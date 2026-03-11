const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// db and migrations are required after app is ready so app.getPath() is available
let db;
let runMigrations;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  db = require('./db');
  runMigrations = require('./migrations');
  runMigrations();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC: health check — verifies Electron, Mithril IPC bridge, and SQLite are all reachable
ipcMain.handle('db:ping', () => {
  const row = db.get('SELECT sqlite_version() AS version');
  return { ok: true, sqliteVersion: row.version };
});
