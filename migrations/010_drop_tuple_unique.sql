-- Remove the UNIQUE(account_number, post_date, description, amount) constraint
-- that incorrectly blocks legitimate duplicate transactions (e.g. two identical
-- purchases on the same day). The only dedup mechanism is idx_transaction_id.
--
-- SQLite cannot DROP CONSTRAINT, so we recreate the table without it.

PRAGMA foreign_keys = OFF;

BEGIN;

CREATE TABLE transactions_new (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  account_number      TEXT,
  post_date           TEXT    NOT NULL,
  check_number        TEXT,
  description         TEXT    NOT NULL,
  amount              REAL    NOT NULL,
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

INSERT INTO transactions_new
SELECT id, account_number, post_date, check_number, description, amount,
       status, balance, category_id, is_user_categorized, source, imported_at,
       account_id, import_batch_id, transaction_id
FROM transactions;

DROP TABLE transactions;

ALTER TABLE transactions_new RENAME TO transactions;

CREATE INDEX        idx_tx_date        ON transactions(post_date);
CREATE INDEX        idx_tx_category    ON transactions(category_id);
CREATE INDEX        idx_tx_account     ON transactions(account_id);
CREATE UNIQUE INDEX idx_transaction_id ON transactions(transaction_id);

COMMIT;

PRAGMA foreign_keys = ON;
