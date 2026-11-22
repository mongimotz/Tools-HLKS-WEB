// SPDX-License-Identifier: AGPL-3.0-or-later
// Document tabs: several schemas (and own symbols in the symbol editor) open at the same time. The store
// holds the active tab; the others are parked here with their undo history, view, file handle and live-sync
// state, and come back unchanged when their tab is activated.
import { emptySchema } from '../model/create.ts';
import type { Schema } from '../model/types.ts';
import { syncRestore, syncSnapshot, type SyncSnapshot } from '../io/session.ts';
import { useEditor, type EditorState, type SymbolDraft, type TabInfo } from './store.ts';

const SLICE = [
  'doc',
  'selection',
  'past',
  'future',
  'dirty',
  'fileName',
  'handle',
  'view',
  'activeNote',
  'conflict',
  'syncError',
  'symbolDraft',
] as const;
type Slice = Pick<EditorState, (typeof SLICE)[number]>;

const parked = new Map<string, { state: Slice; sync: SyncSnapshot }>();
let seq = 1;

const get = () => useEditor.getState();

function pick(st: EditorState): Slice {
  const out = {} as Record<string, unknown>;
  for (const k of SLICE) out[k] = st[k];
  return out as Slice;
}

export function titleOf(st: Pick<EditorState, 'fileName' | 'symbolDraft'>, kind: TabInfo['kind']): string {
  if (kind === 'symbol') return st.symbolDraft?.name || 'Neues Bauteil';
  return st.fileName.replace(/\.schema$/, '');
}

function freshSlice(doc: Schema, fileName: string): Slice {
  return {
    doc,
    selection: [],
    past: [],
    future: [],
    dirty: false,
    fileName,
    handle: null,
    view: null,
    activeNote: null,
    conflict: null,
    syncError: null,
    symbolDraft: null,
  };
}

function park() {
  const st = get();
  parked.set(st.active, { state: pick(st), sync: syncSnapshot() });
}

function activate(key: string, state: Slice, sync: SyncSnapshot) {
  useEditor.setState({ ...state, active: key, preview: null, proposal: null });
  syncRestore(sync, !!state.handle);
}

export function activeKind(): TabInfo['kind'] {
  const st = get();
  return st.tabs.find((t) => t.key === st.active)?.kind ?? 'schema';
}

export function switchTab(key: string) {
  const st = get();
  if (key === st.active) return;
  const p = parked.get(key);
  if (!p) return;
  park();
  parked.delete(key);
  activate(key, p.state, p.sync);
}

/** Opens a new schema tab and makes it active. */
export function newSchemaTab(doc: Schema = emptySchema(), fileName = 'prinzipschema.schema'): string {
  park();
  const key = `t${++seq}`;
  useEditor.setState((s) => ({
    tabs: [...s.tabs, { key, kind: 'schema', title: fileName.replace(/\.schema$/, ''), dirty: false }],
  }));
  activate(key, freshSlice(doc, fileName), { known: 0, knownText: '' });
  return key;
}

/** True when the active tab is an untouched, empty schema (a file or example may replace it). */
export function activeIsBlank(): boolean {
  const st = get();
  if (activeKind() !== 'schema' || st.dirty || st.handle) return false;
  const d = st.doc;
  return !d.components.length && !d.texts.length && !d.notes.length && !st.past.length;
}

/** Before a file or example is opened: a new tab unless the active one is blank. */
export function tabForOpen() {
  if (!activeIsBlank()) newSchemaTab();
}

/** Opens an own symbol in the symbol editor (an open tab of the same symbol is activated). */
export function openSymbolTab(draft: SymbolDraft): string {
  const st = get();
  if (draft.id) {
    const cur = st.tabs.find(
      (t) =>
        t.kind === 'symbol' &&
        (t.key === st.active ? st.symbolDraft?.id === draft.id : parked.get(t.key)?.state.symbolDraft?.id === draft.id),
    );
    if (cur) {
      switchTab(cur.key);
      return cur.key;
    }
  }
  park();
  const key = `t${++seq}`;
  useEditor.setState((s) => ({
    tabs: [...s.tabs, { key, kind: 'symbol', title: draft.name || 'Neues Bauteil', dirty: !draft.saved }],
  }));
  activate(
    key,
    { ...freshSlice(emptySchema(), 'symbol'), symbolDraft: draft, dirty: !draft.saved },
    { known: 0, knownText: '' },
  );
  return key;
}

export function closeTab(key: string) {
  const st = get();
  const info = st.tabs.find((t) => t.key === key);
  if (!info) return;
  const dirty = key === st.active ? st.dirty : !!parked.get(key)?.state.dirty;
  if (dirty && !confirm(`«${info.title}» hat ungespeicherte Änderungen. Trotzdem schliessen?`)) return;
  if (st.tabs.length === 1) {
    // The last tab: replaced by an empty schema.
    parked.clear();
    const nk = `t${++seq}`;
    useEditor.setState({ tabs: [{ key: nk, kind: 'schema', title: 'prinzipschema', dirty: false }] });
    activate(nk, freshSlice(emptySchema(), 'prinzipschema.schema'), { known: 0, knownText: '' });
    return;
  }
  if (key === st.active) {
    const k = st.tabs.findIndex((t) => t.key === key);
    const next = st.tabs[k + 1] ?? st.tabs[k - 1]!;
    switchTab(next.key);
  }
  parked.delete(key);
  useEditor.setState((s) => ({ tabs: s.tabs.filter((t) => t.key !== key) }));
}

/** Schema tabs for the browser draft, in tab order (active one from the store). */
export function schemaTabs(): { key: string; doc: Schema; fileName: string; active: boolean }[] {
  const st = get();
  const out: { key: string; doc: Schema; fileName: string; active: boolean }[] = [];
  for (const t of st.tabs) {
    if (t.kind !== 'schema') continue;
    if (t.key === st.active) out.push({ key: t.key, doc: st.doc, fileName: st.fileName, active: true });
    else {
      const p = parked.get(t.key);
      if (p) out.push({ key: t.key, doc: p.state.doc, fileName: p.state.fileName, active: false });
    }
  }
  return out;
}

/** Restores tabs from the browser draft (first call at start). */
export function restoreTabs(list: { doc: Schema; fileName: string }[], activeIndex: number) {
  if (!list.length) return;
  get().load(list[0]!.doc, list[0]!.fileName);
  useEditor.setState((s) => ({
    tabs: [{ ...s.tabs[0]!, title: list[0]!.fileName.replace(/\.schema$/, '') }],
  }));
  const keys = [get().active];
  for (const d of list.slice(1)) keys.push(newSchemaTab(d.doc, d.fileName));
  switchTab(keys[Math.min(Math.max(0, activeIndex), keys.length - 1)]!);
}

/** Keeps the tab titles and dirty marks of the active tab current. */
export function initTabs() {
  useEditor.subscribe((s, prev) => {
    if (
      s.fileName === prev.fileName &&
      s.dirty === prev.dirty &&
      s.symbolDraft === prev.symbolDraft &&
      s.tabs === prev.tabs
    )
      return;
    const info = s.tabs.find((t) => t.key === s.active);
    if (!info) return;
    const title = titleOf(s, info.kind);
    if (info.title === title && info.dirty === s.dirty) return;
    useEditor.setState({ tabs: s.tabs.map((t) => (t.key === s.active ? { ...t, title, dirty: s.dirty } : t)) });
  });
}

/** Tab dirty state for tabs that are parked (the store's tabs[] keep the value from when they were left). */
export function tabDirty(key: string): boolean {
  const st = get();
  return key === st.active ? st.dirty : !!parked.get(key)?.state.dirty;
}
