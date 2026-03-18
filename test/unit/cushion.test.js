'use strict';

const { assert } = require('chai');
const { calcCushion } = require('../../src/modules/cushion');

describe('calcCushion', () => {
  it('returns positive cushion when balance covers bills and buffer', () => {
    assert.strictEqual(calcCushion(1000, 300, 200), 500);
  });

  it('returns zero when balance exactly covers bills and buffer', () => {
    assert.strictEqual(calcCushion(500, 300, 200), 0);
  });

  it('returns negative cushion when balance does not cover bills and buffer', () => {
    assert.strictEqual(calcCushion(400, 300, 200), -100);
  });

  it('works with no bills', () => {
    assert.strictEqual(calcCushion(500, 0, 200), 300);
  });
});