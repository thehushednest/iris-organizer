const fs = require("node:fs");
const path = require("node:path");
const EventEmitter = require("node:events");

const { Store } = require("./store");
const { decideIntent } = require("./iris-client");
const { createClient, normalizeIncoming, resolveWhatsAppIds, sendText, sendDocument } = require("./whatsapp");
const { startHttpServer } = require("./http");
const { toWhatsAppJid } = require("./config");

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
      "Perintah khusus:",
      "1. `help`",
      "2. `catat: isi catatan`",
      "3. `cari: kata kunci`",
      "4. `kirim: nomor hasil`",
      "5. `batal`",
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

  deriveTitleFromConfirmation(text) {
    const cleaned = String(text || "")
      .replace(/^(ya|iya|ok|oke|boleh|silakan|simpan)\s*/i, "")
      .replace(/^namanya\s+/i, "")
      .trim();

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
    const normalized = String(reference || "").trim().toLowerCase();
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

    const picked = this.pickSearchResult(reference, results);
    if (!picked) {
      await sendText(this.client, incoming.chatId, "Saya belum bisa menentukan file mana yang dimaksud. Coba sebut nomor hasilnya.");
      return;
    }

    await sendDocument(
      this.client,
      toWhatsAppJid,
      incoming.senderNumber,
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

    const decision = await decideIntent(this.config, {
      text: incoming.text,
      hasMedia: true,
      mode: "pending_media_confirmation",
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
        title: caption.replace(/^simpan\s*:?\s*/i, "").trim(),
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

    if (/^cari\s*:?\s*/i.test(text)) {
      await this.handleSearch(incoming, state, text.replace(/^cari\s*:?\s*/i, "").trim());
      return;
    }

    if (/^kirim\s*:?\s*/i.test(text)) {
      await this.handleSend(incoming, state, text.replace(/^kirim\s*:?\s*/i, "").trim());
      return;
    }

    if (/^catat\s*:?\s*/i.test(text)) {
      const content = text.replace(/^catat\s*:?\s*/i, "").trim();
      const record = await this.store.saveTextNote({
        chatId: incoming.chatId,
        senderNumber: incoming.senderNumber,
        text: content,
        category: "catatan",
        messageId: incoming.messageId,
      });
      await sendText(
        this.client,
        incoming.chatId,
        `Catatan sudah saya simpan sebagai "${record.title}" di folder ${record.relativePath}.`,
      );
      return;
    }

    const lastSearchResults = await this.restoreLastSearch(state);
    const decision = await decideIntent(this.config, {
      text,
      hasMedia: false,
      pendingAction: state.pendingAction || null,
      lastSearchResults: lastSearchResults.map((item) => ({
        id: item.record.id,
        title: item.record.title,
        category: item.record.category,
      })),
    });

    if (decision.intent === "help") {
      await sendText(this.client, incoming.chatId, this.helpText());
      return;
    }

    if (decision.intent === "cancel") {
      await this.store.clearPending(incoming.chatId);
      await sendText(this.client, incoming.chatId, "Baik, saya hentikan dulu prosesnya.");
      return;
    }

    if (decision.intent === "search") {
      await this.handleSearch(incoming, state, decision.searchQuery || text);
      return;
    }

    if (decision.intent === "send_file") {
      await this.handleSend(incoming, state, decision.reference || text);
      return;
    }

    if (decision.intent === "chat" || decision.intent === "clarify") {
      await sendText(
        this.client,
        incoming.chatId,
        decision.reply ||
          `Siap. Kalau ${this.config.ownerTitle} mau, saya bisa simpan pesan ini sebagai catatan atau bantu carikan dokumen.`,
      );
      return;
    }

    const record = await this.store.saveTextNote({
      chatId: incoming.chatId,
      senderNumber: incoming.senderNumber,
      text,
      title: decision.title,
      category: decision.category,
      tags: decision.tags,
      messageId: incoming.messageId,
    });

    await sendText(
      this.client,
      incoming.chatId,
      decision.reply || `Catatan sudah saya simpan sebagai "${record.title}" di folder ${record.relativePath}.`,
    );
  }

  async processMessage(rawMessage) {
    if (rawMessage && rawMessage.key && rawMessage.key.fromMe) {
      this.log("[bot] Pesan outgoing/fromMe diabaikan. Kirim perintah dari nomor WhatsApp lain ke nomor bot.");
      return;
    }

    const incoming = await normalizeIncoming(this.config, this.client, rawMessage, {
      onIgnored: (event) => {
        if (event.reason === "unauthorized") {
          const activeWhitelist =
            this.config.whatsappAllowedNumbers.length > 0
              ? this.config.whatsappAllowedNumbers.join(", ")
              : "semua nomor diizinkan";
          this.log(
            `[bot] Pesan dari ${event.senderNumber || "nomor tidak dikenal"} diabaikan. Whitelist aktif: ${activeWhitelist}. Tambahkan persis ID/nomor pengirim ke "Nomor / ID WhatsApp Diizinkan", atau kosongkan field itu untuk mengizinkan semua.`,
          );
        }
      },
    });
    if (!incoming) return;

    this.log(
      `[bot] Pesan diterima dari ${incoming.senderNumber}${
        incoming.media ? ` dengan file ${incoming.media.originalFileName || incoming.media.mimeType}` : ""
      }.`,
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
