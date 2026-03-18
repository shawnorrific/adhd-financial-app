'use strict';

/**
 * Calculate cushion — how much money is left after bills and buffer.
 * @param {number} balance
 * @param {number} billsBeforeNextTotal
 * @param {number} buffer
 * @returns {number}
 */
function calcCushion(balance, billsBeforeNextTotal, buffer) {
  return balance - billsBeforeNextTotal - buffer;
}

module.exports = { calcCushion };