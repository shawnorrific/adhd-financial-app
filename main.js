require('dotenv').config();
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { initDb, getDb } = require('./src/db');

app.name = 'ADHD Finance';

// All modules that touch the DB are required inside app.whenReady() so that
// app.getPath('userData') is available when db.js first opens the database.
let mainWindow = null;

const ICON_PATH = path.join(
  __dirname, 'assets',
  process.platform === 'win32' ? 'icon.ico' : 'icon.png'
);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  initDb(app.getPath('userData'));
  createWindow();

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(ICON_PATH);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: health check ─────────────────────────────────────────────────────────
ipcMain.handle('db:ping', () => {
  const row = getDb().get('SELECT sqlite_version() AS version');
  return { ok: true, sqliteVersion: row.version };
});

// ── IPC: shell utilities ──────────────────────────────────────────────────────
ipcMain.handle('shell:open-external', (_, url) => {
  // Only allow https:// URLs to prevent abuse
  if (url.startsWith('https://')) shell.openExternal(url);
});