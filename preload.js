// preload.js - exposes safe API to renderer
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  readEntries: () => ipcRenderer.invoke("read-entries"),
  saveEntry: (text) => ipcRenderer.invoke("save-entry", text),
  createBackup: () => ipcRenderer.invoke("create-backup"),
  getBackupPath: () => ipcRenderer.invoke("get-backup-path"),
  openBackupFolder: () => ipcRenderer.invoke("open-backup-folder"),
  getConfig: () => ipcRenderer.invoke("get-config"),
  setConfig: (partial) => ipcRenderer.invoke("set-config", partial),
  skipNext: () => ipcRenderer.invoke("skip-next"),
  getUserDataPath: () => ipcRenderer.invoke("get-userdata-path"),
  // allow main to tell renderer to open prompt
  onOpenPrompt: (cb) => ipcRenderer.on("open-prompt", cb),
});
