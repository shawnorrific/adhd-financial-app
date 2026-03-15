require('dotenv').config();
const { app, BrowserWindow, ipcMain, shell, Notification, dialog } = require('electron');
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
let folderWatcher;
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

  folderWatcher = require('./src/folder-watcher');
  folderWatcher.start(mainWindow);

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(ICON_PATH);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      folderWatcher.start(mainWindow);
    }
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
ipcMain.handle('csv:preview', (_, { content, filePath }) => csvImporter.previewCSV(content, filePath || null));
ipcMain.handle('csv:import',  (_, { rows, accountId, filename }) =>
  csvImporter.importRows(rows, accountId || null, filename || null));

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

// ── Helper: compute current balance for one account ───────────────────────────
function getAccountBalance(accountId) {
  const acct = db.get(
    'SELECT manual_balance, manual_balance_date FROM accounts WHERE id = ?', [accountId]);
  const latestTx = db.get(`
    SELECT balance, post_date FROM transactions
    WHERE  balance IS NOT NULL AND account_id = ?
    ORDER  BY post_date DESC LIMIT 1`, [accountId]);

  const useManual  = acct?.manual_balance != null &&
    (latestTx == null || acct.manual_balance_date >= latestTx.post_date);
  const anchor     = useManual ? acct.manual_balance      : (latestTx?.balance   ?? null);
  const anchorDate = useManual ? acct.manual_balance_date : (latestTx?.post_date ?? null);
  if (anchor == null) return null;

  const adj = db.get(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM   transactions
    WHERE  account_id = ? AND post_date > ?`, [accountId, anchorDate])?.total || 0;
  return anchor + adj;
}

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

ipcMain.handle('accounts:setBalance', (_, { id, balance, date }) => {
  db.run(
    'UPDATE accounts SET manual_balance = ?, manual_balance_date = ? WHERE id = ?',
    [parseFloat(balance), date, id]
  );
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

ipcMain.handle('bills:detect', (_, { accountId } = {}) => {
  const accountFilter = accountId ? 'AND t.account_id = ?' : '';
  const params = accountId ? [accountId] : [];
  return db.all(`
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
      ${accountFilter}
    GROUP  BY t.description
    HAVING COUNT(*) >= 2
      AND  (MAX(ABS(t.amount)) - MIN(ABS(t.amount))) < 15
    ORDER  BY avg_amount DESC
    LIMIT  20
  `, params);
});

ipcMain.handle('bills:save', (_, bill) => {
  if (bill.id) {
    db.run(
      'UPDATE bills SET name=?, amount=?, due_day=?, frequency=?, category_id=?, notes=?, account_id=? WHERE id=?',
      [bill.name, bill.amount ?? null, bill.due_day ?? null,
       bill.frequency ?? null, bill.category_id ?? null, bill.notes ?? null,
       bill.account_id ?? null, bill.id]
    );
  } else {
    db.run(
      'INSERT INTO bills (name, amount, due_day, frequency, category_id, notes, account_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [bill.name, bill.amount ?? null, bill.due_day ?? null,
       bill.frequency ?? null, bill.category_id ?? null, bill.notes ?? null,
       bill.account_id ?? null]
    );
  }
  return { ok: true };
});

ipcMain.handle('bills:delete', (_, id) => {
  db.run('UPDATE bills SET is_active = 0 WHERE id = ?', [id]);
  return { ok: true };
});

// ── IPC: transaction delete ───────────────────────────────────────────────────
ipcMain.handle('transactions:delete', (_, id) => {
  db.run('DELETE FROM transactions WHERE id = ?', [id]);
  return { ok: true };
});

// ── IPC: transaction update ───────────────────────────────────────────────────
ipcMain.handle('transactions:update', (_, { id, description, amount, categoryId, accountId, postDate }) => {
  db.run(
    `UPDATE transactions
     SET    description=?, amount=?, category_id=?, account_id=?, post_date=?, is_user_categorized=1
     WHERE  id=?`,
    [description, parseFloat(amount), categoryId || null, accountId || null, postDate || null, id]
  );
  if (description && categoryId) categorizer.learnCorrection(description, categoryId);
  return { ok: true };
});

// ── IPC: transaction add (manual) ────────────────────────────────────────────
ipcMain.handle('transactions:add', (_, { postDate, description, amount, categoryId, accountId }) => {
  // Snapshot balance before insert so we don't double-count the new transaction
  let priorBalance  = null;
  let shouldAdvance = false;
  if (accountId) {
    const acct = db.get(
      'SELECT manual_balance, manual_balance_date FROM accounts WHERE id = ?', [accountId]);
    if (acct?.manual_balance != null) {
      priorBalance  = getAccountBalance(accountId);
      shouldAdvance = priorBalance !== null;
    }
  }

  db.run(
    `INSERT INTO transactions
       (post_date, description, amount, category_id, account_id,
        is_user_categorized, source)
     VALUES (?, ?, ?, ?, ?, 1, 'manual')`,
    [postDate, description.trim(), parseFloat(amount),
     categoryId || null, accountId || null]
  );

  if (shouldAdvance) {
    const acct = db.get(
      'SELECT manual_balance_date FROM accounts WHERE id = ?', [accountId]);
    const newAnchor = postDate > acct.manual_balance_date ? postDate : acct.manual_balance_date;
    db.run(
      'UPDATE accounts SET manual_balance = ?, manual_balance_date = ? WHERE id = ?',
      [priorBalance + parseFloat(amount), newAnchor, accountId]
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

// ── IPC: watch folder ─────────────────────────────────────────────────────────
ipcMain.handle('watcher:get-path', () => folderWatcher.getWatchPath());

ipcMain.handle('watcher:set-path', (_, newPath) => {
  db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    ['watch_folder_path', String(newPath)]
  );
  folderWatcher.start(mainWindow);
  return { ok: true };
});

ipcMain.handle('dialog:open-file', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select CSV file',
    properties: ['openFile'],
    filters: [{ name: 'CSV', extensions: ['csv'] }],
  });
  if (canceled || !filePaths.length) return null;
  const filePath = filePaths[0];
  const content  = require('fs').readFileSync(filePath, 'utf8');
  return { filePath, content };
});

ipcMain.handle('dialog:open-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Watch Folder',
    properties: ['openDirectory'],
  });
  return canceled ? null : filePaths[0];
});

// ── IPC: import history ───────────────────────────────────────────────────────
ipcMain.handle('imports:list', () =>
  db.all(`
    SELECT b.*, a.name AS account_name, a.color AS account_color
    FROM   import_batches b
    LEFT JOIN accounts a ON a.id = b.account_id
    ORDER  BY b.imported_at DESC
  `));

ipcMain.handle('imports:set-account', (_, { batchId, accountId }) => {
  db.run('UPDATE import_batches  SET account_id = ? WHERE id = ?',           [accountId || null, batchId]);
  db.run('UPDATE transactions    SET account_id = ? WHERE import_batch_id = ?', [accountId || null, batchId]);
  return { ok: true };
});

ipcMain.handle('imports:delete', (_, batchId) => {
  db.run('DELETE FROM transactions   WHERE import_batch_id = ?', [batchId]);
  db.run('DELETE FROM import_batches WHERE id = ?',              [batchId]);
  return { ok: true };
});

// ── IPC: danger zone (testing utility) ───────────────────────────────────────
ipcMain.handle('danger:wipe', (_, target) => {
  if (target === 'transactions' || target === 'all') {
    db.run('DELETE FROM transactions');
    db.run('DELETE FROM import_batches');
    db.run('UPDATE accounts SET manual_balance = NULL, manual_balance_date = NULL');
  }
  if (target === 'bills' || target === 'all') {
    db.run('DELETE FROM bills');
  }
  if (target === 'accounts' || target === 'all') {
    db.run('DELETE FROM accounts');
  }
  if (target === 'all') {
    db.run("DELETE FROM _migrations WHERE name != '001_init.sql'");
  }
  return { ok: true };
});

ipcMain.handle('accounts:clearBalance', (_, id) => {
  db.run('UPDATE accounts SET manual_balance = NULL, manual_balance_date = NULL WHERE id = ?', [id]);
  return { ok: true };
});
