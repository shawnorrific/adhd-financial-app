const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

// Store the database in Electron's userData directory so it persists across updates
// and isn't accidentally included in version control
const dbPath = path.join(app.getPath('userData'), 'finance.db');

const db = new Database(dbPath);

// WAL mode: faster writes, allows concurrent reads without blocking
db.pragma('journal_mode = WAL');
// Enforce foreign key constraints — SQLite ignores them by default
db.pragma('foreign_keys = ON');

module.exports = {
  // INSERT / UPDATE / DELETE — returns { changes, lastInsertRowid }
  run: (query, params = []) => db.prepare(query).run(params),

  // SELECT many rows — returns array of row objects
  all: (query, params = []) => db.prepare(query).all(params),

  // SELECT one row — returns a single row object or undefined
  get: (query, params = []) => db.prepare(query).get(params),

  // Execute raw multi-statement SQL (used by migrations only)
  exec: (sql) => db.exec(sql),
};
