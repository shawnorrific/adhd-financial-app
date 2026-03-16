const fs   = require('fs');
const path = require('path');
const db   = require('./db');

// Track which migrations have already run so we never apply them twice
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id     INTEGER PRIMARY KEY AUTOINCREMENT,
    name   TEXT NOT NULL UNIQUE,
    run_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

function runMigrations() {
  const dir   = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  for (const name of files) {
    if (db.get('SELECT id FROM _migrations WHERE name = ?', [name])) continue;
    const sql = fs.readFileSync(path.join(dir, name), 'utf8');
    try {
      db.exec(sql);
    } catch (err) {
      // "duplicate column name" means the schema change already exists in the
      // DB (e.g. after a wipe that cleared _migrations but left the schema).
      // Treat it as already applied so the app can start normally.
      if (!err.message.includes('duplicate column name')) throw err;
      console.warn(`[migrations] ${name} skipped — column already exists`);
    }
    db.run('INSERT INTO _migrations (name) VALUES (?)', [name]);
  }
}

module.exports = runMigrations;
