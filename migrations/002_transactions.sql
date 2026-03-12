-- ── Categories ──────────────────────────────────────────────────────────────
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

-- ── Category rules ───────────────────────────────────────────────────────────
-- Pattern is matched case-insensitively as a substring of the transaction description.
-- User-defined rules take priority over built-in ones; longer patterns beat shorter ones.
CREATE TABLE IF NOT EXISTS category_rules (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  category_id     INTEGER NOT NULL REFERENCES categories(id),
  is_user_defined INTEGER NOT NULL DEFAULT 0  -- 1 = user taught us this
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

-- ── Transactions ─────────────────────────────────────────────────────────────
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
  -- Deduplication: treat same account + date + description + amount as the same transaction
  UNIQUE(account_number, post_date, description, amount)
);

CREATE INDEX IF NOT EXISTS idx_tx_date     ON transactions(post_date);
CREATE INDEX IF NOT EXISTS idx_tx_category ON transactions(category_id);
