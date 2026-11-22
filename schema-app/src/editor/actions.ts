// SPDX-License-Identifier: AGPL-3.0-or-later
// Editing actions as pure functions Schema → Schema (no DOM). The editor commits their result as one undo step.
import type { Component, Connection, Dir, Rotation, Schema, Vec } from '../model/types.ts';
import { componentBox, flowPairs, portPlace, snap, snapVec, type Box } from '../model/geometry.ts';
import { MEDIA, medium, mediumMatches } from '../model/media.ts';
import { findSymbol, symbolFor, symbolVariant } from '../symbols/library.ts';
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
  // A room (or zone) carries what lies inside it.
  for (const room of s.components.filter((c) => ids.has(c.id) && isRoom(c))) {
    const b = componentBox(room);
    const inside = (p: Vec) => p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.h;
    for (const c of s.components) if (c.pos && c.id !== room.id && !isRoom(c) && inside(c.pos)) ids.add(c.id);
    for (const t of s.texts) if (inside(t.pos)) texts.add(t.id);
  }
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

/** Background symbol that encloses others (room, zone); a fire compartment border is no room. */
export function isRoom(c: Component): boolean {
  const d = symbolFor(c);
  return !!d.background && d.size[0] >= 15 && d.size[1] >= 15;
}

/** Room a component lies in (its centre inside the room's box), if any. */
export function roomOf(s: Schema, id: string): Component | undefined {
  const c = s.components.find((x) => x.id === id);
  if (!c?.pos || isRoom(c)) return undefined;
  return s.components.find((r) => {
    if (!r.pos || !isRoom(r)) return false;
    const b = componentBox(r);
    return c.pos![0] > b.x && c.pos![0] < b.x + b.w && c.pos![1] > b.y && c.pos![1] < b.y + b.h;
  });
}

/**
 * Components placed or moved into a group frame (e.g. «Monoblock») join that group, unless they belong to a
 * group already. `frames`: the group boxes of the drawing before the change.
 */
export function joinGroups(s: Schema, ids: string[], frames: { id: string; box: Box }[]): Schema {
  let groups = s.groups;
  for (const id of ids) {
    const c = s.components.find((x) => x.id === id);
    if (!c?.pos || isRoom(c) || groups.some((g) => g.members.includes(id))) continue;
    const hit = frames
      .filter(
        (f) =>
          c.pos![0] > f.box.x && c.pos![0] < f.box.x + f.box.w && c.pos![1] > f.box.y && c.pos![1] < f.box.y + f.box.h,
      )
      .sort((a, b) => a.box.w * a.box.h - b.box.w * b.box.h)[0];
    if (hit) groups = groups.map((g) => (g.id === hit.id ? { ...g, members: [...g.members, id] } : g));
  }
  return groups === s.groups ? s : { ...s, groups };
}

/**
 * After a component was set into a line: room on the line. It sits between its neighbours with `gap` mm on
 * both sides; if the gap is too small, everything after it on the row moves along.
 */
export function makeRoom(s: Schema, id: string, gap = 6): Schema {
  const c = s.components.find((x) => x.id === id);
  if (!c?.pos) return s;
  const inCon = s.connections.find((x) => x.to[0] === id && x.to[1] === 'in');
  const outCon = s.connections.find((x) => x.from[0] === id && x.from[1] === 'out');
  const up = inCon && s.components.find((x) => x.id === inCon.from[0]);
  const down = outCon && s.components.find((x) => x.id === outCon.to[0]);
  const horiz = c.rot === 0 || c.rot === 180;
  const ax = horiz ? 0 : 1;
  const lo = (b: Box) => (horiz ? b.x : b.y),
    len = (b: Box) => (horiz ? b.w : b.h);
  const cb = componentBox(c);
  // Flow direction along the axis: +1 when the downstream neighbour lies after c.
  const dir = down?.pos
    ? Math.sign(down.pos[ax]! - c.pos[ax]!) || 1
    : up?.pos
      ? Math.sign(c.pos[ax]! - up.pos[ax]!) || 1
      : 1;
  const half = len(cb) / 2;
  const off = c.pos[ax]! - (lo(cb) + half); // centre of the drawing box vs. pos (actuators, bounds)
  const g = s.sheet.grid;
  let center = c.pos[ax]! - off; // drawing-box centre along the axis
  let shift = 0;
  const edge = (o: Component | undefined, side: 1 | -1) => {
    if (!o?.pos) return null;
    const b = componentBox(o);
    // side 1: the edge facing c from after it; -1: from before it
    return side === 1 ? (dir > 0 ? lo(b) : lo(b) + len(b)) : dir > 0 ? lo(b) + len(b) : lo(b);
  };
  const before = edge(up, -1),
    after = edge(down, 1);
  if (before !== null) {
    const min = before + dir * (gap + half);
    if ((center - min) * dir < 0) center = min;
  }
  if (after !== null) {
    const max = after - dir * (gap + half);
    if ((center - max) * dir > 0) shift = (center - max) * dir;
  }
  shift = Math.ceil(shift / g - 1e-9) * g;
  const newPos = snap(center + off, g / 2);
  let out: Schema = {
    ...s,
    components: s.components.map((x) =>
      x.id === id ? { ...x, pos: (horiz ? [newPos, x.pos![1]] : [x.pos![0], newPos]) as Vec } : x,
    ),
  };
  if (shift > 0 && down?.pos) {
    // Everything on the row from the downstream neighbour on.
    const row = c.pos[1 - ax]!;
    const from = down.pos[ax]!;
    const ids = out.components
      .filter(
        (x) =>
          x.pos &&
          x.id !== id &&
          !isRoom(x) &&
          Math.abs(x.pos[1 - ax]! - row) <= 12 &&
          (x.pos[ax]! - from) * dir >= -1e-6,
      )
      .map((x) => x.id);
    out = moveSelection(out, ids, horiz ? dir * shift : 0, horiz ? 0 : dir * shift);
  }
  return out;
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
  s = bridgeDeleted(s, new Set(sel));
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

/**
 * Components to be deleted that sit inside a line (a line into a flow inlet and one out of the matching
 * outlet): the two lines become one, so the line stays when the component goes.
 */
export function bridgeDeleted(s: Schema, del: Set<string>): Schema {
  let cons = s.connections;
  for (const c of s.components) {
    if (!del.has(c.id)) continue;
    for (const [pin, pout] of flowPairs(c)) {
      const inc = cons.find((x) => x.to[0] === c.id && x.to[1] === pin);
      const out = cons.find((x) => x.from[0] === c.id && x.from[1] === pout);
      if (!inc || !out || inc.from[0] === out.to[0]) continue;
      // Upstream medium, unless the downstream port does not take it.
      const target = s.components.find((x) => x.id === out.to[0]);
      const port =
        target && findSymbol(target.type) ? symbolFor(target).ports.find((p) => p.id === out.to[1]) : undefined;
      const medium = !port || port.media.some((m) => mediumMatches(m, inc.medium)) ? inc.medium : out.medium;
      cons = cons
        .filter((x) => x.id !== out.id)
        .map((x) => (x.id === inc.id ? { ...x, to: out.to, medium, waypoints: [], pinned: false } : x));
    }
  }
  if (cons === s.connections) return s;
  // Notes on a line that was merged stay on the merged line.
  const kept = new Set(cons.map((x) => x.id));
  const merged = new Map<string, string>();
  for (const x of s.connections)
    if (!kept.has(x.id)) {
      const into = cons.find((y) => y.to[0] === x.to[0] && y.to[1] === x.to[1]);
      if (into) merged.set(x.id, into.id);
    }
  const notes = s.notes.map((n) =>
    'connection' in n.anchor && merged.has(n.anchor.connection)
      ? { ...n, anchor: { connection: merged.get(n.anchor.connection)! } }
      : n,
  );
  return { ...s, connections: cons, notes };
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
    const nid = nextId(out, symbolFor(c).prefix);
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
    const p = c && findSymbol(c.type) && symbolFor(c).ports.find((x) => x.id === pid);
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
    for (const def of symbolFor(c).ports) {
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

/** Can a symbol be set into a line (it has an in and an out port)? */
export function insertable(type: string, variant = ''): boolean {
  if (!findSymbol(type)) return false;
  const def = symbolVariant(type, variant);
  return def.ports.some((x) => x.id === 'in') && def.ports.some((x) => x.id === 'out');
}

/**
 * Where a symbol dropped onto a segment goes: on the line, turned along the flow. The in/out ports sit on
 * the line (their offset from the symbol centre is taken into account).
 */
export function placeOnSegment(
  type: string,
  a: Vec,
  b: Vec,
  p: Vec,
  grid: number,
  variant = '',
): { pos: Vec; rot: Rotation; flip: boolean } | null {
  if (!insertable(type, variant)) return null;
  const def = symbolVariant(type, variant);
  const pin = def.ports.find((x) => x.id === 'in')!;
  const off = pin.at[1] - def.size[1] / 2; // port offset across the flow
  const horiz = Math.abs(a[1] - b[1]) < 1e-6;
  if (horiz) {
    const flip = b[0] < a[0];
    // rot 0 (or mirrored): local y maps to sheet y.
    return { pos: [snap(p[0], grid / 2), a[1] - off], rot: 0, flip };
  }
  const down = b[1] > a[1];
  // rot 90: local y → −x; rot 270: local y → +x.
  return { pos: [down ? a[0] + off : a[0] - off, snap(p[1], grid / 2)], rot: down ? 90 : 270, flip: false };
}

/** Sensor (stem symbol) dropped near a duct: its stem tip touches the line. */
export function placeSensorOn(type: string, a: Vec, b: Vec, p: Vec, grid: number, variant = ''): Vec | null {
  const def = symbolVariant(type, variant);
  if (def.category !== 'control' || !def.obstacle) return null;
  if (Math.abs(a[1] - b[1]) > 1e-6) return null; // horizontal ducts only
  return [snap(p[0], grid / 2), a[1] - def.size[1] / 2];
}

/** Middle of the longest segment of a routed line (where a symbol clicked in the palette goes). */
export function lineMiddle(route: Route): { a: Vec; b: Vec; p: Vec } | null {
  let best: { a: Vec; b: Vec; len: number } | null = null;
  for (let k = 1; k < route.length; k++) {
    const a = route[k - 1]!,
      b = route[k]!;
    const len = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
    if (!best || len > best.len) best = { a, b, len };
  }
  return best && { a: best.a, b: best.b, p: [(best.a[0] + best.b[0]) / 2, (best.a[1] + best.b[1]) / 2] };
}

// ---- Clipboard ----------------------------------------------------------------------------------------

export const CLIP_FORMAT = 'hlks-schema-clip';

export interface Clip {
  format: typeof CLIP_FORMAT;
  components: Component[];
  connections: Connection[];
  texts: Schema['texts'];
  groups: Schema['groups'];
  symbols: Schema['symbols'];
}

/** The selection as a clipboard fragment: components, lines between them, texts, whole groups. */
export function copySelection(s: Schema, sel: string[]): Clip | null {
  const ids = new Set(componentIds(s, sel));
  const texts = s.texts.filter((t) => sel.includes(t.id));
  if (!ids.size && !texts.length) return null;
  const components = s.components.filter((c) => ids.has(c.id) && c.pos);
  const own = [...new Set(components.map((c) => c.type).filter((t) => t.startsWith('user.')))];
  return {
    format: CLIP_FORMAT,
    components,
    connections: s.connections.filter((c) => ids.has(c.from[0]) && ids.has(c.to[0])),
    texts,
    groups: s.groups.filter((g) => g.members.length && g.members.every((m) => ids.has(m))),
    symbols: own.map((t) => findSymbol(t)).filter((d): d is NonNullable<typeof d> => !!d),
  };
}

export function parseClip(text: string): Clip | null {
  try {
    const raw = JSON.parse(text) as Partial<Clip>;
    if (raw?.format !== CLIP_FORMAT || !Array.isArray(raw.components)) return null;
    return {
      format: CLIP_FORMAT,
      components: raw.components,
      connections: raw.connections ?? [],
      texts: raw.texts ?? [],
      groups: raw.groups ?? [],
      symbols: raw.symbols ?? [],
    };
  } catch {
    return null;
  }
}

/** Inserts a clipboard fragment with new IDs; its centre goes to `at` (or offset by `off`). */
export function pasteClip(s: Schema, clip: Clip, at: Vec | null, off: number): { schema: Schema; ids: string[] } {
  const boxes = clip.components.filter((c) => c.pos).map((c) => componentBox(c));
  for (const t of clip.texts) boxes.push({ x: t.pos[0], y: t.pos[1], w: 1, h: 1 });
  const ub = boxes.length
    ? boxes.reduce((u, b) => ({
        x: Math.min(u.x, b.x),
        y: Math.min(u.y, b.y),
        w: Math.max(u.x + u.w, b.x + b.w) - Math.min(u.x, b.x),
        h: Math.max(u.y + u.h, b.y + b.h) - Math.min(u.y, b.y),
      }))
    : { x: 0, y: 0, w: 0, h: 0 };
  const g = s.sheet.grid;
  const dx = at ? snap(at[0] - (ub.x + ub.w / 2), g) : off,
    dy = at ? snap(at[1] - (ub.y + ub.h / 2), g) : off;
  let out: Schema = {
    ...s,
    components: [...s.components],
    connections: [...s.connections],
    texts: [...s.texts],
    groups: [...s.groups],
  };
  const map = new Map<string, string>();
  const ids: string[] = [];
  for (const c of clip.components) {
    const nid = nextId(out, symbolFor(c).prefix);
    map.set(c.id, nid);
    out.components.push({
      ...c,
      id: nid,
      label: c.label === c.id ? nid : c.label,
      props: { ...c.props },
      pos: c.pos ? [c.pos[0] + dx, c.pos[1] + dy] : null,
      pinned: true,
    });
    ids.push(nid);
    out = { ...out };
  }
  for (const c of clip.connections) {
    const a = map.get(c.from[0]),
      b = map.get(c.to[0]);
    if (!a || !b) continue;
    out.connections.push({
      ...c,
      id: nextId(out, 'L'),
      from: [a, c.from[1]],
      to: [b, c.to[1]],
      waypoints: c.waypoints.map((w) => [w[0] + dx, w[1] + dy] as Vec),
    });
  }
  for (const t of clip.texts) {
    const nid = nextId(out, 'T');
    out.texts.push({ ...t, id: nid, pos: [t.pos[0] + dx, t.pos[1] + dy] });
    ids.push(nid);
  }
  for (const gr of clip.groups) {
    const members = gr.members.map((m) => map.get(m)).filter((m): m is string => !!m);
    if (members.length) out.groups.push({ ...gr, id: nextId(out, 'G'), members });
  }
  return { schema: out, ids };
}

/** Cycles the variant of the selected components (key V). */
export function nextVariant(s: Schema, sel: string[], back = false): Schema {
  const ids = new Set(componentIds(s, sel));
  let changed = false;
  const components = s.components.map((c) => {
    if (!ids.has(c.id)) return c;
    const vs = findSymbol(c.type)?.variants ?? [];
    if (vs.length < 2) return c;
    const k = Math.max(
      0,
      vs.findIndex((v) => v.id === (c.variant || vs[0]!.id)),
    );
    const v = vs[(k + (back ? vs.length - 1 : 1)) % vs.length]!;
    changed = true;
    return { ...c, variant: v.id === vs[0]!.id ? '' : v.id };
  });
  if (!changed) return s;
  // Ports may move with the variant: lines are routed again, lines on missing ports go away.
  const next = { ...s, components };
  return { ...next, connections: fitConnections(next, ids) };
}

/** Sets one component's variant ('' = the first). */
export function setVariant(s: Schema, id: string, variant: string): Schema {
  const vs = findSymbol(s.components.find((c) => c.id === id)?.type ?? '')?.variants ?? [];
  const v = variant === vs[0]?.id ? '' : variant;
  const next = { ...s, components: s.components.map((c) => (c.id === id ? { ...c, variant: v } : c)) };
  return { ...next, connections: fitConnections(next, new Set([id])) };
}

/** Lines of changed components: automatic route again; lines on ports that no longer exist are removed. */
export function fitConnections(s: Schema, ids: Set<string>): Connection[] {
  const has = (cid: string, pid: string) => {
    const c = s.components.find((x) => x.id === cid);
    return !c || symbolFor(c).ports.some((p) => p.id === pid);
  };
  return s.connections
    .filter((c) => has(c.from[0], c.from[1]) && has(c.to[0], c.to[1]))
    .map((c) => ((ids.has(c.from[0]) || ids.has(c.to[0])) && c.waypoints.length ? { ...c, waypoints: [] } : c));
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

export function addComponentAt(s: Schema, type: string, pos: Vec, variant = ''): { schema: Schema; id: string } {
  const def = symbolVariant(type, variant);
  const id = nextId(s, def.prefix);
  const c: Component = {
    id,
    type,
    ...(variant ? { variant } : {}),
    label: type === 'junction' ? '' : id,
    props: {},
    pos: snapVec(pos, s.sheet.grid),
    rot: 0,
    flip: false,
    pinned: true,
  };
  return { schema: { ...s, components: [...s.components, c] }, id };
}
