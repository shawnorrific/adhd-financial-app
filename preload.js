'use strict';

/**
 * Preload script — runs in the renderer process before any page JS, but with
 * full Node access.  We use contextBridge to expose a narrow, typed API to
 * the renderer so it never has direct IPC or Node access.
 */

const { contextBridge, ipcRenderer } = require('electron');

// ── Credential store (safeStorage-backed) ────────────────────────────────────
contextBridge.exposeInMainWorld('credentialStore', {
  /**
   * Check whether OS-level encryption is available.
   * @returns {Promise<boolean>}
   */
  isAvailable: () =>
    ipcRenderer.invoke('storage:available').then((r) => r.available),

  /**
   * Encrypt and persist a named credential.
   * @param {string} key   - Logical name, e.g. "plaid_secret"
   * @param {string} value - Plain-text secret
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  set: (key, value) => ipcRenderer.invoke('storage:encrypt', { key, value }),

  /**
   * Retrieve and decrypt a named credential.
   * @param {string} key
   * @returns {Promise<{ ok: boolean, value: string|null, error?: string }>}
   */
  get: (key) => ipcRenderer.invoke('storage:decrypt', { key }),

  /**
   * Delete a stored credential.
   * @param {string} key
   * @returns {Promise<{ ok: boolean, error?: string }>}
   */
  delete: (key) => ipcRenderer.invoke('storage:delete', { key }),
});

// ── App info ──────────────────────────────────────────────────────────────────
contextBridge.exposeInMainWorld('appInfo', {
  platform: process.platform,
  version: process.env.npm_package_version || '0.1.0',
});
