const { app, BrowserWindow, Notification, ipcMain, Tray, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

// ----------------- Config / paths -----------------
// DATA_FILE stays in userData (safe for packaged apps)
const DATA_FILE = path.join(app.getPath("userData"), "data.json");
const TEMP_FILE = DATA_FILE + ".tmp";

// Prefer backups in app directory (useful in development).
// If not writable (packaged app), fall back to userData backups.
const APP_BACKUP_DIR = path.join(__dirname, "backups");
const USERDATA_BACKUP_DIR = path.join(app.getPath("userData"), "backups");
let BACKUP_DIR = APP_BACKUP_DIR; // will be finalized in ensureDataFile()

let mainWindow;
let askIntervalMs = 15 * 60 * 1000; // default 15 minutes
let timer = null;
let tray = null;

// ----------------- Helpers (atomic JSON write/read) -----------------
function writeJsonAtomic(filePath, obj) {
  const tmp = filePath + ".tmp";
  const data = JSON.stringify(obj, null, 2);
  // write to temp file then fsync and rename
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeSync(fd, data, null, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
}

function readJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw || "[]");
  } catch (err) {
    console.error("readJson error, returning []:", err);
    return [];
  }
}

// ----------------- Ensure data + backup dirs -----------------
function ensureDataFile() {
  try {
    // ensure userData directory exists
    if (!fs.existsSync(app.getPath("userData"))) {
      fs.mkdirSync(app.getPath("userData"), { recursive: true });
    }

    // ensure data file exists
    if (!fs.existsSync(DATA_FILE)) {
      writeJsonAtomic(DATA_FILE, []);
    }

    // try to create app-level backup dir first (useful in dev)
    try {
      if (!fs.existsSync(APP_BACKUP_DIR)) {
        fs.mkdirSync(APP_BACKUP_DIR, { recursive: true });
      }
      BACKUP_DIR = APP_BACKUP_DIR;
    } catch (err) {
      // fallback to userData backup dir if app dir not writable
      if (!fs.existsSync(USERDATA_BACKUP_DIR)) {
        fs.mkdirSync(USERDATA_BACKUP_DIR, { recursive: true });
      }
      BACKUP_DIR = USERDATA_BACKUP_DIR;
      console.warn(`App directory not writable; using userData for backups: ${BACKUP_DIR}`);
    }

    // ensure chosen backup dir exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  } catch (err) {
    console.error("ensureDataFile error:", err);
  }
}

// ----------------- Save / backup logic -----------------
let unsavedCounter = 0;

function saveEntry(text) {
  ensureDataFile();
  const data = readJson(DATA_FILE);
  data.unshift({ text, ts: new Date().toISOString() });

  try {
    writeJsonAtomic(DATA_FILE, data);
    unsavedCounter += 1;
    if (unsavedCounter >= 20) {
      createBackup();
      unsavedCounter = 0;
    }
  } catch (err) {
    console.error("Failed to save entry:", err);
    // fallback append-only log
    try {
      const fallback = JSON.stringify({ text, ts: new Date().toISOString() }) + "\n";
      fs.appendFileSync(DATA_FILE + ".log", fallback, "utf8");
    } catch (e) {
      console.error("Fallback append failed:", e);
    }
  }
}

function createBackup() {
  try {
    ensureDataFile();
    const data = readJson(DATA_FILE);
    const name = `data-${Date.now()}.json`;
    const dest = path.join(BACKUP_DIR, name);
    writeJsonAtomic(dest, data);

    // prune old backups (keep last 10)
    const files = fs.readdirSync(BACKUP_DIR)
      .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .map((x) => x.f);

    const keep = 10;
    for (let i = keep; i < files.length; i++) {
      try {
        fs.unlinkSync(path.join(BACKUP_DIR, files[i]));
      } catch (err) {
        // ignore
      }
    }
  } catch (err) {
    console.error("createBackup error:", err);
  }
}

function readEntries(limit = 50) {
  ensureDataFile();
  const data = readJson(DATA_FILE);
  return data.slice(0, limit);
}

// ----------------- UI / Timer -----------------
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 560,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function showPromptNotification() {
  const notif = new Notification({
    title: "What are you currently working on?",
    body: "Click to enter what you are working on (or open the app).",
    silent: false,
  });

  notif.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.webContents.send("open-prompt");
    }
  });

  notif.show();
  if (mainWindow) mainWindow.webContents.send("open-prompt");
}

function startTimer() {
  stopTimer();
  timer = setInterval(() => {
    showPromptNotification();
  }, askIntervalMs);
  // show immediately
  showPromptNotification();
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

// ----------------- App lifecycle -----------------
app.whenReady().then(() => {
  createMainWindow();
  ensureDataFile();

  // tray (optional)
  try {
    const iconPath = path.join(__dirname, "icon.png");
    const trayImage = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;
    tray = new Tray(trayImage || undefined);
    tray.setToolTip("Work Tracker");
    tray.on("click", () => {
      if (mainWindow) mainWindow.show();
    });
  } catch (e) {
    console.warn("Tray not available:", e.message);
  }

  startTimer();

  app.on("activate", () => {
    if (!mainWindow) createMainWindow();
  });
});

function gracefulShutdown() {
  try {
    stopTimer();
    createBackup();
  } catch (err) {
    console.error("gracefulShutdown error:", err);
  }
}

app.on("before-quit", () => {
  gracefulShutdown();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// ----------------- IPC -----------------
ipcMain.handle("read-entries", () => {
  return readEntries();
});

ipcMain.handle("save-entry", (evt, text) => {
  saveEntry(text);
  return readEntries();
});

ipcMain.handle("set-interval-minutes", (evt, minutes) => {
  const ms = Math.max(1, Number(minutes)) * 60 * 1000;
  askIntervalMs = ms;
  startTimer();
  return { ok: true, minutes };
});

ipcMain.handle("create-backup", () => {
  createBackup();
  return { ok: true };
});

// new: return the active backup directory path
ipcMain.handle("get-backup-path", () => {
  ensureDataFile();
  return BACKUP_DIR;
});

// ensure directories early
ensureDataFile();

module.exports = { DATA_FILE, BACKUP_DIR };
