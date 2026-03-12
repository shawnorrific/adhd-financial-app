const { contextBridge, ipcRenderer } = require('electron');

// Expose a typed, minimal API to the renderer.
// Nothing else from Node/Electron leaks through contextIsolation.
contextBridge.exposeInMainWorld('api', {

  // Health check: confirms IPC bridge and SQLite are reachable
  ping: () => ipcRenderer.invoke('db:ping'),

  csv: {
    // Parse a CSV file and return categorised rows — no DB write yet
    preview: content => ipcRenderer.invoke('csv:preview', content),
    // Persist confirmed rows (may include user-corrected categories)
    import:  rows    => ipcRenderer.invoke('csv:import', rows),
  },

  transactions: {
    list:         opts              => ipcRenderer.invoke('transactions:list', opts),
    recategorize: (id, categoryId) => ipcRenderer.invoke('transaction:recategorize', { id, categoryId }),
  },

  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
  },

});
