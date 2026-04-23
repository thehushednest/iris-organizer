const path = require("node:path");
const dotenv = require("dotenv");

function parseBoolean(value, fallback) {
  if (value == null || String(value).trim() === "") {
    return fallback;
  }

  return String(value).trim().toLowerCase() === "true";
}

function parseList(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.replace(/\D/g, ""));
}

function createConfig(source = {}, opts = {}) {
  const cwd = opts.cwd || process.cwd();

  return {
    timezone: source.TZ || "Asia/Jakarta",
    botName: source.BOT_NAME || "IRIS Organizer",
    ownerTitle: source.BOT_OWNER_TITLE || "Bapak",
    whatsappSessionDir: path.resolve(cwd, source.WHATSAPP_SESSION_DIR || "./runtime/session"),
    whatsappAllowedNumbers: parseList(source.WHATSAPP_ALLOWED_NUMBERS),
    storageRoot: path.resolve(cwd, source.STORAGE_ROOT || "./runtime/storage"),
    stateRoot: path.resolve(cwd, source.STATE_ROOT || "./runtime/state"),
    logRoot: path.resolve(cwd, source.LOG_ROOT || "./runtime/logs"),
    defaultCategory: source.DEFAULT_CATEGORY || "umum",
    botHttpHost: source.BOT_HTTP_HOST || "0.0.0.0",
    botHttpPort: Number(source.BOT_HTTP_PORT || 8030),
    botApiToken: source.BOT_API_TOKEN || "",
    irisBaseUrl: source.IRIS_BASE_URL || "http://127.0.0.1:3000",
    irisDecidePath: source.IRIS_DECIDE_PATH || "/api/internal/organizer/decide",
    irisApiToken: source.IRIS_API_TOKEN || "",
    irisTimeoutMs: Number(source.IRIS_TIMEOUT_MS || 40000),
    irisFallbackEnabled: parseBoolean(source.IRIS_FALLBACK_ENABLED, true),
  };
}

function loadConfig(opts = {}) {
  dotenv.config(opts.dotenvPath ? { path: opts.dotenvPath } : undefined);
  return createConfig(process.env, { cwd: opts.cwd });
}

function toWhatsAppJid(number) {
  const digits = String(number || "").replace(/\D/g, "");
  if (!digits) {
    throw new Error("Phone number must contain digits");
  }

  return `${digits}@s.whatsapp.net`;
}

module.exports = {
  createConfig,
  loadConfig,
  toWhatsAppJid,
};
