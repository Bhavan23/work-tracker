// main.js - Work Tracker (with system notification on settings change + scheduled confirmation)
const { app, BrowserWindow, Notification, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

// ----------------- Paths -----------------
const USERDATA = app.getPath("userData");
const DATA_FILE = path.join(USERDATA, "data.json");
const CONFIG_FILE = path.join(USERDATA, "config.json");
const APP_BACKUP_DIR = path.join(__dirname, "backups");
const USERDATA_BACKUP_DIR = path.join(USERDATA, "backups");
let BACKUP_DIR = APP_BACKUP_DIR;
const LOG_FILE = path.join(USERDATA, "work-tracker.log");

// ----------------- Runtime -----------------
let mainWindow = null;
let timer = null;
let unsavedCounter = 0;
let scheduledSettingConfirmation = null; // timeout id for scheduled confirmation notification

// ----------------- Logging -----------------
function appendLog(level, ...args) {
  try {
    const ts = new Date().toISOString();
    const line = `${ts} [${level}] ${args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}\n`;
    fs.appendFileSync(LOG_FILE, line, "utf8");
  } catch {}
}
["log", "info", "warn", "error"].forEach(m => {
  const orig = console[m];
  console[m] = (...a) => { try { orig(...a); } catch {} appendLog(m.toUpperCase(), ...a); };
});
console.info("Work Tracker userData:", USERDATA);

// ----------------- File Helpers -----------------
function writeJsonAtomic(filePath, data) {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath);
}
function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw || "null");
  } catch {
    return fallback;
  }
}

// ----------------- Config -----------------
function defaultConfig() {
  return {
    ask_enabled: true,
    skip_next: false,
    ask_interval_minutes: 15,
    notifications_enabled: true,
    backup_keep_days: 10,
  };
}
function ensureDirsAndFiles() {
  if (!fs.existsSync(USERDATA)) fs.mkdirSync(USERDATA, { recursive: true });
  if (!fs.existsSync(APP_BACKUP_DIR)) fs.mkdirSync(APP_BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(USERDATA_BACKUP_DIR)) fs.mkdirSync(USERDATA_BACKUP_DIR, { recursive: true });
  BACKUP_DIR = fs.existsSync(APP_BACKUP_DIR) ? APP_BACKUP_DIR : USERDATA_BACKUP_DIR;
  if (!fs.existsSync(DATA_FILE)) writeJsonAtomic(DATA_FILE, []);
  if (!fs.existsSync(CONFIG_FILE)) writeJsonAtomic(CONFIG_FILE, defaultConfig());
  if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, "");
}
function loadConfig() {
  ensureDirsAndFiles();
  const cfg = readJsonSafe(CONFIG_FILE, defaultConfig());
  return Object.assign(defaultConfig(), cfg);
}
function saveConfig(cfg) {
  writeJsonAtomic(CONFIG_FILE, cfg);
}

// ----------------- Backup (One per day) -----------------
function createBackup() {
  ensureDirsAndFiles();
  const cfg = loadConfig();
  const today = new Date().toISOString().slice(0, 10);
  const filename = `data-${today}.json`;
  const dest = path.join(BACKUP_DIR, filename);
  try {
    const data = readJsonSafe(DATA_FILE, []) || [];
    writeJsonAtomic(dest, data);
    console.info(`Backup updated: ${dest}`);
    pruneBackups(cfg.backup_keep_days || 10);
  } catch (e) {
    console.error("Backup failed:", e);
  }
}
function pruneBackups(keepDays = 10) {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => /^data-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .map(x => x.f);
    for (let i = keepDays; i < files.length; i++) {
      fs.unlinkSync(path.join(BACKUP_DIR, files[i]));
    }
  } catch (e) {
    console.error("Prune backup error:", e);
  }
}

// ----------------- Data -----------------
function readEntries(limit = 50) {
  const arr = readJsonSafe(DATA_FILE, []);
  return Array.isArray(arr) ? arr.slice(0, limit) : [];
}
function saveEntry(text) {
  const arr = readJsonSafe(DATA_FILE, []);
  arr.unshift({ text, ts: new Date().toISOString() });
  writeJsonAtomic(DATA_FILE, arr);
  unsavedCounter++;
  if (unsavedCounter >= 20) {
    createBackup();
    unsavedCounter = 0;
  }
}

// ----------------- Notifications -----------------
function systemNotificationsAvailable() {
  if (process.env.WORK_TRACKER_DISABLE_NOTIFICATIONS === "1") return false;
  if (process.platform !== "linux") return true;
  if (!process.env.DISPLAY && !process.env.XDG_RUNTIME_DIR) return false;
  try {
    const ver = fs.readFileSync("/proc/version", "utf8").toLowerCase();
    if (ver.includes("microsoft") || ver.includes("wsl")) return false;
  } catch {}
  return true;
}

function showSystemNotification(title, body) {
  try {
    const notif = new Notification({ title, body });
    notif.show();
  } catch (e) {
    console.warn("showSystemNotification failed", e);
  }
}

// ----------------- UI Helpers -----------------
function bringWindowToFront() {
  if (!mainWindow) return;
  try {
    if (mainWindow.isMinimized && mainWindow.isMinimized()) {
      try { mainWindow.restore(); } catch (e) {}
    }
    try { mainWindow.show(); } catch (e) {}
    try { mainWindow.setAlwaysOnTop(true, "screen-saver"); } catch (e) {}
    try { mainWindow.focus(); } catch (e) {}
    setTimeout(() => {
      try { mainWindow.setAlwaysOnTop(false); } catch (e) {}
    }, 900);
  } catch (e) {
    console.error("bringWindowToFront error", e);
  }
}

// ----------------- Force-front helper (retries) -----------------
async function forceWindowToFront(retries = 3) {
  if (!mainWindow) return;
  try {
    try { mainWindow.setFocusable(true); } catch (e) {}
    if (mainWindow.isMinimized && mainWindow.isMinimized()) {
      try { mainWindow.restore(); } catch (e) {}
    }
    try { mainWindow.show(); } catch (e) {}
    try { mainWindow.setVisibleOnAllWorkspaces(true); } catch (e) {}
    try { mainWindow.setAlwaysOnTop(true, "screen-saver"); } catch (e) {}
    try { if (app && typeof app.focus === "function") app.focus(); } catch (e) {}
    try { mainWindow.focus(); } catch (e) {}
    setTimeout(() => {
      try { mainWindow.webContents.send("open-prompt"); } catch (e) {}
    }, 120);
    setTimeout(() => {
      try { mainWindow.setAlwaysOnTop(false); } catch (e) {}
      try { mainWindow.setVisibleOnAllWorkspaces(false); } catch (e) {}
    }, 900);
    if (retries > 0) {
      setTimeout(async () => {
        try {
          const focused = typeof mainWindow.isFocused === "function" ? mainWindow.isFocused() : false;
          if (!focused) await forceWindowToFront(retries - 1);
        } catch {}
      }, 500);
    }
  } catch (e) {
    console.error("forceWindowToFront error", e);
  }
}

// ----------------- Prompt -----------------
function showPrompt() {
  const cfg = loadConfig();
  if (!cfg.ask_enabled) return;
  if (cfg.skip_next) {
    cfg.skip_next = false;
    saveConfig(cfg);
    return;
  }

  // Force front aggressively
  forceWindowToFront();

  // Notifications allowed?
  const notifAllowed = cfg.notifications_enabled && systemNotificationsAvailable();
  if (notifAllowed) {
    try {
      const notif = new Notification({ title: "What are you working on?", body: "Click to log your activity." });
      notif.on("click", () => {
        forceWindowToFront();
      });
      notif.show();
    } catch (e) {
      try { mainWindow?.webContents.send("open-prompt"); } catch (e) {}
    }
  } else {
    try { mainWindow?.webContents.send("open-prompt"); } catch (e) {}
  }
}

// ----------------- Timer -----------------
function startTimerFromConfig() {
  stopTimer();
  const cfg = loadConfig();
  const mins = Math.max(1, cfg.ask_interval_minutes || 15);
  const ms = mins * 60 * 1000;
  timer = setInterval(showPrompt, ms);
  setTimeout(showPrompt, 300);
  console.info(`Timer started with ${mins} minute interval`);
}
function stopTimer() {
  if (timer) clearInterval(timer);
  timer = null;
}

// ----------------- Window -----------------
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 600,
    focusable: true,
    alwaysOnTop: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.on("closed", () => (mainWindow = null));
}

// ----------------- Helper: schedule confirmation notifications after settings change -----------------
function scheduleSettingConfirmation(cfg) {
  // clear existing scheduled confirmation
  if (scheduledSettingConfirmation) {
    clearTimeout(scheduledSettingConfirmation);
    scheduledSettingConfirmation = null;
  }

  // If notifications disabled by config or system, do not schedule
  if (!cfg.notifications_enabled || !systemNotificationsAvailable()) return;

  const mins = Math.max(1, Number(cfg.ask_interval_minutes) || 15);
  // One-time confirmation at next scheduled interval
  scheduledSettingConfirmation = setTimeout(() => {
    try {
      showSystemNotification("Work Tracker", `Next prompt will appear in ${mins} minute(s).`);
    } catch (e) {
      console.warn("scheduledSettingConfirmation failed", e);
    } finally {
      scheduledSettingConfirmation = null;
    }
  }, mins * 60 * 1000);
}

// ----------------- IPC -----------------
ipcMain.handle("read-entries", () => readEntries());
ipcMain.handle("save-entry", (_, text) => {
  saveEntry(text);
  return readEntries();
});
ipcMain.handle("create-backup", () => { createBackup(); return { ok: true }; });
ipcMain.handle("get-backup-path", () => BACKUP_DIR);

ipcMain.handle("get-config", () => loadConfig());
ipcMain.handle("set-config", (_, partial) => {
  const oldCfg = loadConfig();
  const cfg = Object.assign(oldCfg, partial);
  saveConfig(cfg);

  // restart timer if interval changed
  if (partial.ask_interval_minutes !== undefined) startTimerFromConfig();

  // send immediate system notification confirming change (if allowed)
  if (cfg.notifications_enabled && systemNotificationsAvailable()) {
    try {
      showSystemNotification("Work Tracker settings saved", `Interval: ${cfg.ask_interval_minutes} minute(s)`);
    } catch (e) {
      console.warn("Immediate setting notification failed", e);
    }
  }

  // schedule a one-time confirmation at next interval (only if notifications allowed)
  scheduleSettingConfirmation(cfg);

  return cfg;
});

ipcMain.handle("skip-next", () => {
  const cfg = loadConfig();
  cfg.skip_next = true;
  saveConfig(cfg);
  return cfg;
});
ipcMain.handle("get-userdata-path", () => USERDATA);

// ----------------- App Lifecycle -----------------
app.whenReady().then(() => {
  ensureDirsAndFiles();
  createMainWindow();
  startTimerFromConfig();
  // schedule confirmation for current config on startup if notifications allowed
  scheduleSettingConfirmation(loadConfig());
  app.on("activate", () => { if (!mainWindow) createMainWindow(); });
});

app.on("before-quit", () => {
  try { createBackup(); } catch (e) { console.error("Backup on quit failed", e); }
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
