'use strict';

function fmtMoney(n) {
  if (n == null || isNaN(n)) return '$—';
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  return '$' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  const [, mo, d] = iso.split('-');
  return `${months[parseInt(mo, 10) - 1]} ${parseInt(d, 10)}`;
}

module.exports = { fmtMoney, fmtDate }