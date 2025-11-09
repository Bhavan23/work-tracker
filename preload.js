// preload.js – safe IPC bridge
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // entries
  readEntries: () => ipcRenderer.invoke('entries:read'),
  saveEntry: (text) => ipcRenderer.invoke('entries:save', text),

  // config
  getConfig: () => ipcRenderer.invoke('config:get'),
  setConfig: (partial) => ipcRenderer.invoke('config:set', partial),

  // prompts
  skipNext: () => ipcRenderer.invoke('prompt:skipNext'),
  getNextPromptInfo: () => ipcRenderer.invoke('prompt:nextInfo'),

  // backups
  createBackup: () => ipcRenderer.invoke('backup:create'),
  getBackupPath: () => ipcRenderer.invoke('backup:path'),
  openBackupFolder: () => ipcRenderer.invoke('backup:openFolder'),
  restoreFromFile: () => ipcRenderer.invoke('backup:restore'),

  // events from main
  onOpenPrompt: (cb) => ipcRenderer.on('open-prompt', cb),
  onApplyTheme: (cb) => ipcRenderer.on('apply-theme', (_e, payload) => cb(payload)),
});
