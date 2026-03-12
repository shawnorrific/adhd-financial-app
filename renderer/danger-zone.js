// danger-zone.js — hidden testing utility for wiping data selectively.
// Mounted as a separate Mithril root so it persists across route changes.
(function () {
  'use strict';

  const TARGETS = [
    { id: 'transactions', label: 'Transactions',          detail: 'Deletes all transactions and import history.' },
    { id: 'bills',        label: 'Bills',                 detail: 'Deletes all bills.' },
    { id: 'accounts',     label: 'Accounts',              detail: 'Deletes all accounts.' },
    { id: 'all',          label: 'Everything',            detail: 'Wipes transactions, import history, bills, and accounts.' },
  ];

  const DangerZone = {
    oninit(vnode) {
      vnode.state.open  = false;
      vnode.state.wiping = null; // id of target currently being wiped
    },

    async wipe(vnode, target) {
      const s = vnode.state;
      const t = TARGETS.find(x => x.id === target);
      if (!window.confirm(`Delete ${t.label.toLowerCase()}?\n\n${t.detail}\n\nThis cannot be undone.`)) return;
      s.wiping = target;
      m.redraw();
      await window.api.danger.wipe(target);
      s.wiping = null;
      s.open   = false;
      m.redraw();
    },

    view(vnode) {
      const s    = vnode.state;
      const self = this;

      return m('div.dz-root', [

        // ── Trigger button ───────────────────────────────────────────────────
        m('button.dz-trigger', {
          title:   'Danger zone — wipe data',
          onclick() { s.open = !s.open; m.redraw(); },
        }, '🗑'),

        // ── Popup ────────────────────────────────────────────────────────────
        s.open && m('div.dz-popup', [
          m('div.dz-popup-header', [
            m('span.dz-popup-title', '⚠ Danger Zone'),
            m('button.dz-close-btn', {
              onclick() { s.open = false; m.redraw(); },
            }, '✕'),
          ]),
          m('p.dz-popup-hint', 'For testing only. Deletions are immediate and permanent.'),
          m('div.dz-btn-list',
            TARGETS.map(t =>
              m('button.dz-wipe-btn', {
                class:    t.id === 'all' ? 'dz-wipe-btn--all' : '',
                disabled: s.wiping !== null,
                onclick() { self.wipe(vnode, t.id); },
              }, [
                m('span.dz-wipe-label', `Wipe ${t.label}`),
                m('span.dz-wipe-detail', t.detail),
              ])
            )
          ),
        ]),

      ]);
    },
  };

  const container = document.getElementById('danger-zone');
  if (container) m.mount(container, DangerZone);
}());
