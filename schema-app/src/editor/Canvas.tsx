// SPDX-License-Identifier: AGPL-3.0-or-later
// The sheet: the renderer's SVG plus an interaction layer (hit areas, ports, handles).
// Pointer: click selects, Shift adds; drag moves (grid snap); drag from a port connects; drag a line segment
// sets waypoints; drag on empty paper selects by rectangle; wheel zooms; middle button or Space + drag pans.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NoteAnchor, Schema, Vec } from '../model/types.ts';
import { componentBox, portPlace, snap, type Box } from '../model/geometry.ts';
import { paperSize } from '../model/sheet.ts';
import { PIN_HEAD, renderSchema, type Highlight } from '../render/render.ts';
import { symbolFor } from '../symbols/library.ts';
import { validate } from '../model/validate.ts';
import { checkDrawing } from '../layout/check.ts';
import { routeAll } from '../layout/route.ts';
import { shownDoc, useEditor, type View } from './store.ts';
import {
  addComponentAt,
  defaultMedium,
  dragSegment,
  inRect,
  isSignal,
  moveSelection,
  componentIds,
  insertable,
  joinGroups,
  placeSensorOn,
  portAt,
  portBusy,
  segmentAt,
} from './actions.ts';
import { DND_TYPE, paletteDrag, parseDnd } from './Palette.tsx';
import { insertIntoLine } from './insert.ts';

/** Last pointer position over the sheet (sheet mm), for paste and new texts. */
export const pointer: { at: Vec | null } = { at: null };

type Drag =
  | { kind: 'move'; start: Vec; ids: string[]; base: Schema; moved: boolean; into?: Target | null }
  | { kind: 'connect'; from: [string, string]; at: Vec; cur: Vec }
  | { kind: 'segment'; id: string; seg: number; start: Vec; base: Schema; horiz: boolean; moved: boolean }
  | { kind: 'rubber'; start: Vec; cur: Vec; add: boolean }
  | { kind: 'pan'; sx: number; sy: number; view: View };

/** Line segment a symbol would be set into. */
type Target = { id: string; a: Vec; b: Vec };

export function fitView(doc: Schema, w: number, h: number): View {
  const [W, H] = paperSize(doc.sheet);
  const zoom = Math.min(w / (W + 20), h / (H + 20));
  return { zoom, x: W / 2 - w / zoom / 2, y: H / 2 - h / zoom / 2 };
}

export function Canvas() {
  const st = useEditor();
  const doc = shownDoc(st);
  const wrap = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const space = useRef(false);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  // Note being written (note tool): anchor and pin position in sheet mm.
  const [noteDraft, setNoteDraft] = useState<{ anchor: NoteAnchor; at: Vec } | null>(null);
  // Line under a symbol dragged from the palette.
  const [dropTarget, setDropTarget] = useState<Target | null>(null);

  const highlight = useMemo(() => {
    const h: Record<string, Highlight> = {};
    const p = st.proposal;
    if (p) {
      for (const id of p.changed) h[id] = 'change';
      for (const id of p.added) h[id] = 'add';
      return h;
    }
    for (const id of st.selection) h[id] = 'select';
    return h;
  }, [st.selection, st.proposal]);
  // Removed elements of a proposal: drawn as red boxes at their old place.
  const removedBoxes = useMemo(() => {
    const p = st.proposal;
    if (!p?.removed.length) return [];
    const old = renderSchema(p.base).placed;
    return old.components
      .filter((c) => c.pos && p.removed.includes(c.id))
      .map((c) => ({ id: c.id, box: componentBox(c) }));
  }, [st.proposal]);
  // styleRev: re-render when a style template is loaded.
  const r = useMemo(
    () => renderSchema(doc, { grid: true, notes: true, highlight, dark: st.paperDark }),
    [doc, highlight, st.styleRev, st.paperDark],
  );
  const inner = useMemo(() => r.svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''), [r.svg]);
  const issues = useMemo(() => (st.preview ? [] : [...validate(st.doc), ...checkDrawing(r)]), [st.doc, st.preview, r]);
  const placed = r.placed;
  const signalIds = useMemo(
    () => new Set(placed.connections.filter((c) => isSignal(c.medium)).map((c) => c.id)),
    [placed],
  );

  // Size and initial fit.
  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  const view = st.view ?? fitView(doc, size?.w ?? 800, size?.h ?? 600);
  useEffect(() => {
    if (!st.view && size && size.w > 50) st.setView(fitView(doc, size.w, size.h));
  }, [st.view, size, doc, st]);

  const toSheet = useCallback(
    (cx: number, cy: number): Vec => {
      const rect = wrap.current!.getBoundingClientRect();
      return [(cx - rect.left) / view.zoom + view.x, (cy - rect.top) / view.zoom + view.y];
    },
    [view],
  );

  // Wheel zoom around the cursor (non-passive listener so the page does not scroll).
  useEffect(() => {
    const el = wrap.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const v = useEditor.getState().view ?? view;
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left,
        py = e.clientY - rect.top;
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      const zoom = Math.min(40, Math.max(0.5, v.zoom * k));
      const mx = px / v.zoom + v.x,
        my = py / v.zoom + v.y;
      useEditor.getState().setView({ zoom, x: mx - px / zoom, y: my - py / zoom });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [view]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target as HTMLElement).closest('input, textarea, select')) space.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const g = doc.sheet.grid;
  // Snap distance to a line: 2.5 mm, at least 10 screen pixels.
  const lineTol = Math.max(2.5, 10 / view.zoom);

  // Lines as routed without a moved component (it must not bend the line it is dropped on).
  const routesWithout = useRef<{ base: Schema; id: string; routes: Map<string, Vec[]> } | null>(null);
  const routesFor = (exclude?: string, base?: Schema): Map<string, Vec[]> => {
    if (!exclude || !base) return r.routes;
    const c = routesWithout.current;
    if (c && c.base === base && c.id === exclude) return c.routes;
    const without = { ...base, components: base.components.filter((x) => x.id !== exclude) };
    const routes = routeAll(without).routes;
    routesWithout.current = { base, id: exclude, routes };
    return routes;
  };

  /** Line a symbol of `type` would go into at p (null: none, or the symbol has no in/out). */
  const targetAt = (p: Vec, type: string, variant: string, exclude?: string, base?: Schema): Target | null => {
    if (!insertable(type, variant)) return null;
    const seg = segmentAt(routesFor(exclude, base), p, lineTol, signalIds);
    return seg && { id: seg.id, a: seg.a, b: seg.b };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toSheet(e.clientX, e.clientY);
    if (e.button === 1 || space.current || st.proposal) {
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, view });
      return;
    }
    const target = e.target as Element;
    const pin = target.closest('[data-note]');
    if (pin) {
      st.openNote(pin.getAttribute('data-note'));
      return;
    }
    if (st.tool === 'note') {
      setNoteDraft(noteAnchorAt(target, p));
      return;
    }
    const port = target.closest('[data-port]');
    if (port) {
      const [cid, pid] = port.getAttribute('data-port')!.split('|') as [string, string];
      const c = placed.components.find((x) => x.id === cid)!;
      const at = portPlace(c, pid)!.at;
      setDrag({ kind: 'connect', from: [cid, pid], at, cur: p });
      return;
    }
    const hit = target.closest('[data-hit]');
    if (hit) {
      const id = hit.getAttribute('data-hit')!;
      const kind = hit.getAttribute('data-kind');
      let sel = st.selection;
      if (e.shiftKey) sel = sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id];
      else if (!sel.includes(id)) sel = [id];
      st.select(sel);
      if (kind === 'con') {
        const seg = segmentAt(r.routes, p, 3 / view.zoom + 1, signalIds) ?? null;
        if (seg && seg.id === id)
          setDrag({
            kind: 'segment',
            id,
            seg: seg.seg,
            start: p,
            base: placed,
            horiz: Math.abs(seg.a[1] - seg.b[1]) < 1e-6,
            moved: false,
          });
        return;
      }
      if (e.shiftKey && !sel.includes(id)) return;
      setDrag({ kind: 'move', start: p, ids: sel, base: placed, moved: false });
      return;
    }
    setDrag({ kind: 'rubber', start: p, cur: p, add: e.shiftKey });
    if (!e.shiftKey) st.select([]);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    pointer.at = toSheet(e.clientX, e.clientY);
    if (!drag) return;
    const p = toSheet(e.clientX, e.clientY);
    switch (drag.kind) {
      case 'pan':
        st.setView({
          ...drag.view,
          x: drag.view.x - (e.clientX - drag.sx) / view.zoom,
          y: drag.view.y - (e.clientY - drag.sy) / view.zoom,
        });
        return;
      case 'move': {
        const dx = snap(p[0] - drag.start[0], g),
          dy = snap(p[1] - drag.start[1], g);
        if (!dx && !dy && !drag.moved) return;
        st.setPreview(moveSelection(drag.base, drag.ids, dx, dy));
        // A single unconnected component moved onto a line is set into it on release.
        let into: Target | null = null;
        if (drag.ids.length === 1) {
          const c = drag.base.components.find((x) => x.id === drag.ids[0]);
          const free = c && !drag.base.connections.some((x) => x.from[0] === c.id || x.to[0] === c.id);
          if (c && free) into = targetAt(p, c.type, c.variant ?? '', c.id, drag.base);
        }
        if (!drag.moved || into?.id !== drag.into?.id) setDrag({ ...drag, moved: true, into });
        return;
      }
      case 'segment': {
        const d = snap(drag.horiz ? p[1] - drag.start[1] : p[0] - drag.start[0], g);
        const pts = r.routes.get(drag.id) && drag.base.connections.find((c) => c.id === drag.id) ? routeOf(drag) : null;
        if (!pts) return;
        const wps = dragSegment(pts, drag.seg, d);
        if (!wps) {
          st.setPreview(null);
          return;
        }
        st.setPreview({
          ...drag.base,
          connections: drag.base.connections.map((c) => (c.id === drag.id ? { ...c, waypoints: wps } : c)),
        });
        if (!drag.moved) setDrag({ ...drag, moved: true });
        return;
      }
      case 'connect':
      case 'rubber':
        setDrag({ ...drag, cur: p });
        return;
    }
  };

  // Route of a connection before the segment drag started.
  const routeCache = useRef<Map<string, Vec[]>>(new Map());
  const routeOf = (d: Extract<Drag, { kind: 'segment' }>) => {
    const key = d.id + ':' + d.start.join(',');
    if (!routeCache.current.has(key))
      routeCache.current.set(
        key,
        r.routes.get(d.id)!.map((x) => [...x] as Vec),
      );
    return routeCache.current.get(key)!;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const p = toSheet(e.clientX, e.clientY);
    setDrag(null);
    switch (drag.kind) {
      case 'move':
      case 'segment': {
        if (drag.kind === 'move' && (drag.moved || useEditor.getState().preview) && drag.ids.length === 1) {
          // Released on a line: set the (unconnected) component into it.
          const c = drag.base.components.find((x) => x.id === drag.ids[0]);
          const free = c && !drag.base.connections.some((x) => x.from[0] === c.id || x.to[0] === c.id);
          const into = c && free ? targetAt(p, c.type, c.variant ?? '', c.id, drag.base) : null;
          if (c && into) {
            st.setPreview(null);
            if (insertIntoLine(drag.base, into.id, into, p, { type: c.type, variant: c.variant, existing: c.id }))
              return;
          }
        }
        const prev = useEditor.getState().preview;
        if (prev)
          commit(
            drag.kind === 'move' ? 'Verschieben' : 'Leitung verlegen',
            // Moved into a group frame («Monoblock»): joins the group.
            drag.kind === 'move' ? joinGroups(prev, componentIds(prev, drag.ids), r.groupBoxes) : prev,
          );
        else st.setPreview(null);
        routeCache.current.clear();
        return;
      }
      case 'connect': {
        const to = portAt(placed, p, 3 / view.zoom + 1.5, drag.from);
        if (!to) return;
        if (portBusy(placed, drag.from[0], drag.from[1])) return;
        // Draw from an output-like port: keep from → to as flow direction when the start port is an input.
        const fromDef = symbolFor(placed.components.find((c) => c.id === drag.from[0])!).ports.find(
          (x) => x.id === drag.from[1],
        )!;
        const startIsInput = fromDef.id === 'in' || fromDef.id.endsWith('.in') || fromDef.id === 'rec';
        const a: [string, string] = startIsInput ? [to.comp, to.port] : drag.from;
        const b: [string, string] = startIsInput ? drag.from : [to.comp, to.port];
        const m = defaultMedium(placed, a[0], a[1], b);
        // Positions of auto-placed components become part of the file with the first edit.
        st.commit('Verbinden', {
          ...placed,
          connections: [
            ...placed.connections,
            { id: nextConId(placed), from: a, to: b, medium: m, waypoints: [], pinned: false },
          ],
        });
        return;
      }
      case 'rubber': {
        const b = rect(drag.start, drag.cur);
        if (b.w < 0.5 && b.h < 0.5) return;
        const ids = inRect(placed, b, r.textBoxes);
        st.select(drag.add ? [...st.selection, ...ids] : ids);
        return;
      }
    }
  };

  const commit = (label: string, next: Schema) => st.commit(label, next);

  // Drop from the palette: on a line → insert into it; a sensor near a duct sits on it; else at the drop point.
  const onDrop = (e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(DND_TYPE);
    setDropTarget(null);
    paletteDrag.value = '';
    if (!raw || st.proposal) return;
    e.preventDefault();
    const { type, variant } = parseDnd(raw);
    const p = toSheet(e.clientX, e.clientY);
    const t = targetAt(p, type, variant);
    if (t && insertIntoLine(placed, t.id, t, p, { type, variant })) return;
    let at = p;
    const near = segmentAt(r.routes, p, Math.max(6, 16 / view.zoom), signalIds);
    const onDuct = near && placeSensorOn(type, near.a, near.b, p, g, variant);
    if (onDuct) at = onDuct;
    const res = addComponentAt(placed, type, at, variant);
    st.commit('Symbol einfügen', joinGroups(res.schema, [res.id], r.groupBoxes));
    st.select([res.id]);
  };

  const sel = new Set(st.selection);
  const issueIds = new Map<string, string[]>();
  for (const i of issues) for (const id of i.ids) issueIds.set(id, [...(issueIds.get(id) ?? []), i.message]);

  const t = `translate(${-view.x * view.zoom} ${-view.y * view.zoom}) scale(${view.zoom})`;
  const [W, H] = paperSize(doc.sheet);
  return (
    <div
      ref={wrap}
      className={`canvas${st.proposal ? ' proposal' : ''}${st.tool === 'note' ? ' noting' : ''}${drag?.kind === 'connect' ? ' connecting' : ''}${drag?.kind === 'pan' ? ' panning' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          const { type, variant } = parseDnd(paletteDrag.value);
          const t = type ? targetAt(toSheet(e.clientX, e.clientY), type, variant) : null;
          if (t?.id !== dropTarget?.id || t?.a !== dropTarget?.a) setDropTarget(t);
        }
      }}
      onDragLeave={() => setDropTarget(null)}
      onDrop={onDrop}
      data-testid="canvas"
    >
      <svg
        width={size?.w ?? 0}
        height={size?.h ?? 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => (pointer.at = null)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <g transform={t}>
          <rect className="sheet-shadow" x={0.8} y={0.8} width={W} height={H} />
          <g className="sheet" dangerouslySetInnerHTML={{ __html: inner }} />
          <g className="overlay">
            {placed.connections.map((c) => {
              const pts = r.routes.get(c.id);
              if (!pts) return null;
              return (
                <path
                  key={c.id}
                  className="hit-con"
                  data-hit={c.id}
                  data-kind="con"
                  d={pts.map((q, i) => `${i ? 'L' : 'M'}${q[0]} ${q[1]}`).join('')}
                />
              );
            })}
            {r.groupBoxes.map((gb) => (
              <rect
                key={gb.id}
                className={`hit-group${sel.has(gb.id) ? ' selected' : ''}`}
                data-hit={gb.id}
                data-kind="group"
                x={gb.box.x}
                y={gb.box.y}
                width={gb.box.w}
                height={gb.box.h}
              />
            ))}
            {placed.texts.map((tx) => {
              const tb = r.textBoxes.find((b) => b.id === tx.id);
              return tb ? (
                <rect
                  key={tx.id}
                  className={`hit-cmp${sel.has(tx.id) ? ' selected' : ''}`}
                  data-hit={tx.id}
                  data-kind="text"
                  x={tb.box.x - 0.5}
                  y={tb.box.y - 0.5}
                  width={tb.box.w + 1}
                  height={tb.box.h + 1}
                />
              ) : null;
            })}
            {placed.components.map((c) => {
              if (!c.pos) return null;
              const b = componentBox(c);
              const pad = c.type === 'junction' ? 1.5 : 0.5;
              const def = symbolFor(c);
              return (
                <g
                  key={c.id}
                  className={`hit${sel.has(c.id) ? ' selected' : ''}${def.background ? ' bg' : ''}`}
                  data-id={c.id}
                >
                  <rect
                    className="hit-cmp"
                    data-hit={c.id}
                    data-kind="cmp"
                    x={b.x - pad}
                    y={b.y - pad}
                    width={b.w + 2 * pad}
                    height={b.h + 2 * pad}
                  />
                  {def.ports.map((pd) => {
                    const pp = portPlace(c, pd.id)!;
                    const busy = portBusy(placed, c.id, pd.id);
                    return (
                      <circle
                        key={pd.id}
                        className={`port${busy ? ' busy' : ''}`}
                        data-port={`${c.id}|${pd.id}`}
                        cx={pp.at[0]}
                        cy={pp.at[1]}
                        r={1.1}
                      />
                    );
                  })}
                </g>
              );
            })}
            {[...issueIds].map(([id, msgs]) => {
              const c = placed.components.find((x) => x.id === id);
              if (!c?.pos) return null;
              const b = componentBox(c);
              return (
                <g key={id} className="issue" transform={`translate(${b.x + b.w + 0.6} ${b.y - 3})`}>
                  <title>{msgs.join('\n')}</title>
                  <path d="M1.4 0L2.8 2.5H0Z" />
                </g>
              );
            })}
            {r.notePins.map(({ id, at }) => {
              const n = doc.notes.find((x) => x.id === id)!;
              return (
                <circle
                  key={id}
                  className={`hit-note${st.activeNote === id ? ' active' : ''}`}
                  data-note={id}
                  cx={at[0] + PIN_HEAD[0]}
                  cy={at[1] + PIN_HEAD[1]}
                  r={2.6}
                >
                  <title>{n.text}</title>
                </circle>
              );
            })}
            {noteDraft && <circle className="note-draft" cx={noteDraft.at[0]} cy={noteDraft.at[1]} r={0.8} />}
            {removedBoxes.map(({ id, box }) => (
              <rect key={id} className="removed" x={box.x - 1} y={box.y - 1} width={box.w + 2} height={box.h + 2} />
            ))}
            {(() => {
              const t = dropTarget ?? (drag?.kind === 'move' ? drag.into : null);
              return t ? <path className="drop-target" d={`M${t.a[0]} ${t.a[1]}L${t.b[0]} ${t.b[1]}`} /> : null;
            })()}
            {drag?.kind === 'connect' && (
              <path
                className="connect-preview"
                d={`M${drag.at[0]} ${drag.at[1]}L${drag.cur[0]} ${drag.at[1]}L${drag.cur[0]} ${drag.cur[1]}`}
              />
            )}
            {drag?.kind === 'rubber' &&
              (() => {
                const b = rect(drag.start, drag.cur);
                return <rect className="rubber" x={b.x} y={b.y} width={b.w} height={b.h} />;
              })()}
          </g>
        </g>
      </svg>
      {noteDraft && (
        <NotePopover
          // Inside the canvas: the popover is 240 × 120 px plus its 8 px offset.
          left={Math.max(0, Math.min((noteDraft.at[0] - view.x) * view.zoom, (size?.w ?? 0) - 256))}
          top={Math.max(0, Math.min((noteDraft.at[1] - view.y) * view.zoom, (size?.h ?? 0) - 136))}
          onCancel={() => setNoteDraft(null)}
          onSave={(text) => {
            const res = st.ops('Anmerkung', [{ op: 'add_note', anchor: noteDraft.anchor, text }]);
            setNoteDraft(null);
            st.setTool('select');
            if (res?.added[0]) st.openNote(res.added[0]);
          }}
        />
      )}
    </div>
  );

  /** Anchor for a note at a click: the component or line under the pointer, else the free spot. */
  function noteAnchorAt(target: Element, p: Vec): { anchor: NoteAnchor; at: Vec } {
    const hit = target.closest('[data-hit]');
    const id = hit?.getAttribute('data-hit');
    const kind = hit?.getAttribute('data-kind');
    if (id && kind === 'cmp' && st.doc.components.some((c) => c.id === id)) {
      const c = placed.components.find((x) => x.id === id)!;
      const b = componentBox(c);
      return { anchor: { component: id }, at: [b.x + b.w, b.y] };
    }
    if (id && kind === 'con') return { anchor: { connection: id }, at: p };
    const q: Vec = [snap(p[0], g), snap(p[1], g)];
    return { anchor: { pos: q }, at: q };
  }
}

function NotePopover({
  left,
  top,
  onSave,
  onCancel,
}: {
  left: number;
  top: number;
  onSave: (text: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <form
      className="note-popover"
      style={{ left, top }}
      onPointerDown={(e) => e.stopPropagation()}
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim()) onSave(text.trim());
        else onCancel();
      }}
    >
      <textarea
        ref={ref}
        rows={3}
        value={text}
        placeholder="Anmerkung"
        aria-label="Anmerkung"
        data-testid="note-input"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
          if (e.key === 'Escape') {
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <div className="note-popover-buttons">
        <button type="button" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="submit" className="primary" data-testid="note-save">
          Speichern
        </button>
      </div>
    </form>
  );
}

function rect(a: Vec, b: Vec): Box {
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
}

function nextConId(s: Schema): string {
  const used = new Set([...s.components, ...s.connections, ...s.groups, ...s.texts, ...s.notes].map((x) => x.id));
  for (let n = 1; ; n++) {
    const id = `L${String(n).padStart(2, '0')}`;
    if (!used.has(id)) return id;
  }
}
