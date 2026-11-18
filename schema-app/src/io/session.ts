// SPDX-License-Identifier: AGPL-3.0-or-later
// The open file: open/save in place, live sync with external changes (e.g. Claude Code writing the file),
// conflict handling and optional autosave. Without the File System Access API: file input + download.
import { useEditor } from '../editor/store.ts';
import { parseText } from '../model/migrate.ts';
import { SchemaError } from '../model/schema.ts';
import { serialize } from '../model/serialize.ts';
import type { Schema } from '../model/types.ts';
import { saveAsDownload, pickFile, readSchemaFile } from './files.ts';
import {
  ensurePermission,
  fsaSupported,
  lastHandle,
  pickOpen,
  pickSave,
  rememberHandle,
  writeText,
  type Handle,
} from './fsa.ts';

export const POLL_MS = 1000;
const AUTOSAVE_MS = 2000;
const AUTOSAVE_KEY = 'hlks-schema:autosave';

let known = 0; // lastModified of the version we know
let knownText = '';
let writing = false;
let timer: ReturnType<typeof setInterval> | null = null;
let hintShown = false;

const st = () => useEditor.getState();

function errText(e: unknown): string {
  return e instanceof SchemaError ? e.message : `Datei nicht lesbar: ${(e as Error).message}`;
}

export async function openHandle(h: Handle, ask = true): Promise<boolean> {
  if (!(await ensurePermission(h, ask))) return false;
  const f = await h.getFile();
  const text = await f.text();
  let doc: Schema;
  try {
    doc = parseText(text);
  } catch (e) {
    st().notify(errText(e), 'error');
    return false;
  }
  st().load(doc, f.name);
  useEditor.setState({ handle: h, syncError: null, conflict: null, reopen: null });
  known = f.lastModified;
  knownText = text;
  await rememberHandle(h);
  startWatching();
  st().notify(`${f.name} geöffnet`);
  return true;
}

export async function openFile() {
  if (st().dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
  if (fsaSupported) {
    const h = await pickOpen();
    if (h) await openHandle(h);
    return;
  }
  const f = await pickFile();
  if (!f) return;
  try {
    st().load(await readSchemaFile(f), f.name);
    useEditor.setState({ handle: null });
    if (!hintShown) {
      hintShown = true;
      st().notify(
        `${f.name} geöffnet. Dieser Browser kann nicht direkt in die Datei speichern: Speichern lädt die Datei herunter, keine Live-Synchronisation (dafür Chrome oder Edge).`,
      );
    } else st().notify(`${f.name} geöffnet`);
  } catch (e) {
    st().notify(errText(e), 'error');
  }
}

export async function save(): Promise<void> {
  const { handle, doc } = st();
  if (!handle) return saveAs();
  const text = serialize(doc);
  writing = true;
  try {
    known = await writeText(handle as Handle, text);
    knownText = text;
    st().markSaved();
  } catch (e) {
    st().notify(`Speichern fehlgeschlagen: ${(e as Error).message}`, 'error');
  } finally {
    writing = false;
  }
}

export async function saveAs(): Promise<void> {
  const { doc, fileName } = st();
  if (!fsaSupported) {
    saveAsDownload(doc, fileName);
    st().markSaved();
    return;
  }
  const h = await pickSave(fileName);
  if (!h) return;
  const text = serialize(doc);
  writing = true;
  try {
    known = await writeText(h, text);
    knownText = text;
    useEditor.setState({ handle: h });
    st().markSaved(h.name);
    await rememberHandle(h);
    startWatching();
  } finally {
    writing = false;
  }
}

/** Forget the file (new document). */
export function closeFile() {
  useEditor.setState({ handle: null, syncError: null, conflict: null });
  stopWatching();
  void rememberHandle(null);
}

export function startWatching() {
  if (timer) return;
  timer = setInterval(() => void poll(), POLL_MS);
}

export function stopWatching() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** One check of the open file for external changes. */
export async function poll(): Promise<void> {
  const { handle } = st();
  if (!handle || writing) return;
  let f: File;
  try {
    f = await (handle as Handle).getFile();
  } catch {
    return; // file moved or permission lost: keep the editor state
  }
  if (f.lastModified === known) return;
  const text = await f.text();
  if (writing) return;
  if (text === knownText) {
    known = f.lastModified;
    return;
  }
  let doc: Schema;
  try {
    doc = parseText(text);
  } catch (e) {
    // Half-written or invalid: do not load, show the error, try again with the next poll.
    useEditor.setState({ syncError: errText(e) });
    return;
  }
  known = f.lastModified;
  knownText = text;
  useEditor.setState({ syncError: null });
  const s = st();
  if (serialize(s.doc) === text) {
    s.markSaved();
    return;
  }
  if (!s.dirty) {
    s.load(doc, undefined, { asStep: 'Datei extern geändert' });
    s.notify('Datei wurde extern geändert und neu geladen');
  } else useEditor.setState({ conflict: { doc, text } });
}

export async function resolveConflict(choice: 'external' | 'mine' | 'copy') {
  const s = st();
  const c = s.conflict;
  if (!c) return;
  useEditor.setState({ conflict: null });
  if (choice === 'external') {
    s.load(c.doc, undefined, { asStep: 'Externe Version geladen' });
    s.notify('Externe Version geladen');
  } else if (choice === 'mine') {
    await save();
    s.notify('Eigene Version gespeichert (externe Änderung überschrieben)');
  } else {
    // Both: my version goes to a copy, the editor continues with the external version of the original file.
    const mine = s.doc;
    const name = s.fileName.replace(/\.schema$/, '') + ' (Kopie).schema';
    if (fsaSupported) {
      const h = await pickSave(name);
      if (h) await writeText(h, serialize(mine));
    } else saveAsDownload(mine, name);
    s.load(c.doc, undefined, { asStep: 'Externe Version geladen' });
    s.notify(`Eigene Version als Kopie gespeichert, externe Version geladen`);
  }
}

/** On start: reopen the last file directly if permission is still granted, else offer a button. */
export async function restoreLastFile() {
  if (!fsaSupported) return;
  const h = await lastHandle();
  if (!h) return;
  if (await ensurePermission(h, false)) await openHandle(h, false);
  else useEditor.setState({ reopen: { name: h.name } });
}

export async function reopenLast() {
  const h = await lastHandle();
  if (h) await openHandle(h, true);
}

// Autosave: 2 s after the last edit, when a file is open and the option is on.
let autoTimer: ReturnType<typeof setTimeout> | null = null;
export function initAutosave() {
  try {
    useEditor.setState({ autosave: localStorage.getItem(AUTOSAVE_KEY) === '1' });
  } catch {
    /* no storage */
  }
  useEditor.subscribe((s, prev) => {
    if (s.doc === prev.doc || !s.dirty || !s.autosave || !s.handle || s.conflict) return;
    if (autoTimer) clearTimeout(autoTimer);
    autoTimer = setTimeout(() => void save(), AUTOSAVE_MS);
  });
}

export function setAutosave(on: boolean) {
  useEditor.setState({ autosave: on });
  try {
    localStorage.setItem(AUTOSAVE_KEY, on ? '1' : '0');
  } catch {
    /* no storage */
  }
}
