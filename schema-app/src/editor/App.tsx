// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Schema, Vec } from '../model/types.ts';
import { emptySchema } from '../model/create.ts';
import { validate } from '../model/validate.ts';
import { renderSchema } from '../render/render.ts';
import { checkDrawing } from '../layout/check.ts';
import { snap } from '../model/geometry.ts';
import { useEditor } from './store.ts';
import { Canvas, fitView } from './Canvas.tsx';
import { Palette } from './Palette.tsx';
import { Properties } from './Properties.tsx';
import { Toolbar } from './Toolbar.tsx';
import { Help } from './Help.tsx';
import {
  addComponentAt,
  deleteSelection,
  duplicateSelection,
  flipSelection,
  moveSelection,
  newGroup,
  rotateSelection,
} from './actions.ts';
import { download, loadDraft, pickFile, readSchemaFile, saveAsDownload, saveDraft } from '../io/files.ts';
import { SchemaError } from '../model/schema.ts';
import { loadExample } from '../io/examples.ts';

export function App() {
  const st = useEditor();
  const [help, setHelp] = useState(false);
  const canvasSize = useRef({ w: 1000, h: 700 });

  // Restore the browser draft once.
  useEffect(() => {
    const d = loadDraft();
    if (d) useEditor.getState().load(d.doc, d.fileName);
  }, []);
  // Keep the draft current (debounced).
  useEffect(() => {
    const t = setTimeout(() => saveDraft(st.doc, st.fileName), 400);
    return () => clearTimeout(t);
  }, [st.doc, st.fileName]);
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
      const st = useEditor.getState();
      if (st.dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
      st.load(emptySchema(), 'prinzipschema.schema');
    },
    async open() {
      const st = useEditor.getState();
      const f = await pickFile();
      if (!f) return;
      try {
        st.load(await readSchemaFile(f), f.name);
        st.notify(`${f.name} geöffnet`);
      } catch (e) {
        st.notify(e instanceof SchemaError ? e.message : `Datei nicht lesbar: ${(e as Error).message}`, 'error');
      }
    },
    save() {
      const st = useEditor.getState();
      saveAsDownload(st.doc, st.fileName);
      st.markSaved();
    },
    exportSvg() {
      const st = useEditor.getState();
      download(st.fileName.replace(/\.schema$/, '') + '.svg', renderSchema(st.doc).svg, 'image/svg+xml');
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
      const st = useEditor.getState();
      if (st.dirty && !confirm('Ungespeicherte Änderungen verwerfen?')) return;
      st.load(await loadExample(id), `${id}.schema`);
    },
  };

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const s = useEditor.getState();
      const t = e.target as HTMLElement;
      const typing = t.closest('input, textarea, select, [contenteditable]');
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 's') {
        e.preventDefault();
        actions.save();
        return;
      }
      if (mod && k === 'o') {
        e.preventDefault();
        void actions.open();
        return;
      }
      if (typing) return;
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
      if (k === 'escape') return s.select([]);
      if (k === 'delete' || k === 'backspace') {
        if (!sel.length) return;
        e.preventDefault();
        s.commit('Löschen', deleteSelection(s.doc, sel));
        s.select([]);
        return;
      }
      if (k === 'r' && sel.length) return s.commit('Drehen', rotateSelection(renderSchema(s.doc).placed, sel));
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

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (useEditor.getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  return (
    <div className="app">
      <Toolbar a={actions} />
      <Palette
        onPick={(type) => {
          const placed: Schema = renderSchema(st.doc).placed;
          const r = addComponentAt(placed, type, viewCenter());
          st.commit('Symbol einfügen', r.schema);
          st.select([r.id]);
        }}
      />
      <main
        className="stage"
        ref={(el) => {
          if (el) canvasSize.current = { w: el.clientWidth, h: el.clientHeight };
        }}
      >
        <Canvas />
        {st.message && (
          <div className={`toast ${st.message.kind}`} role="status" data-testid="toast">
            {st.message.text}
          </div>
        )}
      </main>
      <Properties issues={issues} />
      {help && <Help onClose={() => setHelp(false)} />}
    </div>
  );
}
