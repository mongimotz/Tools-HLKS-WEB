// SPDX-License-Identifier: AGPL-3.0-or-later
// Editing actions as pure functions Schema → Schema (no DOM). The editor commits their result as one undo step.
import type { Component, Connection, Dir, Rotation, Schema, Vec } from '../model/types.ts';
import { componentBox, portPlace, snap, snapVec, type Box } from '../model/geometry.ts';
import { MEDIA, medium, mediumMatches } from '../model/media.ts';
import { findSymbol, symbolOf } from '../symbols/library.ts';
import { nextId } from '../ops/ops.ts';
import type { Route } from '../layout/route.ts';
import { detachNotes } from '../model/notes.ts';

/** Component IDs a selection stands for: components, plus the members of selected groups. */
export function componentIds(s: Schema, sel: string[]): string[] {
  const out = new Set<string>();
  for (const id of sel) {
    if (s.components.some((c) => c.id === id)) out.add(id);
    const g = s.groups.find((x) => x.id === id);
    if (g) g.members.forEach((m) => out.add(m));
  }
  return [...out];
}

/** Moves components and texts by (dx, dy). Moved components get pinned; lines follow. */
export function moveSelection(s: Schema, sel: string[], dx: number, dy: number): Schema {
  if (!dx && !dy) return s;
  const ids = new Set(componentIds(s, sel));
  const texts = new Set(sel.filter((id) => s.texts.some((t) => t.id === id)));
  const g = s.sheet.grid;
  return {
    ...s,
    components: s.components.map((c) =>
      ids.has(c.id) && c.pos ? { ...c, pos: snapVec([c.pos[0] + dx, c.pos[1] + dy], g), pinned: true } : c,
    ),
    texts: s.texts.map((t) => (texts.has(t.id) ? { ...t, pos: [t.pos[0] + dx, t.pos[1] + dy] as Vec } : t)),
    connections: s.connections.map((c) => {
      if (!c.waypoints.length) return c;
      const a = ids.has(c.from[0]),
        b = ids.has(c.to[0]);
      if (a && b) return { ...c, waypoints: c.waypoints.map((w) => [w[0] + dx, w[1] + dy] as Vec) };
      // One end moved: the manual route no longer fits, route automatically again.
      if (a || b) return { ...c, waypoints: [] };
      return c;
    }),
  };
}

function touching(s: Schema, ids: Set<string>): Set<string> {
  return new Set(s.connections.filter((c) => ids.has(c.from[0]) || ids.has(c.to[0])).map((c) => c.id));
}

function clearRoutes(s: Schema, ids: Set<string>): Connection[] {
  const t = touching(s, ids);
  return s.connections.map((c) => (t.has(c.id) && c.waypoints.length ? { ...c, waypoints: [] } : c));
}

export function rotateSelection(s: Schema, sel: string[]): Schema {
  const ids = new Set(componentIds(s, sel));
  if (!ids.size) return s;
  return {
    ...s,
    components: s.components.map((c) =>
      ids.has(c.id) ? { ...c, rot: ((c.rot + 90) % 360) as Rotation, pinned: true } : c,
    ),
    connections: clearRoutes(s, ids),
  };
}

export function flipSelection(s: Schema, sel: string[]): Schema {
  const ids = new Set(componentIds(s, sel));
  if (!ids.size) return s;
  return {
    ...s,
    components: s.components.map((c) => (ids.has(c.id) ? { ...c, flip: !c.flip, pinned: true } : c)),
    connections: clearRoutes(s, ids),
  };
}

export function deleteSelection(s: Schema, sel: string[]): Schema {
  const del = new Set(sel);
  const comps = new Set(s.components.filter((c) => del.has(c.id)).map((c) => c.id));
  const cons = new Set(
    s.connections.filter((c) => del.has(c.id) || comps.has(c.from[0]) || comps.has(c.to[0])).map((c) => c.id),
  );
  const notes = detachNotes(s, new Set([...comps, ...cons])).filter((n) => !del.has(n.id));
  return {
    ...s,
    components: s.components.filter((c) => !comps.has(c.id)),
    connections: s.connections.filter((c) => !cons.has(c.id)),
    groups: s.groups
      .filter((g) => !del.has(g.id))
      .map((g) => ({ ...g, members: g.members.filter((m) => !comps.has(m)) }))
      .filter((g) => g.members.length),
    texts: s.texts.filter((t) => !del.has(t.id)),
    notes,
  };
}

/** Copies the selected components (and lines between them), offset by 4 grid steps. Returns the new IDs. */
export function duplicateSelection(s: Schema, sel: string[]): { schema: Schema; ids: string[] } {
  const ids = componentIds(s, sel);
  if (!ids.length) return { schema: s, ids: [] };
  let out: Schema = { ...s, components: [...s.components], connections: [...s.connections] };
  const map = new Map<string, string>();
  const off = s.sheet.grid * 4;
  for (const id of ids) {
    const c = s.components.find((x) => x.id === id)!;
    const nid = nextId(out, symbolOf(c.type).prefix);
    map.set(id, nid);
    out.components.push({
      ...c,
      id: nid,
      label: c.label === c.id ? nid : c.label,
      props: { ...c.props },
      pos: c.pos ? [c.pos[0] + off, c.pos[1] + off] : null,
      pinned: true,
    });
    out = { ...out };
  }
  for (const c of s.connections) {
    const a = map.get(c.from[0]),
      b = map.get(c.to[0]);
    if (!a || !b) continue;
    out.connections.push({
      ...c,
      id: nextId(out, 'L'),
      from: [a, c.from[1]],
      to: [b, c.to[1]],
      waypoints: c.waypoints.map((w) => [w[0] + off, w[1] + off] as Vec),
    });
  }
  return { schema: out, ids: [...map.values()] };
}

/** Medium for a new line from a port: the medium already used at that component, else the first allowed one. */
export function defaultMedium(s: Schema, compId: string, portId: string, other?: [string, string]): string {
  const ends: [string, string][] = [[compId, portId], ...(other ? [other] : [])];
  for (const [cid] of ends) {
    for (const con of s.connections)
      if (con.from[0] === cid || con.to[0] === cid) if (fits(s, ends, con.medium)) return con.medium;
  }
  for (const m of MEDIA) if (fits(s, ends, m.id)) return m.id;
  return 'air.supply';
}

function fits(s: Schema, ends: [string, string][], m: string): boolean {
  return ends.every(([cid, pid]) => {
    const c = s.components.find((x) => x.id === cid);
    const p = c && findSymbol(c.type)?.ports.find((x) => x.id === pid);
    return !p || p.media.some((pat) => mediumMatches(pat, m));
  });
}

export function portBusy(s: Schema, cid: string, pid: string): boolean {
  return s.connections.some((c) => (c.from[0] === cid && c.from[1] === pid) || (c.to[0] === cid && c.to[1] === pid));
}

/** Nearest free port within `tol` mm of p. */
export function portAt(
  s: Schema,
  p: Vec,
  tol: number,
  exclude?: [string, string],
): { comp: string; port: string; at: Vec; dir: Dir } | null {
  let best: { comp: string; port: string; at: Vec; dir: Dir; d: number } | null = null;
  for (const c of s.components) {
    if (!c.pos) continue;
    for (const def of symbolOf(c.type).ports) {
      if (exclude && exclude[0] === c.id && exclude[1] === def.id) continue;
      if (portBusy(s, c.id, def.id)) continue;
      const pp = portPlace(c, def.id)!;
      const d = Math.hypot(pp.at[0] - p[0], pp.at[1] - p[1]);
      if (d <= tol && (!best || d < best.d)) best = { comp: c.id, port: def.id, at: pp.at, dir: pp.dir, d };
    }
  }
  return best && { comp: best.comp, port: best.port, at: best.at, dir: best.dir };
}

/** Segment of a routed line within `tol` mm of p. */
export function segmentAt(
  routes: Map<string, Route>,
  p: Vec,
  tol: number,
  signalIds = new Set<string>(),
): { id: string; seg: number; a: Vec; b: Vec } | null {
  let best: { id: string; seg: number; a: Vec; b: Vec; d: number } | null = null;
  for (const [id, pts] of routes) {
    if (signalIds.has(id)) continue;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!,
        b = pts[k]!;
      const d = distToSeg(p, a, b);
      if (d <= tol && (!best || d < best.d)) best = { id, seg: k, a, b, d };
    }
  }
  return best && { id: best.id, seg: best.seg, a: best.a, b: best.b };
}

function distToSeg(p: Vec, a: Vec, b: Vec): number {
  const dx = b[0] - a[0],
    dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Where a symbol dropped onto a segment goes: on the line, turned along the flow. */
export function placeOnSegment(
  type: string,
  a: Vec,
  b: Vec,
  p: Vec,
  grid: number,
): { pos: Vec; rot: Rotation; flip: boolean } | null {
  const def = findSymbol(type);
  if (!def || !def.ports.some((x) => x.id === 'in') || !def.ports.some((x) => x.id === 'out')) return null;
  const horiz = Math.abs(a[1] - b[1]) < 1e-6;
  if (horiz) return { pos: [snap(p[0], grid), a[1]], rot: 0, flip: b[0] < a[0] };
  return { pos: [a[0], snap(p[1], grid)], rot: b[1] > a[1] ? 90 : 270, flip: false };
}

/**
 * Drags segment `seg` (between pts[seg-1] and pts[seg]) of a route perpendicular by `d` mm.
 * Returns the new waypoints, or null if the segment touches a port (first or last segment of a bent route).
 */
export function dragSegment(pts: Route, seg: number, d: number): Vec[] | null {
  if (!d) return null;
  const n = pts.length;
  const a = pts[seg - 1]!,
    b = pts[seg]!;
  const horiz = Math.abs(a[1] - b[1]) < 1e-6;
  if (n === 2) {
    // A straight line becomes a detour: two elbows at 1/4 and 3/4.
    const [p0, p1] = [pts[0]!, pts[1]!];
    if (horiz) {
      const x1 = p0[0] + (p1[0] - p0[0]) / 4,
        x2 = p0[0] + ((p1[0] - p0[0]) * 3) / 4;
      return [
        [x1, p0[1]],
        [x1, p0[1] + d],
        [x2, p0[1] + d],
        [x2, p0[1]],
      ];
    }
    const y1 = p0[1] + (p1[1] - p0[1]) / 4,
      y2 = p0[1] + ((p1[1] - p0[1]) * 3) / 4;
    return [
      [p0[0], y1],
      [p0[0] + d, y1],
      [p0[0] + d, y2],
      [p0[0], y2],
    ];
  }
  if (seg === 1 || seg === n - 1) return null;
  const out = pts.map((p) => [...p] as Vec);
  for (const k of [seg - 1, seg]) {
    if (horiz) out[k]![1] += d;
    else out[k]![0] += d;
  }
  return out.slice(1, -1);
}

/** IDs of components whose box lies completely inside the rectangle, and texts likewise. */
export function inRect(s: Schema, r: Box, textBoxes: { id: string; box: Box }[]): string[] {
  const inside = (b: Box) => b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h;
  const ids = s.components.filter((c) => c.pos && inside(componentBox(c))).map((c) => c.id);
  for (const t of s.texts) {
    const tb = textBoxes.find((x) => x.id === t.id);
    if (tb && inside(tb.box)) ids.push(t.id);
  }
  return ids;
}

export function isSignal(m: string): boolean {
  return medium(m)?.kind === 'signal';
}

export function newGroup(s: Schema, sel: string[]): { schema: Schema; id: string } | null {
  const members = componentIds(s, sel);
  if (members.length < 1) return null;
  const id = nextId(s, 'G');
  return { schema: { ...s, groups: [...s.groups, { id, label: 'Gruppe', members, frame: true }] }, id };
}

export function addComponentAt(s: Schema, type: string, pos: Vec): { schema: Schema; id: string } {
  const def = symbolOf(type);
  const id = nextId(s, def.prefix);
  const c: Component = {
    id,
    type,
    label: type === 'junction' ? '' : id,
    props: {},
    pos: snapVec(pos, s.sheet.grid),
    rot: 0,
    flip: false,
    pinned: true,
  };
  return { schema: { ...s, components: [...s.components, c] }, id };
}
