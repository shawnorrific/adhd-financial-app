// BillsRoute.js — manual bill entry + Google Calendar sync
// Loaded as a plain script. Defines window.Routes.Bills.
(function () {
  'use strict';

  // ── Helpers ───────────────────────────────────────────────────────────────

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '—';
    const [int, dec] = Math.abs(n).toFixed(2).split('.');
    return '$' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
  }

  function billDueText(dueDay) {
    if (!dueDay) return null;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let next = new Date(today.getFullYear(), today.getMonth(), dueDay);
    if (next < today) next = new Date(today.getFullYear(), today.getMonth() + 1, dueDay);
    const days = Math.round((next - today) / 86400000);
    if (days === 0) return 'due today';
    if (days === 1) return 'due tomorrow';
    return `due in ${days} days`;
  }

  const TYPE_LABELS = {
    checking:    'Checking',
    credit_card: 'Credit Card',
    bnpl:        'BNPL (Affirm)',
  };

  function defaultForm() {
    return { name: '', amount: '', dueDay: '', categoryId: '', notes: '', accountId: '' };
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  function loadData(vnode) {
    const s = vnode.state;
    const accountId = s.selectedAccountId || null;
    Promise.all([
      window.api.bills.list({ accountId }),
      window.api.categories.list(),
      window.api.gcal.status(),
      window.api.accounts.list(),
    ]).then(([bills, categories, gcal, accounts]) => {
      s.bills      = bills;
      s.categories = categories;
      s.gcal       = gcal;
      s.accounts   = accounts;
      s.loading    = false;
      m.redraw();
    }).catch(err => {
      s.error   = err.message || String(err);
      s.loading = false;
      m.redraw();
    });
  }

  // ── Component ─────────────────────────────────────────────────────────────

  const BillsRoute = {

    oninit(vnode) {
      const s        = vnode.state;
      s.loading      = true;
      s.bills        = [];
      s.categories   = [];
      s.accounts     = [];
      s.gcal         = { connected: false, email: null, hasEnvCredentials: false };
      s.error        = null;
      s.selectedAccountId = null;
      // Add form
      s.showAdd      = false;
      s.addForm      = defaultForm();
      s.addSaving    = false;
      // Edit
      s.editId       = null;
      s.editForm     = defaultForm();
      s.editSaving   = false;
      // Google Calendar setup
      s.showGcalSetup  = false;
      s.gcalForm       = { clientId: '', clientSecret: '' };
      s.gcalConnecting = false;
      s.gcalError      = null;
      s.syncResult     = null;
      // Per-bill sync in-flight tracking
      s.syncing = {};
      loadData(vnode);
    },

    async addBill(vnode) {
      const s    = vnode.state;
      const f    = s.addForm;
      if (!f.name.trim()) return;
      s.addSaving = true;
      m.redraw();
      await window.api.bills.save({
        name:        f.name.trim(),
        amount:      f.amount     ? parseFloat(f.amount)          : null,
        due_day:     f.dueDay     ? parseInt(f.dueDay, 10)        : null,
        category_id: f.categoryId ? parseInt(f.categoryId, 10)    : null,
        account_id:  f.accountId  ? parseInt(f.accountId, 10)     : null,
        notes:       f.notes.trim() || null,
      });
      s.addSaving = false;
      s.showAdd   = false;
      s.addForm   = defaultForm();
      loadData(vnode);
    },

    startEdit(vnode, bill) {
      const s    = vnode.state;
      s.editId   = bill.id;
      s.editForm = {
        name:       bill.name,
        amount:     bill.amount      != null ? String(bill.amount)      : '',
        dueDay:     bill.due_day     != null ? String(bill.due_day)     : '',
        categoryId: bill.category_id != null ? String(bill.category_id) : '',
        accountId:  bill.account_id  != null ? String(bill.account_id)  : '',
        notes:      bill.notes || '',
      };
    },

    async saveBill(vnode) {
      const s    = vnode.state;
      const f    = s.editForm;
      if (!f.name.trim()) return;
      s.editSaving = true;
      m.redraw();
      await window.api.bills.save({
        id:          s.editId,
        name:        f.name.trim(),
        amount:      f.amount     ? parseFloat(f.amount)          : null,
        due_day:     f.dueDay     ? parseInt(f.dueDay, 10)        : null,
        category_id: f.categoryId ? parseInt(f.categoryId, 10)    : null,
        account_id:  f.accountId  ? parseInt(f.accountId, 10)     : null,
        notes:       f.notes.trim() || null,
      });
      s.editSaving = false;
      s.editId     = null;
      loadData(vnode);
    },

    async deleteBill(vnode, id) {
      await window.api.bills.delete(id);
      loadData(vnode);
    },

    async toggleSync(vnode, bill) {
      const s = vnode.state;
      s.syncing[bill.id] = true;
      m.redraw();
      const result = bill.calendar_event_id
        ? await window.api.gcal.unsyncBill(bill.id)
        : await window.api.gcal.syncBill(bill.id);
      delete s.syncing[bill.id];
      if (!result.ok) s.error = result.error;
      loadData(vnode);
    },

    async connectGcal(vnode) {
      const s = vnode.state;
      const clientId     = s.gcal.hasEnvCredentials ? '' : s.gcalForm.clientId;
      const clientSecret = s.gcal.hasEnvCredentials ? '' : s.gcalForm.clientSecret;
      if (!s.gcal.hasEnvCredentials && (!clientId || !clientSecret)) return;
      s.gcalConnecting = true;
      s.gcalError      = null;
      m.redraw();
      const result = await window.api.gcal.authorize({ clientId, clientSecret });
      s.gcalConnecting = false;
      if (result.ok) {
        s.gcal         = { connected: true, email: result.email };
        s.showGcalSetup = false;
      } else {
        s.gcalError = result.error;
      }
      m.redraw();
    },

    async disconnectGcal(vnode) {
      await window.api.gcal.disconnect();
      vnode.state.gcal = { connected: false, email: null };
      loadData(vnode);
    },

    async syncAll(vnode) {
      const s = vnode.state;
      s.syncResult = null;
      m.redraw();
      const result = await window.api.gcal.syncAll();
      s.syncResult = result.failed === 0
        ? `Synced ${result.synced} bill${result.synced !== 1 ? 's' : ''} to Google Calendar`
        : `${result.synced} synced, ${result.failed} failed: ${result.errors.join('; ')}`;
      loadData(vnode);
      setTimeout(() => { vnode.state.syncResult = null; m.redraw(); }, 5000);
    },

    view(vnode) {
      const s    = vnode.state;
      const self = this;

      const catOptions = [
        m('option', { value: '' }, '— Category —'),
        ...s.categories.map(c => m('option', { value: c.id }, c.name)),
      ];

      const acctOptions = [
        m('option', { value: '' }, '— Account (optional) —'),
        ...s.accounts.map(a => m('option', { value: a.id }, a.name)),
      ];

      // ── Account filter pills ─────────────────────────────────────────────
      function accountPills() {
        if (!s.accounts.length) return null;
        return m('div.account-filter-row', [
          m('button.account-pill', {
            class: s.selectedAccountId === null ? 'active' : '',
            onclick() { s.selectedAccountId = null; loadData(vnode); },
          }, 'All accounts'),
          ...s.accounts.map(acct =>
            m('button.account-pill', {
              key: acct.id,
              class: s.selectedAccountId === acct.id ? 'active' : '',
              style: s.selectedAccountId === acct.id
                ? `background:${acct.color}20; border-color:${acct.color}; color:${acct.color}`
                : `border-color:${acct.color}40; color:${acct.color}`,
              onclick() { s.selectedAccountId = acct.id; loadData(vnode); },
            }, [
              m('span.pill-dot', { style: `background:${acct.color}` }),
              acct.name,
              m('span.pill-type', TYPE_LABELS[acct.type] || acct.type),
            ])
          ),
        ]);
      }

      return m('div.bills-page', [

        // ── Nav ────────────────────────────────────────────────────────────
        m('nav.app-nav', [
          m('span.nav-logo', 'ADHD Finance'),
          m(m.route.Link, { href: '/dashboard', class: 'nav-link' }, 'Dashboard'),
          m(m.route.Link, { href: '/bills',     class: 'nav-link active' }, 'Bills'),
          m(m.route.Link, { href: '/import',    class: 'nav-link' }, 'Import CSV'),
          m(m.route.Link, { href: '/accounts',  class: 'nav-link' }, 'Accounts'),
          m(m.route.Link, { href: '/purchase',  class: 'nav-link' }, 'May I Buy?'),
        ]),

        m('div.bills-body', [

          // ── Account filter ───────────────────────────────────────────────
          accountPills(),

          s.loading && m('p.status-msg', '⏳ Loading…'),
          s.error   && m('p.error-msg', `⚠️ ${s.error}`),

          !s.loading && [

            // ── Page header ───────────────────────────────────────────────
            m('div.bills-header', [
              m('h1.page-title', 'Bills'),
              m('button.btn.btn-primary', {
                onclick() { s.showAdd = !s.showAdd; if (!s.showAdd) s.addForm = defaultForm(); },
              }, s.showAdd ? '✕ Cancel' : '+ Add bill'),
            ]),

            // ── Add bill form ─────────────────────────────────────────────
            s.showAdd && m('div.bill-form-card', [
              m('div.bill-form-grid.bill-form-grid--5col', [
                m('input.form-input', {
                  placeholder: 'Bill name *',
                  value: s.addForm.name,
                  oninput: e => { s.addForm.name = e.target.value; },
                }),
                m('input.form-input[type=number][min=0][step=0.01]', {
                  placeholder: 'Amount ($)',
                  value: s.addForm.amount,
                  oninput: e => { s.addForm.amount = e.target.value; },
                }),
                m('input.form-input[type=number][min=1][max=28]', {
                  placeholder: 'Due day (1–28)',
                  value: s.addForm.dueDay,
                  oninput: e => { s.addForm.dueDay = e.target.value; },
                }),
                m('select.cat-select', {
                  value: s.addForm.categoryId,
                  onchange: e => { s.addForm.categoryId = e.target.value; },
                }, catOptions),
                m('select.cat-select', {
                  value: s.addForm.accountId,
                  onchange: e => { s.addForm.accountId = e.target.value; },
                }, acctOptions),
              ]),
              m('div.form-actions', [
                m('button.btn.btn-ghost', {
                  onclick() { s.showAdd = false; s.addForm = defaultForm(); },
                }, 'Cancel'),
                m('button.btn.btn-primary', {
                  disabled: !s.addForm.name.trim() || s.addSaving,
                  onclick()  { self.addBill(vnode); },
                }, s.addSaving ? 'Saving…' : 'Add Bill'),
              ]),
            ]),

            // ── Bills list ────────────────────────────────────────────────
            s.bills.length === 0 && !s.showAdd
              ? m('div.bills-empty', [
                  m('p', 'No bills yet.'),
                  m('p.muted', 'Add one above, or import a CSV and the dashboard will auto-detect recurring charges.'),
                ])
              : m('div.bills-list-wrap', s.bills.map(bill => {

                  const isEditing = s.editId === bill.id;

                  return m('div.bill-card', { key: bill.id }, isEditing

                    // ── Edit mode ─────────────────────────────────────────
                    ? [
                        m('div.bill-form-grid.bill-form-grid--5col', [
                          m('input.form-input', {
                            value: s.editForm.name,
                            oninput: e => { s.editForm.name = e.target.value; },
                          }),
                          m('input.form-input[type=number][min=0][step=0.01]', {
                            placeholder: 'Amount ($)',
                            value: s.editForm.amount,
                            oninput: e => { s.editForm.amount = e.target.value; },
                          }),
                          m('input.form-input[type=number][min=1][max=28]', {
                            placeholder: 'Due day',
                            value: s.editForm.dueDay,
                            oninput: e => { s.editForm.dueDay = e.target.value; },
                          }),
                          m('select.cat-select', {
                            value: s.editForm.categoryId,
                            onchange: e => { s.editForm.categoryId = e.target.value; },
                          }, catOptions),
                          m('select.cat-select', {
                            value: s.editForm.accountId,
                            onchange: e => { s.editForm.accountId = e.target.value; },
                          }, acctOptions),
                        ]),
                        m('div.form-actions', [
                          m('button.btn.btn-ghost', {
                            onclick() { s.editId = null; },
                          }, 'Cancel'),
                          m('button.btn.btn-primary', {
                            disabled: !s.editForm.name.trim() || s.editSaving,
                            onclick()  { self.saveBill(vnode); },
                          }, s.editSaving ? 'Saving…' : 'Save'),
                        ]),
                      ]

                    // ── View mode ─────────────────────────────────────────
                    : [
                        m('div.bill-card-main', [
                          m('div.bill-card-name', [
                            bill.account_color && m('span.account-dot.dot-sm', {
                              style: `background:${bill.account_color}`,
                            }),
                            bill.name,
                          ]),
                          m('div.bill-card-meta', [
                            bill.amount
                              ? m('span.bill-amount', fmtMoney(bill.amount))
                              : m('span.muted', 'variable amount'),
                            bill.due_day
                              ? m('span.bill-due', ` \u00B7 ${billDueText(bill.due_day)}`)
                              : m('span.muted', ' \u00B7 no due day'),
                            bill.category_name
                              ? m('span.bill-cat', ` \u00B7 ${bill.category_name}`)
                              : null,
                            bill.account_name
                              ? m('span.account-type-badge.badge-sm', {
                                  style: `color:${bill.account_color}; border-color:${bill.account_color}40`,
                                }, bill.account_name)
                              : null,
                          ]),
                        ]),
                        m('div.bill-card-actions', [
                          // Google Calendar sync button (only shown when connected)
                          s.gcal.connected && m('button.btn.btn-ghost.cal-sync-btn', {
                            class: bill.calendar_event_id ? 'synced' : '',
                            title: bill.calendar_event_id
                              ? 'Remove from Google Calendar'
                              : (bill.due_day ? 'Add to Google Calendar' : 'Set a due day to sync'),
                            disabled: s.syncing[bill.id] || !bill.due_day,
                            onclick() { self.toggleSync(vnode, bill); },
                          }, s.syncing[bill.id]
                            ? '…'
                            : bill.calendar_event_id ? '✓ Cal' : '📅 Cal'),

                          m('button.btn.btn-ghost.icon-btn', {
                            title: 'Edit bill',
                            onclick() { self.startEdit(vnode, bill); },
                          }, '✎'),

                          m('button.btn.btn-ghost.icon-btn.delete-btn', {
                            title: 'Delete bill',
                            onclick() { self.deleteBill(vnode, bill.id); },
                          }, '×'),
                        ]),
                      ]
                  );
                })),

            // ── Google Calendar section ───────────────────────────────────
            m('div.gcal-section', [
              m('div.gcal-header', [
                m('h2.section-title', 'Google Calendar'),
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
                              value: s.gcalForm.clientId,
                              oninput: e => { s.gcalForm.clientId = e.target.value; },
                            }),
                            m('input.form-input', {
                              placeholder: 'Client Secret',
                              type: 'password',
                              value: s.gcalForm.clientSecret,
                              oninput: e => { s.gcalForm.clientSecret = e.target.value; },
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

          ], // end !loading
        ]),
      ]);
    },
  };

  window.Routes        = window.Routes || {};
  window.Routes.Bills  = BillsRoute;
}());
