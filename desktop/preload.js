const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("irisDesktop", {
  loadSettings: () => ipcRenderer.invoke("settings:load"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  exportSettings: (settings) => ipcRenderer.invoke("settings:export", settings),
  importSettings: () => ipcRenderer.invoke("settings:import"),
  startService: (settings) => ipcRenderer.invoke("service:start", settings),
  stopService: () => ipcRenderer.invoke("service:stop"),
  refreshQr: (settings) => ipcRenderer.invoke("service:refresh-qr", settings),
  getState: () => ipcRenderer.invoke("service:state"),
  testIris: (settings) => ipcRenderer.invoke("service:test-iris", settings),
  openFolder: (kind) => ipcRenderer.invoke("service:open-folder", kind),
  onLog: (callback) => ipcRenderer.on("service-log", (_event, payload) => callback(payload)),
  onStatus: (callback) =>
    ipcRenderer.on("service-status", (_event, payload) => callback(payload)),
});
