require('dotenv').config();
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

app.name = 'ADHD Finance';

// All modules that touch the DB are required inside app.whenReady() so that
// app.getPath('userData') is available when db.js first opens the database.
let db;
let runMigrations;
let categorizer;
let csvImporter;
let dashboard;
let googleCalendar;

const ICON_PATH = path.join(
  __dirname, 'assets',
  process.platform === 'win32' ? 'icon.ico' : 'icon.png'
);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    icon: ICON_PATH,
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
  categorizer     = require('./src/categorizer');
  csvImporter     = require('./src/csv-importer');
  dashboard       = require('./src/dashboard');
  purchaseChecker = require('./src/purchase-checker');
  googleCalendar  = require('./src/google-calendar');

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
  const row = db.get('SELECT sqlite_version() AS version');
  return { ok: true, sqliteVersion: row.version };
});

// ── IPC: CSV import ───────────────────────────────────────────────────────────
ipcMain.handle('csv:preview', (_, content) => csvImporter.previewCSV(content));
ipcMain.handle('csv:import',  (_, { rows, accountId }) =>
  csvImporter.importRows(rows, accountId || null));

// ── IPC: transactions ─────────────────────────────────────────────────────────
ipcMain.handle('transactions:list', (_, { limit = 200, offset = 0, accountId } = {}) => {
  if (accountId) {
    return db.all(`
      SELECT t.*, c.name AS category_name, c.is_impulse,
             a.name AS account_name, a.color AS account_color, a.type AS account_type
      FROM   transactions t
      LEFT JOIN categories c ON c.id = t.category_id
      LEFT JOIN accounts   a ON a.id = t.account_id
      WHERE  t.account_id = ?
      ORDER  BY t.post_date DESC, t.id DESC
      LIMIT  ? OFFSET ?
    `, [accountId, limit, offset]);
  }
  return db.all(`
    SELECT t.*, c.name AS category_name, c.is_impulse,
           a.name AS account_name, a.color AS account_color, a.type AS account_type
    FROM   transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    LEFT JOIN accounts   a ON a.id = t.account_id
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

// ── IPC: accounts ─────────────────────────────────────────────────────────────
ipcMain.handle('accounts:list', () =>
  db.all('SELECT * FROM accounts ORDER BY id'));

ipcMain.handle('accounts:save', (_, account) => {
  if (account.id) {
    db.run(
      'UPDATE accounts SET name=?, type=?, color=?, institution=? WHERE id=?',
      [account.name, account.type, account.color,
       account.institution || null, account.id]
    );
  } else {
    db.run(
      'INSERT INTO accounts (name, type, color, institution) VALUES (?, ?, ?, ?)',
      [account.name, account.type, account.color, account.institution || null]
    );
  }
  return { ok: true };
});

ipcMain.handle('accounts:delete', (_, id) => {
  const used = db.get(
    'SELECT COUNT(*) AS n FROM transactions WHERE account_id = ?', [id]);
  if (used.n > 0) {
    return { ok: false, error: `${used.n} transaction(s) are linked to this account` };
  }
  db.run('DELETE FROM accounts WHERE id = ?', [id]);
  return { ok: true };
});

// ── IPC: dashboard ────────────────────────────────────────────────────────────
ipcMain.handle('dashboard:summary', (_, { accountId } = {}) =>
  dashboard.getSummary(accountId || null));

// ── IPC: purchase checker ─────────────────────────────────────────────────────
ipcMain.handle('purchase:check', (_, { itemName, cost }) =>
  purchaseChecker.checkPurchase(itemName, parseFloat(cost)));

// ── IPC: bills ────────────────────────────────────────────────────────────────
ipcMain.handle('bills:list', (_, { accountId } = {}) => {
  if (accountId) {
    return db.all(`
      SELECT b.*, c.name AS category_name,
             a.name AS account_name, a.color AS account_color
      FROM   bills b
      LEFT JOIN categories c ON c.id = b.category_id
      LEFT JOIN accounts   a ON a.id = b.account_id
      WHERE  b.is_active = 1 AND b.account_id = ?
      ORDER  BY b.due_day, b.name
    `, [accountId]);
  }
  return db.all(`
    SELECT b.*, c.name AS category_name,
           a.name AS account_name, a.color AS account_color
    FROM   bills b
    LEFT JOIN categories c ON c.id = b.category_id
    LEFT JOIN accounts   a ON a.id = b.account_id
    WHERE  b.is_active = 1
    ORDER  BY b.due_day, b.name
  `);
});

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
      'UPDATE bills SET name=?, amount=?, due_day=?, category_id=?, notes=?, account_id=? WHERE id=?',
      [bill.name, bill.amount ?? null, bill.due_day ?? null,
       bill.category_id ?? null, bill.notes ?? null,
       bill.account_id ?? null, bill.id]
    );
  } else {
    db.run(
      'INSERT INTO bills (name, amount, due_day, category_id, notes, account_id) VALUES (?, ?, ?, ?, ?, ?)',
      [bill.name, bill.amount ?? null, bill.due_day ?? null,
       bill.category_id ?? null, bill.notes ?? null,
       bill.account_id ?? null]
    );
  }
  return { ok: true };
});

ipcMain.handle('bills:delete', (_, id) => {
  db.run('UPDATE bills SET is_active = 0 WHERE id = ?', [id]);
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

// ── IPC: Google Calendar ──────────────────────────────────────────────────────
ipcMain.handle('gcal:status', () => googleCalendar.getStatus());

ipcMain.handle('gcal:authorize', async (_, { clientId, clientSecret }) => {
  try   { return await googleCalendar.authorize(clientId, clientSecret); }
  catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('gcal:disconnect', () => googleCalendar.disconnect());

ipcMain.handle('gcal:sync-bill', async (_, billId) => {
  try   { return await googleCalendar.syncBill(billId); }
  catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('gcal:unsync-bill', async (_, billId) => {
  try   { return await googleCalendar.unsyncBill(billId); }
  catch (err) { return { ok: false, error: err.message }; }
});

ipcMain.handle('gcal:sync-all', async () => {
  try   { return await googleCalendar.syncAll(); }
  catch (err) { return { ok: false, error: err.message }; }
});

// ── IPC: shell utilities ──────────────────────────────────────────────────────
ipcMain.handle('shell:open-external', (_, url) => {
  // Only allow https:// URLs to prevent abuse
  if (url.startsWith('https://')) shell.openExternal(url);
});
