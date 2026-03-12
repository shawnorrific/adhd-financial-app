// ImportRoute.js — CSV import + transaction categorisation UI
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

  // ── Component ────────────────────────────────────────────────────────────────

  const ImportRoute = {

    oninit(vnode) {
      const s = vnode.state;
      s.stage      = 'idle';   // idle | loading | previewing | importing | done | error
      s.preview    = [];
      s.categories = [];
      s.stats      = null;
      s.error      = null;

      window.api.categories.list().then(cats => {
        s.categories = cats;
        m.redraw();
      });
    },

    // Read the file with FileReader then call csv:preview over IPC
    loadFile(vnode, file) {
      if (!file) return;
      const s = vnode.state;

      if (!file.name.toLowerCase().endsWith('.csv')) {
        s.error = 'Please select a .csv file exported from your bank.';
        m.redraw();
        return;
      }

      s.stage = 'loading';
      s.error = null;
      m.redraw();

      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const rows = await window.api.csv.preview(e.target.result);
          if (!rows.length) throw new Error('No transactions found — check the file format.');
          s.preview = rows;
          s.stage   = 'previewing';
        } catch (err) {
          s.error = err.message || String(err);
          s.stage = 'error';
        }
        m.redraw();
      };
      reader.readAsText(file);
    },

    async doImport(vnode) {
      const s = vnode.state;
      s.stage = 'importing';
      m.redraw();
      try {
        s.stats = await window.api.csv.import(s.preview);
        s.stage = 'done';
      } catch (err) {
        s.error = err.message || String(err);
        s.stage = 'error';
      }
      m.redraw();
    },

    view(vnode) {
      const s    = vnode.state;
      const self = this;

      return m('div.import-page', [

        // ── Top nav ──────────────────────────────────────────────────────────
        m('nav.app-nav', [
          m('span.nav-logo', 'ADHD Finance'),
          m(m.route.Link, { href: '/dashboard', class: 'nav-link' }, 'Dashboard'),
          m(m.route.Link, { href: '/import',    class: 'nav-link active' }, 'Import CSV'),
          m(m.route.Link, { href: '/test',      class: 'nav-link' }, 'Stack Check'),
        ]),

        m('div.import-body', [
          m('h1.page-title', 'Import Transactions'),

          // ── Idle — drop zone ────────────────────────────────────────────────
          s.stage === 'idle' && m('label.drop-zone', {
            ondragover(e)  { e.preventDefault(); e.currentTarget.classList.add('drag-over'); },
            ondragleave(e) { e.currentTarget.classList.remove('drag-over'); },
            ondrop(e) {
              e.preventDefault();
              e.currentTarget.classList.remove('drag-over');
              self.loadFile(vnode, e.dataTransfer.files[0]);
            },
          }, [
            m('div.drop-icon', '📂'),
            m('p.drop-primary', 'Drop your CSV here'),
            m('p.drop-hint', 'or click to choose a file'),
            m('span.btn', 'Choose file'),
            m('input[type=file][accept=.csv]', {
              style: 'display:none',
              onchange: e => self.loadFile(vnode, e.target.files[0]),
            }),
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
                }, `Import ${s.preview.length} transactions`),
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
                  m('tr', { key: i, class: row.amount < 0 ? 'debit' : 'credit' }, [
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
              onclick() { s.stage = 'idle'; s.preview = []; s.stats = null; m.redraw(); },
            }, 'Import another file'),
          ]),

          // ── Error ────────────────────────────────────────────────────────────
          s.stage === 'error' && m('div.import-error', [
            m('p', `⚠\uFE0F ${s.error}`),
            m('button.btn', {
              onclick() { s.stage = 'idle'; s.error = null; m.redraw(); },
            }, 'Try again'),
          ]),

        ]),
      ]);
    },
  };

  window.Routes         = window.Routes || {};
  window.Routes.Import  = ImportRoute;
}());
