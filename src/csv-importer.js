'use strict';

const db                            = require('../db');
const { categorize, learnCorrection } = require('./categorizer');

// ── CSV parsing ───────────────────────────────────────────────────────────────

/**
 * Parse CSV text in Verity Credit Union export format.
 *
 * Expected columns (order may vary, detected by header row):
 *   Account Number, Post Date, Check, Description, Debit, Credit,
 *   Status, Balance, Classification
 *
 * @param {string} text - raw CSV file content
 * @returns {object[]} - normalised transaction objects
 */
function parseCSV(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const header = splitLine(lines[0]).map(h => h.trim().toLowerCase());

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitLine(lines[i]);
    if (vals.length < 4) continue;

    const col = name => {
      const idx = header.indexOf(name);
      return idx >= 0 ? (vals[idx] || '').trim() : '';
    };

    const debit  = parseAmount(col('debit'));
    const credit = parseAmount(col('credit'));

    rows.push({
      accountNumber: col('account number') || null,
      postDate:      toISO(col('post date') || col('postdate')),
      checkNumber:   col('check') || null,
      description:   col('description'),
      amount:        credit - debit,   // positive = money in, negative = money out
      status:        col('status') || null,
      balance:       parseAmount(col('balance')) || null,
    });
  }

  // Drop rows with no description or unparseable date
  return rows.filter(r => r.description && r.postDate);
}

/** Split one CSV line, respecting double-quoted fields that may contain commas. */
function splitLine(line) {
  const out = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if      (ch === '"')          { inQ = !inQ; }
    else if (ch === ',' && !inQ)  { out.push(cur); cur = ''; }
    else                          { cur += ch; }
  }
  out.push(cur);
  return out;
}

/** "1,234.56" → 1234.56; empty/unparseable → 0 */
function parseAmount(s) {
  return parseFloat((s || '').replace(/,/g, '')) || 0;
}

/** "MM/DD/YYYY" → "YYYY-MM-DD". Passes through strings already in ISO format. */
function toISO(raw) {
  const m = (raw || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return raw;
}

// ── Preview ───────────────────────────────────────────────────────────────────

/**
 * Parse CSV text and attach auto-categorisation — no DB writes.
 * Returns rows ready to display in the import preview UI.
 *
 * @param {string} text
 * @returns {object[]}
 */
function previewCSV(text) {
  const rows = parseCSV(text);
  return rows.map(row => ({
    ...row,
    ...categorize(row.description),
    isUserCorrected: false,
  }));
}

// ── Import ────────────────────────────────────────────────────────────────────

/**
 * Persist confirmed rows into the DB, associating them with the given account.
 * Saves a category_rule for any row the user manually re-categorised.
 *
 * @param {object[]} rows      - from previewCSV(), possibly with user-edited categoryId
 * @param {number|null} accountId - account to associate all rows with
 * @returns {{ imported: number, skipped: number }}
 */
function importRows(rows, accountId = null) {
  let imported = 0;
  let skipped  = 0;

  for (const row of rows) {
    // Teach the correction before inserting so the rule is in place
    if (row.isUserCorrected && row.categoryId) {
      learnCorrection(row.description, row.categoryId);
    }

    try {
      db.run(`
        INSERT INTO transactions
          (account_number, post_date, check_number, description,
           amount, status, balance, category_id, is_user_categorized, source, account_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'csv', ?)
      `, [
        row.accountNumber  || null,
        row.postDate,
        row.checkNumber    || null,
        row.description,
        row.amount,
        row.status         || null,
        row.balance        ?? null,
        row.categoryId     || null,
        row.isUserCorrected ? 1 : 0,
        accountId,
      ]);
      imported++;
    } catch (e) {
      if (e.message && e.message.includes('UNIQUE')) {
        skipped++; // exact duplicate — silently skip
      } else {
        throw e;
      }
    }
  }

  return { imported, skipped };
}

module.exports = { previewCSV, importRows };
