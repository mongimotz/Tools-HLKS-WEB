// SPDX-License-Identifier: AGPL-3.0-or-later
// Editor state: the document (the .schema model), selection, view, undo/redo with Immer patches.
import { create } from 'zustand';
import { applyPatches, enablePatches, produceWithPatches, type Draft, type Patch } from 'immer';
import type { Schema } from '../model/types.ts';
import { emptySchema } from '../model/create.ts';
import { applyOps, type Op } from '../ops/ops.ts';

enablePatches();

export const MAX_UNDO = 200;

interface Step {
  label: string;
  redo: Patch[];
  undo: Patch[];
}

export type Tool = 'select' | 'note';

export interface Proposal {
  base: Schema;
  schema: Schema;
  added: string[];
  removed: string[];
  changed: string[];
}

export interface View {
  /** Sheet mm at the top-left corner of the canvas. */
  x: number;
  y: number;
  /** Screen pixels per mm. */
  zoom: number;
}

export interface EditorState {
  doc: Schema;
  /** Uncommitted preview while dragging (rendered instead of doc). */
  preview: Schema | null;
  selection: string[];
  tool: Tool;
  /** Right panel tab. */
  panel: 'props' | 'notes' | 'assistant';
  /** Assistant result shown as a preview until «Übernehmen» or «Verwerfen». */
  proposal: Proposal | null;
  /** Note shown open in the notes panel (its pin is highlighted). */
  activeNote: string | null;
  view: View | null;
  past: Step[];
  future: Step[];
  /** Changes since the last save/load. */
  dirty: boolean;
  fileName: string;
  message: { text: string; kind: 'info' | 'error' } | null;
  /** Open file handle (File System Access API), null = no live file. */
  handle: FileSystemFileHandle | null;
  /** External change that could not be loaded (e.g. half-written JSON). */
  syncError: string | null;
  /** External change while there are unsaved local edits. */
  conflict: { doc: Schema; text: string } | null;
  autosave: boolean;
  /** Last file that needs a permission click to reopen. */
  reopen: { name: string } | null;

  load(doc: Schema, fileName?: string, opts?: { keepView?: boolean; asStep?: string }): void;
  change(label: string, recipe: (d: Draft<Schema>) => void): void;
  /** Commits a new document computed by a pure action (only changed top-level parts are written). */
  commit(label: string, next: Schema): void;
  ops(label: string, ops: Op[]): ReturnType<typeof applyOps> | null;
  setPreview(doc: Schema | null): void;
  undo(): void;
  redo(): void;
  select(ids: string[]): void;
  setTool(t: Tool): void;
  setPanel(p: EditorState['panel']): void;
  setProposal(p: Proposal | null): void;
  /** Commits the proposal as one undo step; false if the document changed since the request. */
  applyProposal(): boolean;
  /** Opens a note in the panel and selects its anchor element. */
  openNote(id: string | null): void;
  setView(v: View): void;
  markSaved(fileName?: string): void;
  notify(text: string, kind?: 'info' | 'error'): void;
}

function push(past: Step[], step: Step): Step[] {
  const next = [...past, step];
  return next.length > MAX_UNDO ? next.slice(next.length - MAX_UNDO) : next;
}

export const useEditor = create<EditorState>((set, get) => ({
  doc: emptySchema(),
  preview: null,
  selection: [],
  tool: 'select',
  panel: 'props',
  proposal: null,
  activeNote: null,
  view: null,
  past: [],
  future: [],
  dirty: false,
  fileName: 'prinzipschema.schema',
  message: null,
  handle: null,
  syncError: null,
  conflict: null,
  autosave: false,
  reopen: null,

  load(doc, fileName, opts = {}) {
    const st = get();
    if (opts.asStep) {
      // A reload from outside (live sync) is one undo step.
      const [next, redo, undo] = produceWithPatches(st.doc, () => doc);
      set({
        doc: next,
        past: push(st.past, { label: opts.asStep, redo, undo }),
        future: [],
        dirty: false,
        selection: st.selection.filter((id) => exists(next, id)),
        preview: null,
      });
      return;
    }
    set({
      doc,
      preview: null,
      proposal: null,
      selection: [],
      past: [],
      future: [],
      dirty: false,
      fileName: fileName ?? st.fileName,
      view: opts.keepView ? st.view : null,
    });
  },

  change(label, recipe) {
    const st = get();
    const [next, redo, undo] = produceWithPatches(st.doc, recipe);
    if (!redo.length) {
      set({ preview: null });
      return;
    }
    set({ doc: next, preview: null, past: push(st.past, { label, redo, undo }), future: [], dirty: true });
  },

  commit(label, next) {
    const cur = get().doc;
    if (next === cur) return;
    get().change(label, (d) => {
      for (const k of Object.keys(next) as (keyof Schema)[])
        if (next[k] !== cur[k]) (d as Record<string, unknown>)[k] = next[k];
    });
  },

  ops(label, list) {
    const st = get();
    try {
      const r = applyOps(st.doc, list);
      const [next, redo, undo] = produceWithPatches(st.doc, () => r.schema);
      set({ doc: next, preview: null, past: push(st.past, { label, redo, undo }), future: [], dirty: true });
      if (r.suggestion) get().notify(r.suggestion);
      return r;
    } catch (e) {
      get().notify((e as Error).message, 'error');
      set({ preview: null });
      return null;
    }
  },

  setPreview(doc) {
    set({ preview: doc });
  },

  undo() {
    const st = get();
    const step = st.past[st.past.length - 1];
    if (!step) return;
    const doc = applyPatches(st.doc, step.undo);
    set({
      doc,
      past: st.past.slice(0, -1),
      future: [...st.future, step],
      dirty: true,
      preview: null,
      selection: st.selection.filter((id) => exists(doc, id)),
    });
  },

  redo() {
    const st = get();
    const step = st.future[st.future.length - 1];
    if (!step) return;
    const doc = applyPatches(st.doc, step.redo);
    set({
      doc,
      future: st.future.slice(0, -1),
      past: [...st.past, step],
      dirty: true,
      preview: null,
      selection: st.selection.filter((id) => exists(doc, id)),
    });
  },

  select(ids) {
    set({ selection: [...new Set(ids)] });
  },
  setTool(tool) {
    set({ tool });
  },
  setPanel(panel) {
    set({ panel });
  },
  setProposal(proposal) {
    set({ proposal, preview: null });
  },
  applyProposal() {
    const st = get();
    const p = st.proposal;
    if (!p) return false;
    if (st.doc !== p.base) {
      set({ proposal: null });
      st.notify('Das Schema wurde inzwischen geändert. Vorschlag verworfen.', 'error');
      return false;
    }
    set({ proposal: null });
    get().commit('Assistent', p.schema);
    set({ selection: p.added.filter((id) => exists(get().doc, id)) });
    return true;
  },
  openNote(id) {
    const n = id ? get().doc.notes.find((x) => x.id === id) : undefined;
    if (!n) return set({ activeNote: null });
    const a = n.anchor;
    const anchorId = 'component' in a ? a.component : 'connection' in a ? a.connection : null;
    set({ activeNote: id, panel: 'notes', selection: anchorId && exists(get().doc, anchorId) ? [anchorId] : [] });
  },
  setView(view) {
    set({ view });
  },
  markSaved(fileName) {
    set({ dirty: false, ...(fileName ? { fileName } : {}) });
  },
  notify(text, kind = 'info') {
    set({ message: { text, kind } });
  },
}));

export function exists(s: Schema, id: string): boolean {
  return [s.components, s.connections, s.groups, s.texts, s.notes].some((l) => l.some((x) => x.id === id));
}

/** The document as currently shown (drag preview or committed). */
export function shownDoc(st: Pick<EditorState, 'doc' | 'preview' | 'proposal'>): Schema {
  return st.proposal?.schema ?? st.preview ?? st.doc;
}
