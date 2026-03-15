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
      window.api.accounts.list(),
    ]).then(([summary, accounts]) => {
      s.summary  = summary;
      s.accounts = accounts;
      s.loading  = false;
      s.pa.value = summary.paycheckAmountOverride || '';

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
      s.accounts = [];
      s.error    = null;
      s.selectedAccountId = null;  // null = all accounts
      // Paycheck setup form state
      s.pf = { open: false, frequency: 'biweekly', lastDate: '', saving: false };
      // Paycheck amount override state
      s.pa = { value: '', saving: false };
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
        window.api.settings.set('paycheck_amount',     s.pa.value),
      ]);
      s.pf.open   = false;
      s.pf.saving = false;
      loadData(vnode);
    },

    async savePaycheckAmount(vnode) {
      const s = vnode.state;
      s.pa.saving = true;
      m.redraw();
      await window.api.settings.set('paycheck_amount', s.pa.value);
      s.pa.saving = false;
      loadData(vnode);
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

      function payCycleOutlook() {
        if (!sum || !sum.nextPaycheckDate) return null;

        const daysLeft       = sum.daysUntilPaycheck ?? 0;
        const estSpendBefore = sum.avgDailyDiscretionary * daysLeft;
        const estSpendCycle  = sum.daysUntilNextNext != null
          ? sum.avgDailyDiscretionary * sum.daysUntilNextNext
          : null;
        const heavyBills = sum.estimatedPaycheck != null
          && sum.billsAfterNextTotal > sum.estimatedPaycheck * 0.4;

        return m('div.outlook-section', [
          m('h2.section-title', 'Pay cycle outlook'),
          m('div.outlook-grid', [

            // ── Panel 1: until next paycheck ──────────────────────────────────
            m('div.outlook-card', [
              m('div.outlook-card-header', [
                m('span.outlook-card-title',
                  daysLeft === 0 ? 'Payday is today' : `Until ${fmtDate(sum.nextPaycheckDate)}`),
                daysLeft > 0 && m('span.outlook-card-sub',
                  `${daysLeft} day${daysLeft === 1 ? '' : 's'}`),
              ]),
              m('div.outlook-rows', [
                m('div.outlook-row', [
                  m('span.outlook-row-label', 'Balance'),
                  m('span.outlook-row-value', fmtMoney(sum.balance)),
                ]),
                sum.billsBeforeNextTotal > 0 && m('div.outlook-row', [
                  m('span.outlook-row-label', 'Bills before paycheck'),
                  m('span.outlook-row-value.red', '\u2212' + fmtMoney(sum.billsBeforeNextTotal)),
                ]),
                m('div.outlook-row.outlook-row--divider.outlook-row--total', [
                  m('span.outlook-row-label', 'Free to spend'),
                  m('span.outlook-row-value', {
                    class: (sum.cushion ?? 0) >= 0 ? 'green' : 'red',
                  }, fmtMoney(sum.cushion)),
                ]),
                daysLeft > 0 && estSpendBefore > 0 && m('div.outlook-row.outlook-spending-hint', [
                  m('span.outlook-row-label', 'Typical spending'),
                  m('span.outlook-row-value', '\u2248\u2212' + fmtMoney(estSpendBefore)),
                ]),
              ]),
            ]),

            // ── Panel 2: full cycle after next paycheck ────────────────────────
            sum.nextNextPaycheckDate && m('div.outlook-card', [
              m('div.outlook-card-header', [
                m('span.outlook-card-title', `After ${fmtDate(sum.nextPaycheckDate)}`),
                m('span.outlook-card-sub', `\u2192 ${fmtDate(sum.nextNextPaycheckDate)}`),
              ]),
              m('div.outlook-rows', [
                m('div.outlook-row', [
                  m('span.outlook-row-label', 'Balance'),
                  m('span.outlook-row-value', fmtMoney(sum.balance)),
                ]),
                sum.estimatedPaycheck != null && m('div.outlook-row', [
                  m('span.outlook-row-label', 'Est. paycheck'),
                  m('span.outlook-row-value.green', '+' + fmtMoney(sum.estimatedPaycheck)),
                ]),
                sum.upcomingBillsTotal > 0 && m('div.outlook-row', [
                  m('span.outlook-row-label', [
                    'All upcoming bills',
                    heavyBills && m('span.outlook-heavy-tag', ' heavy'),
                  ]),
                  m('span.outlook-row-value.red', '\u2212' + fmtMoney(sum.upcomingBillsTotal)),
                ]),
                estSpendCycle != null && estSpendCycle > 0 && m('div.outlook-row', [
                  m('span.outlook-row-label', `Est. spending (${sum.daysUntilNextNext}d)`),
                  m('span.outlook-row-value', '\u2248\u2212' + fmtMoney(estSpendCycle)),
                ]),
                sum.estimatedBalance != null
                  ? m('div.outlook-row.outlook-row--divider.outlook-row--total', [
                      m('span.outlook-row-label', 'Projected balance'),
                      m('span.outlook-row-value', {
                        class: sum.estimatedBalance >= 0 ? 'green' : 'red',
                      }, fmtMoney(sum.estimatedBalance)),
                    ])
                  : m('p.outlook-no-data', 'Set paycheck amount for full projection'),
              ]),
              heavyBills && m('div.outlook-warning', [
                '\u26A0\uFE0F ',
                fmtMoney(sum.billsAfterNextTotal),
                ` in bills after ${fmtDate(sum.nextPaycheckDate)} \u2014 plan ahead`,
              ]),
            ]),

          ]),
        ]);
      }

      return m('div.dashboard-page', [

        // ── Nav ──────────────────────────────────────────────────────────────
        m('nav.app-nav', [
          m('span.nav-logo', 'ADHD Finance'),
          m(m.route.Link, { href: '/dashboard', class: 'nav-link active' }, 'Dashboard'),
          m(m.route.Link, { href: '/insights',  class: 'nav-link' }, 'Insights'),
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
                sum.noBillsNudge &&
                  m('div.status-detail.muted', 'Add your bills for a more accurate picture'),
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

                // Estimated / overridden paycheck amount (always visible)
                m('div.card-sub.paycheck-detected',
                  sum.estimatedPaycheck != null
                    ? (sum.paycheckAmountOverride ? 'Override: ' : 'Est. paycheck: ') + fmtMoney(sum.estimatedPaycheck)
                    : 'Amount unknown'
                ),

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
                  m('label.form-label', 'Paycheck amount'),
                  m('input.form-input[type=number]', {
                    placeholder: 'Override amount',
                    value: s.pa.value,
                    oninput: e => { s.pa.value = e.target.value; },
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
                  m('div.card-sub', 'Import transactions to detect bills'),
                ],
              ]),

            ]), // end .stat-cards

            payCycleOutlook(),

          ], // end !loading && sum
        ]),
      ]);
    },
  };

  window.Routes           = window.Routes || {};
  window.Routes.Dashboard = DashboardRoute;
}());
