'use strict';

/** Format a Date to an ISO date string "YYYY-MM-DD". */
function toISO(d) {
  return d.toISOString().split('T')[0];
}

/**
 * Walk forward from `lastDateStr` by one pay period at a time until we reach
 * a date that is >= today.  Uses ISO string comparison so timezone drift can't
 * push us to the wrong date.
 * @param {string} frequency - 'weekly' | 'biweekly' | 'semimonthly' | 'monthly'
 * @param {string} lastDateStr - ISO date string e.g. '2026-02-27'
 * @param {string} nowISO - ISO date string for today
 * @returns {string} - ISO date string of next paycheck
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

module.exports = { calcNextPaycheck, toISO };




