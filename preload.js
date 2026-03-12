const { contextBridge, ipcRenderer } = require('electron');

// Expose a typed API to the renderer — nothing else from Node/Electron leaks through
contextBridge.exposeInMainWorld('api', {
  // Health check: confirms IPC bridge and SQLite are reachable
  ping: () => ipcRenderer.invoke('db:ping'),
});
