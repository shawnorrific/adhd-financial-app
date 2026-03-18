'use strict';

const db = require('../db');
const { fmtDate, fmtMoney } = require('./modules/formatters');
const { toISO, calcNextPaycheck } = require('./modules/calcNextPaycheck');
const { daysBetween, nextDueDate } = require('./modules/dateHelpers');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSetting(key) {
  return db.get('SELECT value FROM settings WHERE key = ?', [key])?.value ?? null;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Check whether a purchase is affordable right now.
 *
 * @param {string} itemName
 * @param {number} cost  - positive dollar amount
 * @returns {{ verdict, title, explanation, suggestedDate, details }}
 */
function checkPurchase(itemName, cost) {
  const today   = toISO(new Date());
  const in7Days = toISO(new Date(Date.now() + 7 * 86400000));

  // ── Current balance ────────────────────────────────────────────────────────
  const latestTx = db.get(
    `SELECT balance, post_date
     FROM   transactions
     WHERE  balance IS NOT NULL
     ORDER  BY post_date DESC, id DESC
     LIMIT  1`
  );

  if (!latestTx || latestTx.balance == null) {
    return {
      verdict:       'unknown',
      title:         'No balance data',
      explanation:   'Import a bank statement first so I can check your balance.',
      suggestedDate: null,
      details:       null,
    };
  }

  const currentBalance = latestTx.balance;
  const buffer         = parseFloat(getSetting('balance_buffer') || '200');

  // ── Bills due in the next 7 days ───────────────────────────────────────────
  const activeBills = db.all(
    `SELECT * FROM bills
     WHERE  is_active = 1 AND due_day IS NOT NULL AND amount IS NOT NULL`
  );

  let billsDue7Total = 0;
  const billsDue7 = [];

  for (const bill of activeBills) {
    const dueDate = nextDueDate(bill.due_day, today);
    if (dueDate <= in7Days) {
      billsDue7Total += bill.amount;
      billsDue7.push({ name: bill.name, amount: bill.amount, dueDate });
    }
  }

  const availableNow  = currentBalance - billsDue7Total;
  const afterPurchase = availableNow - cost;

  // ── Paycheck ───────────────────────────────────────────────────────────────
  const paycheckFrequency = getSetting('paycheck_frequency');
  const paycheckLastDate  = getSetting('paycheck_last_date');

  let nextPaycheckDate = null;
  if (paycheckLastDate) {
    nextPaycheckDate = calcNextPaycheck(
      paycheckFrequency || 'biweekly', paycheckLastDate, today
    );
  }

  // Estimate paycheck size from average of recent income transactions
  const incomeRow = db.get(`
    SELECT AVG(amount) AS avg_income
    FROM   transactions
    WHERE  amount > 0
      AND  post_date >= date('now', '-180 days')
      AND  category_id = (SELECT id FROM categories WHERE name = 'Income' LIMIT 1)
  `);
  const estimatedPaycheck = incomeRow?.avg_income ?? null;

  // Bills due before next paycheck
  let billsBeforePaycheckTotal = 0;
  if (nextPaycheckDate) {
    for (const bill of activeBills) {
      if (!bill.amount) continue;
      const dueDate = nextDueDate(bill.due_day, today);
      if (dueDate < nextPaycheckDate) billsBeforePaycheckTotal += bill.amount;
    }
  }

  // ── Suggested safe-to-buy date ─────────────────────────────────────────────
  let suggestedDate = null;

  if (nextPaycheckDate) {
    if (estimatedPaycheck != null) {
      // Can we afford it after the next paycheck?
      const postPaycheck =
        currentBalance - billsBeforePaycheckTotal + estimatedPaycheck - cost;

      if (postPaycheck >= buffer) {
        suggestedDate = nextPaycheckDate;
      } else {
        // Try the paycheck after that
        const dayAfter = toISO(
          new Date(new Date(nextPaycheckDate + 'T00:00:00').getTime() + 86400000)
        );
        suggestedDate = calcNextPaycheck(
          paycheckFrequency || 'biweekly', nextPaycheckDate, dayAfter
        );
      }
    } else {
      // No income history yet — suggest the next paycheck date without a guarantee
      suggestedDate = nextPaycheckDate;
    }
  }

  // ── Verdict ────────────────────────────────────────────────────────────────
  let verdict, title, explanation;

  if (afterPurchase >= buffer) {
    verdict = 'safe';
    title   = 'Go for it.';
    explanation = billsDue7.length > 0
      ? `After this week's bills (${fmtMoney(billsDue7Total)}) and this purchase, you'll still have ${fmtMoney(afterPurchase)} cushion.`
      : `After this purchase you'll still have ${fmtMoney(afterPurchase)} cushion — above your ${fmtMoney(buffer)} buffer.`;

  } else if (afterPurchase >= 0) {
    verdict = 'borderline';
    title   = 'Technically yes, but…';
    const gap = buffer - afterPurchase;
    explanation = `This would put you ${fmtMoney(gap)} below your ${fmtMoney(buffer)} safety buffer.`
      + (suggestedDate
          ? ` If you can wait until ${fmtDate(suggestedDate)}, you'll be more comfortable.`
          : '');

  } else {
    verdict = 'unsafe';
    title   = 'Not yet.';
    const shortfall = Math.abs(afterPurchase);
    explanation = `You're ${fmtMoney(shortfall)} short after this week's bills.`
      + (suggestedDate
          ? ` Your next paycheck is ${fmtDate(suggestedDate)} — wait until then.`
          : ' Set up your paycheck schedule to get a suggested date.');
  }

  return {
    verdict,
    title,
    explanation,
    suggestedDate,
    details: {
      currentBalance,
      billsDue7,
      billsDue7Total,
      availableNow,
      afterPurchase,
      buffer,
      nextPaycheckDate,
      estimatedPaycheck,
    },
  };
}

module.exports = { checkPurchase };
