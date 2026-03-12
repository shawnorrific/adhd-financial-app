-- Groups all transactions from a single CSV import so they can be
-- viewed, reassigned to an account, or deleted together.

CREATE TABLE IF NOT EXISTS import_batches (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  filename    TEXT,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  account_id  INTEGER REFERENCES accounts(id),
  tx_count    INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE transactions ADD COLUMN import_batch_id INTEGER REFERENCES import_batches(id);
