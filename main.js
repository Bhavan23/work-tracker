// main.js – Electron main, IST-aware display (rendering), UTC math internally
const { app, BrowserWindow, ipcMain, dialog, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let win;

// ---------- Paths (store in app directory) ----------
const APP_DIR = app.getAppPath(); // project dir in dev
const DATA_DIR = path.join(APP_DIR, 'data');
const BACKUP_DIR = path.join(APP_DIR, 'backups');
const CONFIG_PATH = path.join(APP_DIR, 'config.json');
const ENTRIES_PATH = path.join(DATA_DIR, 'entries.json');

// ensure dirs
function ensureDirs() {
  [DATA_DIR, BACKUP_DIR].forEach(p => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); });
}

// default config
const defaultConfig = {
  ask_enabled: true,
  ask_interval_minutes: 15,
  notifications_enabled: true,
  backup_keep_days: 10,
  dark_mode: false,
  compact_mode: false
};

function readJSONSafe(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const raw = fs.readFileSync(file, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function writeJSONSafe(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

// entries helpers
function loadEntries() {
  return readJSONSafe(ENTRIES_PATH, []);
}
function saveEntries(arr) {
  writeJSONSafe(ENTRIES_PATH, arr);
}

// config helpers
function loadConfig() {
  let cfg = readJSONSafe(CONFIG_PATH, defaultConfig);
  // fill missing keys if config was partial
  cfg = { ...defaultConfig, ...cfg };
  writeJSONSafe(CONFIG_PATH, cfg);
  return cfg;
}
function saveConfig(partial) {
  const current = loadConfig();
  const next = { ...current, ...partial };
  writeJSONSafe(CONFIG_PATH, next);
  // inform renderer theme toggles
  if (win) {
    win.webContents.send('apply-theme', { dark: !!next.dark_mode, compact: !!next.compact_mode });
  }
  return next;
}

// ---------- Prompt timer ----------
let promptInterval = null;
let nextPromptAt = null;

function schedulePromptTimer() {
  clearPromptTimer();

  const cfg = loadConfig();
  if (!cfg.ask_enabled) {
    nextPromptAt = null;
    return;
  }

  const ms = Math.max(1, Number(cfg.ask_interval_minutes || 15)) * 60 * 1000;
  nextPromptAt = Date.now() + ms;

  promptInterval = setTimeout(() => {
    // push window to front & ask
    if (win) {
      win.show();
      win.focus();
      win.moveTop && win.moveTop(); // on some WM
      win.webContents.send('open-prompt');

      // optional system notification
      if (cfg.notifications_enabled && Notification.isSupported()) {
        new Notification({
          title: 'Work Tracker',
          body: 'Time to log what you’re working on.',
          silent: false
        }).show();
      }
    }
    // reschedule again
    schedulePromptTimer();
  }, ms);
}
function clearPromptTimer() {
  if (promptInterval) {
    clearTimeout(promptInterval);
    promptInterval = null;
  }
}

// Compute next prompt info for countdown
function getNextPromptInfo() {
  if (!nextPromptAt) return { remainingMs: 0 };
  const remaining = Math.max(0, nextPromptAt - Date.now());
  return { remainingMs: remaining };
}

// ---------- Backup (one file per day, update same file) ----------
function formatDateYYYYMMDD(d = new Date()) {
  // Use UTC date to name the file consistently; contents will store IST timestamps anyway
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dailyBackupPathFor(d = new Date()) {
  return path.join(BACKUP_DIR, `${formatDateYYYYMMDD(d)}.json`);
}

// Merge entries into today's backup (update file, not create multiple)
function createOrUpdateDailyBackup() {
  const entries = loadEntries();
  const todayPath = dailyBackupPathFor(new Date());

  // keep only most recent N days of backups
  const cfg = loadConfig();
  const keepDays = Math.max(1, Number(cfg.backup_keep_days || 10));
  pruneBackups(keepDays);

  writeJSONSafe(todayPath, { updated_at: new Date().toISOString(), entries });
  return { ok: true, path: todayPath };
}

function pruneBackups(keepDays) {
  try {
    const files = fs.readdirSync(BACKUP_DIR).filter(f => f.endsWith('.json'));
    const dated = files.map(f => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }));
    dated.sort((a, b) => b.t - a.t);
    const toRemove = dated.slice(keepDays);
    toRemove.forEach(({ f }) => fs.unlinkSync(path.join(BACKUP_DIR, f)));
  } catch {}
}

// ---------- Restore from file ----------
async function restoreFromFileDialog() {
  const res = await dialog.showOpenDialog(win, {
    title: 'Restore from backup',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true };

  try {
    const file = res.filePaths[0];
    const data = readJSONSafe(file, null);
    if (!data) throw new Error('Invalid file');
    const entries = Array.isArray(data.entries) ? data.entries : Array.isArray(data) ? data : [];
    if (!Array.isArray(entries)) throw new Error('No entries found in selected file');

    saveEntries(entries);
    return { ok: true, restored: entries.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------- Open backup folder ----------
function openBackupFolder() {
  try {
    shell.openPath(BACKUP_DIR);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ---------- Window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Work Tracker',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  win.loadFile('index.html');

  // start timer
  schedulePromptTimer();
}

// ---------- IPC ----------
ipcMain.handle('entries:read', async () => loadEntries());
ipcMain.handle('entries:save', async (_e, text) => {
  const arr = loadEntries();
  // Save raw ISO; display as IST in renderer
  arr.unshift({
    text: String(text || '').trim(),
    ts: new Date().toISOString()
  });
  saveEntries(arr);
  return { ok: true };
});

ipcMain.handle('config:get', async () => loadConfig());
ipcMain.handle('config:set', async (_e, partial) => {
  const next = saveConfig(partial || {});
  // if interval or ask_enabled changed, reschedule
  clearPromptTimer();
  schedulePromptTimer();
  return next;
});

ipcMain.handle('prompt:skipNext', async () => {
  // move next prompt 1 full interval away
  const cfg = loadConfig();
  const ms = Math.max(1, Number(cfg.ask_interval_minutes || 15)) * 60 * 1000;
  nextPromptAt = Date.now() + ms;
  clearPromptTimer();
  schedulePromptTimer();
  return { ok: true };
});

ipcMain.handle('prompt:nextInfo', async () => getNextPromptInfo());

ipcMain.handle('backup:create', async () => createOrUpdateDailyBackup());
ipcMain.handle('backup:path', async () => dailyBackupPathFor(new Date()));
ipcMain.handle('backup:openFolder', async () => openBackupFolder());
ipcMain.handle('backup:restore', async () => restoreFromFileDialog());

app.whenReady().then(() => {
  ensureDirs();
  // seed files if missing
  if (!fs.existsSync(CONFIG_PATH)) writeJSONSafe(CONFIG_PATH, defaultConfig);
  if (!fs.existsSync(ENTRIES_PATH)) writeJSONSafe(ENTRIES_PATH, []);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// expose theme apply back to renderer when config changes
// (already sent in saveConfig)
