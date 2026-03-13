const { contextBridge, ipcRenderer } = require('electron');

// Expose a typed, minimal API to the renderer.
// Nothing else from Node/Electron leaks through contextIsolation.
contextBridge.exposeInMainWorld('api', {

  ping: () => ipcRenderer.invoke('db:ping'),

  csv: {
    preview: (content, filePath)          => ipcRenderer.invoke('csv:preview', { content, filePath }),
    import:  (rows, accountId, filename)  => ipcRenderer.invoke('csv:import',  { rows, accountId, filename }),
  },

  transactions: {
    list:         opts              => ipcRenderer.invoke('transactions:list', opts),
    recategorize: (id, categoryId) => ipcRenderer.invoke('transaction:recategorize', { id, categoryId }),
    update:       (data)           => ipcRenderer.invoke('transactions:update', data),
    delete:       id               => ipcRenderer.invoke('transactions:delete', id),
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

  watcher: {
    getPath: ()       => ipcRenderer.invoke('watcher:get-path'),
    setPath: newPath  => ipcRenderer.invoke('watcher:set-path', newPath),
    // Returns a cleanup function — call it in onremove to avoid listener leaks
    onImport: cb => {
      const fn = (_, d) => cb(d);
      ipcRenderer.on('watcher:imported', fn);
      return () => ipcRenderer.removeListener('watcher:imported', fn);
    },
    onUnrecognized: cb => {
      const fn = (_, d) => cb(d);
      ipcRenderer.on('watcher:unrecognized', fn);
      return () => ipcRenderer.removeListener('watcher:unrecognized', fn);
    },
  },

  dialog: {
    openFolder: () => ipcRenderer.invoke('dialog:open-folder'),
  },

  imports: {
    list:       ()                   => ipcRenderer.invoke('imports:list'),
    setAccount: (batchId, accountId) => ipcRenderer.invoke('imports:set-account', { batchId, accountId }),
    delete:     batchId              => ipcRenderer.invoke('imports:delete', batchId),
  },

  danger: {
    wipe: target => ipcRenderer.invoke('danger:wipe', target),
  },

});
