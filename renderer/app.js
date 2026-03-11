'use strict';
/* global m, credentialStore, appInfo */

/**
 * app.js — Mithril.js entry point (no build step).
 *
 * Routes:
 *   /          → Dashboard (placeholder)
 *   /settings  → API Key Settings (safeStorage demo)
 */

// ── Credential keys we manage ─────────────────────────────────────────────────
const CRED_KEYS = {
  plaidClientId:     'plaid_client_id',
  plaidSecret:       'plaid_secret',
  plaidEnv:          'plaid_env',
  twilioSid:         'twilio_sid',
  twilioToken:       'twilio_token',
  twilioFrom:        'twilio_from',
  googleCalClientId: 'gcal_client_id',
  googleCalSecret:   'gcal_client_secret',
};

// ── Settings page ─────────────────────────────────────────────────────────────
const SettingsPage = {
  fields: {},
  status: {},       // per-key: 'saved' | 'error' | null
  encAvailable: null,

  async oninit() {
    const r = await credentialStore.isAvailable();
    SettingsPage.encAvailable = r;

    // Load all stored values (masked after load)
    for (const [field, key] of Object.entries(CRED_KEYS)) {
      const res = await credentialStore.get(key);
      SettingsPage.fields[field] = res.ok && res.value ? '••••••••' : '';
    }
    m.redraw();
  },

  async save(field, key, value) {
    if (!value || value === '••••••••') return;
    const res = await credentialStore.set(key, value);
    SettingsPage.status[field] = res.ok ? 'saved' : 'error:' + res.error;
    SettingsPage.fields[field] = res.ok ? '••••••••' : value;
    m.redraw();
  },

  async remove(field, key) {
    const res = await credentialStore.delete(key);
    SettingsPage.status[field] = res.ok ? 'cleared' : 'error:' + res.error;
    SettingsPage.fields[field] = '';
    m.redraw();
  },

  view() {
    const enc = SettingsPage.encAvailable;

    const credRow = (label, field, key, placeholder = '') => {
      const st = SettingsPage.status[field];
      return m('.form-group', [
        m('label', label),
        m('.flex-row', { style: 'display:flex;gap:8px;' }, [
          m('input', {
            type: 'password',
            placeholder,
            value: SettingsPage.fields[field] || '',
            oninput: (e) => { SettingsPage.fields[field] = e.target.value; },
          }),
          m('button.btn.btn-primary', {
            onclick: () => SettingsPage.save(field, key, SettingsPage.fields[field]),
          }, 'Save'),
          m('button.btn.btn-ghost', {
            onclick: () => SettingsPage.remove(field, key),
          }, 'Clear'),
        ]),
        st && m('div.mt-8', {
          style: `font-size:12px;color:${st === 'saved' || st === 'cleared' ? 'var(--success)' : 'var(--danger)'}`,
        }, st.startsWith('error:') ? st.slice(6) : st === 'saved' ? 'Saved securely.' : 'Cleared.'),
      ]);
    };

    return m('.main-content', [
      m('h2', { style: 'margin-bottom:20px;font-size:18px;' }, 'API Key Settings'),

      enc === false && m('.card', { style: 'border-color:var(--danger)' }, [
        m('.badge.badge-danger', 'WARNING'),
        m('p.mt-8', { style: 'font-size:13px;color:var(--muted)' },
          'OS-level encryption (safeStorage) is not available on this system. ' +
          'Credentials will not be stored until this is resolved.'),
      ]),

      m('.card', [
        m('.card-title', 'Plaid'),
        credRow('Client ID', 'plaidClientId', CRED_KEYS.plaidClientId, 'your-plaid-client-id'),
        credRow('Secret', 'plaidSecret', CRED_KEYS.plaidSecret, 'your-plaid-secret'),
        m('.form-group', [
          m('label', 'Environment'),
          m('select', {
            value: SettingsPage.fields.plaidEnv || 'sandbox',
            onchange: (e) => SettingsPage.save('plaidEnv', CRED_KEYS.plaidEnv, e.target.value),
          }, [
            m('option', { value: 'sandbox' }, 'Sandbox'),
            m('option', { value: 'development' }, 'Development'),
            m('option', { value: 'production' }, 'Production'),
          ]),
        ]),
      ]),

      m('.card', [
        m('.card-title', 'Twilio (optional SMS alerts)'),
        credRow('Account SID', 'twilioSid', CRED_KEYS.twilioSid, 'ACxxxxxxxx'),
        credRow('Auth Token', 'twilioToken', CRED_KEYS.twilioToken),
        credRow('From Number', 'twilioFrom', CRED_KEYS.twilioFrom, '+15550001234'),
      ]),

      m('.card', [
        m('.card-title', 'Google Calendar (optional bill reminders)'),
        credRow('OAuth Client ID', 'googleCalClientId', CRED_KEYS.googleCalClientId),
        credRow('OAuth Client Secret', 'googleCalSecret', CRED_KEYS.googleCalSecret),
      ]),
    ]);
  },
};

// ── Dashboard (placeholder) ───────────────────────────────────────────────────
const DashboardPage = {
  view: () =>
    m('.main-content', [
      m('h2', { style: 'margin-bottom:20px;font-size:18px;' }, 'Dashboard'),
      m('.card', [
        m('.card-title', 'Getting started'),
        m('p', { style: 'color:var(--muted);font-size:13px;' },
          'Connect your accounts via Settings to get started.'),
        m('a.btn.btn-primary.mt-16', { href: '#!/settings', style: 'text-decoration:none' },
          'Go to Settings'),
      ]),
    ]),
};

// ── Shell layout ──────────────────────────────────────────────────────────────
const Shell = {
  view: ({ children }) =>
    m('.layout', [
      m('.topbar', [
        m('h1', 'ADHD Finance'),
        m('span.text-muted', { style: 'font-size:12px;margin-left:auto;' },
          `v${appInfo.version} · ${appInfo.platform}`),
      ]),
      m('.sidebar', [
        m('nav', [
          m(m.route.Link, { href: '/', class: m.route.get() === '/' ? 'active' : '' }, 'Dashboard'),
          m(m.route.Link, { href: '/settings', class: m.route.get() === '/settings' ? 'active' : '' }, 'Settings'),
        ]),
      ]),
      m('.main-content-wrapper', { style: 'overflow:hidden;display:flex;flex-direction:column;' }, children),
    ]),
};

// ── Route wrappers ────────────────────────────────────────────────────────────
const wrap = (Page) => ({
  view: () => m(Shell, m(Page)),
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────
m.route(document.getElementById('app'), '/', {
  '/':         wrap(DashboardPage),
  '/settings': wrap(SettingsPage),
});
