const { contextBridge, ipcRenderer } = require('electron');

// Expose a typed, minimal API to the renderer.
// Nothing else from Node/Electron leaks through contextIsolation.
contextBridge.exposeInMainWorld('api', {

  // Health check
  ping: () => ipcRenderer.invoke('db:ping'),

  csv: {
    preview: content => ipcRenderer.invoke('csv:preview', content),
    import:  rows    => ipcRenderer.invoke('csv:import',  rows),
  },

  transactions: {
    list:         opts              => ipcRenderer.invoke('transactions:list', opts),
    recategorize: (id, categoryId) => ipcRenderer.invoke('transaction:recategorize', { id, categoryId }),
  },

  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
  },

  dashboard: {
    summary: () => ipcRenderer.invoke('dashboard:summary'),
  },

  bills: {
    list:   ()     => ipcRenderer.invoke('bills:list'),
    detect: ()     => ipcRenderer.invoke('bills:detect'),
    save:   bill   => ipcRenderer.invoke('bills:save', bill),
  },

  settings: {
    get: key          => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', { key, value }),
  },

});
