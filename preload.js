const { contextBridge, ipcRenderer } = require('electron');

// Expose a typed, minimal API to the renderer.
// Nothing else from Node/Electron leaks through contextIsolation.
contextBridge.exposeInMainWorld('api', {

  ping: () => ipcRenderer.invoke('db:ping'),

  csv: {
    preview: content            => ipcRenderer.invoke('csv:preview', content),
    import:  (rows, accountId)  => ipcRenderer.invoke('csv:import',  { rows, accountId }),
  },

  transactions: {
    list:         opts              => ipcRenderer.invoke('transactions:list', opts),
    recategorize: (id, categoryId) => ipcRenderer.invoke('transaction:recategorize', { id, categoryId }),
  },

  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
  },

  accounts: {
    list:   ()        => ipcRenderer.invoke('accounts:list'),
    save:   account   => ipcRenderer.invoke('accounts:save',   account),
    delete: id        => ipcRenderer.invoke('accounts:delete', id),
  },

  dashboard: {
    summary: (opts) => ipcRenderer.invoke('dashboard:summary', opts),
  },

  purchase: {
    check: (itemName, cost) => ipcRenderer.invoke('purchase:check', { itemName, cost }),
  },

  bills: {
    list:   (opts) => ipcRenderer.invoke('bills:list',   opts),
    detect: ()     => ipcRenderer.invoke('bills:detect'),
    save:   bill   => ipcRenderer.invoke('bills:save',   bill),
    delete: id     => ipcRenderer.invoke('bills:delete', id),
  },

  settings: {
    get: key          => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
  },

  gcal: {
    status:     ()                     => ipcRenderer.invoke('gcal:status'),
    authorize:  ({ clientId, clientSecret }) => ipcRenderer.invoke('gcal:authorize', { clientId, clientSecret }),
    disconnect: ()                     => ipcRenderer.invoke('gcal:disconnect'),
    syncBill:   billId                 => ipcRenderer.invoke('gcal:sync-bill',   billId),
    unsyncBill: billId                 => ipcRenderer.invoke('gcal:unsync-bill', billId),
    syncAll:    ()                     => ipcRenderer.invoke('gcal:sync-all'),
  },

  shell: {
    openExternal: url => ipcRenderer.invoke('shell:open-external', url),
  },

});
