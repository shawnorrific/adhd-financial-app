// InsightsRoute.js — monthly spending, breakdown, and recurring charges
// Loaded as a plain script. Defines window.Routes.Insights.
(function () {
  'use strict';

  // ── Helpers ───────────────────────────────────────────────────────────────

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '—';
    const [int, dec] = Math.abs(n).toFixed(2).split('.');
    return '$' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
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

      window.api.bills.detect({ accountId }).then(detected => {
        s.detected = detected;
        m.redraw();
      });

      m.redraw();
    }).catch(err => {
      s.error   = err.message || String(err);
      s.loading = false;
      m.redraw();
    });
  }

  // ── Component ─────────────────────────────────────────────────────────────

  const InsightsRoute = {

    oninit(vnode) {
      const s = vnode.state;
      s.loading  = true;
      s.summary  = null;
      s.bills    = [];
      s.accounts = [];
      s.detected = null;
      s.error    = null;
      s.selectedAccountId = null;
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

      // ── Account filter pills ───────────────────────────────────────────
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

      return m('div.dashboard-page', [

        // ── Nav ────────────────────────────────────────────────────────────
        m('nav.app-nav', [
          m('span.nav-logo', 'ADHD Finance'),
          m(m.route.Link, { href: '/dashboard', class: 'nav-link' }, 'Dashboard'),
          m(m.route.Link, { href: '/insights',  class: 'nav-link active' }, 'Insights'),
          m(m.route.Link, { href: '/bills',     class: 'nav-link' }, 'Bills'),
          m(m.route.Link, { href: '/import',    class: 'nav-link' }, 'Import CSV'),
          m(m.route.Link, { href: '/accounts',  class: 'nav-link' }, 'Accounts'),
          m(m.route.Link, { href: '/transactions', class: 'nav-link' }, 'Transactions'),
          m(m.route.Link, { href: '/purchase',     class: 'nav-link' }, 'May I Buy?'),
        ]),

        m('div.dashboard-body', [

          // ── Account filter ─────────────────────────────────────────────
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

            // ── Monthly summary tiles ──────────────────────────────────
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

            // ── Spending breakdown ─────────────────────────────────────
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

            // ── Detected recurring charges ─────────────────────────────
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

          ], // end !loading && sum
        ]),
      ]);
    },
  };

  window.Routes          = window.Routes || {};
  window.Routes.Insights = InsightsRoute;
}());
