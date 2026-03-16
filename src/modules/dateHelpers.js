'use strict';

const {toISO} = require('./calcNextPaycheck');

/** Number of calendar days from ISO string `a` to ISO string `b`. */
function daysBetween(aISO, bISO) {
  return Math.round((new Date(bISO + 'T00:00:00') - new Date(aISO + 'T00:00:00')) / 86400000);
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

module.exports = { daysBetween, nextDueInfo };