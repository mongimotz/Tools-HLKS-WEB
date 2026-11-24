// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Schema, Vec } from '../model/types.ts';
import { emptySchema } from '../model/create.ts';
import { validate } from '../model/validate.ts';
import { renderSchema } from '../render/render.ts';
import { checkDrawing } from '../layout/check.ts';
import { snap } from '../model/geometry.ts';
import { useEditor } from './store.ts';
import { Canvas, fitView, pointer } from './Canvas.tsx';
import { Palette } from './Palette.tsx';
import { Properties } from './Properties.tsx';
import { Toolbar } from './Toolbar.tsx';
import { Help } from './Help.tsx';
import {
  addComponentAt,
  componentIds,
  copySelection,
  deleteSelection,
  duplicateSelection,
  flipSelection,
  insertable,
  lineMiddle,
  moveSelection,
  newGroup,
  nextVariant,
  parseClip,
  pasteClip,
  rotateSelection,
  type Clip,
} from './actions.ts';
import { loadDrafts, saveDrafts, takeHlksHandoff } from '../io/files.ts';
import { SymbolEditor } from './SymbolEditor.tsx';
import { TabBar } from './TabBar.tsx';
import { insertIntoLine } from './insert.ts';
import {
  activeKind,
  closeTab,
  initTabs,
  newSchemaTab,
  openSymbolTab,
  restoreTabs,
  schemaTabs,
  switchTab,
  tabForOpen,
} from './tabs.ts';
import { draftFromDef, emptyDraft, initOwnSymbols } from '../io/symbols.ts';
import { findSymbol, registerSymbols, symbolVariant } from '../symbols/library.ts';
import { initPaper } from '../io/style.ts';
import { nextId } from '../ops/ops.ts';
import {
  initAutosave,
  openDroppedFile,
  openFile,
  reopenLast,
  resolveConflict,
  restoreLastFile,
  save,
  saveAs,
  setAutosave,
} from '../io/session.ts';
import { exportAs, openInPdfEditor } from '../io/export.ts';
import { initStyle } from '../io/style.ts';
import { Icon } from './icons.tsx';
import { loadExample } from '../io/examples.ts';

export function App() {
  const st = useEditor();
  const [help, setHelp] = useState(false);
  const [draggingFile, setDraggingFile] = useState(false);
  const canvasSize = useRef({ w: 1000, h: 700 });

  // Own symbols, then the browser draft (all tabs), then any handoff from HLKS-Tools or the last live file.
  useEffect(() => {
    initOwnSymbols();
    initTabs();
    const d = loadDrafts();
    if (d) restoreTabs(d.tabs, d.active);
    initStyle();
    initPaper();
    initAutosave();
    const handoff = takeHlksHandoff();
    if (handoff) {
      tabForOpen();
      useEditor.getState().load(handoff.doc, handoff.fileName);
      useEditor.getState().notify(`${handoff.fileName} geöffnet`);
    } else {
      void restoreLastFile();
    }
    const syncGlobal = () => {
      try {
        const raw = localStorage.getItem('hlks-tools:project');
        if (!raw) return;
        const ctx = JSON.parse(raw) as { name?: string; author?: string; date?: string };
        const s = useEditor.getState();
        const cur = s.doc.meta;
        const nextProject = typeof ctx.name === 'string' ? ctx.name : cur.project;
        const nextAuthor = typeof ctx.author === 'string' ? ctx.author : cur.author;
        const nextDate = typeof ctx.date === 'string' && ctx.date ? ctx.date : cur.date;
        if (cur.project !== nextProject || cur.author !== nextAuthor || cur.date !== nextDate) {
          useEditor.setState({
            doc: { ...s.doc, meta: { ...cur, project: nextProject, author: nextAuthor, date: nextDate } },
          });
        }
      } catch {
        /* ignore */
      }
    };
    syncGlobal();
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'hlks-tools:project' || e.key === 'hlks-tools:author') syncGlobal();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('pageshow', syncGlobal);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('pageshow', syncGlobal);
    };
  }, []);

  // File drag-and-drop anywhere on the page (.schema or Prinzipschema .pdf).
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files');
    const reset = () => {
      depth = 0;
      setDraggingFile(false);
    };
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setDraggingFile(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) setDraggingFile(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      reset();
      const file = e.dataTransfer?.files?.[0];
      if (file) void openDroppedFile(file);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    window.addEventListener('dragend', reset);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('dragend', reset);
    };
  }, []);
  // Keep the draft of all schema tabs current (debounced).
  useEffect(() => {
    const t = setTimeout(() => {
      const list = schemaTabs();
      saveDrafts(
        list,
        Math.max(
          0,
          list.findIndex((x) => x.active),
        ),
      );
    }, 400);
    return () => clearTimeout(t);
  }, [st.doc, st.fileName, st.tabs]);
  // Messages disappear after a while.
  useEffect(() => {
    if (!st.message) return;
    const t = setTimeout(() => useEditor.setState({ message: null }), st.message.kind === 'error' ? 8000 : 4000);
    return () => clearTimeout(t);
  }, [st.message]);

  const issues = useMemo(() => [...validate(st.doc), ...checkDrawing(renderSchema(st.doc))], [st.doc]);

  const viewCenter = (): Vec => {
    const st = useEditor.getState();
    const v = st.view;
    const { w, h } = canvasSize.current;
    if (!v) return [210, 140];
    return [snap(v.x + w / v.zoom / 2, st.doc.sheet.grid), snap(v.y + h / v.zoom / 2, st.doc.sheet.grid)];
  };

  // Actions read the current state when they run (keyboard handlers outlive renders).
  const actions = {
    newDoc() {
      newSchemaTab(emptySchema(), 'prinzipschema.schema');
    },
    async open() {
      await openFile();
    },
    save() {
      void save();
    },
    saveAs() {
      void saveAs();
    },
    async exportAs(kind: 'pdf' | 'svg' | 'png') {
      const st = useEditor.getState();
      try {
        const name = await exportAs(st.doc, st.fileName, kind, { mono: st.mono });
        st.notify(`${name} gespeichert`);
      } catch (e) {
        st.notify(`Export fehlgeschlagen: ${(e as Error).message}`, 'error');
      }
    },
    async toPdfEditor() {
      const st = useEditor.getState();
      try {
        const ok = await openInPdfEditor(st.doc, st.fileName, { mono: st.mono });
        if (!ok) st.notify('Übergabe blockiert (Browser-Speicher gesperrt)', 'error');
      } catch (e) {
        st.notify(`Export fehlgeschlagen: ${(e as Error).message}`, 'error');
      }
    },
    setAutosave(on: boolean) {
      setAutosave(on);
    },
    tidy() {
      const st = useEditor.getState();
      st.ops('Aufräumen', [{ op: 'relayout_unpinned', all: false }]);
    },
    fit() {
      const st = useEditor.getState();
      const el = document.querySelector('[data-testid="canvas"]') as HTMLElement | null;
      if (el) st.setView(fitView(st.doc, el.clientWidth, el.clientHeight));
    },
    zoom(k: number) {
      const st = useEditor.getState();
      const el = document.querySelector('[data-testid="canvas"]') as HTMLElement | null;
      const v = st.view;
      if (!el || !v) return;
      const cx = v.x + el.clientWidth / v.zoom / 2,
        cy = v.y + el.clientHeight / v.zoom / 2;
      const zoom = Math.min(40, Math.max(0.5, v.zoom * k));
      st.setView({ zoom, x: cx - el.clientWidth / zoom / 2, y: cy - el.clientHeight / zoom / 2 });
    },
    help() {
      setHelp(true);
    },
    async example(id: string) {
      const loaded = await loadExample(id);
      let doc = loaded;
      try {
        const raw = localStorage.getItem('hlks-tools:project');
        if (raw) {
          const ctx = JSON.parse(raw) as { name?: string; author?: string; date?: string };
          doc = {
            ...loaded,
            meta: {
              ...loaded.meta,
              ...(ctx.name ? { project: ctx.name } : {}),
              ...(ctx.author ? { author: ctx.author } : {}),
              ...(ctx.date ? { date: ctx.date } : {}),
            },
          };
        }
      } catch {
        /* keep example metadata */
      }
      tabForOpen();
      useEditor.getState().load(doc, `${id}.schema`);
    },
    newSymbol() {
      openSymbolTab(emptyDraft());
    },
    editSymbol(id: string) {
      const d = findSymbol(id);
      if (d) openSymbolTab(draftFromDef(d, false));
    },
  };

  /** Palette pick: symbol tab → template; selected line → into it; else in the middle of the view. */
  const pick = (type: string, variant: string) => {
    const s = useEditor.getState();
    if (s.proposal) return;
    if (activeKind() === 'symbol') {
      const d = s.symbolDraft!;
      const def = symbolVariant(type, variant);
      if (d.svg && !confirm(`Zeichnung durch «${def.name}» ersetzen?`)) return;
      const t = draftFromDef(def, true);
      useEditor.setState({
        symbolDraft: { ...t, id: d.id, name: d.saved ? d.name : t.name, saved: d.saved },
        dirty: true,
      });
      return;
    }
    const placed: Schema = renderSchema(s.doc).placed;
    const one = s.selection.length === 1 ? placed.connections.find((c) => c.id === s.selection[0]) : undefined;
    if (one && insertable(type, variant)) {
      const route = renderSchema(placed).routes.get(one.id);
      const mid = route && lineMiddle(route);
      if (mid && insertIntoLine(placed, one.id, mid, mid.p, { type, variant })) return;
    }
    const r = addComponentAt(placed, type, viewCenter(), variant);
    s.commit('Symbol einfügen', r.schema);
    s.select([r.id]);
  };

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const s = useEditor.getState();
      const t = e.target as HTMLElement;
      const typing = t.closest('input, textarea, select, [contenteditable]');
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      // Tabs: Alt+1 … 9 switch, Alt+N new schema, Alt+W close (also in the symbol editor).
      if (e.altKey && !mod) {
        const digit = /^Digit([1-9])$/.exec(e.code);
        if (digit) {
          const tab = s.tabs[Number(digit[1]) - 1];
          if (tab) {
            e.preventDefault();
            switchTab(tab.key);
          }
          return;
        }
        if (e.code === 'KeyN') return (e.preventDefault(), actions.newDoc());
        if (e.code === 'KeyW') return (e.preventDefault(), closeTab(s.active));
      }
      // The symbol editor has its own keys.
      if (activeKind() === 'symbol') return;
      if (mod && k === 's') {
        e.preventDefault();
        if (e.shiftKey) actions.saveAs();
        else actions.save();
        return;
      }
      if (mod && k === 'o') {
        e.preventDefault();
        void actions.open();
        return;
      }
      if (typing) return;
      // While an assistant proposal is shown, only the view changes.
      if (s.proposal && !['0', '+', '=', '-', '?'].includes(k)) return;
      const sel = s.selection;
      const g = s.doc.sheet.grid;
      if (mod && k === 'z' && !e.shiftKey) return (e.preventDefault(), s.undo());
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) return (e.preventDefault(), s.redo());
      if (mod && k === 'a')
        return (e.preventDefault(), s.select([...s.doc.components.map((c) => c.id), ...s.doc.texts.map((x) => x.id)]));
      if (mod && k === 'd') {
        e.preventDefault();
        const r = duplicateSelection(s.doc, sel);
        if (r.ids.length) {
          s.commit('Duplizieren', r.schema);
          s.select(r.ids);
        }
        return;
      }
      if (mod && k === 'g' && e.shiftKey) {
        e.preventDefault();
        const groups = new Set(sel.filter((id) => s.doc.groups.some((g) => g.id === id)));
        if (groups.size) {
          s.change('Gruppe auflösen', (d) => void (d.groups = d.groups.filter((g) => !groups.has(g.id))));
          s.select([...s.doc.groups.filter((g) => groups.has(g.id)).flatMap((g) => g.members)]);
        }
        return;
      }
      if (mod && k === 'g') {
        e.preventDefault();
        const r = newGroup(s.doc, sel);
        if (r) {
          s.commit('Gruppieren', r.schema);
          s.select([r.id]);
        }
        return;
      }
      if (mod) return;
      if (k === 'escape') {
        if (s.tool !== 'select') return s.setTool('select');
        return s.select([]);
      }
      if (k === 'n') return s.setTool(s.tool === 'note' ? 'select' : 'note');
      if (k === 'delete' || k === 'backspace') {
        if (!sel.length) return;
        e.preventDefault();
        s.commit('Löschen', deleteSelection(renderSchema(s.doc).placed, sel));
        s.select([]);
        return;
      }
      if (k === 'r' && sel.length) {
        // Shift+R: back (three quarter turns).
        let next = rotateSelection(renderSchema(s.doc).placed, sel);
        if (e.shiftKey) next = rotateSelection(rotateSelection(next, sel), sel);
        return s.commit('Drehen', next);
      }
      if (k === 'v' && sel.length)
        return s.commit('Ausführung', nextVariant(renderSchema(s.doc).placed, sel, e.shiftKey));
      if (k === 'p' && sel.length) {
        const ids = new Set(componentIds(s.doc, sel));
        const pin = s.doc.components.some((c) => ids.has(c.id) && !c.pinned);
        return s.change(pin ? 'Fixieren' : 'Lösen', (d) => {
          for (const c of d.components) if (ids.has(c.id)) c.pinned = pin;
        });
      }
      if (k === 't') {
        // New text at the pointer (or the middle of the view), selected for editing.
        e.preventDefault();
        const at = pointer.at ?? viewCenter();
        const id = nextId(s.doc, 'T');
        s.change(
          'Text',
          (d) => void d.texts.push({ id, pos: [snap(at[0], g), snap(at[1], g)], text: 'Text', size: 3.5 }),
        );
        s.select([id]);
        s.setPanel('props');
        setTimeout(() => (document.querySelector('[data-testid="prop-text"]') as HTMLInputElement | null)?.select(), 0);
        return;
      }
      if (k === 'enter' && sel.length === 1) {
        // Edit the label (or text) of the selection.
        e.preventDefault();
        s.setPanel('props');
        setTimeout(() => {
          const el = document.querySelector(
            '[data-testid="prop-label"], [data-testid="prop-text"]',
          ) as HTMLInputElement | null;
          el?.focus();
          el?.select();
        }, 0);
        return;
      }
      if (k === 'h') {
        // Show or hide component IDs.
        return s.change('Anzeige', (d) => void (d.sheet.show = { ...d.sheet.show, ids: !d.sheet.show.ids }));
      }
      if (k === 'f' && sel.length) return s.commit('Spiegeln', flipSelection(renderSchema(s.doc).placed, sel));
      const arrows: Record<string, [number, number]> = {
        arrowleft: [-1, 0],
        arrowright: [1, 0],
        arrowup: [0, -1],
        arrowdown: [0, 1],
      };
      if (arrows[k] && sel.length) {
        e.preventDefault();
        const f = e.shiftKey ? 4 : 1;
        s.commit(
          'Verschieben',
          moveSelection(renderSchema(s.doc).placed, sel, arrows[k]![0] * g * f, arrows[k]![1] * g * f),
        );
        return;
      }
      if (k === '0') return actions.fit();
      if (k === '+' || k === '=') return actions.zoom(1.25);
      if (k === '-') return actions.zoom(1 / 1.25);
      if (k === '?') return setHelp(true);
    },
    [st.view, st.fileName],
  );
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  // Clipboard: Ctrl+C / Ctrl+X / Ctrl+V with the system clipboard (also between tabs and browser windows).
  useEffect(() => {
    let internal: Clip | null = null;
    let pastes = 0;
    const editing = (e: Event) =>
      !!(e.target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]') ||
      activeKind() === 'symbol' ||
      !!useEditor.getState().proposal;
    const copy = (e: ClipboardEvent, cut: boolean) => {
      if (editing(e)) return;
      const s = useEditor.getState();
      const placed = renderSchema(s.doc).placed;
      const clip = copySelection(placed, s.selection);
      if (!clip) return;
      e.preventDefault();
      internal = clip;
      pastes = 0;
      e.clipboardData?.setData('text/plain', JSON.stringify(clip));
      if (cut) {
        s.commit('Ausschneiden', deleteSelection(placed, s.selection));
        s.select([]);
      }
    };
    const onCopy = (e: ClipboardEvent) => copy(e, false);
    const onCut = (e: ClipboardEvent) => copy(e, true);
    const onPaste = (e: ClipboardEvent) => {
      if (editing(e)) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      const clip = (text && parseClip(text)) || (!text ? internal : null);
      if (!clip) return;
      e.preventDefault();
      registerSymbols(clip.symbols, false);
      const s = useEditor.getState();
      const placed = renderSchema(s.doc).placed;
      pastes++;
      const r = pasteClip(placed, clip, pointer.at, s.doc.sheet.grid * 4 * pastes);
      s.commit('Einfügen', r.schema);
      s.select(r.ids);
    };
    document.addEventListener('copy', onCopy);
    document.addEventListener('cut', onCut);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('cut', onCut);
      document.removeEventListener('paste', onPaste);
    };
  }, []);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  const symbolTab = st.tabs.find((t) => t.key === st.active)?.kind === 'symbol';
  return (
    <div className={`app${symbolTab ? ' symbol-mode' : ''}`}>
      <Toolbar a={actions} symbolTab={symbolTab} />
      <Palette onPick={pick} onNewSymbol={actions.newSymbol} onEditSymbol={actions.editSymbol} />
      <TabBar onNew={actions.newDoc} />
      {symbolTab ? (
        <SymbolEditor key={st.active} />
      ) : (
        <main
          className="stage"
          ref={(el) => {
            if (el) canvasSize.current = { w: el.clientWidth, h: el.clientHeight };
          }}
        >
          <Canvas />
          {st.reopen && (
            <div className="banner" role="status">
              Zuletzt geöffnet: <b>{st.reopen.name}</b>
              <button onClick={() => void reopenLast()} data-testid="reopen">
                Wieder öffnen
              </button>
              <button className="tb" aria-label="Schliessen" onClick={() => useEditor.setState({ reopen: null })}>
                <Icon name="close" />
              </button>
            </div>
          )}
          {st.syncError && (
            <div className="banner error" role="alert" data-testid="sync-error">
              Externe Änderung nicht geladen: {st.syncError} Neuer Versuch in 1 s.
            </div>
          )}
          {st.conflict && <ConflictDialog />}
          {st.message && (
            <div className={`toast ${st.message.kind}`} role="status" data-testid="toast">
              {st.message.text}
            </div>
          )}
        </main>
      )}
      {!symbolTab && <Properties issues={issues} />}
      {symbolTab && st.message && (
        <div className="toast floating" role="status" data-testid="toast">
          {st.message.text}
        </div>
      )}
      {help && <Help onClose={() => setHelp(false)} />}
      {draggingFile && (
        <div className="file-drop-overlay" aria-hidden="true">
          <span>.schema / PDF öffnen</span>
        </div>
      )}
    </div>
  );
}

function ConflictDialog() {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="alertdialog" aria-labelledby="conflict-title" data-testid="conflict">
        <h2 id="conflict-title">Datei wurde extern geändert</h2>
        <p>Die Datei wurde ausserhalb des Editors geändert, und hier gibt es ungespeicherte Änderungen.</p>
        <div className="modal-buttons">
          <button onClick={() => void resolveConflict('external')} data-testid="conflict-external">
            Externe Version laden
          </button>
          <button onClick={() => void resolveConflict('mine')} data-testid="conflict-mine">
            Meine behalten (überschreiben)
          </button>
          <button onClick={() => void resolveConflict('copy')} data-testid="conflict-copy">
            Beide als Kopie
          </button>
        </div>
      </div>
    </div>
  );
}
