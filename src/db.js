'use strict';

const path = require('path');
const Database = require('better-sqlite3');

/**
 * Initialise (or open) the SQLite database.
 *
 * @param {string} userDataDir - Electron's app.getPath('userData')
 * @returns {import('better-sqlite3').Database}
 */
function initDb(userDataDir) {
  const dbPath = path.join(userDataDir, 'adhd-finance.db');
  const db = new Database(dbPath);

  // WAL mode: better concurrency, safer crashes.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);
  return db;
}

// ── Migrations ────────────────────────────────────────────────────────────────
// Each migration runs exactly once, tracked in the `schema_version` table.

const MIGRATIONS = [
  {
    version: 1,
    up(db) {
      // Encrypted credential store — the actual encrypted bytes live here;
      // decryption happens in main.js via safeStorage.
      db.exec(`
        CREATE TABLE IF NOT EXISTS credentials (
          key        TEXT PRIMARY KEY NOT NULL,
          encrypted  BLOB NOT NULL,
          updated_at INTEGER NOT NULL DEFAULT (unixepoch())
        );
      `);

      // Accounts linked via Plaid or manually.
      db.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          name         TEXT    NOT NULL,
          type         TEXT    NOT NULL DEFAULT 'checking',
          institution  TEXT,
          plaid_id     TEXT    UNIQUE,
          balance      REAL    NOT NULL DEFAULT 0,
          currency     TEXT    NOT NULL DEFAULT 'USD',
          last_synced  INTEGER,
          created_at   INTEGER NOT NULL DEFAULT (unixepoch())
        );
      `);

      // Transactions — normalised, one row per line item.
      db.exec(`
        CREATE TABLE IF NOT EXISTS transactions (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          account_id   INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
          plaid_id     TEXT    UNIQUE,
          date         TEXT    NOT NULL,   -- ISO 8601 YYYY-MM-DD
          description  TEXT    NOT NULL,
          amount       REAL    NOT NULL,   -- negative = debit
          category     TEXT,
          pending      INTEGER NOT NULL DEFAULT 0,
          created_at   INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id);
        CREATE INDEX IF NOT EXISTS idx_tx_date    ON transactions(date);
      `);

      // Recurring bills tracked for calendar reminders.
      db.exec(`
        CREATE TABLE IF NOT EXISTS bills (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          name          TEXT    NOT NULL,
          amount        REAL,
          due_day       INTEGER,            -- day-of-month, null = irregular
          account_id    INTEGER REFERENCES accounts(id),
          gcal_event_id TEXT,
          active        INTEGER NOT NULL DEFAULT 1,
          created_at    INTEGER NOT NULL DEFAULT (unixepoch())
        );
      `);
    },
  },
];

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  const applied = db
    .prepare('SELECT version FROM schema_version ORDER BY version')
    .all()
    .map((r) => r.version);

  for (const migration of MIGRATIONS) {
    if (!applied.includes(migration.version)) {
      const run = db.transaction(() => {
        migration.up(db);
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version);
      });
      run();
    }
  }
}

module.exports = { initDb };
