'use strict';

const { assert } = require('chai');
const { daysBetween, nextDueDate } = require('../../src/modules/dateHelpers');

describe('daysBetween', () => {
  it('returns correct number of days between two dates', () => {
    assert.strictEqual(daysBetween('2026-03-01', '2026-03-16'), 15);
  });

  it('returns 0 when dates are the same', () => {
    assert.strictEqual(daysBetween('2026-03-16', '2026-03-16'), 0);
  });

  it('returns negative when second date is before first', () => {
    assert.strictEqual(daysBetween('2026-03-16', '2026-03-01'), -15);
  });
});

describe('nextDueDate', () => {
  it('returns next due date this month when due day is in the future', () => {
    const result = nextDueDate(20, '2026-03-16');
    assert.strictEqual(result.nextDate, '2026-03-20');
    assert.strictEqual(result.daysUntil, 4);
  });

  it('rolls over to next month when due day has passed', () => {
    const result = nextDueDate(1, '2026-03-16');
    assert.strictEqual(result.nextDate, '2026-04-01');
    assert.strictEqual(result.daysUntil, 16);
  });
});