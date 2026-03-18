'use strict';

const Database = require('better-sqlite3');
const path = require('path');

function getDbPath() {
  if (process.env.NODE_ENV === 'test') return ':memory:';
  const { app } = require('electron');
  return path.join(app.getPath('userData'), 'finance2.db');
}

const dbPath = getDbPath();
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = {
  run: (query, params = []) => db.prepare(query).run(params),
  all: (query, params = []) => db.prepare(query).all(params),
  get:  (query, params = []) => db.prepare(query).get(params),
  exec: (sql) => db.exec(sql),
};
