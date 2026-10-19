// SPDX-License-Identifier: AGPL-3.0-or-later
// Autosave of the PDF-Editor: the open PDF with its unsaved changes, kept in IndexedDB on this device only.
// One slot per file (name + size of the file as it was opened), at most 3 slots, none older than 14 days.
// No DOM: the slot rules are tested in Node; the store needs IndexedDB (browser).

export const AUTOSAVE_DB = 'hlks-tools-pdf-editor-autosave';
export const MAX_SLOTS = 3;
export const MAX_AGE_DAYS = 14;
export const DEBOUNCE_MS = 2000;
const DAY = 24 * 3600 * 1000;
const META = 'meta'; // { key, name, size, savedAt, length }
const BYTES = 'bytes'; // key → Uint8Array (apart, so listing the slots does not read the PDFs)

/** The slot of a file: its name and the size it had when it was opened. */
export const slotKey = (name, size) => `${name}\n${size}`;

/**
 * Keys of the slots to remove: older than `days`, and beyond the newest `max` (the slot `keep`, just written,
 * always stays). `slots`: [{ key, savedAt }].
 */
export function expiredSlots(slots, now = Date.now(), { max = MAX_SLOTS, days = MAX_AGE_DAYS, keep = null } = {}) {
  const old = new Set(slots.filter((s) => s.key !== keep && now - s.savedAt > days * DAY).map((s) => s.key));
  const fresh = slots.filter((s) => !old.has(s.key)).sort((a, b) => (a.key === keep ? -1 : b.key === keep ? 1 : b.savedAt - a.savedAt));
  for (const s of fresh.slice(max)) old.add(s.key);
  return [...old];
}

/** IndexedDB store of the slots. Every call fails quietly ([] / null / false) when storage is blocked. */
export function slotStore(idb = globalThis.indexedDB) {
  const open = () =>
    new Promise((resolve, reject) => {
      const req = idb.open(AUTOSAVE_DB, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(META, { keyPath: 'key' });
        req.result.createObjectStore(BYTES);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  /** One transaction over both stores; `fn(meta, bytes)` returns a request whose result is resolved. */
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction([META, BYTES], mode);
      const req = fn(t.objectStore(META), t.objectStore(BYTES));
      t.oncomplete = () => {
        db.close();
        resolve(req?.result);
      };
      t.onerror = t.onabort = () => {
        db.close();
        reject(t.error);
      };
    });
  };
  const list = async () => ((await tx('readonly', (m) => m.getAll())) ?? []).sort((a, b) => b.savedAt - a.savedAt);
  const remove = (key) =>
    tx('readwrite', (m, b) => {
      b.delete(key);
      return m.delete(key);
    });
  return {
    /** Slots without their bytes, newest first. */
    list: () => list().catch(() => []),
    /** { meta, bytes } of a slot, or null. */
    async get(key) {
      try {
        const [meta, bytes] = await Promise.all([tx('readonly', (m) => m.get(key)), tx('readonly', (m, b) => b.get(key))]);
        return meta && bytes ? { meta, bytes } : null;
      } catch {
        return null;
      }
    },
    remove: (key) => remove(key).then(() => true, () => false),
    /** Write a slot { key, name, size, bytes }, then drop old ones and the oldest beyond the limit. */
    async put({ key, name, size, bytes }) {
      try {
        await tx('readwrite', (m, b) => {
          b.put(bytes, key);
          return m.put({ key, name, size, savedAt: Date.now(), length: bytes.byteLength });
        });
        for (const k of expiredSlots(await list(), Date.now(), { keep: key })) await remove(k);
        return true;
      } catch {
        return false;
      }
    },
    /** Remove slots beyond the age and number limits (page start). */
    async prune() {
      for (const k of expiredSlots(await list().catch(() => []), Date.now())) await remove(k).catch(() => {});
    },
  };
}
