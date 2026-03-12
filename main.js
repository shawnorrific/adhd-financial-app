const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// All modules that touch the DB are required inside app.whenReady() so that
// app.getPath('userData') is available when db.js first opens the database.
let db;
let runMigrations;
let categorizer;
let csvImporter;
let dashboard;

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
  db            = require('./db');
  runMigrations = require('./migrations');
  runMigrations();

  // Require after migrations so all tables exist
  categorizer  = require('./src/categorizer');
  csvImporter  = require('./src/csv-importer');
  dashboard    = require('./src/dashboard');

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ── IPC: health check ─────────────────────────────────────────────────────────
ipcMain.handle('db:ping', () => {
  const row = db.get('SELECT sqlite_version() AS version');
  return { ok: true, sqliteVersion: row.version };
});

// ── IPC: CSV import ───────────────────────────────────────────────────────────
ipcMain.handle('csv:preview', (_, content) => csvImporter.previewCSV(content));
ipcMain.handle('csv:import',  (_, rows)    => csvImporter.importRows(rows));

// ── IPC: transactions ─────────────────────────────────────────────────────────
ipcMain.handle('transactions:list', (_, { limit = 200, offset = 0 } = {}) => {
  return db.all(`
    SELECT t.*, c.name AS category_name, c.is_impulse
    FROM   transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    ORDER  BY t.post_date DESC, t.id DESC
    LIMIT  ? OFFSET ?
  `, [limit, offset]);
});

ipcMain.handle('transaction:recategorize', (_, { id, categoryId }) => {
  db.run(
    'UPDATE transactions SET category_id = ?, is_user_categorized = 1 WHERE id = ?',
    [categoryId, id]
  );
  const tx = db.get('SELECT description FROM transactions WHERE id = ?', [id]);
  if (tx) categorizer.learnCorrection(tx.description, categoryId);
  return { ok: true };
});

// ── IPC: categories ───────────────────────────────────────────────────────────
ipcMain.handle('categories:list', () =>
  db.all('SELECT * FROM categories ORDER BY name'));

// ── IPC: dashboard ────────────────────────────────────────────────────────────
ipcMain.handle('dashboard:summary', () => dashboard.getSummary());

// ── IPC: bills ────────────────────────────────────────────────────────────────
ipcMain.handle('bills:list', () =>
  db.all('SELECT * FROM bills WHERE is_active = 1 ORDER BY due_day, name'));

ipcMain.handle('bills:detect', () =>
  db.all(`
    SELECT
      t.description,
      t.category_id,
      c.name                                                  AS category_name,
      COUNT(*)                                                AS occurrences,
      ROUND(AVG(ABS(t.amount)), 2)                            AS avg_amount,
      CAST(ROUND(AVG(CAST(strftime('%d', t.post_date) AS REAL))) AS INTEGER) AS avg_due_day,
      ROUND(MAX(ABS(t.amount)) - MIN(ABS(t.amount)), 2)       AS amount_variance
    FROM   transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE  t.amount < 0
      AND  t.post_date >= date('now', '-95 days')
      AND  (c.name IS NULL OR c.name NOT IN ('Income', 'Transfer', 'ATM / Cash'))
    GROUP  BY t.description
    HAVING COUNT(*) >= 2
      AND  (MAX(ABS(t.amount)) - MIN(ABS(t.amount))) < 15
    ORDER  BY avg_amount DESC
    LIMIT  20
  `));

ipcMain.handle('bills:save', (_, bill) => {
  if (bill.id) {
    db.run(
      'UPDATE bills SET name=?, amount=?, due_day=?, category_id=?, is_active=? WHERE id=?',
      [bill.name, bill.amount ?? null, bill.due_day ?? null, bill.category_id ?? null, bill.is_active ?? 1, bill.id]
    );
  } else {
    db.run(
      'INSERT INTO bills (name, amount, due_day, category_id) VALUES (?, ?, ?, ?)',
      [bill.name, bill.amount ?? null, bill.due_day ?? null, bill.category_id ?? null]
    );
  }
  return { ok: true };
});

// ── IPC: settings ─────────────────────────────────────────────────────────────
ipcMain.handle('settings:get', (_, key) =>
  db.get('SELECT value FROM settings WHERE key = ?', [key])?.value ?? null);

ipcMain.handle('settings:set', (_, { key, value }) => {
  db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, String(value)]
  );
  return { ok: true };
});
