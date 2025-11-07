const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  readEntries: () => ipcRenderer.invoke("read-entries"),
  saveEntry: (text) => ipcRenderer.invoke("save-entry", text),
  setIntervalMinutes: (minutes) => ipcRenderer.invoke("set-interval-minutes", minutes),
  onOpenPrompt: (cb) => ipcRenderer.on("open-prompt", cb)
});
