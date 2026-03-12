// app.js — Mithril router entry point
// Route components are defined in routes/*.js and loaded before this script.

// ─── Test Route ───────────────────────────────────────────────────────────────
const TestRoute = {
  oninit(vnode) {
    vnode.state.status = 'checking…';
    vnode.state.ok     = null;

    window.api.ping()
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
        m(m.route.Link, { href: '/dashboard', class: 'nav-link' }, 'Dashboard'),
        m(m.route.Link, { href: '/bills',     class: 'nav-link' }, 'Bills'),
        m(m.route.Link, { href: '/import',    class: 'nav-link' }, 'Import CSV'),
        m(m.route.Link, { href: '/accounts',  class: 'nav-link' }, 'Accounts'),
        m(m.route.Link, { href: '/purchase',  class: 'nav-link' }, 'May I Buy?'),
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
      ]),
    ]);
  },
};

// ─── Router ───────────────────────────────────────────────────────────────────
m.route(document.getElementById('app'), '/dashboard', {
  '/dashboard': window.Routes.Dashboard,
  '/bills':     window.Routes.Bills,
  '/import':    window.Routes.Import,
  '/accounts':  window.Routes.Accounts,
  '/purchase':  window.Routes.Purchase,
  '/test':      TestRoute,
});
