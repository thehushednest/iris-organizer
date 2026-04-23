const fs = require("node:fs");
const path = require("node:path");
const EventEmitter = require("node:events");

const { Store } = require("./store");
const { decideIntent } = require("./iris-client");
const { INTENT_GUIDANCE, retrieveIntentExamples } = require("./intent-rag");
const {
  createClient,
  expandIdentityAliases,
  normalizeIncoming,
  resolveWhatsAppIds,
  sendText,
  sendDocument,
} = require("./whatsapp");
const { startHttpServer } = require("./http");

class OrganizerService extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.store = new Store(config);
    this.client = null;
    this.httpServer = null;
    this.running = false;
    this.stopping = false;
    this.status = "stopped";
    this.lastQr = "";
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.replacingClient = false;
  }

  helpText() {
    return [
      `*${this.config.botName}*`,
      "",
      "Bapak bisa menulis bebas, misalnya:",
      "1. `help`",
      "2. `catat: isi catatan`",
      "3. `cari: kata kunci` atau `tolong carikan file kontrak`",
      "4. `list dokumen`, `dokumen apa saja yang ada`, atau `cari dokumen yang ada, kirim listnya`",
      "5. `kirim 1` atau `kirim file pertama`",
      "6. `batal`",
      "",
      `Kalau ${this.config.ownerTitle} kirim file tanpa konteks, saya akan tanya dulu apakah file itu mau disimpan dan namanya apa.`,
    ].join("\n");
  }

  setStatus(status, extra = {}) {
    this.status = status;
    this.emit("status", {
      status,
      botName: this.config.botName,
      qrAvailable: Boolean(this.lastQr),
      ...extra,
    });
  }

  log(message) {
    this.emit("log", message);
  }

  ensureDirectories() {
    [
      this.config.whatsappSessionDir,
      this.config.storageRoot,
      this.config.stateRoot,
      this.config.logRoot,
    ].forEach((dir) => {
      fs.mkdirSync(dir, { recursive: true });
    });
  }

  isNegative(text) {
    return /^(tidak|ga|gak|nggak|jangan|batal|cancel)\b/i.test(String(text).trim());
  }

  supportedActions() {
    return [
      {
        intent: "list_documents",
        description: "Tampilkan daftar dokumen lokal yang sudah tersimpan.",
      },
      {
        intent: "search_documents",
        description: "Cari dokumen lokal berdasarkan topik, judul, kategori, tag, atau nama file.",
        fields: ["searchQuery"],
      },
      {
        intent: "send_file",
        description: "Kirim salah satu hasil pencarian/daftar terakhir ke chat WhatsApp.",
        fields: ["reference"],
      },
      {
        intent: "save_text",
        description: "Simpan pesan teks sebagai catatan lokal.",
        fields: ["title", "category", "tags", "reply"],
      },
      {
        intent: "save_media",
        description: "Simpan file/media pending dengan metadata yang dipahami dari jawaban user.",
        fields: ["title", "category", "tags"],
      },
      {
        intent: "ask_general_info",
        description: "Jawab pertanyaan umum atau informasi eksternal melalui IRIS, tanpa mencari file lokal.",
        fields: ["reply"],
      },
      {
        intent: "help",
        description: "Tampilkan bantuan penggunaan bot.",
      },
      {
        intent: "cancel",
        description: "Batalkan proses/pending action.",
      },
      {
        intent: "clarify",
        description: "Minta klarifikasi jika maksud user belum cukup jelas.",
        fields: ["reply"],
      },
    ];
  }

  normalizeDecision(decision) {
    const normalized = {
      ...(decision || {}),
      intent: String((decision && decision.intent) || "clarify").trim().toLowerCase(),
    };

    const aliases = {
      list: "list_documents",
      browse_documents: "list_documents",
      show_documents: "list_documents",
      search: "search_documents",
      find_document: "search_documents",
      find_documents: "search_documents",
      search_document: "search_documents",
      save_note: "save_text",
      note: "save_text",
      general_info: "ask_general_info",
      web_search: "ask_general_info",
      browse_web: "ask_general_info",
      chat: "ask_general_info",
    };

    normalized.intent = aliases[normalized.intent] || normalized.intent;
    return normalized;
  }

  collectIdentityMappingGroups(value, groups = []) {
    if (value == null) {
      return groups;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => this.collectIdentityMappingGroups(item, groups));
      return groups;
    }

    if (typeof value !== "object") {
      return groups;
    }

    const aliases = new Set();
    for (const [key, item] of Object.entries(value)) {
      if (!/(jid|lid|pn|phone|number|user)/i.test(key)) {
        continue;
      }

      expandIdentityAliases(item).forEach((alias) => aliases.add(alias));
    }

    if (aliases.size > 1) {
      groups.push(Array.from(aliases));
    }

    Object.values(value).forEach((item) => this.collectIdentityMappingGroups(item, groups));
    return groups;
  }

  async absorbIdentityMapping(event) {
    if (!event) {
      return;
    }

    const mergeMappedAliases = (currentList) => {
      const configuredAliases = new Set(currentList.flatMap((item) => expandIdentityAliases(item)));
      const additions = new Set();

      for (const group of this.collectIdentityMappingGroups(event.payload)) {
        if (!group.some((alias) => configuredAliases.has(alias))) {
          continue;
        }

        group.forEach((alias) => additions.add(alias));
      }

      const before = new Set(currentList);
      const merged = Array.from(new Set([...currentList, ...additions]));
      return { merged, added: merged.filter((item) => !before.has(item)) };
    };

    if (this.config.whatsappAllowedNumbers.length > 0) {
      const allowed = mergeMappedAliases(this.config.whatsappAllowedNumbers);
      if (allowed.added.length > 0) {
        this.config.whatsappAllowedNumbers = allowed.merged;
        this.log(`[app] Whitelist WhatsApp otomatis ditambah dari mapping PN/LID: ${allowed.added.join(", ")}`);
        this.emit("whitelist-resolved", {
          allowedNumbers: allowed.merged,
          added: allowed.added,
        });
      }
    }

    if (this.config.whatsappBlockedNumbers.length > 0) {
      const blocked = mergeMappedAliases(this.config.whatsappBlockedNumbers);
      if (blocked.added.length > 0) {
        this.config.whatsappBlockedNumbers = blocked.merged;
        this.log(`[app] Blacklist WhatsApp otomatis ditambah dari mapping PN/LID: ${blocked.added.join(", ")}`);
        this.emit("blacklist-resolved", {
          blockedNumbers: blocked.merged,
          added: blocked.added,
        });
      }
    }
  }

  cleanSearchQuery(text) {
    let cleaned = String(text || "").trim();
    cleaned = cleaned
      .replace(/^(tolong|mohon|boleh|bisa|bisakah)\s+/i, "")
      .replace(/^(kamu\s+)?(bantu\s+)?(saya\s+)?/i, "")
      .replace(/^(cari|carikan|cek|lihat|tampilkan|temukan|find)\s*:?\s*/i, "")
      .replace(/^(dokumen|dokumeny|file|arsip|berkas|data)(\s+(tentang|mengenai|soal|untuk))?\s*/i, "")
      .replace(/\b(kirim|kirimi|kirimkan|kasih|tampilkan)\s+(list|listnya|daftar|daftarnya)\b/gi, "")
      .replace(/\b(dokumen|dokumeny|file|arsip|berkas|data)\s+(yang\s+ada|tersimpan|semua|apa\s+saja|apa\s+aja)\b/gi, "")
      .replace(/\b(yang\s+ada|semua|tersimpan|listnya|daftarnya)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    return cleaned.replace(/^[,.:;\-\s]+|[,.:;\-\s]+$/g, "").trim();
  }

  looksLikeDocumentListRequest(text) {
    const normalized = String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized) return false;

    const mentionsDocs = /\b(dokumen|file|arsip|berkas|data|folder|storage|koleksi)\b/.test(normalized);
    const wantsList = /\b(list|daftar|daftarnya|listnya|apa saja|apa aja|punya|tersimpan|yang ada|semua|tampilkan|lihat|cek)\b/.test(
      normalized,
    );
    const directList = /\b(list|daftar)\s+(dokumen|file|arsip|berkas|data)\b/.test(normalized);

    return (mentionsDocs && wantsList) || directList;
  }

  looksLikeSendReference(text) {
    const normalized = String(text || "").trim().toLowerCase();
    if (!normalized) return true;

    return (
      /^\d+$/.test(normalized) ||
      /^kirim(?:kan)?\s+\d+$/i.test(normalized) ||
      /^kirim(?:kan)?\s+(?:nomor|no|hasil|file|dokumen)\s+\d+$/i.test(normalized) ||
      /^(?:file|dokumen|hasil)\s+\d+$/i.test(normalized) ||
      /\b(pertama|kedua|ketiga|keempat|kelima)\b/i.test(normalized)
    );
  }

  shouldHandleSendFollowupLocally(text, lastSearchResults) {
    if (!Array.isArray(lastSearchResults) || lastSearchResults.length === 0) {
      return false;
    }

    const normalized = String(text || "").trim().toLowerCase();
    if (!normalized) return false;

    return (
      /^\d+$/.test(normalized) ||
      /^kirim(?:kan)?(?:\s+(?:nomor|no|hasil|file|dokumen))?\s+\d+$/i.test(normalized) ||
      /^kirim(?:kan)?$/i.test(normalized) ||
      /^(?:yang\s+)?(?:pertama|kedua|ketiga|keempat|kelima)$/i.test(normalized) ||
      /^(?:file|dokumen|hasil)(?:\s+itu|\s+ini)?$/i.test(normalized)
    );
  }

  looksLikeGeneralInfoRequest(text) {
    const normalized = String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized) return false;

    const asksLocalArchive = /\b(di|dari|dalam)\s+(dokumen|file|arsip)\s+saya\b/.test(normalized) ||
      /\b(dokumen|file|arsip)\s+(saya|lokal|tersimpan)\b/.test(normalized);
    if (asksLocalArchive) return false;

    return (
      /\b(berita|terbaru|terkini|penelusuran web|browsing|internet|cari di web|web)\b/.test(normalized) ||
      /\b(siapa kamu|kamu siapa|jelaskan kamu|bisa apa)\b/.test(normalized)
    );
  }

  generalInfoFallbackReply(text) {
    const normalized = String(text || "").toLowerCase();
    if (/\b(siapa kamu|kamu siapa|jelaskan kamu|bisa apa)\b/i.test(normalized)) {
      return `Saya ${this.config.botName}, bot WhatsApp organizer yang membantu ${this.config.ownerTitle} menyimpan, mencari, dan mengirim kembali dokumen lokal. Saya juga bisa meminta IRIS membantu menjawab pertanyaan umum jika server IRIS mendukungnya.`;
    }

    return "Ini tampaknya pertanyaan informasi umum atau penelusuran web. Saya tidak akan mencarinya di arsip lokal. Jika IRIS sudah mendukung browsing, IRIS bisa menjawabnya sebagai informasi umum.";
  }

  deriveTitleFromConfirmation(text) {
    let cleaned = String(text || "")
      .trim();

    const explicitName = cleaned.match(
      /(?:dengan\s+nama|nama(?:nya)?|judul(?:nya)?|sebagai)\s+(.+)$/i,
    );
    if (explicitName && explicitName[1]) {
      cleaned = explicitName[1].trim();
    } else {
      cleaned = cleaned
        .replace(/^(ya|iya|ok|oke|boleh|silakan|tolong|mohon)\s+/i, "")
        .replace(/^simpan(?:\s+saja)?(?:\s+file\s+(?:ini|tersebut))?\s*/i, "")
        .replace(/^(file\s+ini|dokumen\s+ini)\s+/i, "")
        .trim();
    }

    return cleaned || null;
  }

  buildResultList(results) {
    return results
      .map(
        (item, index) =>
          `${index + 1}. ${item.record.title} [${item.record.category}] - ${path.basename(item.record.relativePath)}`,
      )
      .join("\n");
  }

  pickSearchResult(reference, results) {
    let normalized = String(reference || "").trim().toLowerCase();
    normalized = normalized
      .replace(/^kirim(?:kan)?\s*/i, "")
      .replace(/^(ke\s+sini|di\s+sini|sini|file(?:nya)?|dokumen(?:nya)?|hasil(?:nya)?)$/i, "")
      .trim();

    if (!normalized) {
      return results[0] || null;
    }

    const numberMatch = normalized.match(/\b(\d+)\b/);
    if (numberMatch) {
      const index = Number(numberMatch[1]) - 1;
      return results[index] || null;
    }

    return (
      results.find((item) => String(item.record.title).toLowerCase().includes(normalized)) ||
      results.find((item) =>
        String(item.record.originalFileName || "").toLowerCase().includes(normalized),
      ) ||
      null
    );
  }

  async restoreLastSearch(state) {
    const ids = Array.isArray(state && state.lastSearchResultIds) ? state.lastSearchResultIds : [];
    const loaded = await Promise.all(ids.map((id) => this.store.getDocumentById(id)));
    return loaded.filter(Boolean).map((record) => ({ record, score: 1 }));
  }

  async handleSearch(incoming, state, query) {
    const results = await this.store.search(query);
    if (results.length === 0) {
      await sendText(this.client, incoming.chatId, `Saya belum menemukan dokumen yang cocok untuk "${query}".`);
      return;
    }

    await this.store.saveConversation({
      ...state,
      chatId: incoming.chatId,
      senderNumber: incoming.senderNumber,
      lastSearchQuery: query,
      lastSearchResultIds: results.map((item) => item.record.id),
      pendingAction: {
        type: "search_delivery",
        searchQuery: query,
        searchResultIds: results.map((item) => item.record.id),
      },
    });

    await sendText(
      this.client,
      incoming.chatId,
      `Saya menemukan ${results.length} data untuk "${query}":\n\n${this.buildResultList(results)}\n\nKalau ${this.config.ownerTitle} ingin saya kirimkan, balas misalnya "kirim 1".`,
    );
  }

  async handleListDocuments(incoming, state, limit = 10) {
    const docs = (await this.store.listDocuments())
      .slice()
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, limit);

    if (docs.length === 0) {
      await sendText(this.client, incoming.chatId, "Belum ada dokumen tersimpan.");
      return;
    }

    const results = docs.map((record) => ({ record, score: 1 }));
    await this.store.saveConversation({
      ...state,
      chatId: incoming.chatId,
      senderNumber: incoming.senderNumber,
      lastSearchQuery: "__list_documents__",
      lastSearchResultIds: docs.map((item) => item.id),
      pendingAction: {
        type: "search_delivery",
        searchQuery: "__list_documents__",
        searchResultIds: docs.map((item) => item.id),
      },
    });

    await sendText(
      this.client,
      incoming.chatId,
      `Saya menemukan ${docs.length} dokumen tersimpan terbaru:\n\n${this.buildResultList(results)}\n\nKalau ${this.config.ownerTitle} ingin saya kirimkan, balas misalnya "kirim 1".`,
    );
  }

  async buildIrisPayload(incoming, state, lastSearchResults) {
    const documents = await this.store.listDocuments();
    const payload = {
      text: incoming.text,
      hasMedia: Boolean(incoming.media),
      pendingAction: state.pendingAction || null,
      supportedActions: this.supportedActions(),
      localContext: {
        botRole: "WhatsApp local document organizer executor",
        executionPolicy:
          "IRIS memilih intent terstruktur; bot lokal hanya mengeksekusi intent yang ada di supportedActions.",
        decisionPolicy: [
          "Follow-up numerik setelah lastSearchResults berarti send_file.",
          "Permintaan daftar/list dokumen berarti list_documents, bukan send_file.",
          "Berita/terbaru/terkini/penelusuran web berarti ask_general_info kecuali user menyebut dokumen saya.",
          "Pertanyaan identitas bot seperti siapa kamu berarti ask_general_info, bukan help.",
        ],
        storedDocumentCount: documents.length,
        canBrowseExternally: true,
        note:
          "Untuk pertanyaan informasi umum/terkini, gunakan ask_general_info dan isi reply. Untuk arsip lokal, gunakan list_documents/search_documents/send_file.",
      },
      lastSearchResults: lastSearchResults.map((item, index) => ({
        number: index + 1,
        id: item.record.id,
        title: item.record.title,
        category: item.record.category,
        fileName: item.record.originalFileName || path.basename(item.record.relativePath),
      })),
    };

    return {
      ...payload,
      intentGuidance: INTENT_GUIDANCE,
      intentExamples: retrieveIntentExamples(payload),
    };
  }

  async executeDecision(incoming, state, decision) {
    const normalized = this.normalizeDecision(decision);

    if (normalized.intent === "help") {
      await sendText(this.client, incoming.chatId, this.helpText());
      return;
    }

    if (normalized.intent === "cancel") {
      await this.store.clearPending(incoming.chatId);
      await sendText(this.client, incoming.chatId, "Baik, saya hentikan dulu prosesnya.");
      return;
    }

    if (normalized.intent === "list_documents") {
      await this.handleListDocuments(incoming, state);
      return;
    }

    if (normalized.intent === "search_documents") {
      if (this.looksLikeGeneralInfoRequest(incoming.text)) {
        await sendText(this.client, incoming.chatId, normalized.reply || this.generalInfoFallbackReply(incoming.text));
        return;
      }

      const query = this.cleanSearchQuery(normalized.searchQuery || normalized.query || "");
      if (!query) {
        await this.handleListDocuments(incoming, state);
        return;
      }
      await this.handleSearch(incoming, state, query);
      return;
    }

    if (normalized.intent === "send_file") {
      const reference = normalized.reference || normalized.result || incoming.text;
      if (!this.looksLikeSendReference(reference)) {
        if (this.looksLikeDocumentListRequest(incoming.text)) {
          await this.handleListDocuments(incoming, state);
          return;
        }

        const query = this.cleanSearchQuery(incoming.text);
        if (query) {
          await this.handleSearch(incoming, state, query);
          return;
        }
      }

      await this.handleSend(incoming, state, reference);
      return;
    }

    if (normalized.intent === "ask_general_info" || normalized.intent === "clarify") {
      await sendText(
        this.client,
        incoming.chatId,
        normalized.reply ||
          `Saya belum cukup yakin maksudnya. ${this.config.ownerTitle} bisa minta saya cari arsip lokal, kirim file, simpan catatan, atau bertanya informasi umum.`,
      );
      return;
    }

    const record = await this.store.saveTextNote({
      chatId: incoming.chatId,
      senderNumber: incoming.senderNumber,
      text: incoming.text,
      title: normalized.title,
      category: normalized.category,
      tags: normalized.tags,
      messageId: incoming.messageId,
    });

    await sendText(
      this.client,
      incoming.chatId,
      normalized.reply || `Catatan sudah saya simpan sebagai "${record.title}" di folder ${record.relativePath}.`,
    );
  }

  async handleSend(incoming, state, reference) {
    const results = await this.restoreLastSearch(state);
    if (results.length === 0) {
      await sendText(
        this.client,
        incoming.chatId,
        "Belum ada hasil pencarian yang siap dikirim. Silakan cari dokumen dulu, misalnya `cari: kontrak 2025`.",
      );
      return;
    }

    const normalizedReference = String(reference || "").trim();
    const picked = !normalizedReference && results.length === 1
      ? results[0]
      : this.pickSearchResult(normalizedReference, results);
    if (!picked) {
      const docs = results.length;
      await sendText(
        this.client,
        incoming.chatId,
        `Saya belum bisa menentukan file mana yang dimaksud. Balas dengan nomor hasil, misalnya "kirim 1". Saat ini ada ${docs} hasil yang bisa dipilih.`,
      );
      return;
    }

    await sendDocument(
      this.client,
      incoming.chatId,
      this.store.getAbsoluteDocumentPath(picked.record),
      {
        mimeType: picked.record.mimeType,
        fileName: picked.record.originalFileName || path.basename(picked.record.relativePath),
        caption: `Dokumen "${picked.record.title}" saya kirimkan.`,
      },
    );

    await this.store.clearPending(incoming.chatId);
    await sendText(this.client, incoming.chatId, `Dokumen "${picked.record.title}" sudah saya kirimkan.`);
  }

  async handlePendingMedia(incoming, state) {
    const pendingItem = state.pendingAction && state.pendingAction.mediaItem;
    if (!pendingItem) {
      return false;
    }

    if (this.isNegative(incoming.text)) {
      await this.store.discardPendingMedia(pendingItem);
      await this.store.clearPending(incoming.chatId);
      await sendText(this.client, incoming.chatId, "Baik, file ini tidak saya simpan.");
      return true;
    }

    const payload = {
      text: incoming.text,
      hasMedia: true,
      mode: "pending_media_confirmation",
      pendingAction: state.pendingAction || null,
      supportedActions: this.supportedActions(),
      localContext: {
        botRole: "WhatsApp local document organizer executor",
        executionPolicy:
          "IRIS memilih metadata/intent; bot lokal menyimpan file pending hanya jika user mengonfirmasi.",
      },
    };

    const decision = await decideIntent(this.config, {
      ...payload,
      intentGuidance: INTENT_GUIDANCE,
      intentExamples: retrieveIntentExamples(payload),
    });

    const record = await this.store.commitPendingMedia(pendingItem, {
      title: this.deriveTitleFromConfirmation(incoming.text) || decision.title,
      category: decision.category,
      tags: decision.tags,
    });

    await this.store.clearPending(incoming.chatId);
    await sendText(
      this.client,
      incoming.chatId,
      `File sudah saya simpan sebagai "${record.title}" di folder ${record.relativePath}.`,
    );
    return true;
  }

  async handleMedia(incoming, state) {
    const caption = String((incoming.media && incoming.media.caption) || "").trim();
    this.log(
      `[bot] Memproses file ${incoming.media.originalFileName || incoming.media.mimeType} dengan caption "${caption || "-"}".`,
    );

    if (/^simpan\s*:?\s*/i.test(caption)) {
      const staged = await this.store.stageMedia({
        chatId: incoming.chatId,
        senderNumber: incoming.senderNumber,
        mimeType: incoming.media.mimeType,
        originalFileName: incoming.media.originalFileName,
        caption: incoming.media.caption,
        buffer: incoming.media.buffer,
        messageId: incoming.messageId,
      });

      const record = await this.store.commitPendingMedia(staged, {
        title: this.deriveTitleFromConfirmation(caption) || caption.replace(/^simpan\s*:?\s*/i, "").trim(),
        category: this.config.defaultCategory,
      });

      this.log(`[bot] File disimpan: ${record.relativePath}`);
      await sendText(
        this.client,
        incoming.chatId,
        `File sudah saya simpan sebagai "${record.title}" di folder ${record.relativePath}.`,
      );
      return;
    }

    const staged = await this.store.stageMedia({
      chatId: incoming.chatId,
      senderNumber: incoming.senderNumber,
      mimeType: incoming.media.mimeType,
      originalFileName: incoming.media.originalFileName,
      caption: incoming.media.caption,
      buffer: incoming.media.buffer,
      messageId: incoming.messageId,
    });
    this.log(`[bot] File distage sementara: ${staged.relativePath}`);

    await this.store.saveConversation({
      ...state,
      chatId: incoming.chatId,
      senderNumber: incoming.senderNumber,
      pendingAction: {
        type: "media_save_confirmation",
        mediaItem: staged,
      },
    });

    await sendText(
      this.client,
      incoming.chatId,
      `Apakah ${this.config.ownerTitle} ingin saya simpan ${incoming.media.originalFileName || "file ini"}? Kalau ya, balas dengan nama file yang diinginkan. Kalau tidak, balas "batal".`,
    );
  }

  async handleText(incoming, state) {
    const text = String(incoming.text || "").trim();
    if (!text) {
      return;
    }

    if (/^help$/i.test(text)) {
      await sendText(this.client, incoming.chatId, this.helpText());
      return;
    }

    if (state.pendingAction && state.pendingAction.type === "media_save_confirmation") {
      const handled = await this.handlePendingMedia(incoming, state);
      if (handled) {
        return;
      }
    }

    if (/^batal$/i.test(text)) {
      if (
        state.pendingAction &&
        state.pendingAction.type === "media_save_confirmation" &&
        state.pendingAction.mediaItem
      ) {
        await this.store.discardPendingMedia(state.pendingAction.mediaItem);
      }
      await this.store.clearPending(incoming.chatId);
      await sendText(this.client, incoming.chatId, "Baik, proses yang sedang berjalan saya batalkan.");
      return;
    }

    const lastSearchResults = await this.restoreLastSearch(state);
    if (this.shouldHandleSendFollowupLocally(text, lastSearchResults)) {
      await this.handleSend(incoming, state, text);
      return;
    }

    const decision = await decideIntent(this.config, await this.buildIrisPayload(incoming, state, lastSearchResults));
    await this.executeDecision(incoming, state, decision);
  }

  async processMessage(rawMessage) {
    if (rawMessage && rawMessage.key && rawMessage.key.fromMe) {
      this.log("[bot] Pesan outgoing/fromMe diabaikan. Kirim perintah dari nomor WhatsApp lain ke nomor bot.");
      return;
    }

    const incoming = await normalizeIncoming(this.config, this.client, rawMessage, {
      onIgnored: (event) => {
        if (event.reason === "blocked") {
          this.log(
            `[bot] Pesan dari ${event.senderNumber || "nomor tidak dikenal"} diblokir oleh blacklist. Identitas: ${
              event.senderIdentities && event.senderIdentities.length > 0
                ? event.senderIdentities.join(", ")
                : "-"
            }.`,
          );
          return;
        }

        if (event.reason === "unauthorized") {
          const activeWhitelist =
            this.config.whatsappAllowedNumbers.length > 0
              ? this.config.whatsappAllowedNumbers.join(", ")
              : "semua nomor diizinkan";
          this.log(
            `[bot] Pesan dari ${event.senderNumber || "nomor tidak dikenal"} diabaikan. Whitelist aktif: ${activeWhitelist}. Identitas pesan: ${
              event.senderIdentities && event.senderIdentities.length > 0
                ? event.senderIdentities.join(", ")
                : "-"
            }. Tambahkan salah satu identitas itu ke "Nomor / ID WhatsApp Diizinkan", atau kosongkan field itu untuk mengizinkan semua.`,
          );
        }
      },
    });
    if (!incoming) return;

    this.log(
      `[bot] Pesan diterima dari ${incoming.senderNumber}${
        incoming.media ? ` dengan file ${incoming.media.originalFileName || incoming.media.mimeType}` : ""
      }. Identitas: ${incoming.senderIdentities && incoming.senderIdentities.length > 0 ? incoming.senderIdentities.join(", ") : "-"}.`,
    );

    const state =
      (await this.store.getConversation(incoming.chatId)) || {
        chatId: incoming.chatId,
        senderNumber: incoming.senderNumber,
        pendingAction: null,
        lastSearchResultIds: [],
      };

    if (incoming.media) {
      await this.handleMedia(incoming, state);
      return;
    }

    await this.handleText(incoming, state);
  }

  getDisconnectStatusCode(update) {
    return update && update.lastDisconnect && update.lastDisconnect.error && update.lastDisconnect.error.output
      ? update.lastDisconnect.error.output.statusCode
      : undefined;
  }

  getDisconnectMessage(update) {
    const error = update && update.lastDisconnect ? update.lastDisconnect.error : null;
    return error && error.message ? error.message : "unknown reason";
  }

  scheduleReconnect(update) {
    if (this.stopping || this.replacingClient || !this.running) {
      return;
    }

    const statusCode = this.getDisconnectStatusCode(update);
    if (statusCode === 401) {
      this.log("[whatsapp] Session logged out. Hapus session dan scan QR ulang.");
      this.setStatus("logged_out", { qrAvailable: Boolean(this.lastQr) });
      return;
    }

    if (this.reconnectTimer) {
      return;
    }

    this.reconnectAttempts += 1;
    const delayMs = Math.min(30000, 2000 * 2 ** Math.min(this.reconnectAttempts - 1, 4));
    this.log(
      `[whatsapp] Koneksi tertutup (${statusCode || "no-code"}: ${this.getDisconnectMessage(
        update,
      )}). Reconnect dalam ${Math.round(delayMs / 1000)} detik.`,
    );
    this.setStatus("reconnecting", { qrAvailable: Boolean(this.lastQr) });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectWhatsApp().catch((error) => {
        this.log(`[whatsapp] Reconnect gagal: ${error.message}`);
        this.scheduleReconnect({});
      });
    }, delayMs);
  }

  async reconnectWhatsApp() {
    if (this.stopping || !this.running) {
      return;
    }

    this.log("[whatsapp] Mencoba menyambungkan ulang...");
    await this.openWhatsAppClient();
  }

  async closeWhatsAppClient({ replacing = false } = {}) {
    if (!this.client) {
      return;
    }

    const client = this.client;
    this.client = null;
    this.replacingClient = replacing;

    if (typeof client.end === "function") {
      try {
        client.end(undefined);
      } catch {}
    } else if (client.ws && typeof client.ws.close === "function") {
      try {
        client.ws.close();
      } catch {}
    }

    setTimeout(() => {
      if (this.replacingClient === replacing) {
        this.replacingClient = false;
      }
    }, 500);
  }

  async openWhatsAppClient() {
    await this.closeWhatsAppClient({ replacing: true });

    const client = await createClient(this.config, {
      onQr: (qr) => {
        this.lastQr = qr;
        this.log("[whatsapp] QR baru tersedia. Scan dari WhatsApp agar bot tersambung.");
        this.setStatus("waiting_for_qr", { qrAvailable: true });
      },
      onConnectionUpdate: (update) => {
        if (update.connection === "open") {
          this.reconnectAttempts = 0;
          this.setStatus("connected", { qrAvailable: Boolean(this.lastQr) });
        } else if (update.connection === "close") {
          this.setStatus("disconnected", { qrAvailable: Boolean(this.lastQr) });
          this.scheduleReconnect(update);
        }
      },
      onReady: () => {
        this.reconnectAttempts = 0;
        this.log("[whatsapp] Client connected.");
        this.setStatus("connected");
        this.resolveWhitelistAliases().catch((error) => {
          this.log(`[app] Gagal resolve whitelist WhatsApp: ${error.message}`);
        });
      },
      onIdentityMapping: (event) => {
        this.log(`[whatsapp] Identity mapping diterima dari ${event.source}. Whitelist/blacklist akan memakai alias PN/LID jika tersedia.`);
        this.absorbIdentityMapping(event).catch((error) => {
          this.log(`[app] Gagal menyerap identity mapping WhatsApp: ${error.message}`);
        });
        this.resolveWhitelistAliases().catch((error) => {
          this.log(`[app] Gagal sinkron identity mapping WhatsApp: ${error.message}`);
        });
      },
    });

    client.ev.on("messages.upsert", (event) => {
      if (event.type !== "notify") {
        return;
      }

      for (const rawMessage of event.messages) {
        Promise.resolve()
          .then(() => this.processMessage(rawMessage))
          .catch((error) => {
            this.log(`[bot] Failed to process message: ${error.message}`);
          });
      }
    });

    this.client = client;
  }

  async resolveWhitelistAliases() {
    if (!this.client || this.config.whatsappAllowedNumbers.length === 0) {
      return;
    }

    const before = new Set(this.config.whatsappAllowedNumbers);
    const resolved = await resolveWhatsAppIds(this.client, this.config.whatsappAllowedNumbers);
    const merged = Array.from(new Set([...this.config.whatsappAllowedNumbers, ...resolved]));
    const added = merged.filter((item) => !before.has(item));

    if (added.length === 0) {
      this.log(`[app] Whitelist WhatsApp sudah sinkron: ${merged.join(", ")}`);
      return;
    }

    this.config.whatsappAllowedNumbers = merged;
    this.log(`[app] Whitelist WhatsApp otomatis ditambah ID: ${added.join(", ")}`);
    this.emit("whitelist-resolved", {
      allowedNumbers: merged,
      added,
    });
  }

  async start() {
    if (this.running) {
      return;
    }

    this.stopping = false;
    this.ensureDirectories();
    await this.store.ensureReady();

    this.log(`[app] Starting ${this.config.botName}`);
    this.log(`[app] IRIS remote brain: ${this.config.irisBaseUrl}${this.config.irisDecidePath}`);
    this.log(
      `[app] WhatsApp whitelist aktif: ${
        this.config.whatsappAllowedNumbers.length > 0
          ? this.config.whatsappAllowedNumbers.join(", ")
          : "semua nomor diizinkan"
      }`,
    );
    this.log(
      `[app] WhatsApp blacklist aktif: ${
        this.config.whatsappBlockedNumbers.length > 0
          ? this.config.whatsappBlockedNumbers.join(", ")
          : "tidak ada nomor/ID diblokir"
      }`,
    );
    this.setStatus("starting");
    this.running = true;

    await this.openWhatsAppClient();

    this.httpServer = await startHttpServer(this.config, { store: this.store, client: this.client });
    this.setStatus("running", { qrAvailable: Boolean(this.lastQr) });
  }

  async stop() {
    if (!this.running) {
      return;
    }

    this.setStatus("stopping", { qrAvailable: Boolean(this.lastQr) });
    this.stopping = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.httpServer && typeof this.httpServer.close === "function") {
      await this.httpServer.close().catch(() => {});
    }

    await this.closeWhatsAppClient();

    this.httpServer = null;
    this.running = false;
    this.reconnectAttempts = 0;
    this.setStatus("stopped", { qrAvailable: Boolean(this.lastQr) });
  }

  getState() {
    return {
      status: this.status,
      running: this.running,
      botName: this.config.botName,
      qrAvailable: Boolean(this.lastQr),
      irisBaseUrl: this.config.irisBaseUrl,
      storageRoot: this.config.storageRoot,
    };
  }
}

module.exports = {
  OrganizerService,
};
