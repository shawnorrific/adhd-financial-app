-- Recurring bills — monthly due dates and expected amounts for forecasting
CREATE TABLE IF NOT EXISTS bills (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  amount      REAL,           -- expected monthly amount (null = variable)
  due_day     INTEGER,        -- day of month the bill typically hits (1–28)
  category_id INTEGER REFERENCES categories(id),
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- App settings as simple key-value pairs
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed defaults — these are overwritten when the user configures the app
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('paycheck_frequency', 'biweekly'),   -- weekly | biweekly | semimonthly | monthly
  ('paycheck_last_date', ''),           -- ISO date of most recent paycheck; empty = not set
  ('balance_buffer',     '200');        -- minimum "comfortable" cushion in dollars
