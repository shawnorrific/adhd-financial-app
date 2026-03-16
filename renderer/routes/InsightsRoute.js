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

  function monthLabel(monthsAgo) {
    const d = new Date();
    if (monthsAgo) d.setMonth(d.getMonth() - monthsAgo);
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
      + ' ' + d.getFullYear();
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
      window.api.bills.detect({ accountId }),
      window.api.insights.categoryComparison({ accountId }),
      window.api.insights.categoryTrends({ accountId }),
      window.api.insights.spiralPattern({ accountId }),
      window.api.insights.milestones(),
    ]).then(([summary, bills, accounts, detected, catComparison, catTrends, spiral, milestones]) => {
      s.summary       = summary;
      s.bills         = bills;
      s.accounts      = accounts;
      s.detected      = detected;
      s.catComparison = catComparison;
      s.catTrends     = catTrends;
      s.spiral        = spiral;
      s.milestones    = milestones;
      s.loading       = false;
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
      s.loading       = true;
      s.summary       = null;
      s.bills         = [];
      s.accounts      = [];
      s.detected      = null;
      s.catComparison = [];
      s.catTrends     = [];
      s.spiral        = null;
      s.milestones    = [];
      s.error         = null;
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

      // ── Column header row (shared by mom + trends sections) ───────────
      function colHeader(labels) {
        return m('div', {
          style: 'display:flex; padding:0 0 6px; font-size:11px; color:#9ca3af; user-select:none;',
        }, [
          m('div', { style: 'flex:1' }),
          ...labels.map((lbl, i) =>
            m('div', {
              style: `width:80px; text-align:right;${i > 0 ? ' margin-left:8px;' : ''}${i === labels.length - 1 ? ' font-weight:600; color:#e2e8f0;' : ''}`,
            }, lbl)
          ),
        ]);
      }

      return m('div.dashboard-page', [

        // ── Nav ────────────────────────────────────────────────────────────
        m('nav.app-nav', [
          m('span.nav-logo', 'ADHD Finance'),
          m(m.route.Link, { href: '/dashboard', class: 'nav-link' }, 'Dashboard'),
          m(m.route.Link, { href: '/insights',  class: 'nav-link active' }, 'Insights'),
          m(m.route.Link, { href: '/bills',     class: 'nav-link' }, 'Bills'),
          m(m.route.Link, { href: '/accounts',  class: 'nav-link' }, 'Accounts'),
          m(m.route.Link, { href: '/transactions', class: 'nav-link' }, 'Transactions'),
          m(m.route.Link, { href: '/purchase',     class: 'nav-link' }, 'May I Buy?'),
          m(m.route.Link, { href: '/settings',     class: 'nav-link' }, 'Settings'),
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

            // ── Feature 6: Better than last month callouts ─────────────
            (() => {
              const better = (s.catComparison || []).filter(c =>
                c.last_month > 0 && c.last_month - c.current_month > 20
              );
              return better.length > 0 && m('div', {
                style: 'display:flex; flex-direction:column; gap:6px; margin-bottom:16px;',
              }, better.map(c =>
                m('div', {
                  style: 'border-left:3px solid #22c55e; padding:8px 14px; color:#4ade80; font-size:14px; background:#052e1620; border-radius:0 6px 6px 0;',
                }, `${c.name} this month: ${fmtMoney(c.current_month)} — ${fmtMoney(c.last_month - c.current_month)} less than last month. Nice.`)
              ));
            })(),

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

            // ── Feature 2: Month-over-month comparison ─────────────────
            s.catComparison?.length > 0 && m('div.spending-section', [
              m('h2.section-title', 'Month over month'),
              colHeader([monthLabel(1), monthLabel(0), 'Change']),
              m('div.spend-bars', (s.catComparison || []).map(cat => {
                const diff = cat.current_month - cat.last_month;
                const pct  = cat.last_month > 0 ? diff / cat.last_month * 100 : 100;
                const up20 = diff > 0 && pct > 20;
                const clr  = diff > 0 ? '#ef4444' : diff < 0 ? '#22c55e' : '#9ca3af';
                return m('div.spend-row', [
                  m('div.spend-name', { class: cat.is_impulse ? 'impulse' : '' }, cat.name),
                  m('div', { style: 'display:flex; align-items:center; margin-left:auto;' }, [
                    m('div.spend-amount.mono', {
                      style: 'width:80px; text-align:right; color:#9ca3af; font-size:13px;',
                    }, cat.last_month > 0 ? fmtMoney(cat.last_month) : '—'),
                    m('div.spend-amount.mono', {
                      style: 'width:80px; text-align:right; margin-left:8px;',
                    }, fmtMoney(cat.current_month)),
                    m('div.spend-amount.mono', {
                      style: `width:80px; text-align:right; margin-left:8px; font-size:13px; color:${clr};`,
                    }, diff === 0 ? '—' : [
                      (diff > 0 ? '+' : '') + fmtMoney(Math.abs(diff)),
                      up20 && m('span', { style: 'margin-left:3px; font-size:10px;' }, '▲'),
                    ]),
                  ]),
                ]);
              })),
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

            // ── Feature 3: 3-month category trend ─────────────────────
            s.catTrends?.length > 0 && m('div.spending-section', [
              m('h2.section-title', '3-month category trend'),
              colHeader([monthLabel(2), monthLabel(1), monthLabel(0)]),
              m('div.spend-bars', (s.catTrends || []).map(cat =>
                m('div.spend-row', [
                  m('div.spend-name', { class: cat.is_impulse ? 'impulse' : '' }, cat.name),
                  m('div', { style: 'display:flex; align-items:center; margin-left:auto;' }, [
                    m('div.spend-amount.mono', {
                      style: 'width:80px; text-align:right; color:#9ca3af; font-size:13px;',
                    }, cat.m2 > 0 ? fmtMoney(cat.m2) : '—'),
                    m('div.spend-amount.mono', {
                      style: 'width:80px; text-align:right; margin-left:8px; color:#9ca3af; font-size:13px;',
                    }, cat.m1 > 0 ? fmtMoney(cat.m1) : '—'),
                    m('div.spend-amount.mono', {
                      style: 'width:80px; text-align:right; margin-left:8px; font-weight:600;',
                    }, cat.m0 > 0 ? fmtMoney(cat.m0) : '—'),
                  ]),
                ])
              )),
            ]),

            // ── Feature 1: Subscription audit ─────────────────────────
            (() => {
              const trackedNames = new Set(s.bills.map(b => b.name));
              const untracked = (s.detected || []).filter(d => !trackedNames.has(d.description));
              return untracked.length > 0 && m('div.detect-section', [
                m('h2.section-title', 'Subscription audit'),
                m('p.section-hint',
                  'These charges appear monthly at a consistent amount and aren\'t tracked as bills.'),
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

            // ── Feature 4: Pattern insights ────────────────────────────
            s.spiral?.count > 0 && m('div.detect-section', [
              m('h2.section-title', 'Spending pattern'),
              s.spiral.pctWithImpulse > 0
                ? m('p.section-hint', [
                    `${s.spiral.pctWithImpulse}% of the time your balance dropped below $100, `,
                    `you spent an average of ${fmtMoney(s.spiral.avgAmount)} on impulse purchases within 3 days.`,
                    s.spiral.total > 0 ? ` Total across your history: ${fmtMoney(s.spiral.total)}.` : '',
                  ])
                : m('p.section-hint', [
                    `Your balance has dropped below $100 ${s.spiral.count} time${s.spiral.count !== 1 ? 's' : ''} `,
                    `and you didn\u2019t follow it with impulse spending. That\u2019s a real pattern.`,
                  ]),
            ]),

            // ── Feature 5: Milestones ──────────────────────────────────
            s.milestones?.length > 0 && m('div.detect-section', [
              m('h2.section-title', 'Milestones'),
              m('div.detect-list', s.milestones.map(item =>
                m('div.detect-row', [
                  m('div.detect-info', [
                    m('div.detect-name', ['\u2713 ', item.label]),
                    m('div.detect-meta', item.description),
                  ]),
                ])
              )),
            ]),

          ], // end !loading && sum
        ]),
      ]);
    },
  };

  window.Routes          = window.Routes || {};
  window.Routes.Insights = InsightsRoute;
}());
