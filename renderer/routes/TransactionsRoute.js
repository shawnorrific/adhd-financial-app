// TransactionsRoute.js — full transaction list with inline editing
// Loaded as a plain script. Defines window.Routes.Transactions.
(function () {
  'use strict';

  // ── Helpers ───────────────────────────────────────────────────────────────

  function fmtDate(iso) {
    if (!iso) return '';
    const [y, mo, d] = iso.split('-');
    return `${mo}/${d}/${y.slice(2)}`;
  }

  function fmtAmount(n) {
    const abs = Math.abs(n).toFixed(2);
    return n < 0 ? `\u2212$${abs}` : `+$${abs}`;
  }

  const TYPE_LABELS = {
    checking:    'Checking',
    credit_card: 'Credit Card',
    bnpl:        'BNPL (Affirm)',
  };

  // ── Data loading ──────────────────────────────────────────────────────────

  function loadData(vnode) {
    const s = vnode.state;
    s.loading = true;
    m.redraw();
    Promise.all([
      window.api.transactions.list({ limit: 500, accountId: s.txAccountId }),
      window.api.accounts.list(),
      window.api.categories.list(),
    ]).then(([txList, accounts, categories]) => {
      s.txList     = txList;
      s.accounts   = accounts;
      s.categories = categories;
      s.loading    = false;
      m.redraw();
    }).catch(err => {
      s.error   = err.message || String(err);
      s.loading = false;
      m.redraw();
    });
  }

  function blankDraft() {
    return {
      description:   '',
      amount:        '',
      categoryId:    '',
      accountId:     '',
      trackBill:     false,
      billFrequency: 'monthly',
      billDueDay:    '',
    };
  }

  // ── Component ─────────────────────────────────────────────────────────────

  const TransactionsRoute = {

    oninit(vnode) {
      const s       = vnode.state;
      s.txList      = [];
      s.accounts    = [];
      s.categories  = [];
      s.loading     = true;
      s.error       = null;
      s.txAccountId = null;
      s.editingId   = null;
      s.draft       = blankDraft();
      s.saving      = false;
      loadData(vnode);
    },

    startEdit(vnode, tx) {
      const s      = vnode.state;
      s.editingId  = tx.id;
      s.draft      = {
        description:   tx.description,
        amount:        String(tx.amount),
        categoryId:    tx.category_id    != null ? String(tx.category_id)  : '',
        accountId:     tx.account_id     != null ? String(tx.account_id)   : '',
        trackBill:     false,
        billFrequency: 'monthly',
        billDueDay:    '',
      };
      s.saving = false;
    },

    cancelEdit(vnode) {
      vnode.state.editingId = null;
      vnode.state.draft     = blankDraft();
    },

    async saveEdit(vnode) {
      const s = vnode.state;
      const d = s.draft;
      if (!d.description.trim()) return;

      s.saving = true;
      m.redraw();

      try {
        await window.api.transactions.update({
          id:          s.editingId,
          description: d.description.trim(),
          amount:      parseFloat(d.amount),
          categoryId:  d.categoryId ? parseInt(d.categoryId, 10) : null,
          accountId:   d.accountId  ? parseInt(d.accountId,  10) : null,
        });

        if (d.trackBill) {
          await window.api.bills.save({
            name:      d.description.trim(),
            amount:    Math.abs(parseFloat(d.amount)) || null,
            due_day:   d.billDueDay ? parseInt(d.billDueDay, 10) : null,
            frequency: d.billFrequency || null,
          });
        }

        s.editingId = null;
        s.draft     = blankDraft();
        loadData(vnode);
      } catch (err) {
        s.error  = err.message || String(err);
        s.saving = false;
        m.redraw();
      }
    },

    view(vnode) {
      const s    = vnode.state;
      const self = this;

      const catOptions = [
        m('option', { value: '' }, '— Uncategorized —'),
        ...s.categories.map(c => m('option', { value: c.id }, c.name)),
      ];

      const acctOptions = [
        m('option', { value: '' }, '— No account —'),
        ...s.accounts.map(a => m('option', { value: a.id }, a.name)),
      ];

      // ── Account filter pills ─────────────────────────────────────────────
      function accountPills() {
        if (!s.accounts.length) return null;
        return m('div.account-filter-row', [
          m('button.account-pill', {
            class: s.txAccountId === null ? 'active' : '',
            onclick() { s.txAccountId = null; loadData(vnode); },
          }, 'All accounts'),
          ...s.accounts.map(acct =>
            m('button.account-pill', {
              key: acct.id,
              class: s.txAccountId === acct.id ? 'active' : '',
              style: s.txAccountId === acct.id
                ? `background:${acct.color}20; border-color:${acct.color}; color:${acct.color}`
                : `border-color:${acct.color}40; color:${acct.color}`,
              onclick() { s.txAccountId = acct.id; loadData(vnode); },
            }, [
              m('span.pill-dot', { style: `background:${acct.color}` }),
              acct.name,
              m('span.pill-type', TYPE_LABELS[acct.type] || acct.type),
            ])
          ),
        ]);
      }

      return m('div.tx-page', [

        // ── Nav ─────────────────────────────────────────────────────────────
        m('nav.app-nav', [
          m('span.nav-logo', 'ADHD Finance'),
          m(m.route.Link, { href: '/dashboard',    class: 'nav-link' },        'Dashboard'),
          m(m.route.Link, { href: '/bills',        class: 'nav-link' },        'Bills'),
          m(m.route.Link, { href: '/import',       class: 'nav-link' },        'Import CSV'),
          m(m.route.Link, { href: '/accounts',     class: 'nav-link' },        'Accounts'),
          m(m.route.Link, { href: '/transactions', class: 'nav-link active' }, 'Transactions'),
          m(m.route.Link, { href: '/purchase',     class: 'nav-link' },        'May I Buy?'),
        ]),

        m('div.tx-page-body', [

          m('div.tx-page-header', [
            m('h1.page-title', 'Transactions'),
            s.txList.length > 0 && m('span.tx-count',
              `${s.txList.length} transaction${s.txList.length !== 1 ? 's' : ''}`),
          ]),

          accountPills(),

          s.error   && m('p.error-msg', `⚠️ ${s.error}`),
          s.loading && m('p.status-msg', '⏳ Loading…'),

          !s.loading && s.txList.length === 0 &&
            m('p.section-hint', 'No transactions yet. Import a CSV to get started.'),

          // ── Transaction list ─────────────────────────────────────────────
          !s.loading && s.txList.length > 0 && m('div.txl', [

            // Header row
            m('div.txl-head', [
              m('div.txl-col--date',   'Date'),
              m('div.txl-col--desc',   'Description'),
              m('div.txl-col--amt',    'Amount'),
              m('div.txl-col--cat',    'Category'),
              m('div.txl-col--acct',   'Account'),
              m('div.txl-col--action', ''),
            ]),

            s.txList.map(tx => {
              const isEditing = s.editingId === tx.id;

              return m('div.txl-row-wrap', { key: tx.id }, [

                // ── Read row ───────────────────────────────────────────────
                m('div.txl-row', {
                  class: [
                    tx.amount < 0 ? 'txl-row--debit' : 'txl-row--credit',
                    isEditing ? 'txl-row--editing' : '',
                  ].join(' '),
                }, [
                  m('div.txl-col--date.mono', fmtDate(tx.post_date)),

                  m('div.txl-col--desc', [
                    tx.account_color && m('span.account-dot.dot-xs', {
                      style: `background:${tx.account_color}`,
                    }),
                    m('span.txl-desc-text', tx.description),
                  ]),

                  m('div.txl-col--amt.mono', {
                    class: tx.amount < 0 ? 'txl-debit' : 'txl-credit',
                  }, fmtAmount(tx.amount)),

                  m('div.txl-col--cat',
                    tx.category_name
                      ? m('span.txl-cat-badge', {
                          class: tx.is_impulse ? 'txl-cat-badge--impulse' : '',
                        }, tx.category_name)
                      : m('span.muted', '—')
                  ),

                  m('div.txl-col--acct',
                    tx.account_name
                      ? m('span.account-type-badge.badge-sm', {
                          style: `color:${tx.account_color}; border-color:${tx.account_color}40`,
                        }, [
                          m('span.pill-dot.dot-xs', { style: `background:${tx.account_color}` }),
                          tx.account_name,
                        ])
                      : m('span.muted', '—')
                  ),

                  m('div.txl-col--action',
                    m('button.btn.btn-ghost.icon-btn', {
                      title:   isEditing ? 'Cancel edit' : 'Edit transaction',
                      onclick() {
                        if (isEditing) { self.cancelEdit(vnode); }
                        else           { self.startEdit(vnode, tx); }
                        m.redraw();
                      },
                    }, isEditing ? '✕' : '✎')
                  ),
                ]),

                // ── Inline edit form ───────────────────────────────────────
                isEditing && m('div.txl-edit-form', [

                  m('div.txl-edit-fields', [

                    m('div.txl-edit-field', [
                      m('label.form-label', 'Description'),
                      m('input.form-input', {
                        value:   s.draft.description,
                        oninput: e => { s.draft.description = e.target.value; },
                      }),
                    ]),

                    m('div.txl-edit-field', [
                      m('label.form-label', 'Amount'),
                      m('input.form-input[type=number][step=0.01]', {
                        value:   s.draft.amount,
                        oninput: e => { s.draft.amount = e.target.value; },
                      }),
                    ]),

                    m('div.txl-edit-field', [
                      m('label.form-label', 'Category'),
                      m('select.cat-select', {
                        value:    s.draft.categoryId,
                        onchange: e => { s.draft.categoryId = e.target.value; },
                      }, catOptions),
                    ]),

                    m('div.txl-edit-field', [
                      m('label.form-label', 'Account'),
                      m('select.cat-select', {
                        value:    s.draft.accountId,
                        onchange: e => { s.draft.accountId = e.target.value; },
                      }, acctOptions),
                    ]),

                  ]),

                  // ── Track as bill ────────────────────────────────────────
                  m('div.txl-bill-row', [
                    m('label.txl-bill-check-label', [
                      m('input[type=checkbox]', {
                        checked:  s.draft.trackBill,
                        onchange: e => { s.draft.trackBill = e.target.checked; m.redraw(); },
                      }),
                      m('span', 'Track as recurring bill'),
                    ]),

                    s.draft.trackBill && m('div.txl-bill-fields', [
                      m('div.txl-edit-field', [
                        m('label.form-label', 'Frequency'),
                        m('select.cat-select', {
                          value:    s.draft.billFrequency,
                          onchange: e => { s.draft.billFrequency = e.target.value; },
                        }, [
                          m('option', { value: 'monthly' },     'Monthly'),
                          m('option', { value: 'biweekly' },    'Every 2 weeks'),
                          m('option', { value: 'weekly' },      'Weekly'),
                          m('option', { value: 'semimonthly' }, 'Twice a month'),
                        ]),
                      ]),
                      m('div.txl-edit-field', [
                        m('label.form-label', 'Due day (1–28)'),
                        m('input.form-input[type=number][min=1][max=28]', {
                          placeholder: 'optional',
                          value:       s.draft.billDueDay,
                          oninput:     e => { s.draft.billDueDay = e.target.value; },
                        }),
                      ]),
                    ]),
                  ]),

                  m('div.form-actions', [
                    m('button.btn.btn-ghost', {
                      onclick() { self.cancelEdit(vnode); m.redraw(); },
                    }, 'Cancel'),
                    m('button.btn.btn-primary', {
                      disabled: !s.draft.description.trim() || s.saving,
                      onclick()  { self.saveEdit(vnode); },
                    }, s.saving ? 'Saving…' : 'Save'),
                  ]),

                ]),

              ]); // txl-row-wrap
            }),

          ]), // .txl

        ]), // .tx-page-body
      ]);
    },
  };

  window.Routes              = window.Routes || {};
  window.Routes.Transactions = TransactionsRoute;
}());
