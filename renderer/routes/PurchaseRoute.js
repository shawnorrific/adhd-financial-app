// PurchaseRoute.js — "Mother May I?" purchase checker
// Loaded as a plain script. Defines window.Routes.Purchase.
(function () {
  'use strict';

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '—';
    const [int, dec] = Math.abs(n).toFixed(2).split('.');
    return '$' + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const months = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec'];
    const [, mo, d] = iso.split('-');
    return `${months[parseInt(mo, 10) - 1]} ${parseInt(d, 10)}`;
  }

  const VERDICT_CONFIG = {
    safe: {
      cls:  'mmi-verdict--safe',
      icon: '✅',
    },
    borderline: {
      cls:  'mmi-verdict--borderline',
      icon: '⚠️',
    },
    unsafe: {
      cls:  'mmi-verdict--unsafe',
      icon: '🚫',
    },
    unknown: {
      cls:  'mmi-verdict--unknown',
      icon: '💤',
    },
  };

  const PurchaseRoute = {

    oninit(vnode) {
      const s     = vnode.state;
      s.item      = '';
      s.cost      = '';
      s.checking  = false;
      s.result    = null;
      s.error     = null;
    },

    async check(vnode) {
      const s    = vnode.state;
      const cost = parseFloat(s.cost);
      if (!s.item.trim() || isNaN(cost) || cost <= 0) return;

      s.checking = true;
      s.result   = null;
      s.error    = null;
      m.redraw();

      try {
        s.result = await window.api.purchase.check(s.item.trim(), cost);
      } catch (err) {
        s.error = err.message || String(err);
      }

      s.checking = false;
      m.redraw();
    },

    view(vnode) {
      const s    = vnode.state;
      const self = this;
      const res  = s.result;
      const vc   = res ? (VERDICT_CONFIG[res.verdict] || VERDICT_CONFIG.unknown) : null;

      const canCheck = s.item.trim().length > 0
        && parseFloat(s.cost) > 0
        && !s.checking;

      return m('div.purchase-page', [

        // ── Nav ────────────────────────────────────────────────────────────
        m('nav.app-nav', [
          m('span.nav-logo', 'ADHD Finance'),
          m(m.route.Link, { href: '/dashboard', class: 'nav-link' },         'Dashboard'),
          m(m.route.Link, { href: '/bills',     class: 'nav-link' },         'Bills'),
          m(m.route.Link, { href: '/import',    class: 'nav-link' },         'Import CSV'),
          m(m.route.Link, { href: '/accounts',  class: 'nav-link' },         'Accounts'),
          m(m.route.Link, { href: '/transactions', class: 'nav-link' },        'Transactions'),
          m(m.route.Link, { href: '/purchase',     class: 'nav-link active' }, 'May I Buy?'),
        ]),

        m('div.purchase-body', [

          m('h1.purchase-heading', [
            m('span', 'Mother May I?'),
          ]),
          m('p.purchase-subheading',
            'Enter what you want to buy and the cost. I\'ll check your balance, upcoming bills, and next paycheck.'),

          // ── Input form ──────────────────────────────────────────────────
          m('div.mmi-form', [
            m('div.mmi-fields', [
              m('div.mmi-field', [
                m('label.form-label[for=mmi-item]', 'What do you want to buy?'),
                m('input.form-input#mmi-item[type=text][placeholder=e.g. Headphones]', {
                  value:   s.item,
                  oninput: e => { s.item = e.target.value; s.result = null; },
                  onkeydown: e => { if (e.key === 'Enter') self.check(vnode); },
                }),
              ]),
              m('div.mmi-field.mmi-field--cost', [
                m('label.form-label[for=mmi-cost]', 'How much does it cost?'),
                m('div.mmi-cost-wrap', [
                  m('span.mmi-dollar', '$'),
                  m('input.form-input#mmi-cost[type=number][min=0.01][step=0.01][placeholder=0.00]', {
                    value:   s.cost,
                    oninput: e => { s.cost = e.target.value; s.result = null; },
                    onkeydown: e => { if (e.key === 'Enter') self.check(vnode); },
                  }),
                ]),
              ]),
            ]),

            m('button.btn.btn-primary.mmi-check-btn', {
              disabled: !canCheck,
              onclick:  () => self.check(vnode),
            }, s.checking ? '⏳ Checking…' : 'Check it'),
          ]),

          // ── Error ────────────────────────────────────────────────────────
          s.error && m('p.error-msg', `⚠️ ${s.error}`),

          // ── Verdict card ─────────────────────────────────────────────────
          res && m(`div.mmi-verdict.${vc.cls}`, [

            m('div.mmi-verdict-header', [
              m('span.mmi-verdict-icon', vc.icon),
              m('div.mmi-verdict-text', [
                m('div.mmi-verdict-item',
                  `${res.details ? fmtMoney(parseFloat(s.cost)) : ''} ${s.item}`),
                m('div.mmi-verdict-title', res.title),
              ]),
            ]),

            m('p.mmi-explanation', res.explanation),

            // ── Detail breakdown ─────────────────────────────────────────
            res.details && m('div.mmi-details', [

              m('div.mmi-detail-row', [
                m('span.mmi-detail-label', 'Current balance'),
                m('span.mmi-detail-value', fmtMoney(res.details.currentBalance)),
              ]),

              res.details.billsDue7.length > 0 && [
                m('div.mmi-detail-row', [
                  m('span.mmi-detail-label', `Bills due in 7 days`),
                  m('span.mmi-detail-value.mmi-debit',
                    `−${fmtMoney(res.details.billsDue7Total)}`),
                ]),
                res.details.billsDue7.map(bill =>
                  m('div.mmi-detail-row.mmi-detail-row--sub', {key: bill.name}, [
                    m('span.mmi-detail-label', `${bill.name} (due ${fmtDate(bill.dueDate)})`),
                    m('span.mmi-detail-value.mmi-debit.muted',
                      `−${fmtMoney(bill.amount)}`),
                  ])
                ),
              ],

              m('div.mmi-detail-row', [
                m('span.mmi-detail-label', 'This purchase'),
                m('span.mmi-detail-value.mmi-debit',
                  `−${fmtMoney(parseFloat(s.cost))}`),
              ]),

              m('div.mmi-detail-row.mmi-detail-row--total', [
                m('span.mmi-detail-label', 'Left after purchase'),
                m('span.mmi-detail-value', fmtMoney(res.details.afterPurchase)),
              ]),

              res.details.nextPaycheckDate && m('div.mmi-detail-row', [
                m('span.mmi-detail-label', 'Next paycheck'),
                m('span.mmi-detail-value',
                  fmtDate(res.details.nextPaycheckDate)
                  + (res.details.estimatedPaycheck != null
                      ? ` (~${fmtMoney(res.details.estimatedPaycheck)})`
                      : '')),
              ]),

              res.suggestedDate && res.verdict !== 'safe' && m('div.mmi-detail-row.mmi-detail-row--suggest', [
                m('span.mmi-detail-label', 'Suggested date to buy'),
                m('span.mmi-detail-value.mmi-suggest-date',
                  fmtDate(res.suggestedDate)),
              ]),

            ]),

          ]),

        ]), // .purchase-body
      ]);
    },
  };

  window.Routes          = window.Routes || {};
  window.Routes.Purchase = PurchaseRoute;
}());
