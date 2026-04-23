const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const pino = require("pino");
const qrcode = require("qrcode-terminal");

const mediaLogger = pino({ level: "silent" });
let baileysModulePromise = null;

async function getBaileys() {
  if (!baileysModulePromise) {
    baileysModulePromise = import("@whiskeysockets/baileys");
  }

  return baileysModulePromise;
}

function persistQr(config, qr) {
  const qrTextPath = path.join(config.logRoot, "latest-qr.txt");
  const qrRawPath = path.join(config.logRoot, "latest-qr.raw.txt");
  qrcode.generate(qr, { small: true }, (rendered) => {
    fs.writeFileSync(qrTextPath, rendered, "utf8");
  });

  fs.writeFileSync(qrRawPath, qr, "utf8");
}

function extractSenderNumber(chatId, participant) {
  return String(participant || chatId || "")
    .split("@")[0]
    .replace(/\D/g, "");
}

function normalizeIdentityValue(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }

  if (raw.includes("@")) {
    const [user, server] = raw.split("@");
    const baseUser = String(user || "").split(":")[0];
    const digits = baseUser.replace(/\D/g, "");
    return digits && server ? `${digits}@${server}` : raw;
  }

  return raw.replace(/\D/g, "");
}

function expandIdentityAliases(value) {
  const normalized = normalizeIdentityValue(value);
  if (!normalized) {
    return [];
  }

  const aliases = new Set([normalized]);
  const digits = normalized.split("@")[0].replace(/\D/g, "");
  if (digits) {
    aliases.add(digits);
    aliases.add(`${digits}@s.whatsapp.net`);
    aliases.add(`${digits}@lid`);
  }

  return Array.from(aliases);
}

function buildIdentitySet(values) {
  const identities = new Set();
  values.forEach((value) => {
    expandIdentityAliases(value).forEach((alias) => identities.add(alias));
  });
  return identities;
}

function collectKeyIdentities(message) {
  const key = (message && message.key) || {};
  const attrs = key && typeof key === "object" ? key : {};
  const candidates = [
    attrs.remoteJid,
    attrs.participant,
    attrs.remoteJidAlt,
    attrs.participantAlt,
    attrs.senderPn,
    attrs.senderLid,
    attrs.participantPn,
    attrs.participantLid,
    attrs.chat,
    attrs.from,
    attrs.id && attrs.remoteJid,
  ];

  return buildIdentitySet(candidates);
}

function collectDigitsDeep(value, output = new Set()) {
  if (value == null) {
    return output;
  }

  if (typeof value === "string" || typeof value === "number") {
    const digits = String(value).replace(/\D/g, "");
    if (digits.length >= 5) {
      output.add(digits);
    }
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectDigitsDeep(item, output));
    return output;
  }

  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectDigitsDeep(item, output));
  }

  return output;
}

function matchIdentity(list, identities) {
  const configured = buildIdentitySet(list || []);
  for (const identity of identities) {
    if (configured.has(identity)) {
      return identity;
    }
  }

  return null;
}

function getAccessDecision(config, identities, options = {}) {
  const chatId = String(options.chatId || "").toLowerCase();
  const isGroup = Boolean(options.isGroup);
  if (isGroup) {
    const blockedGroups = new Set((config.whatsappBlockedGroups || []).map((item) => String(item).toLowerCase()));
    if (blockedGroups.has(chatId)) {
      return { allowed: false, reason: "group_blocked", matchedIdentity: chatId };
    }

    return { allowed: true, reason: "group_allowed" };
  }

  const blockedMatch = matchIdentity(config.whatsappBlockedNumbers, identities);
  if (blockedMatch) {
    return { allowed: false, reason: "blocked", matchedIdentity: blockedMatch };
  }

  if (!config.whatsappAllowedNumbers || config.whatsappAllowedNumbers.length === 0) {
    return { allowed: true, reason: "open" };
  }

  const allowedMatch = matchIdentity(config.whatsappAllowedNumbers, identities);
  if (allowedMatch) {
    return { allowed: true, reason: "allowed", matchedIdentity: allowedMatch };
  }

  return { allowed: false, reason: "unauthorized" };
}

async function fetchParticipatingGroups(client) {
  if (!client || typeof client.groupFetchAllParticipating !== "function") {
    return [];
  }

  const groups = await client.groupFetchAllParticipating();
  return Object.values(groups || {})
    .map((group) => ({
      id: String(group.id || "").toLowerCase(),
      subject: group.subject || "Grup tanpa nama",
      participantsCount: Array.isArray(group.participants) ? group.participants.length : 0,
    }))
    .filter((group) => group.id)
    .sort((a, b) => a.subject.localeCompare(b.subject, "id"));
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function collectStringValuesDeep(value, output = new Set()) {
  if (value == null) {
    return output;
  }

  if (typeof value === "string" || typeof value === "number") {
    const text = String(value).trim();
    if (text) {
      output.add(text);
    }
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectStringValuesDeep(item, output));
    return output;
  }

  if (typeof value === "object") {
    Object.values(value).forEach((item) => collectStringValuesDeep(item, output));
  }

  return output;
}

function unwrapMessageContent(content) {
  let current = content || {};

  for (let depth = 0; depth < 5; depth += 1) {
    if (current.ephemeralMessage && current.ephemeralMessage.message) {
      current = current.ephemeralMessage.message;
      continue;
    }

    if (current.viewOnceMessage && current.viewOnceMessage.message) {
      current = current.viewOnceMessage.message;
      continue;
    }

    if (current.viewOnceMessageV2 && current.viewOnceMessageV2.message) {
      current = current.viewOnceMessageV2.message;
      continue;
    }

    if (current.documentWithCaptionMessage && current.documentWithCaptionMessage.message) {
      current = current.documentWithCaptionMessage.message;
      continue;
    }

    break;
  }

  return current;
}

function getMessageText(message) {
  const content = unwrapMessageContent(message.message || {});

  return normalizeText(
    content.conversation ||
      (content.extendedTextMessage && content.extendedTextMessage.text) ||
      (content.imageMessage && content.imageMessage.caption) ||
      (content.videoMessage && content.videoMessage.caption) ||
      (content.documentMessage && content.documentMessage.caption) ||
      (content.buttonsResponseMessage && content.buttonsResponseMessage.selectedDisplayText) ||
      (content.templateButtonReplyMessage && content.templateButtonReplyMessage.selectedDisplayText) ||
      "",
  );
}

function getContextInfoCandidates(message) {
  const content = unwrapMessageContent(message.message || {});

  return [
    content.messageContextInfo,
    content.contextInfo,
    content.extendedTextMessage && content.extendedTextMessage.contextInfo,
    content.imageMessage && content.imageMessage.contextInfo,
    content.videoMessage && content.videoMessage.contextInfo,
    content.documentMessage && content.documentMessage.contextInfo,
    content.audioMessage && content.audioMessage.contextInfo,
    content.buttonsResponseMessage && content.buttonsResponseMessage.contextInfo,
    content.templateButtonReplyMessage && content.templateButtonReplyMessage.contextInfo,
  ].filter((item) => item && typeof item === "object");
}

function getContextInfo(message) {
  return getContextInfoCandidates(message)[0] || {};
}

function isGroupJid(jid) {
  return /@g\.us$/i.test(String(jid || ""));
}

function getOwnIdentityAliases(client) {
  const candidates = [];
  if (client && client.user && typeof client.user === "object") {
    Object.values(client.user).forEach((value) => {
      if (typeof value === "string") {
        candidates.push(value);
      }
    });
  }

  if (client && Array.isArray(client.__identityCandidates)) {
    candidates.push(...client.__identityCandidates);
  }

  return buildIdentitySet(candidates);
}

function hasBotMention(client, message) {
  const contextInfo = getContextInfo(message);
  const mentioned = Array.isArray(contextInfo.mentionedJid) ? contextInfo.mentionedJid : [];
  if (mentioned.length === 0) {
    return false;
  }

  const selfAliases = getOwnIdentityAliases(client);
  return mentioned.some((jid) => expandIdentityAliases(jid).some((alias) => selfAliases.has(alias)));
}

function getMentionDebug(client, message) {
  const contextInfo = getContextInfo(message);
  const contextCandidates = getContextInfoCandidates(message);
  return {
    text: getMessageText(message),
    mentionedJid: Array.isArray(contextInfo.mentionedJid) ? contextInfo.mentionedJid : [],
    rawMentionedJid: contextCandidates.flatMap((candidate) =>
      Array.isArray(candidate.mentionedJid) ? candidate.mentionedJid : [],
    ),
    contextCandidateCount: contextCandidates.length,
    selfAliases: Array.from(getOwnIdentityAliases(client)),
  };
}

async function downloadMediaFromContent(content) {
  const { downloadContentFromMessage, getContentType } = await getBaileys();
  const unwrapped = unwrapMessageContent(content || {});
  const contentType = getContentType(unwrapped);
  if (!contentType) return null;

  const mediaMessage =
    unwrapped.imageMessage || unwrapped.videoMessage || unwrapped.documentMessage || unwrapped.audioMessage;
  if (!mediaMessage) return null;

  const mediaTypeMap = {
    imageMessage: "image",
    videoMessage: "video",
    documentMessage: "document",
    audioMessage: "audio",
  };
  const mediaType = mediaTypeMap[contentType];
  if (!mediaType) return null;

  const stream = await downloadContentFromMessage(mediaMessage, mediaType);
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }

  return {
    buffer: Buffer.concat(chunks),
    mimeType: mediaMessage.mimetype || "application/octet-stream",
    originalFileName: typeof mediaMessage.fileName === "string" ? mediaMessage.fileName : null,
    caption: normalizeText(
      mediaMessage.caption ||
        (unwrapped.documentMessage && unwrapped.documentMessage.caption) ||
        "",
    ) || null,
  };
}

async function extractMedia(client, message) {
  const { downloadMediaMessage, getContentType } = await getBaileys();
  const content = unwrapMessageContent(message.message || {});
  const contentType = getContentType(content);
  if (!contentType) return null;

  const mediaMessage =
    content.imageMessage || content.videoMessage || content.documentMessage || content.audioMessage;
  if (!mediaMessage) return null;

  const buffer = await downloadMediaMessage(
    message,
    "buffer",
    {},
    {
      logger: mediaLogger,
      reuploadRequest: client.updateMediaMessage,
    },
  );

  return {
    buffer,
    mimeType: mediaMessage.mimetype || "application/octet-stream",
    originalFileName: typeof mediaMessage.fileName === "string" ? mediaMessage.fileName : null,
    caption: getMessageText(message) || null,
  };
}

async function createClient(config, hooks = {}) {
  const {
    default: makeWASocket,
    Browsers,
    DisconnectReason,
    fetchLatestBaileysVersion,
    useMultiFileAuthState,
  } = await getBaileys();
  const { state, saveCreds } = await useMultiFileAuthState(config.whatsappSessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const client = makeWASocket({
    auth: state,
    version,
    browser: Browsers.baileys("Chrome"),
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
  });
  client.__identityCandidates = Array.from(
    collectStringValuesDeep([
      client.user,
      state && state.creds && state.creds.me,
      state && state.creds && state.creds.account,
    ]),
  );

  client.ev.on("creds.update", saveCreds);
  client.ev.on("lid-mapping.update", (payload) => {
    if (typeof hooks.onIdentityMapping === "function") {
      hooks.onIdentityMapping({ source: "lid-mapping.update", payload });
    }
  });
  client.ev.on("messaging-history.set", (payload) => {
    if (payload && payload.lidPnMappings && typeof hooks.onIdentityMapping === "function") {
      hooks.onIdentityMapping({ source: "messaging-history.set", payload: payload.lidPnMappings });
    }
  });
  client.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (typeof hooks.onConnectionUpdate === "function") {
      hooks.onConnectionUpdate(update);
    }

    if (qr) {
      persistQr(config, qr);
      console.log("[whatsapp] Scan QR berikut untuk login:");
      qrcode.generate(qr, { small: true });
      if (typeof hooks.onQr === "function") {
        hooks.onQr(qr);
      }
    }

    if (connection === "open") {
      console.log("[whatsapp] Client ready");
      if (typeof hooks.onReady === "function") {
        hooks.onReady();
      }
    }

    if (connection === "close") {
      const statusCode = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
        ? lastDisconnect.error.output.statusCode
        : undefined;

      if (statusCode === DisconnectReason.loggedOut) {
        console.error("[whatsapp] Session logged out");
      } else {
        console.warn("[whatsapp] Connection closed", statusCode || "");
      }
    }
  });

  return client;
}

async function resolveWhatsAppIds(client, numbers) {
  if (!client || typeof client.onWhatsApp !== "function") {
    return [];
  }

  const inputDigits = Array.from(
    new Set(
      (numbers || [])
        .flatMap((number) => expandIdentityAliases(number))
        .map((number) => String(number || "").split("@")[0].replace(/\D/g, ""))
        .filter(Boolean),
    ),
  );
  if (inputDigits.length === 0) {
    return [];
  }

  const jids = inputDigits.map((number) => `${number}@s.whatsapp.net`);
  const resolved = new Set(inputDigits);

  try {
    const result = await client.onWhatsApp(...jids);
    collectDigitsDeep(result, resolved);
  } catch {
    return inputDigits;
  }

  return Array.from(resolved);
}

async function sendText(client, chatId, text) {
  await client.sendMessage(chatId, { text });
}

async function sendDocument(client, chatId, absolutePath, options) {
  const buffer = await fsp.readFile(absolutePath);
  await client.sendMessage(chatId, {
    document: buffer,
    mimetype: options.mimeType,
    fileName: options.fileName,
    caption: options.caption,
  });
}

async function normalizeIncoming(config, client, message, hooks = {}) {
  const chatId = message && message.key ? message.key.remoteJid : null;
  if (!chatId || chatId === "status@broadcast" || (message.key && message.key.fromMe)) {
    if (typeof hooks.onIgnored === "function") {
      hooks.onIgnored({
        reason: message && message.key && message.key.fromMe ? "from_me" : "unsupported_chat",
        chatId,
      });
    }
    return null;
  }

  const senderNumber = extractSenderNumber(chatId, message.key && message.key.participant);
  const groupMessage = isGroupJid(chatId);
  const mentionsBot = hasBotMention(client, message);
  if (groupMessage && !mentionsBot) {
    const debug = getMentionDebug(client, message);
    if (typeof hooks.onIgnored === "function") {
      hooks.onIgnored({
        reason: "group_without_mention",
        chatId,
        senderNumber,
        mentionDebug: debug,
        text: getMessageText(message),
      });
    }
    return null;
  }

  const senderIdentities = collectKeyIdentities(message);
  const access = getAccessDecision(config, senderIdentities, {
    chatId,
    isGroup: groupMessage,
  });
  if (!access.allowed) {
    if (typeof hooks.onIgnored === "function") {
      hooks.onIgnored({
        reason: access.reason,
        chatId,
        senderNumber,
        senderIdentities: Array.from(senderIdentities),
        matchedIdentity: access.matchedIdentity,
      });
    }
    return null;
  }

  const contextInfo = getContextInfo(message);
  const quotedMedia =
    contextInfo && contextInfo.quotedMessage
      ? await downloadMediaFromContent(contextInfo.quotedMessage).catch(() => null)
      : null;

  return {
    chatId,
    senderNumber,
    senderIdentities: Array.from(senderIdentities),
    isGroup: groupMessage,
    mentionsBot,
    messageId: message.key && message.key.id,
    text: getMessageText(message),
    media: await extractMedia(client, message),
    quotedMedia,
    quotedText: normalizeText(
      contextInfo && contextInfo.quotedMessage
        ? getMessageText({ message: contextInfo.quotedMessage })
        : "",
    ),
  };
}

module.exports = {
  createClient,
  expandIdentityAliases,
  fetchParticipatingGroups,
  normalizeIncoming,
  resolveWhatsAppIds,
  sendText,
  sendDocument,
};
