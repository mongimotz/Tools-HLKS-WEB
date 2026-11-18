// SPDX-License-Identifier: AGPL-3.0-or-later
// File System Access API (Chrome, Edge): open and save in place, remember the last file, watch it for changes.
// Other browsers fall back to the file input and downloads (see files.ts).
import { idbGet, idbSet } from './idb.ts';

type Mode = 'read' | 'readwrite';
interface PermHandle extends FileSystemFileHandle {
  queryPermission?(o: { mode: Mode }): Promise<PermissionState>;
  requestPermission?(o: { mode: Mode }): Promise<PermissionState>;
  createWritable(): Promise<FileSystemWritableFileStream>;
}
type W = Window & {
  showOpenFilePicker?(o?: unknown): Promise<PermHandle[]>;
  showSaveFilePicker?(o?: unknown): Promise<PermHandle>;
};

const TYPES = [{ description: 'Prinzipschema', accept: { 'application/json': ['.schema'] } }];
const LAST = 'last-file';

export const fsaSupported = typeof window !== 'undefined' && 'showOpenFilePicker' in window;

export type Handle = PermHandle;

export async function pickOpen(): Promise<Handle | null> {
  try {
    const [h] = await (window as W).showOpenFilePicker!({
      types: TYPES,
      excludeAcceptAllOption: false,
      multiple: false,
    });
    return h ?? null;
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return null;
    throw e;
  }
}

export async function pickSave(suggestedName: string): Promise<Handle | null> {
  try {
    return await (window as W).showSaveFilePicker!({ types: TYPES, suggestedName });
  } catch (e) {
    if ((e as DOMException).name === 'AbortError') return null;
    throw e;
  }
}

/** Asks for read/write permission (needs a user gesture when not granted yet). */
export async function ensurePermission(h: Handle, ask: boolean): Promise<boolean> {
  if (!h.queryPermission) return true;
  if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
  if (!ask || !h.requestPermission) return false;
  return (await h.requestPermission({ mode: 'readwrite' })) === 'granted';
}

export async function writeText(h: Handle, text: string): Promise<number> {
  const w = await h.createWritable();
  await w.write(text);
  await w.close();
  return (await h.getFile()).lastModified;
}

export async function rememberHandle(h: Handle | null) {
  try {
    await idbSet(LAST, h ?? undefined);
  } catch {
    /* IndexedDB unavailable: the file is just not remembered */
  }
}

export async function lastHandle(): Promise<Handle | null> {
  try {
    return (await idbGet<Handle>(LAST)) ?? null;
  } catch {
    return null;
  }
}
