// AccountsRoute.js — manage financial accounts (checking, credit card, BNPL)
// Loaded as a plain script. Defines window.Routes.Accounts.
(function () {
  'use strict';

  const TYPE_LABELS = {
    checking:    'Checking',
    credit_card: 'Credit Card',
    bnpl:        'BNPL (Affirm)',
  };

  const TYPE_COLORS = {
    checking:    '#4A9EFF',
    credit_card: '#A78BFA',
    bnpl:        '#FB923C',
  };

  function defaultForm() {
    return { name: '', type: 'checking', color: TYPE_COLORS.checking, institution: '' };
  }

  function loadData(vnode) {
    const s = vnode.state;
    window.api.accounts.list().then(accounts => {
      s.accounts = accounts;
      s.loading  = false;
      m.redraw();
    }).catch(err => {
      s.error   = err.message || String(err);
      s.loading = false;
      m.redraw();
    });
  }

  // ── Component ─────────────────────────────────────────────────────────────

  const AccountsRoute = {

    oninit(vnode) {
      const s      = vnode.state;
      s.loading    = true;
      s.accounts   = [];
      s.error      = null;
      s.deleteError = null;
      s.showAdd    = false;
      s.addForm    = defaultForm();
      s.addSaving  = false;
      s.editId     = null;
      s.editForm   = defaultForm();
      s.editSaving = false;
      loadData(vnode);
    },

    async addAccount(vnode) {
      const s = vnode.state;
      const f = s.addForm;
      if (!f.name.trim()) return;
      s.addSaving = true;
      m.redraw();
      await window.api.accounts.save({
        name:        f.name.trim(),
        type:        f.type,
        color:       f.color,
        institution: f.institution.trim() || null,
      });
      s.addSaving = false;
      s.showAdd   = false;
      s.addForm   = defaultForm();
      loadData(vnode);
    },

    startEdit(vnode, account) {
      const s    = vnode.state;
      s.editId   = account.id;
      s.editForm = {
        name:        account.name,
        type:        account.type,
        color:       account.color,
        institution: account.institution || '',
      };
    },

    async saveAccount(vnode) {
      const s = vnode.state;
      const f = s.editForm;
      if (!f.name.trim()) return;
      s.editSaving = true;
      m.redraw();
      await window.api.accounts.save({
        id:          s.editId,
        name:        f.name.trim(),
        type:        f.type,
        color:       f.color,
        institution: f.institution.trim() || null,
      });
      s.editSaving = false;
      s.editId     = null;
      loadData(vnode);
    },

    async deleteAccount(vnode, id) {
      const s = vnode.state;
      s.deleteError = null;
      const result = await window.api.accounts.delete(id);
      if (!result.ok) {
        s.deleteError = result.error;
        m.redraw();
        return;
      }
      loadData(vnode);
    },

    view(vnode) {
      const s    = vnode.state;
      const self = this;

      const typeOptions = [
        m('option', { value: 'checking'    }, 'Checking'),
        m('option', { value: 'credit_card' }, 'Credit Card'),
        m('option', { value: 'bnpl'        }, 'BNPL (Affirm)'),
      ];

      function formFields(form, key) {
        return [
          m('input.form-input', {
            placeholder: 'Account name *',
            value: form.name,
            oninput: e => { form.name = e.target.value; },
          }),
          m('select.cat-select', {
            value: form.type,
            onchange: e => {
              form.type  = e.target.value;
              form.color = TYPE_COLORS[e.target.value] || form.color;
            },
          }, typeOptions),
          m('input.form-input', {
            placeholder: 'Institution (optional)',
            value: form.institution,
            oninput: e => { form.institution = e.target.value; },
          }),
          m('div.color-field', [
            m('label.form-label', 'Color'),
            m('input[type=color].color-picker', {
              value: form.color,
              oninput: e => { form.color = e.target.value; },
            }),
          ]),
        ];
      }

      return m('div.accounts-page', [

        m('nav.app-nav', [
          m('span.nav-logo', 'ADHD Finance'),
          m(m.route.Link, { href: '/dashboard', class: 'nav-link' }, 'Dashboard'),
          m(m.route.Link, { href: '/bills',     class: 'nav-link' }, 'Bills'),
          m(m.route.Link, { href: '/import',    class: 'nav-link' }, 'Import CSV'),
          m(m.route.Link, { href: '/accounts',  class: 'nav-link active' }, 'Accounts'),
          m(m.route.Link, { href: '/transactions', class: 'nav-link' }, 'Transactions'),
          m(m.route.Link, { href: '/purchase',     class: 'nav-link' }, 'May I Buy?'),
        ]),

        m('div.accounts-body', [

          s.loading && m('p.status-msg', '⏳ Loading…'),
          s.error   && m('p.error-msg', `⚠️ ${s.error}`),

          !s.loading && [

            m('div.bills-header', [
              m('h1.page-title', 'Accounts'),
              m('button.btn.btn-primary', {
                onclick() { s.showAdd = !s.showAdd; if (!s.showAdd) s.addForm = defaultForm(); },
              }, s.showAdd ? '✕ Cancel' : '+ Add account'),
            ]),

            s.deleteError && m('p.error-msg', `⚠️ ${s.deleteError}`),

            // ── Add form ───────────────────────────────────────────────────
            s.showAdd && m('div.bill-form-card', [
              m('div.account-form-grid', formFields(s.addForm, 'add')),
              m('div.form-actions', [
                m('button.btn.btn-ghost', {
                  onclick() { s.showAdd = false; s.addForm = defaultForm(); },
                }, 'Cancel'),
                m('button.btn.btn-primary', {
                  disabled: !s.addForm.name.trim() || s.addSaving,
                  onclick()  { self.addAccount(vnode); },
                }, s.addSaving ? 'Saving…' : 'Add Account'),
              ]),
            ]),

            // ── Account list ───────────────────────────────────────────────
            s.accounts.length === 0 && !s.showAdd
              ? m('div.bills-empty', [
                  m('p', 'No accounts yet.'),
                  m('p.muted', 'Add a checking account, credit card, or BNPL plan to get started.'),
                ])
              : m('div.bills-list-wrap', s.accounts.map(account => {
                  const isEditing = s.editId === account.id;

                  return m('div.bill-card', isEditing

                    // ── Edit mode ─────────────────────────────────────────
                    ? [
                        m('div.account-form-grid', formFields(s.editForm, 'edit')),
                        m('div.form-actions', [
                          m('button.btn.btn-ghost', {
                            onclick() { s.editId = null; },
                          }, 'Cancel'),
                          m('button.btn.btn-primary', {
                            disabled: !s.editForm.name.trim() || s.editSaving,
                            onclick()  { self.saveAccount(vnode); },
                          }, s.editSaving ? 'Saving…' : 'Save'),
                        ]),
                      ]

                    // ── View mode ─────────────────────────────────────────
                    : [
                        m('div.bill-card-main', [
                          m('div.account-card-name', [
                            m('span.account-dot', { style: `background:${account.color}` }),
                            m('span', account.name),
                          ]),
                          m('div.bill-card-meta', [
                            m('span.account-type-badge', {
                              style: `border-color:${account.color}; color:${account.color}`,
                            }, TYPE_LABELS[account.type] || account.type),
                            account.institution
                              ? m('span.bill-cat', ` · ${account.institution}`)
                              : null,
                          ]),
                        ]),
                        m('div.bill-card-actions', [
                          m('button.btn.btn-ghost.icon-btn', {
                            title: 'Edit account',
                            onclick() { self.startEdit(vnode, account); },
                          }, '✎'),
                          m('button.btn.btn-ghost.icon-btn.delete-btn', {
                            title: 'Delete account',
                            onclick() { self.deleteAccount(vnode, account.id); },
                          }, '×'),
                        ]),
                      ]
                  );
                })),

            // ── Legend ────────────────────────────────────────────────────
            m('div.accounts-legend', [
              m('p.section-hint', 'Account colors appear throughout the app to help you identify transactions at a glance.'),
              m('div.legend-row', [
                Object.entries(TYPE_LABELS).map(([type, label]) =>
                  m('span.legend-item', [
                    m('span.account-dot', { style: `background:${TYPE_COLORS[type]}` }),
                    label,
                  ])
                ),
              ]),
            ]),

          ], // end !loading
        ]),
      ]);
    },
  };

  window.Routes          = window.Routes || {};
  window.Routes.Accounts = AccountsRoute;
}());
