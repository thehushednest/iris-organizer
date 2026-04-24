const fs = require("node:fs/promises");
const path = require("node:path");
const { app, BrowserWindow, ipcMain, dialog, screen } = require("electron");
const axios = require("axios");
const QRCode = require("qrcode");

const { createConfig } = require("../src/config");
const { OrganizerService } = require("../src/service");

let mainWindow = null;
let service = null;
let serviceConfig = null;
let logBuffer = [];

function getSettingsPaths() {
  const baseDir = app.getPath("userData");
  return {
    baseDir,
    settingsPath: path.join(baseDir, "settings.json"),
    runtimeRoot: path.join(baseDir, "runtime"),
  };
}

function defaultSettings() {
  return {
    botName: "IRIS Organizer",
    ownerTitle: "Bapak",
    allowedNumbers: "",
    blockedNumbers: "",
    blockedGroups: [],
    botApiToken: "local-bot-token",
    botHttpPort: "8030",
    irisBaseUrl: "http://127.0.0.1:3000",
    irisDecidePath: "/api/internal/organizer/decide",
    irisApiToken: "",
    irisTimeoutMs: "40000",
    irisFallbackEnabled: true,
    defaultCategory: "umum",
  };
}

async function loadSettings() {
  const { settingsPath } = getSettingsPaths();
  try {
    const raw = await fs.readFile(settingsPath, "utf8");
    return { ...defaultSettings(), ...JSON.parse(raw) };
  } catch {
    return defaultSettings();
  }
}

async function saveSettings(settings) {
  const { settingsPath } = getSettingsPaths();
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function buildServiceConfigFromSettings(settings) {
  const { baseDir, runtimeRoot } = getSettingsPaths();

  return createConfig(
    {
      TZ: "Asia/Jakarta",
      BOT_NAME: settings.botName,
      BOT_OWNER_TITLE: settings.ownerTitle,
      WHATSAPP_ALLOWED_NUMBERS: settings.allowedNumbers,
      WHATSAPP_BLOCKED_NUMBERS: settings.blockedNumbers,
      WHATSAPP_BLOCKED_GROUPS: settings.blockedGroups,
      WHATSAPP_SESSION_DIR: path.join(runtimeRoot, "session"),
      STORAGE_ROOT: path.join(runtimeRoot, "storage"),
      STATE_ROOT: path.join(runtimeRoot, "state"),
      LOG_ROOT: path.join(runtimeRoot, "logs"),
      DEFAULT_CATEGORY: settings.defaultCategory,
      BOT_HTTP_HOST: "127.0.0.1",
      BOT_HTTP_PORT: settings.botHttpPort,
      BOT_API_TOKEN: settings.botApiToken,
      IRIS_BASE_URL: settings.irisBaseUrl,
      IRIS_DECIDE_PATH: settings.irisDecidePath,
      IRIS_API_TOKEN: settings.irisApiToken,
      IRIS_TIMEOUT_MS: settings.irisTimeoutMs,
      IRIS_FALLBACK_ENABLED: String(Boolean(settings.irisFallbackEnabled)),
    },
    { cwd: baseDir },
  );
}

function pushLog(message) {
  const line = `[${new Date().toLocaleTimeString()}] ${message}`;
  logBuffer = [...logBuffer.slice(-199), line];
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("service-log", line);
  }
}

async function emitStatus() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const state = service ? service.getState() : { status: "stopped", running: false };
  mainWindow.webContents.send("service-status", {
    ...state,
    ...(await readQrPayload()),
  });
}

async function readQrPayload() {
  if (!serviceConfig) {
    return { qrText: "", qrImage: "" };
  }

  try {
    const [qrText, qrRaw] = await Promise.all([
      fs.readFile(path.join(serviceConfig.logRoot, "latest-qr.txt"), "utf8").catch(() => ""),
      fs.readFile(path.join(serviceConfig.logRoot, "latest-qr.raw.txt"), "utf8").catch(() => ""),
    ]);
    const qrImage = qrRaw
      ? await QRCode.toDataURL(qrRaw, {
          errorCorrectionLevel: "M",
          margin: 2,
          scale: 8,
          color: {
            dark: "#06110f",
            light: "#ffffff",
          },
        })
      : "";

    return { qrText, qrImage };
  } catch {
    return { qrText: "", qrImage: "" };
  }
}

async function startServiceWithSettings(settings) {
  serviceConfig = buildServiceConfigFromSettings(settings);

  if (service) {
    await stopService();
  }

  service = new OrganizerService(serviceConfig);
  service.on("log", (message) => pushLog(message));
  service.on("whitelist-resolved", async (payload) => {
    const current = await loadSettings();
    const allowedNumbers = Array.from(
      new Set([
        ...String(current.allowedNumbers || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        ...payload.allowedNumbers,
      ]),
    ).join(",");
    await saveSettings({ ...current, allowedNumbers });
    pushLog(`[app] Whitelist tersimpan otomatis: ${allowedNumbers}`);
  });
  service.on("blacklist-resolved", async (payload) => {
    const current = await loadSettings();
    const blockedNumbers = Array.from(
      new Set([
        ...String(current.blockedNumbers || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        ...payload.blockedNumbers,
      ]),
    ).join(",");
    await saveSettings({ ...current, blockedNumbers });
    pushLog(`[app] Blacklist tersimpan otomatis: ${blockedNumbers}`);
  });
  service.on("status", async (payload) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("service-status", {
        ...payload,
        running: Boolean(service && service.running),
        groups: service ? service.groupCatalog : [],
        ...(await readQrPayload()),
      });
    }
  });
  service.on("groups-updated", async (groups) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("service-groups", groups);
    }
  });

  try {
    await service.start();
    pushLog(`Service started for ${serviceConfig.botName}`);
  } catch (error) {
    pushLog(`[app] Gagal menjalankan service: ${error.message}`);
    service.removeAllListeners();
    service = null;
    throw error;
  }
}

async function stopService() {
  if (!service) {
    return;
  }

  await service.stop();
  pushLog("Service stopped");
  service.removeAllListeners();
  service = null;
}

async function clearQrFiles(config) {
  if (!config) {
    return;
  }

  await Promise.all([
    fs.rm(path.join(config.logRoot, "latest-qr.txt"), { force: true }).catch(() => {}),
    fs.rm(path.join(config.logRoot, "latest-qr.raw.txt"), { force: true }).catch(() => {}),
  ]);
}

async function resetWhatsAppSession(config) {
  if (!config) {
    return;
  }

  await Promise.all([
    fs.rm(config.whatsappSessionDir, { recursive: true, force: true }).catch(() => {}),
    clearQrFiles(config),
  ]);
}

function createWindow() {
  const { workAreaSize } = screen.getPrimaryDisplay();
  const targetWidth = Math.min(1360, Math.max(1140, workAreaSize.width - 40));
  const targetHeight = Math.min(860, Math.max(700, workAreaSize.height - 40));

  mainWindow = new BrowserWindow({
    width: targetWidth,
    height: targetHeight,
    minWidth: 1100,
    minHeight: 700,
    resizable: true,
    maximizable: true,
    fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle("settings:load", async () => {
  return loadSettings();
});

ipcMain.handle("settings:save", async (_event, settings) => {
  await saveSettings(settings);
  if (service) {
    pushLog("[app] Konfigurasi baru disimpan. Bot direstart agar whitelist/blacklist terbaru aktif.");
    await startServiceWithSettings(settings);
    await emitStatus();
  }

  return {
    ok: true,
    state: service ? service.getState() : { status: "stopped", running: false },
    ...(await readQrPayload()),
  };
});

ipcMain.handle("settings:export", async (_event, settings) => {
  const targetWindow = BrowserWindow.getFocusedWindow() || mainWindow;
  const result = await dialog.showSaveDialog(targetWindow, {
    title: "Simpan Template Konfigurasi",
    defaultPath: "iris-organizer-config.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (result.canceled || !result.filePath) {
    return { ok: false, canceled: true };
  }

  await fs.writeFile(result.filePath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  return { ok: true, filePath: result.filePath };
});

ipcMain.handle("settings:import", async () => {
  const targetWindow = BrowserWindow.getFocusedWindow() || mainWindow;
  const result = await dialog.showOpenDialog(targetWindow, {
    title: "Impor Template Konfigurasi",
    properties: ["openFile"],
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return { ok: false, canceled: true };
  }

  const raw = await fs.readFile(result.filePaths[0], "utf8");
  const imported = JSON.parse(raw);
  const merged = {
    ...defaultSettings(),
    ...imported,
  };

  await saveSettings(merged);
  return {
    ok: true,
    settings: merged,
    filePath: result.filePaths[0],
  };
});

ipcMain.handle("service:start", async (_event, settings) => {
  await saveSettings(settings);
  await startServiceWithSettings(settings);
  return {
    ok: true,
    state: service ? service.getState() : { status: "stopped", running: false },
    ...(await readQrPayload()),
  };
});

ipcMain.handle("service:stop", async () => {
  await stopService();
  return { ok: true };
});

ipcMain.handle("service:refresh-qr", async (_event, settings) => {
  await saveSettings(settings);
  const cfg = buildServiceConfigFromSettings(settings);

  pushLog("[whatsapp] Refresh QR diminta. Session lokal akan direset dan perlu scan ulang.");
  await stopService();
  await resetWhatsAppSession(cfg);
  await startServiceWithSettings(settings);
  await emitStatus();

  return {
    ok: true,
    state: service ? service.getState() : { status: "stopped", running: false },
    ...(await readQrPayload()),
  };
});

ipcMain.handle("service:state", async () => {
  const settings = await loadSettings();
  return {
    settings,
    state: service ? service.getState() : { status: "stopped", running: false },
    groups: service ? service.groupCatalog : [],
    ...(await readQrPayload()),
    logs: logBuffer,
  };
});

ipcMain.handle("service:test-iris", async (_event, settings) => {
  const cfg = buildServiceConfigFromSettings(settings);
  const url = new URL(cfg.irisDecidePath, cfg.irisBaseUrl).toString();

  const response = await axios.post(
    url,
    {
      text: "tolong cari kontrak april",
      hasMedia: false,
      lastSearchResults: [],
    },
    {
      timeout: cfg.irisTimeoutMs,
      headers: {
        Authorization: `Bearer ${cfg.irisApiToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  return {
    ok: true,
    response: response.data,
  };
});

ipcMain.handle("service:open-folder", async (_event, kind) => {
  const { shell } = require("electron");
  const settings = await loadSettings();
  const cfg = buildServiceConfigFromSettings(settings);
  const targets = {
    storage: cfg.storageRoot,
    runtime: path.dirname(cfg.storageRoot),
    logs: cfg.logRoot,
  };

  if (targets[kind]) {
    await shell.openPath(targets[kind]);
  }

  return { ok: true };
});

app.whenReady().then(async () => {
  createWindow();
  const settings = await loadSettings();
  serviceConfig = buildServiceConfigFromSettings(settings);
});

app.on("window-all-closed", async () => {
  await stopService().catch(() => {});
  if (process.platform !== "darwin") {
    app.quit();
  }
});
