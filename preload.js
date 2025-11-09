// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  readEntries: () => ipcRenderer.invoke("read-entries"),
  saveEntry: (text) => ipcRenderer.invoke("save-entry", text),
  createBackup: () => ipcRenderer.invoke("create-backup"),
  getBackupPath: () => ipcRenderer.invoke("get-backup-path"),
  getConfig: () => ipcRenderer.invoke("get-config"),
  setConfig: (obj) => ipcRenderer.invoke("set-config", obj),
  skipNext: () => ipcRenderer.invoke("skip-next"),
  setIntervalMinutes: (m) => ipcRenderer.invoke("set-interval-minutes", m),
  getUserdataPath: () => ipcRenderer.invoke("get-userdata-path"),
  onOpenPrompt: (cb) => ipcRenderer.on("open-prompt", cb),
});
