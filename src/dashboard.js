'use strict';

const db = require('../db');

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSetting(key) {
  return db.get('SELECT value FROM settings WHERE key = ?', [key])?.value ?? null;
}

/** Format a Date to an ISO date string "YYYY-MM-DD". */
function toISO(d) {
  return d.toISOString().split('T')[0];
}

/** Number of calendar days from ISO string `a` to ISO string `b`. */
function daysBetween(aISO, bISO) {
  return Math.round((new Date(bISO + 'T00:00:00') - new Date(aISO + 'T00:00:00')) / 86400000);
}

/**
 * Walk forward from `lastDateStr` by one pay period at a time until we reach
 * a date that is >= today.  Uses ISO string comparison so timezone drift can't
 * push us to the wrong date.
 */
function calcNextPaycheck(frequency, lastDateStr, nowISO) {
  let next = new Date(lastDateStr + 'T00:00:00');

  const advance = () => {
    switch (frequency) {
      case 'weekly':        next.setDate(next.getDate() + 7);  break;
      case 'biweekly':      next.setDate(next.getDate() + 14); break;
      case 'semimonthly': {
        const d = next.getDate();
        if (d < 15) { next.setDate(15); }
        else        { next.setMonth(next.getMonth() + 1); next.setDate(1); }
        break;
      }
      case 'monthly': next.setMonth(next.getMonth() + 1); break;
      default:        next.setDate(next.getDate() + 14);
    }
  };

  // Advance until the candidate date is today or in the future
  while (toISO(next) < nowISO) advance();
  return toISO(next);
}

/**
 * Given a bill's due_day (1–28), find its next occurrence from today and the
 * number of days away.
 */
function nextDueInfo(dueDay, todayISO) {
  const today   = new Date(todayISO + 'T00:00:00');
  const year    = today.getFullYear();
  const month   = today.getMonth();
  let candidate = new Date(year, month, dueDay);

  // If the due date has already passed this month, move to next month
  if (toISO(candidate) <= todayISO) {
    candidate = new Date(year, month + 1, dueDay);
  }

  return {
    nextDate:  toISO(candidate),
    daysUntil: daysBetween(todayISO, toISO(candidate)),
  };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Return everything the Dashboard component needs in one round-trip.
 */
function getSummary() {
  const today = toISO(new Date());
  const monthStart = today.substring(0, 7) + '-01';

  // ── Balance ────────────────────────────────────────────────────────────────
  const latestTx = db.get(`
    SELECT balance, post_date
    FROM   transactions
    WHERE  balance IS NOT NULL
    ORDER  BY post_date DESC, id DESC
    LIMIT  1
  `);
  const balance = latestTx?.balance ?? null;

  // ── Paycheck ───────────────────────────────────────────────────────────────
  const paycheckFrequency = getSetting('paycheck_frequency');
  const paycheckLastDate  = getSetting('paycheck_last_date');  // '' when not set

  let nextPaycheckDate  = null;
  let daysUntilPaycheck = null;

  if (paycheckLastDate) {
    nextPaycheckDate  = calcNextPaycheck(paycheckFrequency || 'biweekly', paycheckLastDate, today);
    daysUntilPaycheck = daysBetween(today, nextPaycheckDate);
    if (daysUntilPaycheck < 0) daysUntilPaycheck = 0;
  }

  // ── Bills ──────────────────────────────────────────────────────────────────
  const bills = db.all('SELECT * FROM bills WHERE is_active = 1 AND due_day IS NOT NULL ORDER BY due_day');

  // Next upcoming bill (the soonest one from today)
  let nextBill          = null;
  let nextBillDaysUntil = Infinity;
  for (const bill of bills) {
    const { daysUntil } = nextDueInfo(bill.due_day, today);
    if (daysUntil < nextBillDaysUntil) {
      nextBill          = bill;
      nextBillDaysUntil = daysUntil;
    }
  }
  if (!nextBill) nextBillDaysUntil = null;

  // Bills due before the next paycheck (used in cushion calculation)
  let upcomingBillsTotal = 0;
  const upcomingBills    = [];
  if (nextPaycheckDate) {
    for (const bill of bills) {
      if (!bill.amount) continue;
      const { nextDate } = nextDueInfo(bill.due_day, today);
      if (nextDate <= nextPaycheckDate) {
        upcomingBillsTotal += bill.amount;
        upcomingBills.push({ ...bill, nextDate });
      }
    }
  }

  // ── "Am I okay right now?" ─────────────────────────────────────────────────
  const buffer = parseFloat(getSetting('balance_buffer') || '200');
  let status        = 'unknown';
  let statusMessage = 'Import transactions to get started';
  let cushion       = null;

  if (balance !== null) {
    if (!paycheckLastDate) {
      status        = 'setup';
      statusMessage = 'Set up your paycheck schedule';
    } else if (bills.length === 0) {
      status        = 'setup';
      statusMessage = 'Add your recurring bills';
    } else {
      cushion = balance - upcomingBillsTotal;
      if (cushion >= buffer) {
        status        = 'ok';
        statusMessage = "You're okay";
      } else if (cushion >= 0) {
        status        = 'tight';
        statusMessage = 'Tight but covered';
      } else {
        status        = 'danger';
        statusMessage = 'Watch your spending';
      }
    }
  }

  // ── Monthly summary ────────────────────────────────────────────────────────
  const monthlySpend = db.get(`
    SELECT COALESCE(SUM(ABS(amount)), 0) AS total
    FROM   transactions
    WHERE  amount < 0 AND post_date >= ?
  `, [monthStart])?.total || 0;

  const monthlyIncome = db.get(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM   transactions
    WHERE  amount > 0 AND post_date >= ?
  `, [monthStart])?.total || 0;

  const topCategories = db.all(`
    SELECT c.name, c.is_impulse, COALESCE(SUM(ABS(t.amount)), 0) AS total
    FROM   transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE  t.amount < 0 AND t.post_date >= ?
    GROUP  BY t.category_id
    ORDER  BY total DESC
    LIMIT  8
  `, [monthStart]);

  return {
    balance,
    balanceDate:        latestTx?.post_date ?? null,
    paycheckFrequency,
    paycheckLastDate,
    nextPaycheckDate,
    daysUntilPaycheck,
    nextBill:           nextBill ?? null,
    nextBillDaysUntil:  nextBillDaysUntil ?? null,
    upcomingBills,
    upcomingBillsTotal,
    cushion,
    buffer,
    status,               // 'unknown' | 'setup' | 'ok' | 'tight' | 'danger'
    statusMessage,
    monthlySpend,
    monthlyIncome,
    topCategories,
  };
}

module.exports = { getSummary };
