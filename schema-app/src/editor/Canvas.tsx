// SPDX-License-Identifier: AGPL-3.0-or-later
// The sheet: the renderer's SVG plus an interaction layer (hit areas, ports, handles).
// Pointer: click selects, Shift adds; drag moves (grid snap); drag from a port connects; drag a line segment
// sets waypoints; drag on empty paper selects by rectangle; wheel zooms; middle button or Space + drag pans.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Schema, Vec } from '../model/types.ts';
import { componentBox, portPlace, snap, type Box } from '../model/geometry.ts';
import { paperSize } from '../model/sheet.ts';
import { renderSchema, type Highlight } from '../render/render.ts';
import { symbolOf } from '../symbols/library.ts';
import { validate } from '../model/validate.ts';
import { checkDrawing } from '../layout/check.ts';
import { shownDoc, useEditor, type View } from './store.ts';
import {
  addComponentAt,
  defaultMedium,
  dragSegment,
  inRect,
  isSignal,
  moveSelection,
  placeOnSegment,
  portAt,
  portBusy,
  segmentAt,
} from './actions.ts';
import { DND_TYPE } from './Palette.tsx';

type Drag =
  | { kind: 'move'; start: Vec; ids: string[]; base: Schema; moved: boolean }
  | { kind: 'connect'; from: [string, string]; at: Vec; cur: Vec }
  | { kind: 'segment'; id: string; seg: number; start: Vec; base: Schema; horiz: boolean; moved: boolean }
  | { kind: 'rubber'; start: Vec; cur: Vec; add: boolean }
  | { kind: 'pan'; sx: number; sy: number; view: View };

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

  const highlight = useMemo(() => {
    const h: Record<string, Highlight> = {};
    for (const id of st.selection) h[id] = 'select';
    return h;
  }, [st.selection]);
  const r = useMemo(() => renderSchema(doc, { grid: true, notes: true, highlight }), [doc, highlight]);
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

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button === 2) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const p = toSheet(e.clientX, e.clientY);
    if (e.button === 1 || space.current) {
      setDrag({ kind: 'pan', sx: e.clientX, sy: e.clientY, view });
      return;
    }
    const target = e.target as Element;
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
        if (!drag.moved) setDrag({ ...drag, moved: true });
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
        const prev = useEditor.getState().preview;
        if (drag.moved && prev) commit(drag.kind === 'move' ? 'Verschieben' : 'Leitung verlegen', prev);
        else st.setPreview(null);
        routeCache.current.clear();
        return;
      }
      case 'connect': {
        const to = portAt(placed, p, 3 / view.zoom + 1.5, drag.from);
        if (!to) return;
        if (portBusy(placed, drag.from[0], drag.from[1])) return;
        // Draw from an output-like port: keep from → to as flow direction when the start port is an input.
        const fromDef = symbolOf(placed.components.find((c) => c.id === drag.from[0])!.type).ports.find(
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

  // Drop from the palette: on a line → insert into it, else add at the drop point.
  const onDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData(DND_TYPE);
    if (!type) return;
    e.preventDefault();
    const p = toSheet(e.clientX, e.clientY);
    const seg = segmentAt(r.routes, p, 2.5, signalIds);
    const place = seg && placeOnSegment(type, seg.a, seg.b, p, g);
    if (seg && place) {
      // Keep auto-placed positions, then split the line.
      const n0 = useEditor.getState().past.length;
      st.commit('Einsetzen', placed);
      const res = st.ops('Einsetzen', [
        {
          op: 'insert_into_connection',
          connection: seg.id,
          type,
          pos: place.pos,
          rot: place.rot,
          flip: place.flip,
          in: 'in',
          out: 'out',
        },
      ]);
      // The two edits form one step for the user: merge them.
      if (res && useEditor.getState().past.length === n0 + 2) mergeLastSteps('In Leitung einsetzen');
      if (res) st.select(res.added.filter((id) => useEditor.getState().doc.components.some((c) => c.id === id)));
      return;
    }
    const res = addComponentAt(placed, type, p);
    st.commit('Symbol einfügen', res.schema);
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
      className={`canvas${drag?.kind === 'connect' ? ' connecting' : ''}${drag?.kind === 'pan' ? ' panning' : ''}`}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DND_TYPE)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={onDrop}
      data-testid="canvas"
    >
      <svg
        width={size?.w ?? 0}
        height={size?.h ?? 0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
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
              const def = symbolOf(c.type);
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
    </div>
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

/** Merges the last two undo steps into one. */
function mergeLastSteps(label: string) {
  useEditor.setState((s) => {
    const n = s.past.length;
    if (n < 2) return s;
    const a = s.past[n - 2]!,
      b = s.past[n - 1]!;
    return { past: [...s.past.slice(0, -2), { label, redo: [...a.redo, ...b.redo], undo: [...b.undo, ...a.undo] }] };
  });
}
