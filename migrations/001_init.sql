-- Complete schema — single source of truth.
-- All tables are created in dependency order; seed data follows each table.

PRAGMA foreign_keys = ON;

-- ── Categories ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  is_impulse INTEGER NOT NULL DEFAULT 0  -- 1 = flagged for "Mother May I" impulse check
);

INSERT OR IGNORE INTO categories (name, is_impulse) VALUES
  ('Rent',                0),
  ('Groceries',           0),
  ('Food Delivery',       1),
  ('Pet Insurance',       0),
  ('Pet Supplies',        0),
  ('Car Insurance',       0),
  ('Renters Insurance',   0),
  ('Internet',            0),
  ('Phone',               0),
  ('Buy Now Pay Later',   0),
  ('Credit Card Payment', 0),
  ('Subscription',        1),
  ('Income',              0),
  ('Transfer',            0),
  ('ATM / Cash',          0),
  ('Fees',                0),
  ('Uncategorized',       0);

-- ── Category rules ────────────────────────────────────────────────────────────
-- Pattern matched case-insensitively as a substring of the transaction description.
-- User-defined rules take priority; longer patterns beat shorter ones.
CREATE TABLE IF NOT EXISTS category_rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  category_id     INTEGER NOT NULL REFERENCES categories(id),
  is_user_defined INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO category_rules (pattern, category_id) VALUES
  ('Goodman Boa',    (SELECT id FROM categories WHERE name = 'Rent')),
  ('Trupanion',      (SELECT id FROM categories WHERE name = 'Pet Insurance')),
  ('Chewy',          (SELECT id FROM categories WHERE name = 'Pet Supplies')),
  ('PetSmart',       (SELECT id FROM categories WHERE name = 'Pet Supplies')),
  ('DoorDash',       (SELECT id FROM categories WHERE name = 'Food Delivery')),
  ('Doordash',       (SELECT id FROM categories WHERE name = 'Food Delivery')),
  ('Safeway',        (SELECT id FROM categories WHERE name = 'Groceries')),
  ('Suvie',          (SELECT id FROM categories WHERE name = 'Groceries')),
  ('Affirm',         (SELECT id FROM categories WHERE name = 'Buy Now Pay Later')),
  ('Credit One',     (SELECT id FROM categories WHERE name = 'Credit Card Payment')),
  ('Capital One',    (SELECT id FROM categories WHERE name = 'Credit Card Payment')),
  ('Comcast',        (SELECT id FROM categories WHERE name = 'Internet')),
  ('Xfinity',        (SELECT id FROM categories WHERE name = 'Internet')),
  ('T-Mobile',       (SELECT id FROM categories WHERE name = 'Phone')),
  ('Mint Mobile',    (SELECT id FROM categories WHERE name = 'Phone')),
  ('Crunchyroll',    (SELECT id FROM categories WHERE name = 'Subscription')),
  ('Patreon',        (SELECT id FROM categories WHERE name = 'Subscription')),
  ('Apple.com/bill', (SELECT id FROM categories WHERE name = 'Subscription')),
  ('Microsoft',      (SELECT id FROM categories WHERE name = 'Subscription')),
  ('Allstate',       (SELECT id FROM categories WHERE name = 'Car Insurance')),
  ('Overdraft',      (SELECT id FROM categories WHERE name = 'Fees')),
  ('NSF Fee',        (SELECT id FROM categories WHERE name = 'Fees')),
  ('Late Fee',       (SELECT id FROM categories WHERE name = 'Fees')),
  ('ATM',            (SELECT id FROM categories WHERE name = 'ATM / Cash')),
  ('Direct Deposit', (SELECT id FROM categories WHERE name = 'Income')),
  ('Payroll',        (SELECT id FROM categories WHERE name = 'Income'));

-- ── Accounts ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  type        TEXT    NOT NULL DEFAULT 'checking',  -- checking | credit_card | bnpl
  color       TEXT    NOT NULL DEFAULT '#4A9EFF',
  institution TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO accounts (id, name, type, color, institution) VALUES
  (1, 'Checking',      'checking',    '#4A9EFF', NULL),
  (2, 'Credit Card',   'credit_card', '#A78BFA', NULL),
  (3, 'BNPL (Affirm)', 'bnpl',        '#FB923C', 'Affirm');

-- ── Import batches ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS import_batches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT,
  imported_at TEXT    NOT NULL DEFAULT (datetime('now')),
  account_id  INTEGER REFERENCES accounts(id),
  tx_count    INTEGER NOT NULL DEFAULT 0
);

-- ── Transactions ──────────────────────────────────────────────────────────────
-- No tuple UNIQUE constraint — transaction_id is the sole dedup key.
CREATE TABLE IF NOT EXISTS transactions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  account_number      TEXT,
  post_date           TEXT    NOT NULL,  -- YYYY-MM-DD
  check_number        TEXT,
  description         TEXT    NOT NULL,
  amount              REAL    NOT NULL,  -- positive = credit/income, negative = debit/expense
  status              TEXT,
  balance             REAL,
  category_id         INTEGER REFERENCES categories(id),
  is_user_categorized INTEGER NOT NULL DEFAULT 0,
  source              TEXT    NOT NULL DEFAULT 'csv',
  imported_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  account_id          INTEGER REFERENCES accounts(id),
  import_batch_id     INTEGER REFERENCES import_batches(id),
  transaction_id      TEXT
);

CREATE INDEX        IF NOT EXISTS idx_tx_date        ON transactions(post_date);
CREATE INDEX        IF NOT EXISTS idx_tx_category    ON transactions(category_id);
CREATE INDEX        IF NOT EXISTS idx_tx_account     ON transactions(account_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_id ON transactions(transaction_id);

-- ── Bills ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bills (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT    NOT NULL,
  amount            REAL,                        -- expected monthly amount (null = variable)
  due_day           INTEGER,                     -- day of month (1–28)
  category_id       INTEGER REFERENCES categories(id),
  is_active         INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  notes             TEXT,
  calendar_event_id TEXT,
  account_id        INTEGER REFERENCES accounts(id),
  frequency         TEXT                         -- weekly | biweekly | semimonthly | monthly
);

-- ── Settings ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('paycheck_frequency',  'biweekly'),
  ('paycheck_last_date',  ''),
  ('balance_buffer',      '200'),
  ('google_client_id',    ''),
  ('google_client_secret',''),
  ('google_refresh_token',''),
  ('google_access_token', ''),
  ('google_token_expiry', '0'),
  ('google_user_email',   ''),
  ('paycheck_amount',     '');
