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
    db.exec(sql);
    db.run('INSERT INTO _migrations (name) VALUES (?)', [name]);
  }
}

module.exports = runMigrations;
