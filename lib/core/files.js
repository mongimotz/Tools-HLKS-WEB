// SPDX-License-Identifier: AGPL-3.0-or-later
// Browser file handling: open PDF/JSON/.schema, in-place save (File System Access API with download fallback),
// and hand-over between tool pages.

import { parseEnvelope, EnvelopeError, FORMAT, ENVELOPE_VERSION } from './envelope.js';
import { findTool, toolUrl, ROOT_URL } from './registry.js';

const isPdf = (b) => b.length > 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46; // %PDF

export const fsaSupported = typeof window !== 'undefined' && 'showSaveFilePicker' in window;

/** Wrap a raw .schema object (format "hlks-schema") into an HLKS-Tools envelope for routing and handoff. */
export function wrapSchemaEnvelope(obj, fileName = '') {
  const meta = obj?.meta ?? {};
  return {
    format: FORMAT,
    envelopeVersion: ENVELOPE_VERSION,
    tool: 'schema',
    version: typeof obj?.version === 'number' ? obj.version : 1,
    calcVersion: '1.0.0',
    savedAt: new Date().toISOString(),
    project: {
      name: String(meta.project || meta.title || ''),
      number: '',
      author: String(meta.author || ''),
      date: String(meta.date || ''),
    },
    inputs: obj,
    snapshot: fileName ? { fileName } : null,
  };
}

/** Read a File (PDF with embedded data.json, plain .json, or .schema) and return the parsed envelope. */
export async function readEnvelopeFromFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text;
  if (isPdf(bytes)) {
    try {
      const { extractDataJson } = await import('./pdf.js'); // pdf-lib loads only when a PDF is opened
      text = await extractDataJson(bytes);
    } catch {
      throw new EnvelopeError('pdf-unreadable', 'PDF nicht lesbar');
    }
    if (!text) {
      throw new EnvelopeError('no-data', 'Keine HLKS-Tools-Daten in dieser PDF');
    }
  } else {
    text = new TextDecoder('utf-8').decode(bytes);
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && parsed.format === 'hlks-schema') {
      return wrapSchemaEnvelope(parsed, file.name);
    }
    return parseEnvelope(parsed);
  } catch (e) {
    if (e instanceof EnvelopeError) throw e;
    throw new EnvelopeError('invalid-json', 'Ungültiges JSON');
  }
}

/**
 * Inspect any opened File: returns either `{ kind: 'envelope', envelope }` (HLKS calc, schema, or dossier)
 * or `{ kind: 'foreign-pdf', file }` for a plain/unreadable PDF suitable for PDF-Editor.
 */
export async function readAnyFile(file) {
  try {
    const envelope = await readEnvelopeFromFile(file);
    return { kind: 'envelope', envelope, file };
  } catch (e) {
    if (e instanceof EnvelopeError && (e.code === 'no-data' || e.code === 'pdf-unreadable')) {
      return { kind: 'foreign-pdf', file };
    }
    throw e;
  }
}

/** Route an envelope or foreign PDF to its target tool page (or start page for a dossier). Returns true if navigated. */
export async function routeToTool(result) {
  if (result.kind === 'foreign-pdf') {
    const editor = findTool('pdf-editor');
    if (editor?.status !== 'ready') return false;
    if (!(await stashFileHandoff(result.file))) throw new EnvelopeError('handoff-blocked', 'Übergabe blockiert (Browser-Speicher gesperrt)');
    location.href = toolUrl('pdf-editor');
    return true;
  }
  const env = result.envelope;
  if (env.tool === 'dossier') {
    if (!stashHandoff(env)) throw new EnvelopeError('handoff-blocked', 'Übergabe blockiert (Browser-Speicher gesperrt)');
    location.href = ROOT_URL.href;
    return true;
  }
  const tool = findTool(env.tool);
  if (!tool || tool.status !== 'ready') throw new EnvelopeError('unknown-tool', 'Unbekanntes Werkzeug');
  if (!stashHandoff(env)) throw new EnvelopeError('handoff-blocked', 'Übergabe blockiert (Browser-Speicher gesperrt)');
  location.href = toolUrl(env.tool);
  return true;
}

/** Hand a freshly built PDF directly over to the PDF-Editor (IndexedDB file handoff). */
export async function openInPdfEditor(bytes, filename) {
  const editor = findTool('pdf-editor');
  if (editor?.status !== 'ready') return false;
  const file = new File([bytes], filename, { type: 'application/pdf' });
  if (!(await stashFileHandoff(file))) return false;
  location.href = toolUrl('pdf-editor');
  return true;
}

/** Open the system file picker. Resolves with a File or null. */
export function pickFile(accept = '.pdf,.json,.schema,application/pdf,application/json') {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

/** Open a file picker with File System Access handle when supported (for in-place overwrite on save). */
export async function pickFileWithHandle(accept = '.pdf,.json,.schema,application/pdf,application/json', types = null) {
  if (typeof window !== 'undefined' && 'showOpenFilePicker' in window && types) {
    try {
      const [handle] = await window.showOpenFilePicker({ types, excludeAcceptAllOption: false, multiple: false });
      if (!handle) return null;
      const file = await handle.getFile();
      return { file, handle };
    } catch (e) {
      if (e?.name === 'AbortError') return null;
      /* fall back to standard input */
    }
  }
  const file = await pickFile(accept);
  return file ? { file, handle: null } : null;
}

/**
 * Save bytes/text either in place via File System Access API (Chrome/Edge) or as a browser download.
 * Returns `{ handle, name, mode: 'file' | 'download' }`, or `null` if the user cancelled the save picker.
 */
export async function saveFile({
  data,
  filename,
  mime = 'application/pdf',
  handle = null,
  forcePicker = false,
  description = 'PDF-Dokument',
  accept = { 'application/pdf': ['.pdf'] },
}) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  if (fsaSupported) {
    let target = forcePicker ? null : handle;
    try {
      if (target) {
        if (target.queryPermission && (await target.queryPermission({ mode: 'readwrite' })) !== 'granted') {
          const granted = target.requestPermission ? (await target.requestPermission({ mode: 'readwrite' })) === 'granted' : false;
          if (!granted) target = null;
        }
      }
      if (!target) {
        target = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description, accept }],
        });
      }
      const writable = await target.createWritable();
      await writable.write(blob);
      await writable.close();
      return { handle: target, name: target.name || filename, mode: 'file' };
    } catch (e) {
      if (e?.name === 'AbortError') return null;
      /* security error or unsupported environment: fall back to download */
    }
  }
  download(blob, filename, mime);
  return { handle: null, name: filename, mode: 'download' };
}

export function download(data, filename, type = 'application/octet-stream') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFileName(parts, ext) {
  const base = parts
    .filter(Boolean)
    .join('_')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 120);
  return `${base || 'HLKS-Tools'}.${ext}`;
}

// ---- hand-over between pages (start page import → tool page) ----------------

const HANDOFF_KEY = 'hlks-tools:handoff';

export function stashHandoff(envelope) {
  try {
    sessionStorage.setItem(HANDOFF_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function takeHandoff() {
  try {
    const s = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY);
    return s ? parseEnvelope(s) : null;
  } catch {
    return null;
  }
}

// ---- hand-over of a whole file (start page → PDF → DXF). Files can be large: IndexedDB, not sessionStorage.

const FILE_DB = 'hlks-tools';
const FILE_STORE = 'handoff';

function fileDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FILE_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(FILE_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function fileTx(mode, fn) {
  return fileDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(FILE_STORE, mode);
        const result = fn(tx.objectStore(FILE_STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(result.result);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

/** Keep a File for the next page (the tool it is opened in). Resolves false when storage is blocked. */
export async function stashFileHandoff(file) {
  try {
    await fileTx('readwrite', (store) => store.put(file, 'file'));
    return true;
  } catch {
    return false;
  }
}

/** Take the File stashed by the previous page, or null. */
export async function takeFileHandoff() {
  try {
    const file = await fileTx('readonly', (store) => store.get('file'));
    if (file) await fileTx('readwrite', (store) => store.delete('file'));
    return file ?? null;
  } catch {
    return null;
  }
}

/**
 * Accept files dropped anywhere on the page. Adds `is-dragging` to <body> while dragging. A drop zone on the
 * page that takes the files itself calls `preventDefault()`; then the page-wide handler leaves them alone.
 */
export function enableFileDrop(onFile) {
  let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    depth++;
    document.body.classList.add('is-dragging');
  });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (!depth) document.body.classList.remove('is-dragging');
  });
  window.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  const reset = () => {
    depth = 0;
    document.body.classList.remove('is-dragging');
  };
  // capture phase: a drop zone that stops the event (e.g. a viewer in a shadow DOM) must not leave the overlay on
  window.addEventListener('drop', (e) => hasFiles(e) && reset(), true);
  window.addEventListener('dragend', reset, true);
  window.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    reset();
    if (e.defaultPrevented) return;
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  });
}
