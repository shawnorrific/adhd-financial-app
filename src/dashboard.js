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
 * When accountId is provided, financial data is filtered to that account.
 *
 * @param {number|null} accountId
 */
function getSummary(accountId = null) {
  const today = toISO(new Date());
  const monthStart = today.substring(0, 7) + '-01';

  const acctWhere  = accountId ? 'AND account_id = ?' : '';
  const acctParam  = accountId ? [accountId]          : [];

  // ── Per-account balances (always returned for the account strip) ────────────
  const rawAccounts = db.all(`
    SELECT a.id, a.name, a.type, a.color,
           a.manual_balance, a.manual_balance_date,
           t.balance AS tx_balance, t.post_date AS tx_balance_date
    FROM   accounts a
    LEFT JOIN (
      SELECT account_id, balance, post_date
      FROM   transactions
      WHERE  balance IS NOT NULL
      GROUP  BY account_id
      HAVING post_date = MAX(post_date)
    ) t ON t.account_id = a.id
    ORDER BY a.id
  `);

  const accountBalances = rawAccounts.map(a => {
    const useManual = a.manual_balance != null &&
      (a.tx_balance == null || a.manual_balance_date >= a.tx_balance_date);
    return {
      ...a,
      latest_balance: useManual ? a.manual_balance      : a.tx_balance,
      balance_date:   useManual ? a.manual_balance_date : a.tx_balance_date,
      balance_source: useManual ? 'manual'              : 'import',
    };
  });

  // ── Balance ────────────────────────────────────────────────────────────────
  const latestTx = db.get(`
    SELECT balance, post_date
    FROM   transactions
    WHERE  balance IS NOT NULL
      ${acctWhere}
    ORDER  BY post_date DESC, balance ASC
    LIMIT  1
  `, acctParam);

  let manualBalance = null, manualBalanceDate = null;
  if (accountId) {
    const acct = db.get(
      'SELECT manual_balance, manual_balance_date FROM accounts WHERE id = ?', [accountId]);
    manualBalance     = acct?.manual_balance      ?? null;
    manualBalanceDate = acct?.manual_balance_date ?? null;
  }

  const useManual  = manualBalance !== null &&
    (latestTx == null || manualBalanceDate >= latestTx.post_date);
  const anchor     = useManual ? manualBalance     : (latestTx?.balance   ?? null);
  const anchorDate = useManual ? manualBalanceDate : (latestTx?.post_date ?? null);

  let balance = anchor;
  if (anchor !== null && anchorDate !== null) {
    const adjustment = db.get(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM   transactions
      WHERE  post_date > ?
      ${acctWhere}
    `, [anchorDate, ...acctParam])?.total || 0;
    balance = anchor + adjustment;
  }

  // ── Paycheck ───────────────────────────────────────────────────────────────
  const paycheckFrequency = getSetting('paycheck_frequency');
  const paycheckLastDate  = getSetting('paycheck_last_date');  // '' when not set

  let nextPaycheckDate     = null;
  let nextNextPaycheckDate = null;
  let daysUntilPaycheck    = null;

  if (paycheckLastDate) {
    nextPaycheckDate  = calcNextPaycheck(paycheckFrequency || 'biweekly', paycheckLastDate, today);
    daysUntilPaycheck = daysBetween(today, nextPaycheckDate);
    if (daysUntilPaycheck < 0) daysUntilPaycheck = 0;

    // One additional pay period beyond the next paycheck
    const dayAfterNext = toISO(new Date(new Date(nextPaycheckDate + 'T00:00:00').getTime() + 86400000));
    nextNextPaycheckDate = calcNextPaycheck(paycheckFrequency || 'biweekly', nextPaycheckDate, dayAfterNext);
  }

  // ── Bills ──────────────────────────────────────────────────────────────────
  const billsWhere = accountId
    ? 'WHERE is_active = 1 AND due_day IS NOT NULL AND (account_id = ? OR account_id IS NULL)'
    : 'WHERE is_active = 1 AND due_day IS NOT NULL';
  const bills = db.all(
    `SELECT * FROM bills ${billsWhere} ORDER BY due_day`,
    accountId ? [accountId] : []
  );

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

  // Bills due between now and the paycheck after next (used in cushion calculation).
  // Also track the sub-total of bills due before the *next* paycheck so we can
  // compute a pre-paycheck cushion and take the more conservative of the two.
  let billsBeforeNextTotal = 0;  // today → nextPaycheckDate
  let upcomingBillsTotal   = 0;  // today → nextNextPaycheckDate
  const upcomingBills      = [];
  if (nextNextPaycheckDate) {
    for (const bill of bills) {
      if (!bill.amount) continue;
      const { nextDate } = nextDueInfo(bill.due_day, today);
      if (nextDate <= nextNextPaycheckDate) {
        upcomingBillsTotal += bill.amount;
        upcomingBills.push({ ...bill, nextDate });
      }
      if (nextPaycheckDate && nextDate <= nextPaycheckDate) {
        billsBeforeNextTotal += bill.amount;
      }
    }
  }
  const billsAfterNextTotal = upcomingBillsTotal - billsBeforeNextTotal;

  // ── Avg daily discretionary spend (last 6 months, split by pay period) ──────
  const discTx = db.all(`
    SELECT t.post_date, ABS(t.amount) AS amt
    FROM   transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE  t.amount < 0
      AND  t.post_date >= date('now', '-6 months')
      AND  (c.name IS NULL OR c.name NOT IN (
             'Transfer', 'Credit Card Payment', 'Income', 'ATM / Cash'
           ))
      AND  LOWER(t.description) NOT IN (
             SELECT LOWER(name) FROM bills WHERE is_active = 1
           )
      ${acctWhere}
  `, acctParam);

  let p1Total = 0, p1Days = 0;
  let p2Total = 0, p2Days = 0;
  const seenPeriods = new Set();
  for (const row of discTx) {
    const [y, mo, d] = row.post_date.split('-').map(Number);
    const isP1 = d <= 15;
    const key  = `${y}-${mo}-${isP1 ? 1 : 2}`;
    if (!seenPeriods.has(key)) {
      seenPeriods.add(key);
      if (isP1) {
        p1Days += 15;
      } else {
        p2Days += new Date(y, mo, 0).getDate() - 15;
      }
    }
    if (isP1) p1Total += row.amt;
    else       p2Total += row.amt;
  }
  const avgDailyP1 = p1Days > 0 ? p1Total / p1Days : 0;
  const avgDailyP2 = p2Days > 0 ? p2Total / p2Days : 0;
  const avgDailyDiscretionary = new Date().getDate() <= 15 ? avgDailyP1 : avgDailyP2;

  // Estimate paycheck size from average of recent Income transactions
const paycheckAmountOverride = getSetting('paycheck_amount') || '';
let estimatedPaycheck = null;

if (parseFloat(paycheckAmountOverride) > 0) {
  estimatedPaycheck = parseFloat(paycheckAmountOverride);
} else {
  const deposits = db.all(`
    SELECT amount, post_date
    FROM   transactions
    WHERE  amount > 500
    ORDER  BY amount ASC
  `);

  const clusters = [];
  for (const row of deposits) {
    let placed = false;
    for (const cluster of clusters) {
      if (row.amount / cluster[0].amount <= 1.1) {
        cluster.push(row);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([row]);
  }

  let bestCluster = null;
  for (const cluster of clusters) {
    if (cluster.length < 4) continue;
    const byDate = [...cluster].sort((a, b) => (a.post_date < b.post_date ? -1 : 1));
    const gaps = [];
    for (let i = 1; i < byDate.length; i++) {
      const ms = new Date(byDate[i].post_date + 'T00:00:00') - new Date(byDate[i - 1].post_date + 'T00:00:00');
      gaps.push(ms / 86400000);
    }
    const meanGap = gaps.reduce((acc, g) => acc + g, 0) / gaps.length;
    const stddev  = Math.sqrt(gaps.reduce((acc, g) => acc + (g - meanGap) ** 2, 0) / gaps.length);
    if (meanGap > 0 && stddev / meanGap < 0.2) {
      if (!bestCluster || cluster.length > bestCluster.length) bestCluster = cluster;
    }
  }

  if (bestCluster) {
    estimatedPaycheck = bestCluster.reduce((acc, r) => acc + r.amount, 0) / bestCluster.length;
  }
}

  const daysUntilNextNext = nextNextPaycheckDate
    ? Math.round((new Date(nextNextPaycheckDate + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000)
    : null;
  const estimatedBalance = (estimatedPaycheck != null && daysUntilNextNext != null && balance !== null)
    ? balance + estimatedPaycheck - upcomingBillsTotal - avgDailyDiscretionary * daysUntilNextNext
    : null;

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
        cushion = balance;
        status = cushion >= buffer ? 'ok' : cushion >= 0 ? 'tight' : 'danger';
        statusMessage = 'Add your bills for a more accurate picture';
    } else {
      const estimatedDiscretionarySpend = avgDailyDiscretionary * (daysUntilPaycheck ?? 0);
      cushion = balance - billsBeforeNextTotal;
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
    ${acctWhere}
  `, [monthStart, ...acctParam])?.total || 0;

  const monthlyIncome = db.get(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM   transactions
    WHERE  amount > 0 AND post_date >= ?
    ${acctWhere}
  `, [monthStart, ...acctParam])?.total || 0;

  const topCategories = db.all(`
    SELECT c.name, c.is_impulse, COALESCE(SUM(ABS(t.amount)), 0) AS total
    FROM   transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE  t.amount < 0 AND t.post_date >= ?
    ${acctWhere}
    GROUP  BY t.category_id
    ORDER  BY total DESC
    LIMIT  8
  `, [monthStart, ...acctParam]);


  return {
    balance,
    balanceDate:        anchorDate ?? null,
    accountBalances,
    paycheckFrequency,
    paycheckLastDate,
    nextPaycheckDate,
    daysUntilPaycheck,
    nextBill:           nextBill ?? null,
    nextBillDaysUntil:  nextBillDaysUntil ?? null,
    upcomingBills,
    upcomingBillsTotal,
    estimatedPaycheck,
    paycheckAmountOverride: paycheckAmountOverride || '',
    cushion,
    billsBeforeNextTotal,
    billsAfterNextTotal,
    nextNextPaycheckDate,
    daysUntilNextNext,
    estimatedBalance,
    avgDailyDiscretionary,
    estimatedDiscretionarySpend: avgDailyDiscretionary * (daysUntilPaycheck ?? 0),
    buffer,
    status,               // 'unknown' | 'setup' | 'ok' | 'tight' | 'danger'
    statusMessage,
    monthlySpend,
    monthlyIncome,
    topCategories,
  };
}

module.exports = { getSummary };
