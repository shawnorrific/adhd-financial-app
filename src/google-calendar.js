'use strict';

const https = require('https');
const http  = require('http');
const { shell } = require('electron');
const db = require('../db');

const SCOPES        = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email';
const REDIRECT_PORT = 9922;
const REDIRECT_URI  = `http://127.0.0.1:${REDIRECT_PORT}/callback`;

// ── DB helpers ────────────────────────────────────────────────────────────────

function getSetting(key) {
  return db.get('SELECT value FROM settings WHERE key = ?', [key])?.value || '';
}

function setSetting(key, value) {
  db.run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    [key, String(value)]
  );
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

/** POST to a Google OAuth endpoint with form-encoded body. */
function httpPost(url, formData) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(formData).toString();
    const u    = new URL(url);
    const req  = https.request({
      hostname: u.hostname, port: 443, path: u.pathname, method: 'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try {
          const j = JSON.parse(raw);
          if (j.error) reject(new Error(j.error_description || j.error));
          else resolve(j);
        } catch { reject(new Error(`Bad response: ${raw.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** GET a Google API endpoint with Bearer token. */
function httpGet(url, accessToken) {
  return new Promise((resolve, reject) => {
    const u   = new URL(url);
    const req = https.request({
      hostname: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error(`Bad response: ${raw.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/** Make a Google Calendar REST request with a JSON body. */
function calRequest(method, path, body, accessToken) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'www.googleapis.com', port: 443,
      path: '/calendar/v3' + path, method,
      headers: {
        Authorization:  `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
    }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        if (res.statusCode === 204) { resolve(null); return; }
        try {
          const j = JSON.parse(raw);
          if (j.error) reject(new Error(j.error.message || JSON.stringify(j.error)));
          else resolve(j);
        } catch { reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 120)}`)); }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ── Token management ──────────────────────────────────────────────────────────

async function getAccessToken() {
  const expiry = parseInt(getSetting('google_token_expiry') || '0', 10);
  // Use cached token if it has more than 60s left
  if (expiry > Date.now() + 60000) return getSetting('google_access_token');

  const refreshToken = getSetting('google_refresh_token');
  if (!refreshToken) throw new Error('Not connected to Google Calendar');

  const tokens = await httpPost('https://oauth2.googleapis.com/token', {
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     getSetting('google_client_id'),
    client_secret: getSetting('google_client_secret'),
  });
  setSetting('google_access_token', tokens.access_token);
  setSetting('google_token_expiry',  String(Date.now() + tokens.expires_in * 1000));
  return tokens.access_token;
}

// ── OAuth flow ────────────────────────────────────────────────────────────────

let _pendingServer = null;

/** Start a local HTTP server and return a Promise that resolves with the OAuth code. */
function waitForCode() {
  if (_pendingServer) { try { _pendingServer.close(); } catch {} _pendingServer = null; }

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1:${REDIRECT_PORT}`);
      if (url.pathname !== '/callback') { res.writeHead(404); res.end(); return; }

      const code  = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html><body style="font-family:sans-serif;text-align:center;padding:64px;background:#0f1117;color:#e8eaf0">
        <h2 style="font-size:28px;margin-bottom:12px">${code ? '✅ Connected!' : '❌ Error'}</h2>
        <p style="color:#8b8fa8">${code ? 'You can close this tab and return to ADHD Finance.' : (error || 'Unknown error')}</p>
      </body></html>`);

      server.close();
      _pendingServer = null;
      if (code) resolve(code);
      else reject(new Error(error || 'Authorization denied'));
    });

    server.on('error', err => { _pendingServer = null; reject(err); });
    server.listen(REDIRECT_PORT, '127.0.0.1');
    _pendingServer = server;

    setTimeout(() => {
      if (_pendingServer) { _pendingServer.close(); _pendingServer = null; }
      reject(new Error('Authorization timed out (3 minutes)'));
    }, 180000);
  });
}

async function authorize(clientId, clientSecret) {
  // Fall back to .env if credentials weren't supplied via the UI
  clientId     = clientId     || process.env.GOOGLE_CLIENT_ID     || '';
  clientSecret = clientSecret || process.env.GOOGLE_CLIENT_SECRET || '';
  if (!clientId || !clientSecret) throw new Error('No Google client credentials found. Add them to .env or enter them in the app.');

  setSetting('google_client_id',     clientId);
  setSetting('google_client_secret', clientSecret);

  const params = new URLSearchParams({
    client_id: clientId, redirect_uri: REDIRECT_URI,
    response_type: 'code', scope: SCOPES,
    access_type: 'offline', prompt: 'consent',
  });

  // Start server before opening browser so the redirect is never missed
  const codePromise = waitForCode();
  shell.openExternal(`https://accounts.google.com/o/oauth2/auth?${params}`);
  const code = await codePromise;

  const tokens = await httpPost('https://oauth2.googleapis.com/token', {
    code, client_id: clientId, client_secret: clientSecret,
    redirect_uri: REDIRECT_URI, grant_type: 'authorization_code',
  });
  setSetting('google_refresh_token', tokens.refresh_token);
  setSetting('google_access_token',  tokens.access_token);
  setSetting('google_token_expiry',   String(Date.now() + tokens.expires_in * 1000));

  const info = await httpGet('https://www.googleapis.com/oauth2/v2/userinfo', tokens.access_token);
  setSetting('google_user_email', info.email || '');
  return { ok: true, email: info.email || '' };
}

// ── Calendar event helpers ────────────────────────────────────────────────────

function buildEvent(bill) {
  const today = new Date();
  let start   = new Date(today.getFullYear(), today.getMonth(), bill.due_day);
  if (start < today) start = new Date(today.getFullYear(), today.getMonth() + 1, bill.due_day);

  const startStr = start.toISOString().split('T')[0];
  const end      = new Date(start); end.setDate(end.getDate() + 1);
  const endStr   = end.toISOString().split('T')[0];
  const amtStr   = bill.amount ? ` · $${bill.amount.toFixed(2)}` : '';

  return {
    summary:     `${bill.name}${amtStr}`,
    description: 'Monthly bill — tracked by ADHD Finance',
    start:       { date: startStr },
    end:         { date: endStr },
    recurrence:  [`RRULE:FREQ=MONTHLY;BYMONTHDAY=${bill.due_day}`],
    colorId:     '9',  // blueberry
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

function getStatus() {
  return {
    connected:        !!getSetting('google_refresh_token'),
    email:            getSetting('google_user_email') || null,
    hasEnvCredentials: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  };
}

async function disconnect() {
  // Delete all synced calendar events before clearing local references,
  // so a future reconnect + sync doesn't create duplicates.
  try {
    const token = await getAccessToken();
    const bills = db.all('SELECT id, calendar_event_id FROM bills WHERE calendar_event_id IS NOT NULL');
    await Promise.allSettled(
      bills.map(b =>
        calRequest('DELETE', `/calendars/primary/events/${b.calendar_event_id}`, null, token)
          .catch(() => {}) // ignore 404s / already-deleted events
      )
    );
  } catch {
    // Not connected or token refresh failed — skip remote cleanup, clear local refs anyway
  }
  ['google_refresh_token', 'google_access_token', 'google_user_email'].forEach(k => setSetting(k, ''));
  setSetting('google_token_expiry', '0');
  db.run('UPDATE bills SET calendar_event_id = NULL');
  return { ok: true };
}

async function syncBill(billId) {
  const bill = db.get('SELECT * FROM bills WHERE id = ?', [billId]);
  if (!bill)         throw new Error('Bill not found');
  if (!bill.due_day) throw new Error('Bill has no due day — edit it first');

  const token = await getAccessToken();
  const event = buildEvent(bill);

  if (bill.calendar_event_id) {
    try {
      await calRequest('PUT', `/calendars/primary/events/${bill.calendar_event_id}`, event, token);
    } catch (err) {
      // Event was manually deleted from Google Calendar — clear the stale ID and re-create
      if (!/404|Not Found|Gone/i.test(err.message)) throw err;
      db.run('UPDATE bills SET calendar_event_id = NULL WHERE id = ?', [billId]);
      const created = await calRequest('POST', '/calendars/primary/events', event, token);
      db.run('UPDATE bills SET calendar_event_id = ? WHERE id = ?', [created.id, billId]);
    }
  } else {
    const created = await calRequest('POST', '/calendars/primary/events', event, token);
    db.run('UPDATE bills SET calendar_event_id = ? WHERE id = ?', [created.id, billId]);
  }
  return { ok: true };
}

async function unsyncBill(billId) {
  const bill = db.get('SELECT * FROM bills WHERE id = ?', [billId]);
  if (!bill?.calendar_event_id) return { ok: true };

  const token = await getAccessToken();
  try {
    await calRequest('DELETE', `/calendars/primary/events/${bill.calendar_event_id}`, null, token);
  } catch (err) {
    // Event already deleted from calendar — that's fine
    if (!/404|Not Found|Gone/i.test(err.message)) throw err;
  }
  db.run('UPDATE bills SET calendar_event_id = NULL WHERE id = ?', [billId]);
  return { ok: true };
}

async function syncAll() {
  const bills   = db.all('SELECT * FROM bills WHERE is_active = 1 AND due_day IS NOT NULL');
  let synced = 0, failed = 0;
  const errors  = [];

  for (const bill of bills) {
    try   { await syncBill(bill.id); synced++; }
    catch (err) { failed++; errors.push(`${bill.name}: ${err.message}`); }
  }
  return { ok: true, synced, failed, errors };
}

module.exports = { authorize, getStatus, disconnect, syncBill, unsyncBill, syncAll };
