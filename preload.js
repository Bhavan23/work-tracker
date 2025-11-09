// preload.js — safe bridge
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  readEntries: () => ipcRenderer.invoke("read-entries"),
  saveEntry: (text) => ipcRenderer.invoke("save-entry", text),
  createBackup: () => ipcRenderer.invoke("create-backup"),
  getBackupPath: () => ipcRenderer.invoke("get-backup-path"),
  openBackupFolder: () => ipcRenderer.invoke("open-backup-folder"),
  restoreFromFile: () => ipcRenderer.invoke("restore-from-file"),
  getConfig: () => ipcRenderer.invoke("get-config"),
  setConfig: (partial) => ipcRenderer.invoke("set-config", partial),
  skipNext: () => ipcRenderer.invoke("skip-next"),
  getUserDataPath: () => ipcRenderer.invoke("get-userdata-path"),
  getNextPromptInfo: () => ipcRenderer.invoke("get-next-prompt-info"),
  onOpenPrompt: (cb) => ipcRenderer.on("open-prompt", cb),
  onApplyTheme: (cb) => ipcRenderer.on("apply-theme", (_, payload)=> cb(payload)),
});
