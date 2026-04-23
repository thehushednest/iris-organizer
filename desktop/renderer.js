const fields = {
  botName: document.getElementById("botName"),
  ownerTitle: document.getElementById("ownerTitle"),
  allowedNumbers: document.getElementById("allowedNumbers"),
  defaultCategory: document.getElementById("defaultCategory"),
  irisBaseUrl: document.getElementById("irisBaseUrl"),
  irisDecidePath: document.getElementById("irisDecidePath"),
  irisApiToken: document.getElementById("irisApiToken"),
  botApiToken: document.getElementById("botApiToken"),
  botHttpPort: document.getElementById("botHttpPort"),
  irisTimeoutMs: document.getElementById("irisTimeoutMs"),
  irisFallbackEnabled: document.getElementById("irisFallbackEnabled"),
};

const statusText = document.getElementById("statusText");
const statusHint = document.getElementById("statusHint");
const qrBox = document.getElementById("qrBox");
const qrImage = document.getElementById("qrImage");
const logBox = document.getElementById("logBox");
const qrStateBadge = document.getElementById("qrStateBadge");
const connectionBadge = document.getElementById("connectionBadge");
const refreshQrBtn = document.getElementById("refreshQrBtn");

function setBadge(element, label, tone) {
  element.textContent = label;
  element.className = `state-badge ${tone}`;
}

function collectSettings() {
  return {
    botName: fields.botName.value.trim(),
    ownerTitle: fields.ownerTitle.value.trim(),
    allowedNumbers: fields.allowedNumbers.value.trim(),
    defaultCategory: fields.defaultCategory.value.trim(),
    irisBaseUrl: fields.irisBaseUrl.value.trim(),
    irisDecidePath: fields.irisDecidePath.value.trim(),
    irisApiToken: fields.irisApiToken.value,
    botApiToken: fields.botApiToken.value,
    botHttpPort: fields.botHttpPort.value.trim(),
    irisTimeoutMs: fields.irisTimeoutMs.value.trim(),
    irisFallbackEnabled: fields.irisFallbackEnabled.checked,
  };
}

function applySettings(settings) {
  Object.entries(fields).forEach(([key, element]) => {
    if (element.type === "checkbox") {
      element.checked = Boolean(settings[key]);
    } else {
      element.value = settings[key] ?? "";
    }
  });
}

function appendLog(line) {
  const existing = logBox.textContent === "Belum ada log." ? "" : `${logBox.textContent}\n`;
  logBox.textContent = `${existing}${line}`.trim();
  logBox.scrollTop = logBox.scrollHeight;
}

function fitQrBox() {
  if (
    qrImage.src ||
    !qrBox.textContent ||
    qrBox.textContent === "QR belum tersedia."
  ) {
    qrBox.style.fontSize = "";
    qrBox.style.lineHeight = "";
    return;
  }

  qrBox.style.fontSize = "8px";
  qrBox.style.lineHeight = "0.72";

  requestAnimationFrame(() => {
    for (let size = 8; size >= 2.5; size -= 0.25) {
      qrBox.style.fontSize = `${size}px`;
      qrBox.style.lineHeight = String(Math.max(0.5, size / 12));

      const fitsWidth = qrBox.scrollWidth <= qrBox.clientWidth + 1;
      const fitsHeight = qrBox.scrollHeight <= qrBox.clientHeight + 1;
      if (fitsWidth && fitsHeight) {
        break;
      }
    }
  });
}

function renderQr(payload) {
  if (payload.qrImage) {
    qrImage.src = payload.qrImage;
    qrImage.hidden = false;
    qrBox.hidden = true;
    setBadge(qrStateBadge, "QR Tersedia", "waiting");
    return;
  }

  qrImage.removeAttribute("src");
  qrImage.hidden = true;
  qrBox.hidden = false;

  if (payload.qrText) {
    qrBox.textContent = payload.qrText;
    fitQrBox();
    setBadge(qrStateBadge, "QR Tersedia", "waiting");
  } else if (!payload.running) {
    qrBox.textContent = "QR belum tersedia.";
    fitQrBox();
    setBadge(qrStateBadge, "Belum Ada QR", "idle");
  }
}

function renderState(payload) {
  if (!payload) return;
  statusText.textContent = payload.botName
    ? `${payload.botName} • ${payload.status || "unknown"}`
    : payload.status || "unknown";

  statusHint.textContent = payload.running
    ? "Bot sedang aktif. Jika QR masih muncul, scan terlebih dahulu sampai status connected."
    : "Bot belum berjalan. Isi konfigurasi lalu tekan Jalankan Bot.";

  const status = String(payload.status || "idle").toLowerCase();
  if (status.includes("disconnect")) {
    setBadge(connectionBadge, payload.status || "Disconnected", "error");
  } else if (status.includes("connect") || status === "running") {
    setBadge(connectionBadge, payload.status || "Running", "running");
  } else if (status.includes("wait") || status.includes("start")) {
    setBadge(connectionBadge, payload.status || "Starting", "waiting");
  } else if (status.includes("stop")) {
    setBadge(connectionBadge, payload.status || "Stopped", "idle");
  } else {
    setBadge(connectionBadge, payload.status || "Idle", "idle");
  }

  renderQr(payload);
}

async function bootstrap() {
  const snapshot = await window.irisDesktop.getState();
  applySettings(snapshot.settings);
  renderState(snapshot.state);
  renderQr(snapshot);
  if (Array.isArray(snapshot.logs) && snapshot.logs.length > 0) {
    logBox.textContent = snapshot.logs.join("\n");
  }
}

document.getElementById("saveBtn").addEventListener("click", async () => {
  await window.irisDesktop.saveSettings(collectSettings());
  appendLog("Konfigurasi berhasil disimpan.");
});

document.getElementById("exportBtn").addEventListener("click", async () => {
  try {
    const result = await window.irisDesktop.exportSettings(collectSettings());
    if (result && result.ok && result.filePath) {
      appendLog(`Template konfigurasi berhasil diekspor ke ${result.filePath}`);
    }
  } catch (error) {
    appendLog(`Gagal mengekspor template konfigurasi: ${error.message}`);
  }
});

document.getElementById("importBtn").addEventListener("click", async () => {
  try {
    const result = await window.irisDesktop.importSettings();
    if (result && result.ok && result.settings) {
      applySettings(result.settings);
      appendLog(`Template konfigurasi berhasil diimpor dari ${result.filePath}`);
    }
  } catch (error) {
    appendLog(`Gagal mengimpor template konfigurasi: ${error.message}`);
  }
});

document.getElementById("testIrisBtn").addEventListener("click", async () => {
  appendLog("Mengecek koneksi ke IRIS...");
  try {
    const result = await window.irisDesktop.testIris(collectSettings());
    appendLog(`Koneksi IRIS berhasil: ${JSON.stringify(result.response)}`);
  } catch (error) {
    appendLog(`Koneksi IRIS gagal: ${error.message}`);
    setBadge(connectionBadge, "IRIS Error", "error");
  }
});

document.getElementById("startBtn").addEventListener("click", async () => {
  appendLog("Menjalankan bot...");
  const result = await window.irisDesktop.startService(collectSettings());
  renderState(result.state);
  renderQr(result);
});

document.getElementById("stopBtn").addEventListener("click", async () => {
  await window.irisDesktop.stopService();
  appendLog("Perintah stop dikirim.");
});

refreshQrBtn.addEventListener("click", async () => {
  refreshQrBtn.disabled = true;
  appendLog("Meminta QR WhatsApp baru...");
  try {
    const result = await window.irisDesktop.refreshQr(collectSettings());
    renderState(result.state);
    renderQr(result);
  } catch (error) {
    appendLog(`Gagal refresh QR WhatsApp: ${error.message}`);
    setBadge(qrStateBadge, "QR Error", "error");
  } finally {
    refreshQrBtn.disabled = false;
  }
});

document.getElementById("openStorageBtn").addEventListener("click", () => {
  window.irisDesktop.openFolder("storage");
});

document.getElementById("openLogsBtn").addEventListener("click", () => {
  window.irisDesktop.openFolder("logs");
});

document.getElementById("openRuntimeBtn").addEventListener("click", () => {
  window.irisDesktop.openFolder("runtime");
});

window.irisDesktop.onLog((line) => {
  appendLog(line);
});

window.irisDesktop.onStatus((payload) => {
  renderState(payload);
});

window.addEventListener("resize", fitQrBox);

bootstrap().catch((error) => {
  appendLog(`Gagal memuat aplikasi: ${error.message}`);
});
