const { app, BrowserWindow, Notification, ipcMain, Tray, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");

const DATA_FILE = path.join(app.getPath("userData"), "data.json");

let mainWindow;
let askIntervalMs = 15 * 60 * 1000; // default 15 minutes
let timer = null;
let tray = null;

function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify([]), "utf8");
  }
}

function saveEntry(text) {
  ensureDataFile();
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "[]");
  data.unshift({
    text,
    ts: new Date().toISOString()
  });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  return data;
}

function readEntries(limit = 50) {
  ensureDataFile();
  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "[]");
  return data.slice(0, limit);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 560,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
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
    silent: false
  });

  notif.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      // ask renderer to open prompt
      mainWindow.webContents.send("open-prompt");
    }
  });

  notif.show();

  // also instruct renderer to open prompt in case user prefers immediate input
  if (mainWindow) {
    mainWindow.webContents.send("open-prompt");
  }
}

function startTimer() {
  stopTimer();
  timer = setInterval(() => {
    showPromptNotification();
  }, askIntervalMs);
  // fire first immediately for convenience
  showPromptNotification();
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

app.whenReady().then(() => {
  createMainWindow();
  ensureDataFile();

  // tray (optional) - shows app icon and quick open
  try {
    const iconPath = path.join(__dirname, "icon.png");
    const trayImage = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined;
    tray = new Tray(trayImage || undefined);
    tray.setToolTip("Work Tracker");
    tray.on("click", () => {
      if (mainWindow) {
        mainWindow.show();
      }
    });
  } catch (e) {
    console.warn("Tray not available:", e.message);
  }

  startTimer();

  app.on("activate", () => {
    if (!mainWindow) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  // keep the app alive in tray on macOS; on windows we quit if not using tray
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// IPC handlers
ipcMain.handle("read-entries", () => {
  return readEntries();
});

ipcMain.handle("save-entry", (evt, text) => {
  const data = saveEntry(text);
  return data;
});

ipcMain.handle("set-interval-minutes", (evt, minutes) => {
  const ms = Math.max(1, Number(minutes)) * 60 * 1000;
  askIntervalMs = ms;
  startTimer();
  return { ok: true, minutes };
});
