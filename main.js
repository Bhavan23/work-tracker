const { app, BrowserWindow, Notification, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

// ----------------- Config / paths -----------------
const DATA_FILE = path.join(app.getPath("userData"), "data.json");
const APP_BACKUP_DIR = path.join(__dirname, "backups");
const USERDATA_BACKUP_DIR = path.join(app.getPath("userData"), "backups");
let BACKUP_DIR = APP_BACKUP_DIR;

// timer config
let askIntervalMs = 15 * 60 * 1000; // default 15 minutes
let timer = null;
let mainWindow = null;

// ----------------- Notification enable/disable logic -----------------
// Allow forcing disable via env var for headless / CI / WSL
const ENV_DISABLE_NOTIFS = !!process.env.WORK_TRACKER_DISABLE_NOTIFICATIONS;

// Heuristics: on linux, if DISPLAY or XDG_RUNTIME_DIR are missing, notifications likely won't work.
// Also disable on WSL (detect via /proc/version containing Microsoft)
function isRunningOnWSL() {
  try {
    const ver = fs.readFileSync("/proc/version", "utf8").toLowerCase();
    return ver.includes("microsoft") || ver.includes("wsl");
  } catch {
    return false;
  }
}

function notificationsLikelyAvailable() {
  if (ENV_DISABLE_NOTIFS) return false;
  if (process.platform !== "linux") return true; // mac/win usually ok
  // linux heuristics
  if (!process.env.DISPLAY && !process.env.XDG_RUNTIME_DIR) return false;
  if (isRunningOnWSL()) return false;
  return true;
}

const NOTIFICATIONS_ENABLED = notificationsLikelyAvailable();

// ----------------- Helpers -----------------
function writeJsonAtomic(filePath, obj) {
  const tmp = filePath + ".tmp";
  const data = JSON.stringify(obj, null, 2);
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
    console.error("readJson error:", err);
    return [];
  }
}

function ensureDataFile() {
  try {
    if (!fs.existsSync(app.getPath("userData"))) {
      fs.mkdirSync(app.getPath("userData"), { recursive: true });
    }

    if (!fs.existsSync(DATA_FILE)) {
      writeJsonAtomic(DATA_FILE, []);
    }

    try {
      if (!fs.existsSync(APP_BACKUP_DIR)) {
        fs.mkdirSync(APP_BACKUP_DIR, { recursive: true });
      }
      BACKUP_DIR = APP_BACKUP_DIR;
    } catch {
      if (!fs.existsSync(USERDATA_BACKUP_DIR)) {
        fs.mkdirSync(USERDATA_BACKUP_DIR, { recursive: true });
      }
      BACKUP_DIR = USERDATA_BACKUP_DIR;
      console.warn(`App directory not writable; using userData for backups: ${BACKUP_DIR}`);
    }

    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
  } catch (err) {
    console.error("ensureDataFile error:", err);
  }
}

// ----------------- Save / backup -----------------
let unsavedCounter = 0;

function saveEntry(text) {
  ensureDataFile();
  const data = readJson(DATA_FILE);
  data.unshift({ text, ts: new Date().toISOString() });
  try {
    writeJsonAtomic(DATA_FILE, data);
  } catch (err) {
    console.error("writeJsonAtomic failed:", err);
    try {
      fs.appendFileSync(DATA_FILE + ".log", JSON.stringify({ text, ts: new Date().toISOString() }) + "\n", "utf8");
    } catch (e) {
      console.error("fallback append failed:", e);
    }
  }
  unsavedCounter++;
  if (unsavedCounter >= 20) {
    createBackup();
    unsavedCounter = 0;
  }
}

function createBackup() {
  ensureDataFile();
  const data = readJson(DATA_FILE);
  const dest = path.join(BACKUP_DIR, `data-${Date.now()}.json`);
  try {
    writeJsonAtomic(dest, data);
  } catch (err) {
    console.error("createBackup write failed:", err);
    return;
  }

  // prune old backups (keep last 10)
  try {
    const files = fs
      .readdirSync(BACKUP_DIR)
      .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .map((x) => x.f);

    for (let i = 10; i < files.length; i++) {
      try {
        fs.unlinkSync(path.join(BACKUP_DIR, files[i]));
      } catch (e) {
        // ignore
      }
    }
  } catch (err) {
    console.error("prune backups failed:", err);
  }
}

function readEntries(limit = 50) {
  ensureDataFile();
  return readJson(DATA_FILE).slice(0, limit);
}

// ----------------- UI / Timer -----------------
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 760,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  mainWindow.on("closed", () => (mainWindow = null));
}

/**
 * showPromptNotification:
 * - If notifications are enabled, attempt to show a Notification wrapped in try/catch.
 * - Otherwise, fallback to opening the app and sending 'open-prompt' to renderer.
 */
function showPromptNotification() {
  if (!mainWindow) return;

  const openPromptFallback = () => {
    try {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send("open-prompt");
    } catch (e) {
      console.error("openPromptFallback failed:", e);
    }
  };

  if (!NOTIFICATIONS_ENABLED) {
    // Silent mode — open prompt directly
    console.info("Notifications disabled by heuristic/env; opening prompt directly.");
    openPromptFallback();
    return;
  }

  // Try native Notification
  try {
    const notif = new Notification({
      title: "What are you working on?",
      body: "Click to enter your current task.",
    });

    notif.on("click", () => {
      try {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send("open-prompt");
      } catch (e) {
        console.error("Notification click handler failed:", e);
      }
    });

    // show() may throw if DBus/portal missing; guard it
    try {
      notif.show();
    } catch (e) {
      console.warn("Notification.show() threw — falling back to open prompt.", e);
      openPromptFallback();
    }
  } catch (err) {
    console.warn("Creating Notification failed — falling back to open prompt.", err);
    openPromptFallback();
  }
}

function startTimer() {
  stopTimer();
  timer = setInterval(showPromptNotification, askIntervalMs);
  // small delay to ensure window ready
  setTimeout(showPromptNotification, 300);
}

function stopTimer() {
  if (timer) clearInterval(timer);
}

// ----------------- App lifecycle -----------------
app.whenReady().then(() => {
  createMainWindow();
  ensureDataFile();
  startTimer();

  app.on("activate", () => {
    if (!mainWindow) createMainWindow();
  });
});

app.on("before-quit", () => {
  try {
    createBackup();
  } catch (e) {
    console.error("Error during before-quit backup:", e);
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ----------------- IPC -----------------
ipcMain.handle("read-entries", () => readEntries());
ipcMain.handle("save-entry", (evt, text) => {
  saveEntry(text);
  return readEntries();
});
ipcMain.handle("set-interval-minutes", (evt, mins) => {
  askIntervalMs = Math.max(1, Number(mins)) * 60 * 1000;
  startTimer();
  return { ok: true, minutes: askIntervalMs / (60 * 1000) };
});
ipcMain.handle("create-backup", () => {
  createBackup();
  return { ok: true };
});
ipcMain.handle("get-backup-path", () => {
  ensureDataFile();
  return BACKUP_DIR;
});

// ensure we have dirs
ensureDataFile();
