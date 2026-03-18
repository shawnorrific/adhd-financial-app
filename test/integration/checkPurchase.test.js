'use strict';

const assert = require('assert');
const { setupSchema, seedSettings, seedCategory, seedIncome, seedBalance, seedBill, clearTables } = require('../helpers/seedDB')
const { checkPurchase } = require('../../src/purchase-checker');
const fmtDate = require('../../src/modules/formatters');

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('checkPurchase()', () => {

    before(() => setupSchema());
        beforeEach(() => {
            clearTables();
            seedCategory('Income'); // ensure Income category exists for any test that needs it
    });

  // ── No balance data ────────────────────────────────────────────────────────

  describe('when no balance data exists', () => {
    it('returns unknown verdict', () => {
      const result = checkPurchase('Headphones', 80);
      assert.strictEqual(result.verdict, 'unknown');
      assert.strictEqual(result.suggestedDate, null);
    });
  });

  // ── Safe ───────────────────────────────────────────────────────────────────

  describe('safe verdict', () => {
    it('returns safe when balance comfortably covers cost + buffer', () => {
      seedBalance(1000);
      const result = checkPurchase('Headphones', 80);
      assert.strictEqual(result.verdict, 'safe');
      assert.ok(result.details.afterPurchase >= result.details.buffer);
    });

    it('mentions upcoming bills in explanation when bills are due within 7 days', () => {
      seedBalance(1000);
      const dueDay = new Date(Date.now() + 2 * 86400000).getDate();
      seedBill('Electric', 100, dueDay);
      const result = checkPurchase('Keyboard', 50);
      assert.strictEqual(result.verdict, 'safe');
      assert.ok(result.explanation.includes('bills'));
    });

    it('does not mention bills when none are due this week', () => {
      seedBalance(1000);
      const result = checkPurchase('Keyboard', 50);
      assert.strictEqual(result.verdict, 'safe');
      assert.ok(!result.explanation.includes('bills'));
    });
  });

  // ── Borderline ─────────────────────────────────────────────────────────────

  describe('borderline verdict', () => {
    it('returns borderline when purchase dips below buffer but stays non-negative', () => {
      seedBalance(400); // buffer default 200, cost 250 → afterPurchase=150, gap=50
      const result = checkPurchase('Shoes', 250);
      assert.strictEqual(result.verdict, 'borderline');
    });

    it('includes suggested date in explanation when paycheck is configured', () => {
      seedBalance(400);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      seedSettings({
        paycheck_frequency: 'biweekly',
        paycheck_last_date: yesterday,
        });
      const result = checkPurchase('Shoes', 250);
      assert.strictEqual(result.verdict, 'borderline');
      assert.ok(result.suggestedDate);
      assert.ok(result.explanation.includes('wait until')); // year-month present
    });
  });

  // ── Unsafe ─────────────────────────────────────────────────────────────────

  describe('unsafe verdict', () => {
    it('returns unsafe when balance cannot cover cost after bills', () => {
      seedBalance(300);
      const dueDay = new Date(Date.now() + 1 * 86400000).getDate();
      seedBill('Rent', 250, dueDay);
      const result = checkPurchase('TV', 500);
      assert.strictEqual(result.verdict, 'unsafe');
      assert.ok(result.details.afterPurchase < 0);
    });

    it('includes next paycheck date when configured', () => {
      seedBalance(300);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      seedSettings('paycheck_frequency', 'biweekly');
      seedSettings('paycheck_last_date', yesterday);
      const result = checkPurchase('TV', 500);
      assert.ok(result.suggestedDate);
      assert.ok(result.explanation.includes('wait until'));;
    });

    it('prompts to set up paycheck when not configured', () => {
      seedBalance(300);
      const result = checkPurchase('TV', 500);
      assert.ok(result.explanation.includes('paycheck schedule'));
    });
  });

  // ── Suggested date logic ───────────────────────────────────────────────────

  describe('suggestedDate', () => {
    it('is null when no paycheck is configured', () => {
      seedBalance(500);
      const result = checkPurchase('Item', 400);
      assert.strictEqual(result.suggestedDate, null);
    });

    it('falls back to next paycheck date when no income history exists', () => {
      seedBalance(100);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      seedSettings('paycheck_frequency', 'biweekly');
      seedSettings('paycheck_last_date', yesterday);
      const result = checkPurchase('Item', 400);
      assert.ok(result.suggestedDate);
    });

    it('suggests the paycheck-after-next when one paycheck is not enough', () => {
      seedBalance(100);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      seedSettings('paycheck_frequency', 'biweekly');
      seedSettings('paycheck_last_date', yesterday);
      // Seed a small income so estimatedPaycheck is well below the cost
      seedIncome(500, 14);
      const result = checkPurchase('Very Expensive Item', 2000);
      assert.ok(result.suggestedDate);
      // Should be ~4 weeks out, not ~2
      const today = new Date();
      const suggested = new Date(result.suggestedDate);
      const daysOut = (suggested - today) / 86400000;
      assert.ok(daysOut > 20, `Expected >20 days out, got ${daysOut.toFixed(1)}`);
    });
  });

  // ── Bills filtering ────────────────────────────────────────────────────────

  describe('bill filtering', () => {
    it('ignores inactive bills', () => {
      seedBalance(400);
      const dueDay = new Date(Date.now() + 2 * 86400000).getDate();
      seedBill('Inactive Bill', 300, dueDay, 0); // is_active = 0
      const result = checkPurchase('Item', 150);
      // Without inactive bill counted, should be safe not unsafe
      assert.strictEqual(result.verdict, 'safe');
    });

    it('ignores bills due after 7 days for availableNow calc', () => {
      seedBalance(400);
      const dueDay = new Date(Date.now() + 10 * 86400000).getDate();
      seedBill('Future Bill', 300, dueDay);
      const result = checkPurchase('Item', 150);
      assert.strictEqual(result.verdict, 'safe');
    });
  });

});