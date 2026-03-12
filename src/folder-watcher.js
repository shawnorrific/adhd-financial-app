'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { Notification } = require('electron');

const db          = require('../db');
const csvImporter = require('./csv-importer');

const DEFAULT_WATCH_PATH = path.join(os.homedir(), 'Downloads');

// Minimum columns required in the header row to recognise a Verity CU export
const REQUIRED_HEADERS = ['post date', 'description', 'debit', 'credit'];

let _watcher   = null;
let _watchPath = null;
let _win       = null;
const _timers  = {};   // filename → debounce timer id

// ── Helpers ────────────────────────────────────────────────────────────────────

function getSetting(key) {
  return db.get('SELECT value FROM settings WHERE key = ?', [key])?.value ?? null;
}

function isVerityFormat(text) {
  const header = (text.split(/\r?\n/)[0] || '').toLowerCase();
  return REQUIRED_HEADERS.every(h => header.includes(h));
}

function notify(title, body) {
  try { new Notification({ title, body }).show(); } catch (_) { /* headless env */ }
}

function push(channel, data) {
  if (_win && !_win.isDestroyed()) _win.webContents.send(channel, data);
}

// ── Core file processor ────────────────────────────────────────────────────────

function processFile(filePath) {
  const filename = path.basename(filePath);

  // Read — may have disappeared between the watch event and now
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return;
  }

  // Format check — notify but do NOT import unrecognised files
  if (!isVerityFormat(text)) {
    const title = 'ADHD Finance — Unrecognized File';
    const body  = `"${filename}" was found but doesn't match the Verity Credit Union format.`;
    notify(title, body);
    push('watcher:unrecognized', { filename });
    return;
  }

  // Import
  let result;
  try {
    const rows = csvImporter.previewCSV(text);
    result     = csvImporter.importRows(rows, null, filename);
  } catch (err) {
    notify('ADHD Finance — Import Error', `Could not import "${filename}": ${err.message}`);
    return;
  }

  // Move to imported/ subfolder so the file isn't re-processed on restart
  const importedDir = path.join(path.dirname(filePath), 'imported');
  try {
    if (!fs.existsSync(importedDir)) fs.mkdirSync(importedDir);
    fs.renameSync(filePath, path.join(importedDir, filename));
  } catch (_) {
    // Non-fatal: leave original in place if move fails (e.g. cross-device rename)
  }

  // Desktop notification
  const n    = result.imported;
  const skip = result.skipped;
  const body = n === 0 && skip > 0
    ? `All transactions in "${filename}" were already imported.`
    : `Imported ${n} transaction${n !== 1 ? 's' : ''}${skip ? ` (${skip} duplicate${skip !== 1 ? 's' : ''} skipped)` : ''} from "${filename}".`;

  notify('ADHD Finance — Transactions Imported', body);
  push('watcher:imported', { filename, imported: n, skipped: skip });
}

// ── Public API ─────────────────────────────────────────────────────────────────

function start(win) {
  _win = win;
  stop(); // tear down any existing watcher first

  const saved = getSetting('watch_folder_path');
  _watchPath  = saved || DEFAULT_WATCH_PATH;

  if (!fs.existsSync(_watchPath)) return; // folder not present yet — skip silently

  _watcher = fs.watch(_watchPath, (eventType, filename) => {
    if (eventType !== 'rename' || !filename) return;
    if (!filename.toLowerCase().endsWith('.csv')) return;

    // Debounce per filename to avoid double-firing during a file copy
    const fullPath = path.join(_watchPath, filename);
    clearTimeout(_timers[filename]);
    _timers[filename] = setTimeout(() => {
      delete _timers[filename];
      if (fs.existsSync(fullPath)) processFile(fullPath);
    }, 500);
  });

  _watcher.on('error', () => stop()); // gracefully handle folder deletion
}

function stop() {
  if (_watcher) { _watcher.close(); _watcher = null; }
  for (const id of Object.values(_timers)) clearTimeout(id);
  for (const k  of Object.keys(_timers))  delete _timers[k];
}

function getWatchPath() {
  return _watchPath || getSetting('watch_folder_path') || DEFAULT_WATCH_PATH;
}

module.exports = { start, stop, getWatchPath };
