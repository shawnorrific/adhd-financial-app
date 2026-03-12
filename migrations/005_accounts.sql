-- ── Accounts ─────────────────────────────────────────────────────────────────
-- Distinct financial accounts: checking, credit cards, BNPL plans, etc.
CREATE TABLE IF NOT EXISTS accounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  type        TEXT    NOT NULL DEFAULT 'checking', -- checking | credit_card | bnpl
  color       TEXT    NOT NULL DEFAULT '#4A9EFF',
  institution TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Seed three common account types
INSERT OR IGNORE INTO accounts (id, name, type, color, institution) VALUES
  (1, 'Checking',      'checking',    '#4A9EFF', NULL),
  (2, 'Credit Card',   'credit_card', '#A78BFA', NULL),
  (3, 'BNPL (Affirm)', 'bnpl',        '#FB923C', 'Affirm');

-- Link transactions to a specific account
ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id);

-- Link bills to a specific account
ALTER TABLE bills ADD COLUMN account_id INTEGER REFERENCES accounts(id);

-- Index for common filter queries
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);
