// main.js — Work Tracker (tabs UI + open folder + restore + countdown + themes)
const { app, BrowserWindow, Notification, ipcMain, shell, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const USERDATA = app.getPath("userData");
const DATA_FILE = path.join(USERDATA, "data.json");
const CONFIG_FILE = path.join(USERDATA, "config.json");
const APP_BACKUP_DIR = path.join(__dirname, "backups");
const USERDATA_BACKUP_DIR = path.join(USERDATA, "backups");
let BACKUP_DIR = APP_BACKUP_DIR;
const LOG_FILE = path.join(USERDATA, "work-tracker.log");

let mainWindow = null;
let timer = null;
let nextPromptAt = null; // Date
let unsavedCounter = 0;

function appendLog(level, ...args) {
  try {
    const ts = new Date().toISOString();
    const line = `${ts} [${level}] ${args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ")}\n`;
    fs.appendFileSync(LOG_FILE, line, "utf8");
  } catch {}
}
["log","info","warn","error"].forEach(m=>{
  const orig = console[m];
  console[m]=(...a)=>{ try{ orig(...a) }catch{} appendLog(m.toUpperCase(), ...a) };
});

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

function defaultConfig() {
  return {
    ask_enabled: true,
    skip_next: false,
    ask_interval_minutes: 15,
    notifications_enabled: true,
    backup_keep_days: 10,
    dark_mode: false,
    compact_mode: false,
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
function saveConfig(cfg) { writeJsonAtomic(CONFIG_FILE, cfg); }

function createBackup() {
  ensureDirsAndFiles();
  const cfg = loadConfig();
  const today = new Date().toISOString().slice(0,10);
  const filename = `data-${today}.json`;
  const dest = path.join(BACKUP_DIR, filename);
  try {
    const data = readJsonSafe(DATA_FILE, []) || [];
    writeJsonAtomic(dest, data);
    pruneBackups(cfg.backup_keep_days || 10);
    return { ok: true, path: dest };
  } catch (e) {
    console.error("Backup failed:", e);
    return { ok: false, error: String(e) };
  }
}
function pruneBackups(keepDays = 10) {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => /^data-\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a,b)=>b.t-a.t).map(x=>x.f);
    for (let i = keepDays; i < files.length; i++) {
      fs.unlinkSync(path.join(BACKUP_DIR, files[i]));
    }
  } catch (e) {
    console.error("Prune backup error:", e);
  }
}

// Entries
function readEntries(limit = 200) {
  const arr = readJsonSafe(DATA_FILE, []);
  return Array.isArray(arr) ? arr.slice(0, limit) : [];
}
function saveEntry(text) {
  const arr = readJsonSafe(DATA_FILE, []);
  arr.unshift({ text, ts: new Date().toISOString() });
  writeJsonAtomic(DATA_FILE, arr);
  unsavedCounter++;
  if (unsavedCounter >= 20) { createBackup(); unsavedCounter = 0; }
}

// Notifications
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
  try { new Notification({ title, body }).show(); } catch {}
}

// Prompt window focusing
async function forceWindowToFront(retries = 3) {
  if (!mainWindow) return;
  try {
    try { mainWindow.setFocusable(true) } catch {}
    if (mainWindow.isMinimized && mainWindow.isMinimized()) try { mainWindow.restore() } catch {}
    try { mainWindow.show() } catch {}
    try { mainWindow.setVisibleOnAllWorkspaces(true) } catch {}
    try { mainWindow.setAlwaysOnTop(true, "screen-saver") } catch {}
    try { app.focus() } catch {}
    try { mainWindow.focus() } catch {}
    setTimeout(()=>{ try { mainWindow.webContents.send("open-prompt") } catch {} }, 120);
    setTimeout(()=>{ try { mainWindow.setAlwaysOnTop(false); mainWindow.setVisibleOnAllWorkspaces(false) } catch {} }, 900);
    if (retries > 0) setTimeout(async ()=>{
      try {
        const focused = typeof mainWindow.isFocused === "function" ? mainWindow.isFocused() : false;
        if (!focused) await forceWindowToFront(retries - 1);
      } catch {}
    }, 500);
  } catch (e) { console.error("forceWindowToFront error", e); }
}

function scheduleNextPrompt(minutes) {
  nextPromptAt = new Date(Date.now() + minutes*60*1000);
}
function showPrompt() {
  const cfg = loadConfig();
  if (!cfg.ask_enabled) { scheduleNextPrompt(cfg.ask_interval_minutes || 15); return; }
  if (cfg.skip_next) { cfg.skip_next = false; saveConfig(cfg); scheduleNextPrompt(cfg.ask_interval_minutes || 15); return; }

  // bring up prompt
  forceWindowToFront();
  const notifAllowed = cfg.notifications_enabled && systemNotificationsAvailable();
  if (notifAllowed) {
    try {
      const n = new Notification({ title: "What are you working on?", body: "Click to log your activity." });
      n.on("click", ()=>forceWindowToFront());
      n.show();
    } catch { try { mainWindow?.webContents.send("open-prompt") } catch {} }
  } else {
    try { mainWindow?.webContents.send("open-prompt") } catch {}
  }
  scheduleNextPrompt(cfg.ask_interval_minutes || 15);
}

function startTimerFromConfig() {
  stopTimer();
  const cfg = loadConfig();
  const mins = Math.max(1, cfg.ask_interval_minutes || 15);
  const ms = mins * 60 * 1000;
  scheduleNextPrompt(mins);
  timer = setInterval(showPrompt, ms);
  // fire one gentle prompt soon after launch
  setTimeout(showPrompt, 300);
}
function stopTimer() { if (timer) clearInterval(timer); timer = null; }

function createMainWindow() {
  const cfg = loadConfig();
  mainWindow = new BrowserWindow({
    width: 980, height: 740, focusable: true, alwaysOnTop: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.on("closed", ()=> mainWindow = null);

  // send theme flags to renderer
  setTimeout(()=> {
    try { mainWindow.webContents.send("apply-theme", { dark: !!cfg.dark_mode, compact: !!cfg.compact_mode }); } catch {}
  }, 200);
}

// IPC
ipcMain.handle("read-entries", () => readEntries());
ipcMain.handle("save-entry", (_, text) => { saveEntry(text); return readEntries(); });
ipcMain.handle("create-backup", () => createBackup());
ipcMain.handle("get-backup-path", () => BACKUP_DIR);
ipcMain.handle("open-backup-folder", async () => {
  try {
    ensureDirsAndFiles();
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const result = await shell.openPath(BACKUP_DIR);
    if (result && result.length > 0) return { ok: false, error: result };
    return { ok: true, path: BACKUP_DIR };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});
ipcMain.handle("restore-from-file", async () => {
  try {
    ensureDirsAndFiles();
    const res = await dialog.showOpenDialog({
      title: "Select backup file",
      defaultPath: BACKUP_DIR,
      properties: ["openFile"],
      filters: [{ name: "JSON backups", extensions: ["json"] }],
    });
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true };
    const file = res.filePaths[0];
    const data = readJsonSafe(file, null);
    if (!Array.isArray(data)) return { ok: false, error: "Invalid backup format" };
    writeJsonAtomic(DATA_FILE, data);
    return { ok: true, restored: data.length };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});
ipcMain.handle("get-config", () => loadConfig());
ipcMain.handle("set-config", (_, partial) => {
  const old = loadConfig();
  const cfg = Object.assign(old, partial || {});
  saveConfig(cfg);
  if (partial && partial.ask_interval_minutes !== undefined) startTimerFromConfig();
  // theme push
  try { mainWindow?.webContents.send("apply-theme", { dark: !!cfg.dark_mode, compact: !!cfg.compact_mode }); } catch {}
  // notif about saved
  if (cfg.notifications_enabled && systemNotificationsAvailable()) {
    try { showSystemNotification("Settings saved", `Next prompt in ${cfg.ask_interval_minutes} minute(s)`); } catch {}
  }
  return cfg;
});
ipcMain.handle("skip-next", ()=> { const cfg = loadConfig(); cfg.skip_next = true; saveConfig(cfg); return cfg; });
ipcMain.handle("get-userdata-path", ()=> USERDATA);
ipcMain.handle("get-next-prompt-info", () => {
  const now = Date.now();
  const at = nextPromptAt ? nextPromptAt.getTime() : now;
  const remain = Math.max(0, at - now);
  return { nextAt: at, remainingMs: remain };
});

app.whenReady().then(()=>{
  ensureDirsAndFiles();
  createMainWindow();
  startTimerFromConfig();
  app.on("activate", ()=>{ if (!mainWindow) createMainWindow(); });
});

app.on("before-quit", ()=> { try { createBackup(); } catch (e) { console.error("Backup on quit failed", e); } });
app.on("window-all-closed", ()=> { if (process.platform !== "darwin") app.quit(); });
