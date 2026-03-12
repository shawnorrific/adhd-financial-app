const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// All modules that touch the DB are required inside app.whenReady() so that
// app.getPath('userData') is available when db.js first opens the database.
let db;
let runMigrations;
let categorizer;
let csvImporter;

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
  db           = require('./db');
  runMigrations = require('./migrations');
  runMigrations();

  // Require after migrations so all tables exist
  categorizer  = require('./src/categorizer');
  csvImporter  = require('./src/csv-importer');

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC handlers ──────────────────────────────────────────────────────────────

// Health check — verifies Electron, IPC bridge, and SQLite are all reachable
ipcMain.handle('db:ping', () => {
  const row = db.get('SELECT sqlite_version() AS version');
  return { ok: true, sqliteVersion: row.version };
});

// Parse CSV text and return categorised rows WITHOUT writing to the DB
ipcMain.handle('csv:preview', (_, content) => {
  return csvImporter.previewCSV(content);
});

// Persist confirmed rows (user may have edited categoryId for some)
ipcMain.handle('csv:import', (_, rows) => {
  return csvImporter.importRows(rows);
});

// Transactions list — most recent first, with category info joined in
ipcMain.handle('transactions:list', (_, { limit = 200, offset = 0 } = {}) => {
  return db.all(`
    SELECT t.*, c.name AS category_name, c.is_impulse
    FROM   transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    ORDER  BY t.post_date DESC, t.id DESC
    LIMIT  ? OFFSET ?
  `, [limit, offset]);
});

// Update one transaction's category and teach it as a permanent rule
ipcMain.handle('transaction:recategorize', (_, { id, categoryId }) => {
  db.run(
    'UPDATE transactions SET category_id = ?, is_user_categorized = 1 WHERE id = ?',
    [categoryId, id]
  );
  const tx = db.get('SELECT description FROM transactions WHERE id = ?', [id]);
  if (tx) categorizer.learnCorrection(tx.description, categoryId);
  return { ok: true };
});

// All categories for dropdowns
ipcMain.handle('categories:list', () => {
  return db.all('SELECT * FROM categories ORDER BY name');
});
