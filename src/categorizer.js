'use strict';

// db.js is always required after app.whenReady() in main.js so it's safe to
// require here — by the time this module loads, the DB file is already open.
const db = require('../db');

// Rules are loaded once and cached; invalidated when a user correction is saved
let _rules = null;

function loadRules() {
  _rules = db.all(`
    SELECT r.pattern, r.category_id, c.name AS category_name, c.is_impulse
    FROM   category_rules r
    JOIN   categories c ON c.id = r.category_id
    ORDER  BY r.is_user_defined DESC,   -- user corrections beat built-ins
              length(r.pattern)  DESC   -- longer patterns are more specific
  `);
}

/**
 * Return the best category for a transaction description.
 * @param {string} description
 * @returns {{ categoryId: number, categoryName: string, isImpulse: boolean }}
 */
function categorize(description) {
  if (!_rules) loadRules();

  const lower = description.toLowerCase();
  for (const rule of _rules) {
    if (lower.includes(rule.pattern.toLowerCase())) {
      return {
        categoryId:   rule.category_id,
        categoryName: rule.category_name,
        isImpulse:    rule.is_impulse === 1,
      };
    }
  }

  const fallback = db.get("SELECT id FROM categories WHERE name = 'Uncategorized'");
  return { categoryId: fallback.id, categoryName: 'Uncategorized', isImpulse: false };
}

/**
 * Persist a user correction so future imports auto-categorise the same merchant.
 * Extracts a stable pattern from the raw description (strips order-IDs etc.).
 * @param {string} description
 * @param {number} categoryId
 */
function learnCorrection(description, categoryId) {
  const pattern = extractPattern(description);
  db.run(`
    INSERT INTO category_rules (pattern, category_id, is_user_defined)
    VALUES (?, ?, 1)
    ON CONFLICT(pattern) DO UPDATE SET
      category_id     = excluded.category_id,
      is_user_defined = 1
  `, [pattern, categoryId]);
  _rules = null; // force reload on next categorize() call
}

// Pull the leading merchant-name chunk from a raw bank description.
// e.g. "DOORDASH*ORDER 98765" → "DOORDASH"
//      "CHEWY.COM 800-123"    → "CHEWY.COM"
function extractPattern(description) {
  const clean = description.trim();
  // Take leading word characters (letters, digits, spaces, dots, hyphens)
  const match = clean.match(/^[A-Za-z0-9 .'&\-]+/);
  const raw   = match ? match[0].trim() : clean;
  // Drop trailing digits/punctuation that look like order IDs
  const trimmed = raw.replace(/[\s\d*#]+$/, '').trim();
  return (trimmed.length >= 3 ? trimmed : clean).substring(0, 40);
}

module.exports = { categorize, learnCorrection };
