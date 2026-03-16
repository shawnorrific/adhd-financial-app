// SettingsRoute.js — app-wide settings
// Loaded as a plain script. Defines window.Routes.Settings.
(function () {
  'use strict';

  // ── Helpers ───────────────────────────────────────────────────────────────

  function fmtDateTime(raw) {
    if (!raw) return '';
    const d = new Date(raw.replace(' ', 'T') + 'Z');
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const WIPE_TARGETS = [
    { id: 'transactions', label: 'Transactions', detail: 'Deletes all transactions and import history.' },
    { id: 'bills',        label: 'Bills',        detail: 'Deletes all bills.' },
    { id: 'accounts',     label: 'Accounts',     detail: 'Deletes all accounts.' },
    { id: 'all',          label: 'Everything',   detail: 'Wipes transactions, import history, bills, and accounts.' },
  ];

  // ── Data loading ──────────────────────────────────────────────────────────

  function loadData(vnode) {
    const s = vnode.state;
    Promise.all([
      window.api.settings.get('balance_buffer'),
      window.api.settings.get('paycheck_frequency'),
      window.api.settings.get('paycheck_last_date'),
      window.api.settings.get('paycheck_amount'),
      window.api.watcher.getPath(),
      window.api.imports.list(),
      window.api.gcal.status(),
      window.api.accounts.list(),
    ]).then(([buffer, pfFreq, pfDate, pfAmount, watchPath, batches, gcal, accounts]) => {
      s.buffer.value = buffer   || '200';
      s.pf.frequency = pfFreq   || 'biweekly';
      s.pf.lastDate  = pfDate   || '';
      s.pf.amount    = pfAmount || '';
      s.watchInput   = watchPath || '';
      s.batches      = batches;
      s.gcal         = gcal;
      s.accounts     = accounts;
      s.loading      = false;
      m.redraw();
    }).catch(err => {
      s.error   = err.message || String(err);
      s.loading = false;
      m.redraw();
    });
  }

  // ── Component ─────────────────────────────────────────────────────────────

  const SettingsRoute = {

    oninit(vnode) {
      const s          = vnode.state;
      s.loading        = true;
      s.error          = null;
      // Financial Preferences
      s.buffer         = { value: '', saving: false };
      s.pf             = { frequency: 'biweekly', lastDate: '', amount: '', saving: false };
      // Import
      s.watchInput     = '';
      s.watchSaved     = false;
      s.batches        = [];
      s.accounts       = [];
      // Integrations — Google Calendar
      s.gcal           = { connected: false, email: null, hasEnvCredentials: false };
      s.showGcalSetup  = false;
      s.gcalForm       = { clientId: '', clientSecret: '' };
      s.gcalConnecting = false;
      s.gcalError      = null;
      s.syncResult     = null;
      // Danger Zone
      s.wiping         = null;
      loadData(vnode);
    },

    async saveBuffer(vnode) {
      const s = vnode.state;
      s.buffer.saving = true;
      m.redraw();
      await window.api.settings.set('balance_buffer', s.buffer.value);
      s.buffer.saving = false;
      m.redraw();
    },

    async savePaycheck(vnode) {
      const s = vnode.state;
      if (!s.pf.lastDate) return;
      s.pf.saving = true;
      m.redraw();
      await Promise.all([
        window.api.settings.set('paycheck_frequency', s.pf.frequency),
        window.api.settings.set('paycheck_last_date',  s.pf.lastDate),
        window.api.settings.set('paycheck_amount',     s.pf.amount),
      ]);
      s.pf.saving = false;
      m.redraw();
    },

    async saveWatchPath(vnode) {
      const s = vnode.state;
      await window.api.watcher.setPath(s.watchInput);
      s.watchSaved = true;
      m.redraw();
      setTimeout(() => { s.watchSaved = false; m.redraw(); }, 2000);
    },

    async connectGcal(vnode) {
      const s            = vnode.state;
      const clientId     = s.gcal.hasEnvCredentials ? '' : s.gcalForm.clientId;
      const clientSecret = s.gcal.hasEnvCredentials ? '' : s.gcalForm.clientSecret;
      if (!s.gcal.hasEnvCredentials && (!clientId || !clientSecret)) return;
      s.gcalConnecting = true;
      s.gcalError      = null;
      m.redraw();
      const result = await window.api.gcal.authorize({ clientId, clientSecret });
      s.gcalConnecting = false;
      if (result.ok) {
        s.gcal          = { connected: true, email: result.email };
        s.showGcalSetup = false;
      } else {
        s.gcalError = result.error;
      }
      m.redraw();
    },

    async disconnectGcal(vnode) {
      await window.api.gcal.disconnect();
      vnode.state.gcal = { connected: false, email: null };
      m.redraw();
    },

    async syncAll(vnode) {
      const s = vnode.state;
      s.syncResult = null;
      m.redraw();
      const result = await window.api.gcal.syncAll();
      s.syncResult = result.failed === 0
        ? `Synced ${result.synced} bill${result.synced !== 1 ? 's' : ''} to Google Calendar`
        : `${result.synced} synced, ${result.failed} failed: ${result.errors.join('; ')}`;
      m.redraw();
      setTimeout(() => { vnode.state.syncResult = null; m.redraw(); }, 5000);
    },

    async wipe(vnode, target) {
      const s = vnode.state;
      const t = WIPE_TARGETS.find(x => x.id === target);
      if (!window.confirm(`Delete ${t.label.toLowerCase()}?\n\n${t.detail}\n\nThis cannot be undone.`)) return;
      s.wiping = target;
      m.redraw();
      await window.api.danger.wipe(target);
      s.wiping = null;
      m.redraw();
    },

    view(vnode) {
      const s    = vnode.state;
      const self = this;

      return m('div.settings-page', [

        // ── Nav ──────────────────────────────────────────────────────────────
        m('nav.app-nav', [
          m('span.nav-logo', 'ADHD Finance'),
          m(m.route.Link, { href: '/dashboard',    class: 'nav-link' }, 'Dashboard'),
          m(m.route.Link, { href: '/insights',     class: 'nav-link' }, 'Insights'),
          m(m.route.Link, { href: '/bills',        class: 'nav-link' }, 'Bills'),
          m(m.route.Link, { href: '/import',       class: 'nav-link' }, 'Import CSV'),
          m(m.route.Link, { href: '/accounts',     class: 'nav-link' }, 'Accounts'),
          m(m.route.Link, { href: '/transactions', class: 'nav-link' }, 'Transactions'),
          m(m.route.Link, { href: '/purchase',     class: 'nav-link' }, 'May I Buy?'),
          m(m.route.Link, { href: '/settings',     class: 'nav-link active' }, 'Settings'),
        ]),

        m('div.settings-body', [

          m('h1.page-title', 'Settings'),

          s.loading && m('p.status-msg', '⏳ Loading…'),
          s.error   && m('p.error-msg', `⚠️ ${s.error}`),

          !s.loading && [

            // ── 1. Financial Preferences ──────────────────────────────────────
            m('div.settings-section', [
              m('h2.section-title', 'Financial Preferences'),

              m('div.settings-field-group', [
                m('label.settings-label', 'Balance buffer'),
                m('p.section-hint', 'Amount kept as a cushion when calculating whether you can afford something.'),
                m('div.settings-inline-row', [
                  m('input.form-input[type=number][min=0][step=1]', {
                    value:   s.buffer.value,
                    oninput: e => { s.buffer.value = e.target.value; },
                  }),
                  m('button.btn.btn-primary', {
                    disabled: s.buffer.saving,
                    onclick()  { self.saveBuffer(vnode); },
                  }, s.buffer.saving ? 'Saving…' : 'Save'),
                ]),
              ]),

              m('div.settings-field-group', [
                m('label.settings-label', 'Paycheck schedule'),
                m('p.section-hint', 'Used to calculate your upcoming pay dates and project your balance.'),
                m('label.form-label', 'Frequency'),
                m('select.cat-select', {
                  value:    s.pf.frequency,
                  onchange: e => { s.pf.frequency = e.target.value; },
                }, [
                  m('option', { value: 'weekly'      }, 'Weekly'),
                  m('option', { value: 'biweekly'    }, 'Every 2 weeks'),
                  m('option', { value: 'semimonthly' }, 'Twice a month (1st & 15th)'),
                  m('option', { value: 'monthly'     }, 'Monthly'),
                ]),
                m('label.form-label', 'Last paycheck date'),
                m('input.form-input[type=date]', {
                  value:   s.pf.lastDate,
                  oninput: e => { s.pf.lastDate = e.target.value; },
                }),
                m('label.form-label', 'Paycheck amount'),
                m('input.form-input[type=number]', {
                  placeholder: 'Override amount',
                  value:       s.pf.amount,
                  oninput:     e => { s.pf.amount = e.target.value; },
                }),
                m('div.form-actions', [
                  m('button.btn.btn-primary', {
                    disabled: !s.pf.lastDate || s.pf.saving,
                    onclick()  { self.savePaycheck(vnode); },
                  }, s.pf.saving ? 'Saving…' : 'Save'),
                ]),
              ]),
            ]),

            // ── 2. Import ─────────────────────────────────────────────────────
            m('div.settings-section', [
              m('h2.section-title', 'Import'),

              m('div.settings-field-group', [
                m('label.settings-label', 'Watch folder'),
                m('p.section-hint', 'CSV files placed here are imported automatically.'),
                m('div.watch-folder-path-row', [
                  m('input.form-input[type=text]', {
                    value:       s.watchInput,
                    placeholder: '~/Downloads',
                    oninput(e)  { s.watchInput = e.target.value; },
                  }),
                  m('button.btn', {
                    async onclick() {
                      const p = await window.api.dialog.openFolder();
                      if (p) { s.watchInput = p; m.redraw(); }
                    },
                  }, 'Browse'),
                  m('button.btn.btn-primary', {
                    onclick() { self.saveWatchPath(vnode); },
                  }, s.watchSaved ? 'Saved!' : 'Save'),
                ]),
              ]),

              s.batches.length > 0 && m('div.settings-field-group', [
                m('label.settings-label', 'Import history'),
                m('div.import-batch-list',
                  s.batches.map(batch =>
                    m('div.import-batch-row', [
                      m('div.import-batch-meta', [
                        m('span.import-batch-filename', batch.filename || 'Unknown file'),
                        m('span.import-batch-date', fmtDateTime(batch.imported_at)),
                      ]),
                      m('span.import-batch-count', `${batch.tx_count} tx`),
                      m('select.cat-select.import-batch-account', {
                        onchange(e) {
                          const newId = e.target.value ? parseInt(e.target.value, 10) : null;
                          batch.account_id = newId;
                          window.api.imports.setAccount(batch.id, newId);
                        },
                      }, [
                        m('option', { value: '', selected: !batch.account_id }, ''),
                        ...s.accounts.map(acct =>
                          m('option', { value: acct.id, selected: acct.id === batch.account_id }, acct.name)
                        ),
                      ]),
                      m('button.btn.icon-btn.delete-btn', {
                        title: 'Delete all transactions from this import',
                        async onclick() {
                          const label = batch.filename || 'this import';
                          if (!window.confirm(`Delete all ${batch.tx_count} transaction${batch.tx_count !== 1 ? 's' : ''} from \u201c${label}\u201d? This cannot be undone.`)) return;
                          await window.api.imports.delete(batch.id);
                          s.batches = s.batches.filter(b => b.id !== batch.id);
                          m.redraw();
                        },
                      }, '\uD83D\uDDD1'),
                    ])
                  )
                ),
              ]),
            ]),

            // ── 3. Integrations ───────────────────────────────────────────────
            m('div.settings-section', [
              m('h2.section-title', 'Integrations'),

              m('div.settings-field-group', [
                m('div.gcal-header', [
                  m('h3.settings-label', 'Google Calendar'),
                  s.gcal.connected && [
                    m('span.gcal-connected-badge', `✓ ${s.gcal.email}`),
                    m('div.gcal-header-actions', [
                      s.syncResult && m('span.sync-result', s.syncResult),
                      m('button.btn.btn-ghost', {
                        onclick() { self.syncAll(vnode); },
                      }, 'Sync all'),
                      m('button.btn.btn-ghost', {
                        onclick() { self.disconnectGcal(vnode); },
                      }, 'Disconnect'),
                    ]),
                  ],
                ]),

                !s.gcal.connected && [
                  s.showGcalSetup
                    ? m('div.gcal-setup', [
                        s.gcal.hasEnvCredentials
                          ? m('p.section-hint', 'Credentials loaded from .env — click Connect to authorize.')
                          : [
                              m('p.section-hint', [
                                '1. Open ',
                                m('a.ext-link', {
                                  href: '#',
                                  onclick(e) {
                                    e.preventDefault();
                                    window.api.shell.openExternal('https://console.cloud.google.com/apis/credentials');
                                  },
                                }, 'Google Cloud Console'),
                                ' \u2192 select or create a project',
                              ]),
                              m('p.section-hint', '2. Enable the Google Calendar API \u2192 Create Credentials \u2192 OAuth client ID \u2192 Desktop app'),
                              m('p.section-hint', '3. Paste your credentials below and click Connect:'),
                              m('input.form-input', {
                                placeholder: 'Client ID',
                                value:       s.gcalForm.clientId,
                                oninput:     e => { s.gcalForm.clientId = e.target.value; },
                              }),
                              m('input.form-input', {
                                placeholder: 'Client Secret',
                                type:        'password',
                                value:       s.gcalForm.clientSecret,
                                oninput:     e => { s.gcalForm.clientSecret = e.target.value; },
                              }),
                            ],
                        s.gcalError && m('p.error-msg', s.gcalError),
                        m('div.form-actions', [
                          m('button.btn.btn-ghost', {
                            onclick() { s.showGcalSetup = false; s.gcalError = null; },
                          }, 'Cancel'),
                          m('button.btn.btn-primary', {
                            disabled: (!s.gcal.hasEnvCredentials && (!s.gcalForm.clientId || !s.gcalForm.clientSecret)) || s.gcalConnecting,
                            onclick()  { self.connectGcal(vnode); },
                          }, s.gcalConnecting ? 'Waiting for browser…' : 'Connect'),
                        ]),
                      ])
                    : m('div.gcal-prompt', [
                        m('p', 'Push your bills to Google Calendar so they appear alongside meetings and appointments.'),
                        m('button.btn.btn-primary', {
                          onclick() { s.showGcalSetup = true; },
                        }, 'Connect Google Calendar'),
                      ]),
                ],
              ]),
            ]),

            // ── 4. Danger Zone ────────────────────────────────────────────────
            m('div.settings-section.settings-section--danger', [
              m('h2.section-title', 'Danger Zone'),
              m('p.section-hint', 'Deletions are immediate and permanent.'),
              m('div.dz-btn-list',
                WIPE_TARGETS.map(t =>
                  m('button.dz-wipe-btn', {
                    class:    t.id === 'all' ? 'dz-wipe-btn--all' : '',
                    disabled: s.wiping !== null,
                    onclick() { self.wipe(vnode, t.id); },
                  }, [
                    m('span.dz-wipe-label', `Wipe ${t.label}`),
                    m('span.dz-wipe-detail', t.detail),
                  ])
                )
              ),
            ]),

          ], // end !loading
        ]),
      ]);
    },
  };

  window.Routes          = window.Routes || {};
  window.Routes.Settings = SettingsRoute;
}());
