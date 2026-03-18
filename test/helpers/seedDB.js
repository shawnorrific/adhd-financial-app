'use strict';

const db = require('../../db');

function setupSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      name                TEXT NOT NULL,
      type                TEXT NOT NULL DEFAULT 'checking',
      color               TEXT,
      manual_balance      REAL,
      manual_balance_date TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id  INTEGER,
      post_date   TEXT,
      description TEXT,
      amount      REAL,
      balance     REAL,
      category_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS bills (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT,
      amount    REAL,
      due_day   INTEGER,
      is_active INTEGER DEFAULT 1,
      account_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT,
      is_impulse INTEGER DEFAULT 0
    );
  `);
}

function seedSettings(overrides = {}) {
  const defaults = {
    balance_buffer: '200',
    paycheck_frequency: 'semimonthly',
    paycheck_last_date: '2026-02-27',
    paycheck_amount: '',
  };
  const settings = { ...defaults, ...overrides };
  for (const [key, value] of Object.entries(settings)) {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }
}

module.exports = { setupSchema, seedSettings };