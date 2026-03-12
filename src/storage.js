'use strict';

/**
 * storage.js — thin SQLite-backed store for safeStorage encrypted blobs.
 *
 * The main process calls safeStorage.encryptString() before calling set(),
 * and safeStorage.decryptString() after calling get().  This module only
 * deals with raw Buffer persistence — it has no knowledge of Electron's
 * safeStorage API so it remains testable in plain Node.
 *
 * @param {import('better-sqlite3').Database} db
 */
function createStorage(db) {
  const stmtSet = db.prepare(`
    INSERT INTO credentials (key, encrypted, updated_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(key) DO UPDATE SET
      encrypted  = excluded.encrypted,
      updated_at = excluded.updated_at
  `);

  const stmtGet = db.prepare(
    'SELECT encrypted FROM credentials WHERE key = ?'
  );

  const stmtDelete = db.prepare(
    'DELETE FROM credentials WHERE key = ?'
  );

  const stmtList = db.prepare(
    'SELECT key, updated_at FROM credentials ORDER BY key'
  );

  return {
    /**
     * Persist an encrypted Buffer for the given key.
     * @param {string} key
     * @param {Buffer} encryptedBuffer
     */
    setCredential(key, encryptedBuffer) {
      stmtSet.run(key, encryptedBuffer);
    },

    /**
     * Retrieve the encrypted Buffer for the given key, or null if absent.
     * @param {string} key
     * @returns {Buffer|null}
     */
    getCredential(key) {
      const row = stmtGet.get(key);
      return row ? row.encrypted : null;
    },

    /**
     * Remove the credential for the given key (no-op if absent).
     * @param {string} key
     */
    deleteCredential(key) {
      stmtDelete.run(key);
    },

    /**
     * List all stored credential keys with their last-updated timestamps.
     * @returns {{ key: string, updated_at: number }[]}
     */
    listCredentials() {
      return stmtList.all();
    },
  };
}

module.exports = { createStorage };
