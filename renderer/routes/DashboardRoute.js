// DashboardRoute.js — "Am I okay right now?" dashboard
// Loaded as a plain script. Defines window.Routes.Dashboard.
(function () {
  'use strict';

  // ── Formatting helpers ────────────────────────────────────────────────────

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '—';
    const [int, dec] = Math.abs(n).toFixed(2).split('.');
    return '$' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const [, mo, d] = iso.split('-');
    return `${months[parseInt(mo, 10) - 1]} ${parseInt(d, 10)}`;
  }

  function daysText(n) {
    if (n == null) return '—';
    if (n === 0)   return 'Today \uD83C\uDF89';
    if (n === 1)   return 'Tomorrow';
    return `${n} days`;
  }

  /** "due today" / "due tomorrow" / "due in X days" for a monthly due_day. */
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

  function monthLabel() {
    const now = new Date();
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getMonth()]
      + ' ' + now.getFullYear();
  }

  const TYPE_LABELS = {
    checking:    'Checking',
    credit_card: 'Credit Card',
    bnpl:        'BNPL (Affirm)',
  };

  // ── Data loading ──────────────────────────────────────────────────────────

  function loadData(vnode, { silent = false } = {}) {
    const s = vnode.state;
    if (!silent) {
      s.loading = true;
      m.redraw();
    }

    const accountId = s.selectedAccountId || null;

    Promise.all([
      window.api.dashboard.summary({ accountId }),
      window.api.bills.list({ accountId }),
      window.api.accounts.list(),
    ]).then(([summary, bills, accounts]) => {
      s.summary  = summary;
      s.bills    = bills;
      s.accounts = accounts;
      s.loading  = false;

      // Always detect recurring charges so the list stays available for adding more
      if (summary.balance !== null) {
        window.api.bills.detect().then(detected => {
          s.detected = detected;
          m.redraw();
        });
      } else {
        s.detected = [];
      }

      m.redraw();
    }).catch(err => {
      s.error   = err.message || String(err);
      s.loading = false;
      m.redraw();
    });
  }

  // ── Component ─────────────────────────────────────────────────────────────

  const DashboardRoute = {

    oninit(vnode) {
      const s   = vnode.state;
      s.loading  = true;
      s.summary  = null;
      s.bills    = [];
      s.accounts = [];
      s.detected = null;
      s.error    = null;
      s.selectedAccountId = null;  // null = all accounts
      // Paycheck setup form state
      s.pf = { open: false, frequency: 'biweekly', lastDate: '', saving: false };
      loadData(vnode);
    },

    async savePaycheck(vnode) {
      const s = vnode.state;
      if (!s.pf.lastDate) return;
      s.pf.saving = true;
      m.redraw();
      await Promise.all([
        window.api.settings.set('paycheck_frequency', s.pf.frequency),
        window.api.settings.set('paycheck_last_date',  s.pf.lastDate),
      ]);
      s.pf.open   = false;
      s.pf.saving = false;
      loadData(vnode);
    },

    async addBill(vnode, detected) {
      await window.api.bills.save({
        name:        detected.description,
        amount:      detected.avg_amount,
        due_day:     detected.avg_due_day,
        category_id: detected.category_id,
      });
      loadData(vnode, { silent: true });
    },

    view(vnode) {
      const s    = vnode.state;
      const self = this;
      const sum  = s.summary;

      const STATUS = {
        ok:      { icon: '✅', label: "You're okay",          cls: 'ok'      },
        tight:   { icon: '⚠️',  label: 'Tight but covered',   cls: 'tight'   },
        danger:  { icon: '🚨', label: 'Watch your spending',  cls: 'danger'  },
        setup:   { icon: '⚙️',  label: 'Finish setup',         cls: 'setup'   },
        unknown: { icon: '💤', label: 'No data yet',          cls: 'unknown' },
      };
      const sc = STATUS[sum?.status ?? 'unknown'];

      // ── Account filter pills ─────────────────────────────────────────────
      function accountPills() {
        if (!s.accounts.length) return null;
        return m('div.account-filter-row', [
          m('button.account-pill', {
            class: s.selectedAccountId === null ? 'active' : '',
            onclick() {
              s.selectedAccountId = null;
              loadData(vnode);
            },
          }, 'All accounts'),
          ...s.accounts.map(acct =>
            m('button.account-pill', {
              class: s.selectedAccountId === acct.id ? 'active' : '',
              style: s.selectedAccountId === acct.id
                ? `background:${acct.color}20; border-color:${acct.color}; color:${acct.color}`
                : `border-color:${acct.color}40; color:${acct.color}`,
              onclick() {
                s.selectedAccountId = acct.id;
                loadData(vnode);
              },
            }, [
              m('span.pill-dot', { style: `background:${acct.color}` }),
              acct.name,
              m('span.pill-type', TYPE_LABELS[acct.type] || acct.type),
            ])
          ),
          m(m.route.Link, { href: '/accounts', class: 'account-pill manage-pill' }, '⚙ Manage'),
        ]);
      }

      // ── Per-account balance cards (all-accounts view) ────────────────────
      function accountBalanceCards() {
        const balances = sum?.accountBalances?.filter(a => a.latest_balance != null);
        if (!balances?.length) return null;
        return m('div.account-balance-strip', balances.map(acct =>
          m('div.acct-balance-card', {
            style: `border-left: 4px solid ${acct.color}`,
          }, [
            m('div.acct-card-header', [
              m('span.account-dot', { style: `background:${acct.color}` }),
              m('span.acct-card-name', acct.name),
              m('span.acct-type-chip', {
                style: `color:${acct.color}; border-color:${acct.color}40`,
              }, TYPE_LABELS[acct.type] || acct.type),
            ]),
            m('div.acct-card-balance', fmtMoney(acct.latest_balance)),
            acct.balance_date && m('div.acct-card-date', `as of ${fmtDate(acct.balance_date)}`),
          ])
        ));
      }

      return m('div.dashboard-page', [

        // ── Nav ──────────────────────────────────────────────────────────────
        m('nav.app-nav', [
          m('span.nav-logo', 'ADHD Finance'),
          m(m.route.Link, { href: '/dashboard', class: 'nav-link active' }, 'Dashboard'),
          m(m.route.Link, { href: '/bills',     class: 'nav-link' }, 'Bills'),
          m(m.route.Link, { href: '/import',    class: 'nav-link' }, 'Import CSV'),
          m(m.route.Link, { href: '/accounts',  class: 'nav-link' }, 'Accounts'),
          m(m.route.Link, { href: '/transactions', class: 'nav-link' }, 'Transactions'),
          m(m.route.Link, { href: '/purchase',     class: 'nav-link' }, 'May I Buy?'),
        ]),

        m('div.dashboard-body', [

          // ── Account filter + refresh ─────────────────────────────────────
          m('div.dashboard-top-bar', [
            accountPills(),
            m('button.btn.btn-ghost.dashboard-refresh-btn', {
              title:   'Refresh data',
              onclick() { loadData(vnode); },
            }, '↻'),
          ]),

          s.loading && m('p.status-msg', '⏳ Loading…'),
          s.error   && m('p.error-msg', `⚠️ ${s.error}`),

          !s.loading && sum && [

            // ── Status banner ───────────────────────────────────────────────
            m(`div.status-banner.${sc.cls}`, [
              m('span.status-icon', sc.icon),
              m('div.status-text', [
                m('div.status-label', sc.label),

                // Cushion / shortfall detail
                sum.cushion != null && m('div.status-detail', [
                  fmtMoney(Math.abs(sum.cushion)),
                  sum.cushion >= 0 ? ' cushion' : ' shortfall',
                  sum.nextPaycheckDate
                    ? ` before ${fmtDate(sum.nextPaycheckDate)} paycheck`
                    : ' before next paycheck',
                ]),

                // Next bill callout
                sum.nextBill && m('div.status-detail', [
                  `Next: ${sum.nextBill.name}`,
                  sum.nextBill.amount ? ` ${fmtMoney(sum.nextBill.amount)}` : '',
                  ` \u00B7 due ${daysText(sum.nextBillDaysUntil).toLowerCase()}`,
                ]),

                // Setup / unknown nudge
                (sum.status === 'setup' || sum.status === 'unknown') &&
                  m('div.status-detail.muted', sum.statusMessage),
              ]),
            ]),

            // ── Stat cards ──────────────────────────────────────────────────
            m('div.stat-cards', [

              // Balance — single account shows one card; all accounts shows per-account strip
              s.selectedAccountId
                ? m('div.stat-card', [
                    m('div.card-label', 'Balance'),
                    m('div.card-value', sum.balance != null ? fmtMoney(sum.balance) : '—'),
                    m('div.card-sub',
                      sum.balanceDate ? `as of ${fmtDate(sum.balanceDate)}` : 'import a CSV to start'),
                  ])
                : m('div.stat-card.stat-card--wide', [
                    m('div.card-label', 'Balances'),
                    accountBalanceCards() ||
                      m('div.card-value.muted', sum.balance != null ? fmtMoney(sum.balance) : '—'),
                    !accountBalanceCards() && sum.balanceDate &&
                      m('div.card-sub', `as of ${fmtDate(sum.balanceDate)}`),
                    !accountBalanceCards() && !sum.balanceDate &&
                      m('div.card-sub', 'import a CSV to start'),
                  ]),

              // Paycheck countdown
              m('div.stat-card', [
                m('div.card-label', 'Next paycheck'),

                sum.daysUntilPaycheck != null ? [
                  m('div.card-value', daysText(sum.daysUntilPaycheck)),
                  m('div.card-sub', sum.nextPaycheckDate ? fmtDate(sum.nextPaycheckDate) : ''),
                  m('button.btn.btn-ghost.card-edit-btn', {
                    onclick() { s.pf.open = !s.pf.open; s.pf.frequency = sum.paycheckFrequency || 'biweekly'; s.pf.lastDate = sum.paycheckLastDate || ''; },
                  }, s.pf.open ? 'cancel' : 'edit'),
                ] : [
                  m('div.card-value.muted', 'Not set up'),
                  m('button.btn.btn-primary.card-cta-btn', {
                    onclick() { s.pf.open = true; },
                  }, 'Configure'),
                ],

                // Inline paycheck setup form
                s.pf.open && m('div.inline-form', [
                  m('label.form-label', 'Frequency'),
                  m('select.cat-select', {
                    value: s.pf.frequency,
                    onchange: e => { s.pf.frequency = e.target.value; },
                  }, [
                    m('option', { value: 'weekly'      }, 'Weekly'),
                    m('option', { value: 'biweekly'    }, 'Every 2 weeks'),
                    m('option', { value: 'semimonthly' }, 'Twice a month (1st & 15th)'),
                    m('option', { value: 'monthly'     }, 'Monthly'),
                  ]),
                  m('label.form-label', 'Last paycheck date'),
                  m('input.form-input[type=date]', {
                    value: s.pf.lastDate,
                    oninput: e => { s.pf.lastDate = e.target.value; },
                  }),
                  m('div.form-actions', [
                    m('button.btn.btn-ghost', {
                      onclick() { s.pf.open = false; },
                    }, 'Cancel'),
                    m('button.btn.btn-primary', {
                      disabled: !s.pf.lastDate || s.pf.saving,
                      onclick()  { self.savePaycheck(vnode); },
                    }, s.pf.saving ? 'Saving…' : 'Save'),
                  ]),
                ]),
              ]),

              // Next bill
              m('div.stat-card', [
                m('div.card-label', 'Next bill due'),
                sum.nextBill ? [
                  m('div.card-value', daysText(sum.nextBillDaysUntil)),
                  m('div.card-sub', [
                    sum.nextBill.name,
                    sum.nextBill.amount ? m('span', ` \u00B7 ${fmtMoney(sum.nextBill.amount)}`) : null,
                  ]),
                ] : [
                  m('div.card-value.muted', 'None tracked'),
                  s.detected?.length
                    ? m('div.card-sub', `${s.detected.length} recurring charges below`)
                    : m('div.card-sub', 'Import transactions to detect bills'),
                ],
              ]),

            ]), // end .stat-cards

            // ── Monthly summary tiles ────────────────────────────────────────
            m('div.monthly-row', [
              m('div.monthly-tile', [
                m('div.tile-label', `${monthLabel()} spending`),
                m('div.tile-value.red',
                  sum.monthlySpend > 0 ? `\u2212${fmtMoney(sum.monthlySpend)}` : '—'),
              ]),
              m('div.monthly-tile', [
                m('div.tile-label', `${monthLabel()} income`),
                m('div.tile-value.green',
                  sum.monthlyIncome > 0 ? `+${fmtMoney(sum.monthlyIncome)}` : '—'),
              ]),
            ]),

            // ── Spending breakdown ───────────────────────────────────────────
            sum.topCategories?.length > 0 && m('div.spending-section', [
              m('h2.section-title', 'Spending this month'),
              m('div.spend-bars', (() => {
                const max = Math.max(...sum.topCategories.map(c => c.total), 1);
                return sum.topCategories.map(cat =>
                  m('div.spend-row', [
                    m('div.spend-name', { class: cat.is_impulse ? 'impulse' : '' },
                      cat.name || 'Uncategorized'),
                    m('div.spend-bar-wrap',
                      m('div.spend-bar-track',
                        m('div.spend-bar-fill', {
                          class: cat.is_impulse ? 'impulse' : '',
                          style: `width:${(cat.total / max * 100).toFixed(1)}%`,
                        })
                      )
                    ),
                    m('div.spend-amount.mono', fmtMoney(cat.total)),
                  ])
                );
              })()),
            ]),

            // ── Detected recurring charges ───────────────────────────────────
            (() => {
              const trackedNames = new Set(s.bills.map(b => b.name));
              const untracked = (s.detected || []).filter(d => !trackedNames.has(d.description));
              return untracked.length > 0 && m('div.detect-section', [
                m('h2.section-title', 'Recurring charges detected'),
                m('p.section-hint',
                  'These appear monthly at a consistent amount. Add them as bills so the dashboard can track upcoming payments.'),
                m('div.detect-list', untracked.map(d =>
                  m('div.detect-row', [
                    m('div.detect-info', [
                      m('div.detect-name', d.description),
                      m('div.detect-meta', [
                        `~${fmtMoney(d.avg_amount)}`,
                        d.avg_due_day ? ` \u00B7 around day\u00A0${d.avg_due_day}` : '',
                        ` \u00B7 ${d.occurrences}\u00D7 in 3\u00A0months`,
                      ]),
                    ]),
                    m('button.btn.btn-ghost', {
                      onclick() { self.addBill(vnode, d); },
                    }, '+ Track as bill'),
                  ])
                )),
              ]);
            })(),

            // ── Configured bills list ────────────────────────────────────────
            s.bills.length > 0 && m('div.bills-section', [
              m('h2.section-title', 'Bills'),
              m('div.bills-list', s.bills.map(bill =>
                m('div.bill-row', [
                  m('div.bill-info', [
                    bill.account_color && m('span.account-dot.dot-sm', {
                      style: `background:${bill.account_color}`,
                    }),
                    m('div.bill-name', bill.name),
                  ]),
                  m('div.bill-meta', [
                    bill.amount
                      ? m('span', fmtMoney(bill.amount))
                      : m('span.muted', 'variable'),
                    bill.due_day
                      ? m('span.muted', ` \u00B7 ${billDueText(bill.due_day)}`)
                      : null,
                  ]),
                ])
              )),
            ]),

          ], // end !loading && sum
        ]),
      ]);
    },
  };

  window.Routes           = window.Routes || {};
  window.Routes.Dashboard = DashboardRoute;
}());
