'use strict';

const { assert } = require('chai');
const { calcNextPaycheck } = require('../../src/modules/calcNextPaycheck');

describe('calcNextPaycheck', () => {
  it('advances biweekly from a past date', () => {
    assert.strictEqual(calcNextPaycheck('biweekly', '2026-02-27', '2026-03-16'), '2026-03-27');
  });

  it('advances weekly from a past date', () => {
    assert.strictEqual(calcNextPaycheck('weekly', '2026-03-09', '2026-03-16'), '2026-03-16');
  });

  it('advances semimonthly from the 1st', () => {
    assert.strictEqual(calcNextPaycheck('semimonthly', '2026-03-01', '2026-03-16'), '2026-04-01');
  });

  it('advances semimonthly from the 15th', () => {
    assert.strictEqual(calcNextPaycheck('semimonthly', '2026-02-15', '2026-03-16'), '2026-04-01');
  });

  it('advances monthly', () => {
    assert.strictEqual(calcNextPaycheck('monthly', '2026-02-13', '2026-03-16'), '2026-04-13');
  });

  it('defaults to biweekly for unknown frequency', () => {
    assert.strictEqual(calcNextPaycheck('unknown', '2026-02-27', '2026-03-16'), '2026-03-27');
  });
});