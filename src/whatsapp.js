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

function isAuthorizedNumber(senderNumber) {
  if (this.config.whatsappAllowedNumbers.length === 0) {
    return true;
  }

  return this.config.whatsappAllowedNumbers.includes(senderNumber);
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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

  client.ev.on("creds.update", saveCreds);
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

async function sendText(client, chatId, text) {
  await client.sendMessage(chatId, { text });
}

async function sendDocument(client, toWhatsAppJid, phoneNumber, absolutePath, options) {
  const buffer = await fsp.readFile(absolutePath);
  await client.sendMessage(toWhatsAppJid(phoneNumber), {
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
  if (!isAuthorizedNumber.call({ config }, senderNumber)) {
    if (typeof hooks.onIgnored === "function") {
      hooks.onIgnored({
        reason: "unauthorized",
        chatId,
        senderNumber,
      });
    }
    return null;
  }

  return {
    chatId,
    senderNumber,
    messageId: message.key && message.key.id,
    text: getMessageText(message),
    media: await extractMedia(client, message),
  };
}

module.exports = {
  createClient,
  normalizeIncoming,
  sendText,
  sendDocument,
};
