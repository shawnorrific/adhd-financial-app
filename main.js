'use strict';

const { app, BrowserWindow, ipcMain, safeStorage, shell } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

const isDev = process.argv.includes('--dev');

// ── Database & storage modules ──────────────────────────────────────────────
// Deferred until app is ready so user-data paths resolve correctly.
let db;
let storage;
let localServer;
let serverPort = 0;

// ── Window ───────────────────────────────────────────────────────────────────
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    title: 'ADHD Finance',
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // needed for preload to require electron
    },
  });

  // Load renderer via local HTTP server so fetch/CORS behaves predictably.
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}`);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in system browser, not Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ── Local HTTP server (serves renderer/ to the BrowserWindow) ────────────────
function startLocalServer() {
  return new Promise((resolve, reject) => {
    const rendererDir = path.join(__dirname, 'renderer');

    const MIME = {
      '.html': 'text/html; charset=utf-8',
      '.js':   'application/javascript; charset=utf-8',
      '.css':  'text/css; charset=utf-8',
      '.json': 'application/json',
      '.png':  'image/png',
      '.ico':  'image/x-icon',
      '.svg':  'image/svg+xml',
    };

    localServer = http.createServer((req, res) => {
      // Normalize URL path
      let urlPath = req.url.split('?')[0];
      if (urlPath === '/') urlPath = '/index.html';

      const filePath = path.join(rendererDir, urlPath);

      // Basic path traversal guard
      if (!filePath.startsWith(rendererDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME[ext] || 'application/octet-stream';

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
      });
    });

    // Bind to 127.0.0.1 only — never exposed to the network.
    localServer.listen(0, '127.0.0.1', () => {
      serverPort = localServer.address().port;
      resolve(serverPort);
    });

    localServer.on('error', reject);
  });
}

// ── safeStorage IPC handlers ─────────────────────────────────────────────────
//
// Channels:
//   storage:encrypt   { key: string, value: string } → { ok: true } | { ok: false, error }
//   storage:decrypt   { key: string }                → { ok: true, value } | { ok: false, error }
//   storage:delete    { key: string }                → { ok: true } | { ok: false, error }
//   storage:available {}                             → { available: bool }

function registerStorageHandlers() {
  ipcMain.handle('storage:available', () => {
    return { available: safeStorage.isEncryptionAvailable() };
  });

  ipcMain.handle('storage:encrypt', (_event, { key, value }) => {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        throw new Error('safeStorage encryption is not available on this system');
      }
      if (typeof key !== 'string' || typeof value !== 'string') {
        throw new TypeError('key and value must be strings');
      }
      const encrypted = safeStorage.encryptString(value);
      // Persist the encrypted buffer to the DB for durable storage.
      storage.setCredential(key, encrypted);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('storage:decrypt', (_event, { key }) => {
    try {
      if (typeof key !== 'string') throw new TypeError('key must be a string');
      const encrypted = storage.getCredential(key);
      if (!encrypted) return { ok: true, value: null };
      const value = safeStorage.decryptString(encrypted);
      return { ok: true, value };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('storage:delete', (_event, { key }) => {
    try {
      if (typeof key !== 'string') throw new TypeError('key must be a string');
      storage.deleteCredential(key);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Initialise modules that need app.getPath('userData').
  const { initDb } = require('./src/db');
  const { createStorage } = require('./src/storage');

  db = initDb(app.getPath('userData'));
  storage = createStorage(db);

  await startLocalServer();
  registerStorageHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  if (localServer) localServer.close();
  if (db) db.close();
});
