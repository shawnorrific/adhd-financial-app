const fs = require('fs');
const path = require('path');
const db = require('./db');

// Track which migrations have already run so we never apply them twice
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    name    TEXT    NOT NULL UNIQUE,
    run_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  )
`);

function runMigrations() {
  const migrationsDir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(migrationsDir)) return;

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // numbered filenames (001_, 002_, ...) sort correctly lexicographically

  for (const file of files) {
    const already = db.get('SELECT id FROM _migrations WHERE name = ?', [file]);
    if (already) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.exec(sql);
    db.run('INSERT INTO _migrations (name) VALUES (?)', [file]);
    console.log(`[migrations] applied: ${file}`);
  }
}

module.exports = runMigrations;
