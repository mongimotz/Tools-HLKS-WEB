// SPDX-License-Identifier: AGPL-3.0-or-later
// Symbol and stamp libraries in the viewer (EmbedPDF stamp plugin). Built-in symbol libraries come as PDFs
// from symbols/ (scripts/build-symbol-library.mjs); the stamp library is drawn in the worker from stamps/ and
// the settings; own symbols are SVGs the worker turns into library pages. The viewer keeps every library
// except its own standard set in IndexedDB (`embedpdf-stamps`), so a library is imported again only when its
// source changed: each one carries `src:<fingerprint>` in its categories.

import { formatDate } from './defaults.js';
import { STAMP_LIBRARY_ID, STAMP_LIBRARY_TITLE } from './stamps.js';

export const SYMBOL_KIND = 'symbols';
export const OWN_LIBRARY_ID = 'hlks-eigene';
export const OWN_LIBRARY_NAME = 'Eigene';
const SYMBOLS = new URL('./symbols/', import.meta.url);
const STAMPS = new URL('./stamps/', import.meta.url);

const tag = (source) => `src:${source}`;
const fetchBytes = async (url) => new Uint8Array(await (await fetch(url)).arrayBuffer());
const fetchJson = async (url) => (await fetch(url)).json();
const VIEWER_STORE = { db: 'embedpdf-stamps', store: 'libraries' };

/** Ids of the libraries the viewer brings back from its IndexedDB store after it starts. */
function storedLibraryIds() {
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(VIEWER_STORE.db);
    } catch {
      resolve([]);
      return;
    }
    req.onupgradeneeded = () => req.transaction.abort(); // no store yet: do not create one here
    req.onerror = () => resolve([]);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VIEWER_STORE.store)) {
        db.close();
        resolve([]);
        return;
      }
      const keys = db.transaction(VIEWER_STORE.store, 'readonly').objectStore(VIEWER_STORE.store).getAllKeys();
      keys.onsuccess = () => (db.close(), resolve(keys.result.map(String)));
      keys.onerror = () => (db.close(), resolve([]));
    };
  });
}

/**
 * Wait until the viewer has restored its stored libraries (it does so on its own after it starts), then
 * remove copies: a library of this tool (`src:` category) under an id it does not use, or an id listed twice.
 */
export async function settleLibraries(stamp, expectedIds, timeout = 8000) {
  const stored = await storedLibraryIds();
  const start = Date.now();
  while (Date.now() - start < timeout && !stored.every((id) => stamp.getLibrary(id))) await new Promise((r) => setTimeout(r, 100));
  const seen = new Set();
  for (const lib of stamp.listLibraries()) {
    const ours = lib.categories?.some((c) => c.startsWith('src:'));
    if ((ours && !expectedIds.includes(lib.id)) || seen.has(lib.id) || isEmptyOwn(stamp, lib)) await stamp.deleteLibrary(lib.id).catch(() => {});
    seen.add(lib.id);
  }
}

/** An own library saved while empty comes back with one blank Letter page (`Stamp1`): it is empty. */
function isEmptyOwn(stamp, lib) {
  if (lib.id !== OWN_LIBRARY_ID) return false;
  if (!lib.assetIds.length) return true;
  const a = lib.assetIds.length === 1 ? stamp.getAsset(lib.assetIds[0]) : null;
  return a?.name === 'Stamp1' && a.label === 'Stamp1' && Math.round(a.size.width) === 612 && Math.round(a.size.height) === 792;
}

/** Import `bytes()` as library `id` unless the stored one has the same source. Resolves the library. */
async function ensure(stamp, { id, source, kind, name }, bytes) {
  const existing = stamp.getLibrary(id);
  if (existing?.categories?.includes(tag(source))) return existing;
  if (existing) await stamp.deleteLibrary(id);
  const { library } = await stamp.importLibrary(await bytes(), { name, libraryKind: kind, categories: [tag(source)] });
  return library;
}

/** The built-in symbol libraries (kind `symbols`, shown in the editor's Symbole panel), in manifest order. */
export async function installSymbols(stamp) {
  const { libraries } = await fetchJson(new URL('libraries.json', SYMBOLS));
  await settleLibraries(stamp, [...libraries.map((l) => l.libraryId), STAMP_LIBRARY_ID, OWN_LIBRARY_ID]);
  const out = [];
  for (const lib of libraries) {
    out.push(await ensure(stamp, { id: lib.libraryId, source: lib.source, kind: SYMBOL_KIND, name: lib.title }, () => fetchBytes(new URL(lib.file, SYMBOLS))));
  }
  return out;
}

/** Fingerprint of everything a stamp library depends on (templates, settings, today's date, colours). */
function stampSource(manifest, settings, values, colors) {
  const s = JSON.stringify([manifest, settings.stamps, values, colors]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h.toString(16);
}

/** The stamp library (kind `stamps`, the viewer's Stempel panel) for the current settings and date. */
export async function installStamps(stamp, worker, settings, colors) {
  const manifest = await fetchJson(new URL('manifest.json', STAMPS));
  const values = { name: settings.name, datum: formatDate(new Date(), settings.dateFormat) };
  const source = stampSource(manifest, settings, values, colors);
  const build = async () => {
    const templates = await Promise.all(manifest.stamps.map(async (t) => ({ ...t, svg: await (await fetch(new URL(t.file, STAMPS))).text() })));
    return worker.call('stampLibrary', { templates, own: settings.stamps, values, colors, source }).promise;
  };
  return ensure(stamp, { id: STAMP_LIBRARY_ID, source, kind: 'stamps', name: STAMP_LIBRARY_TITLE }, build);
}

/** The user's own symbol library, created when missing. */
export async function ownLibrary(stamp) {
  const existing = stamp.getLibrary(OWN_LIBRARY_ID);
  if (existing) return existing;
  const { library } = await stamp.createLibrary(OWN_LIBRARY_NAME, { id: OWN_LIBRARY_ID, kind: SYMBOL_KIND });
  return library;
}

/** Add SVG files as own symbols. Resolves { added: [asset], failed: [file name] }. */
export async function addOwnSymbols(stamp, worker, files) {
  await ownLibrary(stamp);
  const added = [];
  const failed = [];
  for (const file of files) {
    try {
      const pdf = await worker.call('svgPage', { svg: await file.text() }).promise;
      const label = file.name.replace(/\.svg$/i, '').trim() || 'Symbol';
      const { asset } = await stamp.createAsset({ libraryId: OWN_LIBRARY_ID, source: pdf, label });
      added.push(asset);
    } catch {
      failed.push(file.name);
    }
  }
  return { added, failed };
}

/** The own library as one PDF (to share with colleagues). */
export function exportOwn(stamp) {
  return stamp.exportLibrary(OWN_LIBRARY_ID);
}

/** Add the symbols of a shared library PDF to the own library. Resolves the number added. */
export async function importOwn(stamp, bytes) {
  await ownLibrary(stamp);
  const { library } = await stamp.importLibrary(bytes, { name: `${OWN_LIBRARY_NAME} (Import)`, libraryKind: SYMBOL_KIND });
  let n = 0;
  for (const id of library.assetIds) {
    await stamp.moveAsset(id, { libraryId: OWN_LIBRARY_ID });
    n++;
  }
  await stamp.deleteLibrary(library.id);
  return n;
}
