'use strict';

const { assert } = require('chai');
const { setupSchema, seedSettings } = require('../helpers/seedDB');
const { getSummary } = require('../../src/dashboard');
const db = require('../../db');

const TODAY = '2026-03-16';

describe('getSummary — cushion integration', () => {
  before(() => {
    setupSchema();
  });

  beforeEach(() => {
    db.run('DELETE FROM transactions');
    db.run('DELETE FROM bills');
    db.run('DELETE FROM settings');
    seedSettings();
  });

  it('cushion reflects balance minus bills before next paycheck and buffer', () => {
    // Seed a transaction with a known balance
    db.run(
      'INSERT INTO transactions (account_id, post_date, description, amount, balance) VALUES (?, ?, ?, ?, ?)',
      [1, '2026-03-15', 'Test deposit', 1000, 1000]
    );

    // Seed a bill due before next paycheck
    db.run(
      'INSERT INTO bills (name, amount, due_day, is_active) VALUES (?, ?, ?, ?)',
      ['Rent', 300, 20, 1]
    );

    const summary = getSummary(null, TODAY);

    assert.strictEqual(summary.cushion, 500); // 1000 - 300 - 200 buffer
    assert.strictEqual(summary.status, 'ok');
  });

  it('status is tight when cushion is negative but within buffer', () => {
    db.run(
      'INSERT INTO transactions (account_id, post_date, description, amount, balance) VALUES (?, ?, ?, ?, ?)',
      [1, '2026-03-15', 'Test deposit', 450, 450]
    );

    db.run(
      'INSERT INTO bills (name, amount, due_day, is_active) VALUES (?, ?, ?, ?)',
      ['Rent', 300, 20, 1]
    );

    const summary = getSummary(null, TODAY);

    assert.strictEqual(summary.cushion, -50); // 450 - 300 - 200
    assert.strictEqual(summary.status, 'tight');
  });

  it('changing buffer setting changes cushion', () => {
    db.run('DELETE FROM settings');
    seedSettings({ balance_buffer: '500' });

    db.run(
      'INSERT INTO transactions (account_id, post_date, description, amount, balance) VALUES (?, ?, ?, ?, ?)',
      [1, '2026-03-15', 'Test deposit', 1000, 1000]
    );

    db.run(
      'INSERT INTO bills (name, amount, due_day, is_active) VALUES (?, ?, ?, ?)',
      ['Rent', 300, 20, 1]
    );

    const summary = getSummary(null, TODAY);

    assert.strictEqual(summary.cushion, 200); // 1000 - 300 - 500
    assert.strictEqual(summary.buffer, 500);
  });
});