// ImportRoute.js — CSV import + transaction history
// Loaded as a plain script (no bundler). Defines window.Routes.Import.
(function () {
  'use strict';

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function fmtDate(iso) {
    if (!iso) return '';
    const [y, mo, d] = iso.split('-');
    return `${mo}/${d}/${y.slice(2)}`;
  }

  function fmtAmount(n) {
    const abs = Math.abs(n).toFixed(2);
    // Use proper minus sign so screen readers and copy-paste work correctly
    return n < 0 ? `\u2212$${abs}` : `+$${abs}`;
  }

  // SQLite datetime is UTC "YYYY-MM-DD HH:MM:SS" — convert to local display
  function fmtDateTime(raw) {
    if (!raw) return '';
    const d = new Date(raw.replace(' ', 'T') + 'Z');
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ── Component ────────────────────────────────────────────────────────────────

  const ImportRoute = {

    oninit(vnode) {
      const s = vnode.state;
      s.stage           = 'idle';   // idle | loading | previewing | importing | done | error
      s.preview         = [];
      s.categories      = [];
      s.accounts        = [];
      s.selectedAccount = null;     // account chosen before import
      s.stats           = null;
      s.error           = null;
      s.pendingFilename = null;     // filename of the file currently being imported

      // Watch folder state
      s.watchInput = '';
      s.watchSaved = false;
      s.watchToast = null; // { type: 'imported'|'unrecognized', filename, imported?, skipped? }

      // Import history
      s.batches = [];

      Promise.all([
        window.api.categories.list(),
        window.api.accounts.list(),
        window.api.watcher.getPath(),
        window.api.imports.list(),
      ]).then(([cats, accounts, watchPath, batches]) => {
        s.categories = cats;
        s.accounts   = accounts;
        s.watchInput = watchPath || '';
        s.batches    = batches;
        m.redraw();
      });

      // Subscribe to background-import events; store cleanup fns for onremove
      s._offImport = window.api.watcher.onImport(async data => {
        s.watchToast = { type: 'imported', ...data };
        s.batches = await window.api.imports.list();
        m.redraw();
        setTimeout(() => { s.watchToast = null; m.redraw(); }, 7000);
      });
      s._offUnrecognized = window.api.watcher.onUnrecognized(data => {
        s.watchToast = { type: 'unrecognized', ...data };
        m.redraw();
        setTimeout(() => { s.watchToast = null; m.redraw(); }, 7000);
      });
    },

    onremove(vnode) {
      const s = vnode.state;
      if (s._offImport)       s._offImport();
      if (s._offUnrecognized) s._offUnrecognized();
    },

    async openFile(vnode) {
      const s      = vnode.state;
      const result = await window.api.dialog.openFile();
      if (!result) return;
      const { filePath, content } = result;

      s.stage           = 'loading';
      s.error           = null;
      s.pendingFilename = filePath.split(/[\\/]/).pop();
      m.redraw();

      try {
        const rows = await window.api.csv.preview(content, filePath);
        if (!rows.length) throw new Error('No transactions found — check the file format.');
        s.preview = rows;
        s.stage   = 'previewing';
      } catch (err) {
        s.error = err.message || String(err);
        s.stage = 'error';
      }
      m.redraw();
    },

    async doImport(vnode) {
      const s = vnode.state;
      s.stage = 'importing';
      m.redraw();
      try {
        const accountId = s.selectedAccount ? s.selectedAccount.id : null;
        s.stats   = await window.api.csv.import(s.preview, accountId, s.pendingFilename);
        s.batches = await window.api.imports.list();
        s.stage   = 'done';
      } catch (err) {
        s.error = err.message || String(err);
        s.stage = 'error';
      }
      m.redraw();
    },

    view(vnode) {
      const s    = vnode.state;
      const self = this;

      // ── Account selector for import ────────────────────────────────────────
      function accountSelector() {
        if (!s.accounts.length) return null;
        return m('div.import-account-row', [
          m('span.import-account-label', 'Import into:'),
          m('div.account-chip-group', [
            m('button.account-chip', {
              class: !s.selectedAccount ? 'active' : '',
              onclick() { s.selectedAccount = null; m.redraw(); },
            }, 'No account'),
            ...s.accounts.map(acct =>
              m('button.account-chip', {
                class: s.selectedAccount?.id === acct.id ? 'active' : '',
                style: s.selectedAccount?.id === acct.id
                  ? `background:${acct.color}20; border-color:${acct.color}; color:${acct.color}`
                  : `border-color:${acct.color}40`,
                onclick() { s.selectedAccount = acct; m.redraw(); },
              }, [
                m('span.pill-dot', { style: `background:${acct.color}` }),
                acct.name,
              ])
            ),
          ]),
        ]);
      }

      return m('div.import-page', [

        // ── Top nav ──────────────────────────────────────────────────────────
        m('nav.app-nav', [
          m('span.nav-logo', 'ADHD Finance'),
          m(m.route.Link, { href: '/dashboard', class: 'nav-link' }, 'Dashboard'),
          m(m.route.Link, { href: '/bills',     class: 'nav-link' }, 'Bills'),
          m(m.route.Link, { href: '/import',    class: 'nav-link active' }, 'Import CSV'),
          m(m.route.Link, { href: '/accounts',  class: 'nav-link' }, 'Accounts'),
          m(m.route.Link, { href: '/transactions', class: 'nav-link' }, 'Transactions'),
          m(m.route.Link, { href: '/purchase',     class: 'nav-link' }, 'May I Buy?'),
        ]),

        m('div.import-body', [
          m('h1.page-title', 'Import Transactions'),

          // ── Watch folder config ───────────────────────────────────────────
          m('div.watch-folder-card', [
            m('div.section-title', 'Watch Folder'),
            m('p.watch-folder-hint',
              'Place Verity Credit Union CSV exports here and they\'ll be imported automatically.'),
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
                async onclick() {
                  await window.api.watcher.setPath(s.watchInput);
                  s.watchSaved = true;
                  m.redraw();
                  setTimeout(() => { s.watchSaved = false; m.redraw(); }, 2000);
                },
              }, s.watchSaved ? 'Saved!' : 'Save'),
            ]),
            s.watchToast && m('div.watch-toast', {
              class: s.watchToast.type === 'imported'
                ? 'watch-toast--imported'
                : 'watch-toast--unrecognized',
            }, [
              s.watchToast.type === 'imported'
                ? `Imported ${s.watchToast.imported} transaction${s.watchToast.imported !== 1 ? 's' : ''}` +
                  (s.watchToast.skipped ? ` (${s.watchToast.skipped} duplicate${s.watchToast.skipped !== 1 ? 's' : ''} skipped)` : '') +
                  ` from \u201c${s.watchToast.filename}\u201d.`
                : `\u201c${s.watchToast.filename}\u201d was found but doesn\u2019t match the Verity Credit Union format.`,
              m('button.watch-toast-dismiss', {
                onclick() { s.watchToast = null; m.redraw(); },
              }, '\u00d7'),
            ]),
          ]),

          // ── Account selector ─────────────────────────────────────────────
          (s.stage === 'idle' || s.stage === 'previewing') && accountSelector(),

          // ── Idle — file picker ───────────────────────────────────────────
          s.stage === 'idle' && m('div.drop-zone', [
            m('div.drop-icon', '📂'),
            m('p.drop-primary', 'Choose a CSV file to import'),
            m('button.btn', { onclick() { self.openFile(vnode); } }, 'Choose file'),
          ]),

          // ── Loading / importing spinner ────────────────────────────────────
          s.stage === 'loading'   && m('p.status-msg', '⏳ Parsing CSV…'),
          s.stage === 'importing' && m('p.status-msg', '⏳ Importing…'),

          // ── Preview table ──────────────────────────────────────────────────
          s.stage === 'previewing' && [
            m('div.preview-header', [
              m('span.tx-count', `${s.preview.length} transactions found`),
              m('div.preview-actions', [
                m('button.btn.btn-ghost', {
                  onclick() { s.stage = 'idle'; s.preview = []; m.redraw(); },
                }, 'Cancel'),
                m('button.btn.btn-primary', {
                  onclick() { self.doImport(vnode); },
                }, `Import ${s.preview.length} transactions`
                  + (s.selectedAccount ? ` → ${s.selectedAccount.name}` : '')
                ),
              ]),
            ]),

            m('div.table-scroll',
              m('table.tx-table', [
                m('thead', m('tr', [
                  m('th', 'Date'),
                  m('th', 'Description'),
                  m('th.right', 'Amount'),
                  m('th', 'Category'),
                ])),
                m('tbody', s.preview.map((row, i) =>
                  m('tr', { class: row.amount < 0 ? 'debit' : 'credit' }, [
                    m('td.mono', fmtDate(row.postDate)),
                    m('td.desc', row.description),
                    m('td.amount.right.mono', fmtAmount(row.amount)),
                    m('td', m('select.cat-select', {
                      value: row.categoryId,
                      onchange(e) {
                        const newId = parseInt(e.target.value, 10);
                        s.preview[i].categoryId      = newId;
                        s.preview[i].isUserCorrected = true;
                        const cat = s.categories.find(c => c.id === newId);
                        if (cat) s.preview[i].categoryName = cat.name;
                        m.redraw();
                      },
                    }, s.categories.map(cat =>
                      m('option', { value: cat.id, selected: cat.id === row.categoryId }, cat.name)
                    ))),
                  ])
                )),
              ])
            ),
          ],

          // ── Done ────────────────────────────────────────────────────────────
          s.stage === 'done' && m('div.import-done', [
            m('div.done-icon', '✅'),
            m('h2', 'Import complete'),
            m('p.done-stat', [m('strong', s.stats.imported), ' transactions imported']),
            s.stats.skipped > 0 && m('p.done-skipped', `${s.stats.skipped} duplicate${s.stats.skipped !== 1 ? 's' : ''} skipped`),
            m('button.btn.btn-primary', {
              onclick() { s.stage = 'idle'; s.preview = []; s.stats = null; s.pendingFilename = null; m.redraw(); },
            }, 'Import another file'),
          ]),

          // ── Error ────────────────────────────────────────────────────────────
          s.stage === 'error' && m('div.import-error', [
            m('p', `⚠\uFE0F ${s.error}`),
            m('button.btn', {
              onclick() { s.stage = 'idle'; s.error = null; s.pendingFilename = null; m.redraw(); },
            }, 'Try again'),
          ]),

          // ── Import history ────────────────────────────────────────────────
          s.batches.length > 0 && m('div.import-history-section', [
            m('div.section-title', 'Import History'),
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
                    title: `Delete all transactions from this import`,
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
      ]);
    },
  };

  window.Routes         = window.Routes || {};
  window.Routes.Import  = ImportRoute;
}());
