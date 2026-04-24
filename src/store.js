const fs = require("node:fs/promises");
const path = require("node:path");

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .toLowerCase()
    .slice(0, 80);
}

function summarizeText(value, limit = 180) {
  const compact = String(value || "").replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit - 3)}...` : compact;
}

function generateId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function inferExtension(mimeType, originalFileName) {
  const fromName = originalFileName ? path.extname(originalFileName).toLowerCase() : "";
  if (fromName) {
    return fromName;
  }

  const map = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/zip": ".zip",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "text/plain": ".txt",
  };

  return map[mimeType] || ".bin";
}

function inferKind(mimeType) {
  if (String(mimeType).startsWith("image/")) return "image";
  if (String(mimeType).startsWith("video/")) return "video";
  if (String(mimeType).startsWith("audio/")) return "audio";
  if (mimeType === "text/plain") return "note";
  return "document";
}

function getIndonesianMonthName(date) {
  const monthNames = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  return monthNames[date.getMonth()] || String(date.getMonth() + 1).padStart(2, "0");
}

function getIndonesianDayFolder(date) {
  const dayNames = [
    "Minggu",
    "Senin",
    "Selasa",
    "Rabu",
    "Kamis",
    "Jum'at",
    "Sabtu",
  ];
  const dayName = dayNames[date.getDay()] || "Hari";
  return `${dayName} tanggal ${String(date.getDate()).padStart(2, "0")}`;
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function uniquePathForFile(baseAbsolutePath) {
  const parsed = path.parse(baseAbsolutePath);

  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const suffix = attempt === 0 ? "" : `-${attempt + 1}`;
    const candidate = path.join(parsed.dir, `${parsed.name}${suffix}${parsed.ext}`);

    try {
      await fs.access(candidate);
    } catch (error) {
      if (error && error.code === "ENOENT") {
        return candidate;
      }

      throw error;
    }
  }

  throw new Error(`Unable to allocate unique file path for ${baseAbsolutePath}`);
}

class Store {
  constructor(config) {
    this.config = config;
    this.documentsFile = path.join(config.stateRoot, "documents.json");
    this.conversationsFile = path.join(config.stateRoot, "conversations.json");
    this.pendingRoot = path.join(config.stateRoot, "pending");
  }

  async ensureReady() {
    await Promise.all([
      fs.mkdir(this.config.storageRoot, { recursive: true }),
      fs.mkdir(this.config.stateRoot, { recursive: true }),
      fs.mkdir(this.config.logRoot, { recursive: true }),
      fs.mkdir(this.pendingRoot, { recursive: true }),
    ]);

    await Promise.all([
      writeJson(this.documentsFile, await readJson(this.documentsFile, { documents: [] })),
      writeJson(this.conversationsFile, await readJson(this.conversationsFile, {})),
    ]);
  }

  async listDocuments() {
    const payload = await readJson(this.documentsFile, { documents: [] });
    return payload.documents;
  }

  async appendDocument(record) {
    const payload = await readJson(this.documentsFile, { documents: [] });
    payload.documents.push(record);
    await writeJson(this.documentsFile, payload);
    return record;
  }

  async getDocumentById(id) {
    const docs = await this.listDocuments();
    return docs.find((item) => item.id === id) || null;
  }

  async getConversation(chatId) {
    const conversations = await readJson(this.conversationsFile, {});
    return conversations[chatId] || null;
  }

  async saveConversation(state) {
    const conversations = await readJson(this.conversationsFile, {});
    conversations[state.chatId] = {
      ...state,
      updatedAt: new Date().toISOString(),
    };
    await writeJson(this.conversationsFile, conversations);
    return conversations[state.chatId];
  }

  async clearPending(chatId) {
    const state = await this.getConversation(chatId);
    if (!state) return null;
    state.pendingAction = null;
    return this.saveConversation(state);
  }

  async stageMedia(input) {
    const id = generateId("pending");
    const extension = inferExtension(input.mimeType, input.originalFileName);
    const relativePath = path.join("pending", `${id}${extension}`);
    const absolutePath = path.join(this.config.stateRoot, relativePath);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, input.buffer);

    return {
      id,
      chatId: input.chatId,
      senderNumber: input.senderNumber,
      mimeType: input.mimeType,
      originalFileName: input.originalFileName || null,
      caption: input.caption || null,
      sizeBytes: input.buffer.length,
      extension,
      messageId: input.messageId || null,
      relativePath,
      createdAt: new Date().toISOString(),
    };
  }

  async discardPendingMedia(item) {
    const absolutePath = path.join(this.config.stateRoot, item.relativePath);
    await fs.rm(absolutePath, { force: true });
  }

  async commitPendingMedia(item, meta) {
    const title = (meta.title || this.suggestTitleFromMedia(item)).trim();
    const category =
      slugify(meta.category || this.config.defaultCategory) || this.config.defaultCategory;
    const id = generateId("doc");
    const safeTitle = slugify(title) || id;
    const now = new Date();
    const relativePath = path.join(
      String(now.getFullYear()),
      getIndonesianMonthName(now),
      getIndonesianDayFolder(now),
      category,
      `${safeTitle}${item.extension}`,
    );
    const preferredAbsolutePath = path.join(this.config.storageRoot, relativePath);

    await fs.mkdir(path.dirname(preferredAbsolutePath), { recursive: true });
    const absolutePath = await uniquePathForFile(preferredAbsolutePath);
    const finalRelativePath = path.relative(this.config.storageRoot, absolutePath);
    await fs.rename(path.join(this.config.stateRoot, item.relativePath), absolutePath);

    const record = {
      id,
      kind: inferKind(item.mimeType),
      chatId: item.chatId,
      senderNumber: item.senderNumber,
      title,
      category,
      tags: Array.isArray(meta.tags) ? meta.tags.filter(Boolean) : [],
      mimeType: item.mimeType,
      originalFileName: item.originalFileName,
      caption: item.caption,
      relativePath: finalRelativePath,
      extension: item.extension,
      sizeBytes: item.sizeBytes,
      textPreview: item.caption ? summarizeText(item.caption) : null,
      sourceMessageId: item.messageId,
      createdAt: now.toISOString(),
    };

    return this.appendDocument(record);
  }

  async saveTextNote(input) {
    const id = generateId("note");
    const title = (input.title || this.suggestTitleFromText(input.text)).trim();
    const category = slugify(input.category || "catatan") || "catatan";
    const safeTitle = slugify(title) || id;
    const now = new Date();
    const relativePath = path.join(
      String(now.getFullYear()),
      getIndonesianMonthName(now),
      getIndonesianDayFolder(now),
      category,
      `${safeTitle}.txt`,
    );
    const preferredAbsolutePath = path.join(this.config.storageRoot, relativePath);
    const content =
      `Judul: ${title}\n` +
      `Kategori: ${category}\n` +
      `Tanggal: ${now.toISOString()}\n` +
      `Pengirim: ${input.senderNumber}\n\n` +
      `${String(input.text || "").trim()}\n`;

    await fs.mkdir(path.dirname(preferredAbsolutePath), { recursive: true });
    const absolutePath = await uniquePathForFile(preferredAbsolutePath);
    const finalRelativePath = path.relative(this.config.storageRoot, absolutePath);
    await fs.writeFile(absolutePath, content, "utf8");

    return this.appendDocument({
      id,
      kind: "note",
      chatId: input.chatId,
      senderNumber: input.senderNumber,
      title,
      category,
      tags: Array.isArray(input.tags) ? input.tags.filter(Boolean) : [],
      mimeType: "text/plain",
      originalFileName: null,
      caption: null,
      relativePath: finalRelativePath,
      extension: ".txt",
      sizeBytes: Buffer.byteLength(content, "utf8"),
      textPreview: summarizeText(input.text),
      sourceMessageId: input.messageId || null,
      createdAt: now.toISOString(),
    });
  }

  async search(query, limit = 5) {
    const normalized = String(query || "").trim().toLowerCase();
    if (!normalized) return [];

    const terms = normalized.split(/\s+/).filter(Boolean);
    const docs = await this.listDocuments();

    return docs
      .map((record) => ({ record, score: this.score(record, terms) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return String(b.record.createdAt).localeCompare(String(a.record.createdAt));
      })
      .slice(0, limit);
  }

  getAbsoluteDocumentPath(record) {
    return path.join(this.config.storageRoot, record.relativePath);
  }

  score(record, terms) {
    const haystack = [
      record.title,
      record.category,
      record.originalFileName,
      record.caption,
      record.textPreview,
      record.relativePath,
      ...(record.tags || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    let score = 0;
    for (const term of terms) {
      if (String(record.title).toLowerCase().includes(term)) score += 5;
      if (String(record.originalFileName || "").toLowerCase().includes(term)) score += 4;
      if (String(record.category || "").toLowerCase().includes(term)) score += 3;
      if (haystack.includes(term)) score += 1;
    }

    return score;
  }

  suggestTitleFromText(text) {
    const preview = summarizeText(text, 60);
    return preview || `catatan-${new Date().toISOString().slice(0, 19)}`;
  }

  suggestTitleFromMedia(item) {
    if (item.originalFileName) {
      return item.originalFileName.replace(path.extname(item.originalFileName), "");
    }

    if (item.caption) {
      return summarizeText(item.caption, 60);
    }

    return `dokumen-${new Date(item.createdAt).toISOString().slice(0, 19)}`;
  }
}

module.exports = {
  Store,
  slugify,
  summarizeText,
};
