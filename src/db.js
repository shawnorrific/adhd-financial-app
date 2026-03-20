'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

function initDb(userDataDir) {
  const dbPath = process.env.NODE_ENV === 'test'
    ? ':memory:'
    : path.join(userDataDir, 'adhd-finance.db');

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  runMigrations(db);
  return db;
}

function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      name   TEXT NOT NULL UNIQUE,
      run_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const already = db.prepare(
      'SELECT id FROM _migrations WHERE name = ?'
    ).get(file);
    if (already) continue;

    const sql = fs.readFileSync(
      path.join(migrationsDir, file), 'utf8'
    );

    const run = db.transaction(() => {
      db.exec(sql);
      db.prepare(
        'INSERT INTO _migrations (name) VALUES (?)'
      ).run(file);
    });

    run();
  }
}

function getDb() {
  if (!instance) throw new Error('db not initialised — call initDb first');
  return instance;
}

let instance = null;

function initDbSingleton(userDataDir) {
  if (!instance) instance = initDb(userDataDir);
  return instance;
}

module.exports = {
  initDb: initDbSingleton,
  getDb,
};