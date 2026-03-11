// app.js — Mithril router + components
// All UI lives here for now; will be split into components/ as the app grows

// ─── Test Route ────────────────────────────────────────────────────────────────
// Confirms Electron IPC bridge + Mithril + SQLite are all wired up correctly.
// This screen is replaced by the real dashboard in Step 3.

const TestRoute = {
  oninit(vnode) {
    vnode.state.status = 'checking…';
    vnode.state.ok = null;

    window.api
      .ping()
      .then((result) => {
        vnode.state.ok = result.ok;
        vnode.state.status = `SQLite ${result.sqliteVersion}`;
        m.redraw();
      })
      .catch((err) => {
        vnode.state.ok = false;
        vnode.state.status = `Error: ${err.message}`;
        m.redraw();
      });
  },

  view(vnode) {
    const { ok, status } = vnode.state;
    const icon = ok === null ? '⏳' : ok ? '✅' : '❌';
    const statusClass = ok === null ? 'pending' : ok ? 'ok' : 'error';

    return m('div.test-route', [
      m('div.logo', 'ADHD Finance'),
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
      m('p.hint', 'All green? Tell the human. Then Step 2 begins.'),
    ]);
  },
};

// ─── Router ────────────────────────────────────────────────────────────────────
m.route(document.getElementById('app'), '/test', {
  '/test': TestRoute,
});
