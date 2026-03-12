// app.js — Mithril router entry point
// Routes are defined in routes/*.js and loaded before this script.

// ─── Test Route ───────────────────────────────────────────────────────────────
// Confirms Electron IPC bridge + Mithril + SQLite are all wired up correctly.

const TestRoute = {
  oninit(vnode) {
    vnode.state.status = 'checking…';
    vnode.state.ok     = null;

    window.api
      .ping()
      .then(result => {
        vnode.state.ok     = result.ok;
        vnode.state.status = `SQLite ${result.sqliteVersion}`;
        m.redraw();
      })
      .catch(err => {
        vnode.state.ok     = false;
        vnode.state.status = `Error: ${err.message}`;
        m.redraw();
      });
  },

  view(vnode) {
    const { ok, status } = vnode.state;
    const icon        = ok === null ? '⏳' : ok ? '✅' : '❌';
    const statusClass = ok === null ? 'pending' : ok ? 'ok' : 'error';

    return m('div.test-page', [
      m('nav.app-nav', [
        m('span.nav-logo', 'ADHD Finance'),
        m(m.route.Link, { href: '/test',   class: 'nav-link active' }, 'Stack Check'),
        m(m.route.Link, { href: '/import', class: 'nav-link' }, 'Import CSV'),
      ]),
      m('div.test-body', [
        m('h1', 'Stack check'),
        m('div.check-row', [
          m('span.check-label', 'Electron'),
          m('span.check-badge.ok', '✅ running'),
        ]),
        m('div.check-row', [
          m('span.check-label', 'Mithril.js'),
          m('span.check-badge.ok', '✅ rendering'),
        ]),
        m('div.check-row', [
          m('span.check-label', 'SQLite (better-sqlite3)'),
          m(`span.check-badge.${statusClass}`, `${icon} ${status}`),
        ]),
        m('p.hint', 'Step 2 live — click Import CSV to bring in transactions.'),
      ]),
    ]);
  },
};

// ─── Router ───────────────────────────────────────────────────────────────────
m.route(document.getElementById('app'), '/import', {
  '/test':   TestRoute,
  '/import': window.Routes.Import,
});
