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

function seedCategory(name = 'Income', isImpulse = 0) {
  db.run(
    'INSERT OR IGNORE INTO categories (name, is_impulse) VALUES (?, ?)',
    [name, isImpulse]
  );
}

function seedIncome(amount, daysAgo) {
  const date = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
  db.run(
    `INSERT INTO transactions (amount, post_date, category_id)
     VALUES (?, ?, (SELECT id FROM categories WHERE name = 'Income' LIMIT 1))`,
    [amount, date]
  );
}

function seedBalance(balance, daysAgo = 0) {
  const date = new Date(Date.now() - daysAgo * 86400000).toISOString().slice(0, 10);
  db.run(
    'INSERT INTO transactions (balance, post_date) VALUES (?, ?)',
    [balance, date]
  );
}

function seedBill(name, amount, due_day, is_active = 1) {
  db.run(
    'INSERT INTO bills (name, amount, due_day, is_active) VALUES (?, ?, ?, ?)',
    [name, amount, due_day, is_active]
  );
}

function clearTables() {
  db.run('DELETE FROM transactions');
  db.run('DELETE FROM bills');
  db.run('DELETE FROM settings');
  db.run('DELETE FROM categories');
}

module.exports = { setupSchema, seedSettings, seedCategory, seedIncome, seedBalance, seedBill, clearTables };
