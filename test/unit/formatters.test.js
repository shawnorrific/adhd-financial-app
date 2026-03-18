'use strict';

const { assert } = require('chai');
const { fmtMoney, fmtDate } = require('../../src/modules/formatters');

describe('fmtMoney', () => {
  it('formats a whole number', () => {
    assert.strictEqual(fmtMoney(500), '$500.00');
  });

  it('formats a decimal number', () => {
    assert.strictEqual(fmtMoney(72.22), '$72.22');
  });

  it('formats a large number with commas', () => {
    assert.strictEqual(fmtMoney(1234567.89), '$1,234,567.89');
  });

  it('formats a negative number without sign', () => {
    assert.strictEqual(fmtMoney(-100), '$100.00');
  });

  it('returns $— for null', () => {
    assert.strictEqual(fmtMoney(null), '$—');
  });

  it('returns $— for NaN', () => {
    assert.strictEqual(fmtMoney(NaN), '$—');
  });
});

describe('fmtDate', () => {
  it('formats a standard date', () => {
    assert.strictEqual(fmtDate('2026-03-16'), 'Mar 16');
  });

  it('strips leading zero from day', () => {
    assert.strictEqual(fmtDate('2026-03-01'), 'Mar 1');
  });

  it('returns — for null', () => {
    assert.strictEqual(fmtDate(null), '—');
  });

  it('returns — for empty string', () => {
    assert.strictEqual(fmtDate(''), '—');
  });
});