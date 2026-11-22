// SPDX-License-Identifier: AGPL-3.0-or-later
// Topology layout ("Aufräumen" and chain input). The flow graph is split into strands: paths through the
// symbols' flow port pairs (from → to is the flow direction). Rules:
//  - the longest strand is the main row, flowing left → right;
//  - a strand that passes through an already placed component (e.g. the b side of a WRG) is anchored there
//    and flows in the direction of that component's ports (WRG b side: right → left, above the supply row);
//  - a branch leaving a junction downwards or upwards becomes a vertical strand;
//  - single-port terminals at a row end hang below the row;
//  - fixed (pinned) components never move; strands through them are anchored to them;
//  - if the result exceeds the drawing area, gaps shrink down to the minimum; symbols never shrink.
import type { Component, Dir, Rotation, Schema, Vec } from '../model/types.ts';
import {
  DIR_VEC,
  componentBox,
  flowPairs,
  isBackground,
  portPlace,
  rotateDir,
  snap,
  unionBox,
  type Box,
} from '../model/geometry.ts';
import { drawingArea } from '../model/sheet.ts';
import { medium } from '../model/media.ts';
import { symbolFor, symbolOf } from '../symbols/library.ts';
import { DEFAULT_STYLE, type Style } from '../render/style.ts';
import { placeMissing } from './place.ts';

interface Node {
  id: string;
  inPort: string | null;
  outPort: string | null;
}

interface Strand {
  nodes: Node[];
  /** Junction (already in another strand) this branch leaves from. */
  from?: { id: string; port: string };
}

export interface LayoutOptions {
  /** Also move pinned components. */
  all?: boolean;
  /** Extra space (mm) after a component along its strand, e.g. for a sensor placed on the duct there. */
  extraAfter?: Record<string, number>;
  style?: Style;
}

export interface LayoutResult {
  schema: Schema;
  /** Gap used along strands (mm). */
  gap: number;
  /** Set when the content does not fit even with minimal gaps. */
  suggestion: string | null;
}

const FLOW_DIR: Record<Dir, Dir> = { W: 'E', E: 'W', N: 'S', S: 'N' }; // in-port facing W → flow towards E
const IS_SENSOR = (c: Component) => symbolFor(c).category === 'control' && !!symbolFor(c).obstacle;

function portIndex(s: Schema) {
  const m = new Map<string, { con: string; other: [string, string]; role: 'from' | 'to' }>();
  for (const c of s.connections) {
    m.set(`${c.from[0]}:${c.from[1]}`, { con: c.id, other: c.to, role: 'from' });
    m.set(`${c.to[0]}:${c.to[1]}`, { con: c.id, other: c.from, role: 'to' });
  }
  return m;
}

function nodesOf(c: Component, s: Schema): Node[] {
  if (c.type === 'junction') {
    return [];
  }
  const pairs = flowPairs(c);
  if (pairs.length) return pairs.map(([a, b]) => ({ id: c.id, inPort: a, outPort: b }));
  const def = symbolFor(c);
  const ports = def.ports.filter(
    (p) => p.media.some((m) => m.startsWith('air') || m.startsWith('water')) || p.media.includes('*'),
  );
  if (ports.length !== 1) return [];
  const p = ports[0]!;
  // A single port is an outlet of the flow if a connection starts there.
  const starts = s.connections.some((x) => x.from[0] === c.id && x.from[1] === p.id);
  return [starts ? { id: c.id, inPort: null, outPort: p.id } : { id: c.id, inPort: p.id, outPort: null }];
}

/** Hydraulic circuits: the line from a flow (Vorlauf) to a return (Rücklauf) medium starts a new strand. */
export const isReturn = (m: string) => m.endsWith('.return');
const isFlowMedium = (m: string) => m.endsWith('.flow');

/** Splits the flow graph into strands. */
export function strands(s: Schema): Strand[] {
  const conById = new Map(s.connections.map((c) => [c.id, c]));
  const restarts: Node[] = [];
  const idx = portIndex(s);
  const comps = new Map(s.components.map((c) => [c.id, c]));
  const nodes = s.components.flatMap((c) => nodesOf(c, s));
  const visited = new Set<string>();
  const key = (n: Node) => `${n.id}|${n.inPort}|${n.outPort}`;
  const out: Strand[] = [];
  const queue: Strand[] = [];

  const walk = (first: Node, from?: Strand['from']): Strand => {
    const st: Strand = { nodes: [], from };
    let n: Node | null = first;
    while (n && !visited.has(key(n))) {
      visited.add(key(n));
      st.nodes.push(n);
      if (!n.outPort) break;
      const link = idx.get(`${n.id}:${n.outPort}`);
      if (!link || link.role !== 'from') break;
      const [cid, pid] = link.other;
      const c = comps.get(cid);
      if (!c) break;
      const inMed = n.inPort ? conById.get(idx.get(`${n.id}:${n.inPort}`)?.con ?? '')?.medium : undefined;
      const outMed = conById.get(link.con)!.medium;
      if (isReturn(outMed) && (!inMed || !isReturn(inMed)) && c.type !== 'junction') {
        // Flow → return: the return is its own row.
        const next = nodesOf(c, s).find((x) => x.inPort === pid);
        if (next) restarts.push(next);
        break;
      }
      if (c.type === 'junction') {
        const outs = s.connections.filter((x) => x.from[0] === cid).map((x) => x.from[1]);
        const pIn = symbolOf('junction').ports.find((p) => p.id === pid)!;
        const straight =
          outs.find((o) => symbolOf('junction').ports.find((p) => p.id === o)!.dir === FLOW_DIR[pIn.dir]) ??
          outs[0] ??
          null;
        const j: Node = { id: cid, inPort: pid, outPort: straight };
        for (const o of outs)
          if (o !== straight)
            queue.push({ nodes: [{ id: cid, inPort: null, outPort: o }], from: { id: cid, port: o } });
        n = j;
        continue;
      }
      n = nodesOf(c, s).find((x) => x.inPort === pid) ?? null;
    }
    return st;
  };

  const sources = nodes.filter((n) => !n.inPort || !idx.get(`${n.id}:${n.inPort}`));
  for (const src of sources) {
    if (visited.has(key(src))) continue;
    const st = walk(src);
    if (st.nodes.length) out.push(st);
    while (queue.length) {
      const b = queue.shift()!;
      const jn = b.nodes[0]!;
      const link = idx.get(`${jn.id}:${jn.outPort}`);
      if (!link) continue;
      const c = comps.get(link.other[0]);
      const next = c ? (c.type === 'junction' ? null : nodesOf(c, s).find((x) => x.inPort === link.other[1])) : null;
      const rest = next ? walk(next, b.from) : { nodes: [] };
      out.push({ nodes: rest.nodes, from: b.from });
    }
    drain();
  }
  function drain() {
    while (restarts.length || queue.length) {
      const r = restarts.shift();
      if (r) {
        if (!visited.has(key(r))) out.push(walk(r));
        continue;
      }
      const b = queue.shift()!;
      const jn = b.nodes[0]!;
      const link = idx.get(`${jn.id}:${jn.outPort}`);
      if (!link) continue;
      const c = comps.get(link.other[0]);
      const next = c ? (c.type === 'junction' ? null : nodesOf(c, s).find((x) => x.inPort === link.other[1])) : null;
      out.push({ nodes: next ? walk(next, b.from).nodes : [], from: b.from });
    }
  }
  drain();
  // Leftover cycles (hydraulic circuits): start at a generator (return in, flow out), else anywhere.
  const medOf = (id: string, port: string | null) =>
    port ? (conById.get(idx.get(`${id}:${port}`)?.con ?? '')?.medium ?? '') : '';
  const starts = [
    ...nodes.filter((n) => isReturn(medOf(n.id, n.inPort)) && isFlowMedium(medOf(n.id, n.outPort))),
    ...nodes,
  ];
  for (const n of starts)
    if (!visited.has(key(n))) {
      out.push(walk(n));
      drain();
    }
  return out.filter((x) => x.nodes.length || x.from);
}

function orientFor(c: Component, n: Node, flow: Dir): { rot: Rotation; flip: boolean } {
  const def = symbolFor(c);
  const port = def.ports.find((p) => p.id === (n.inPort ?? n.outPort));
  if (!port) return { rot: 0, flip: false };
  // The in-port must face against the flow; an out-port only end faces along the flow.
  const outP = n.outPort ? def.ports.find((p) => p.id === n.outPort) : undefined;
  const sameSide = !!outP && outP.dir === port.dir;
  const want: Dir = n.inPort && !sameSide ? ({ E: 'W', W: 'E', N: 'S', S: 'N' } as const)[flow] : flow;
  const natural = port.dir;
  // Single-port terminals whose port is across the flow keep their orientation (they hang off the row).
  const axis = (d: Dir) => (d === 'E' || d === 'W' ? 'h' : 'v');
  if (def.ports.length === 1 && axis(natural) !== axis(want)) return { rot: 0, flip: false };
  if (natural === want) return { rot: 0, flip: false };
  if ((natural === 'W' || natural === 'E') && (want === 'W' || want === 'E')) return { rot: 0, flip: true };
  for (const rot of [90, 180, 270] as Rotation[])
    if (rotateDir(natural, rot, false) === want) return { rot, flip: false };
  return { rot: 0, flip: false };
}

function extentAlong(c: Component, flow: Dir): number {
  const b = componentBox({ ...c, pos: [0, 0] });
  return flow === 'E' || flow === 'W' ? b.w : b.h;
}

export function autoLayout(input: Schema, opts: LayoutOptions = {}): LayoutResult {
  const style = opts.style ?? DEFAULT_STYLE;
  let gap = style.layout.gap;
  let result = layoutOnce(input, gap, opts, style);
  const area = drawingArea(input.sheet);
  const fits = (s: Schema) => {
    const b = unionBox(s.components.filter((c) => c.pos && !isBackground(c)).map(componentBox));
    return !b || (b.w <= area.w - 10 && b.h <= area.h - 10);
  };
  while (!fits(result) && gap - input.sheet.grid >= style.layout.minGap) {
    gap -= input.sheet.grid;
    result = layoutOnce(input, gap, opts, style);
  }
  let suggestion: string | null = null;
  if (!fits(result)) {
    const next = { A4: 'A3', A3: 'A2', A2: 'A1', A1: 'A1' }[input.sheet.size];
    suggestion =
      next === input.sheet.size
        ? 'Inhalt passt nicht aufs Blatt: auf zwei Blätter aufteilen.'
        : `Inhalt passt nicht auf ${input.sheet.size}: Format ${next} wählen oder auf zwei Blätter aufteilen.`;
  }
  return { schema: result, gap, suggestion };
}

function layoutOnce(input: Schema, gap: number, opts: LayoutOptions, style: Style): Schema {
  const g = input.sheet.grid;
  const area = drawingArea(input.sheet);
  const movable = (c: Component) => opts.all || !c.pinned;
  // Remember which duct each sensor sits on, to put it back there.
  const sensorOn = sensorsOnDucts(input);
  const extra: Record<string, number> = { ...(opts.extraAfter ?? {}) };
  for (const [sid, conId] of sensorOn) {
    const con = input.connections.find((c) => c.id === conId)!;
    extra[con.from[0]] = Math.max(
      extra[con.from[0]] ?? 0,
      componentBox({ ...input.components.find((c) => c.id === sid)!, pos: [0, 0] }).w + gap,
    );
  }

  const comps = input.components.map((c) => ({ ...c, pos: movable(c) ? null : c.pos }) as Component);
  const byId = new Map(comps.map((c) => [c.id, c]));
  const s: Schema = { ...input, components: comps };
  const fixed = new Set(comps.filter((c) => c.pos).map((c) => c.id));
  const placedNow = new Set<string>();
  const all = strands(s).filter((st) => st.nodes.length);
  // Main strand: longest; then strands anchored to placed components, branches, the rest.
  all.sort((a, b) => b.nodes.length - a.nodes.length);
  const done = new Set<Strand>();
  /** Placed component a return strand flows into (with its outlet on the same side), e.g. a boiler. */
  const returnInto = (st: Strand): { c: Component; out: Vec } | null => {
    const last = st.nodes[st.nodes.length - 1];
    if (!last?.outPort) return null;
    const con = input.connections.find((c) => c.from[0] === last.id && c.from[1] === last.outPort);
    if (!con || !isReturn(con.medium)) return null;
    const c = byId.get(con.to[0]);
    if (!c?.pos || c.type === 'junction') return null;
    const pair = flowPairs(c).find(([i]) => i === con.to[1]);
    const out = pair && portPlace(c, pair[1]);
    return out ? { c, out: out.at } : null;
  };
  const returnish = (st: Strand) =>
    st.nodes.some((n) => input.connections.some((c) => c.to[0] === n.id && isReturn(c.medium)));
  const extractish = (st: Strand) =>
    st.nodes.some((n) =>
      input.connections.some(
        (c) => (c.from[0] === n.id || c.to[0] === n.id) && ['air.extract', 'air.exhaust'].includes(c.medium),
      ),
    );

  // Junction girth: space a junction needs along its strand for the branches leaving it sideways.
  const branchGirth = (jid: string) => {
    let w = 0;
    for (const st of all)
      if (st.from?.id === jid)
        for (const n of st.nodes) w = Math.max(w, componentBox({ ...byId.get(n.id)!, pos: [0, 0], rot: 90 }).w);
    return w ? w + 24 : 0;
  };

  let rowsAbove = 0,
    rowsBelow = 0;
  const mainY = snap(area.y + area.h * 0.6, g);

  const horizontal = (d: Dir) => d === 'E' || d === 'W';

  /** Places a strand along a row. anchorPos: point on the row line at the anchor's along-position. */
  const placeStrand = (st: Strand, anchorIdx: number, anchorPos: Vec, flow: Dir) => {
    const v = DIR_VEC[flow];
    const H = horizontal(flow);
    const rowCoord = H ? anchorPos[1] : anchorPos[0];
    const along = (c: Component) => extentAlong(c, flow);
    const isHanging = (n: Node) => {
      const c = byId.get(n.id)!;
      const def = symbolFor(c);
      if (def.ports.length !== 1) return false;
      return horizontal(def.ports[0]!.dir) !== H;
    };
    const set = (c: Component, n: Node, alongPos: number) => {
      if (fixed.has(c.id) || placedNow.has(c.id)) return;
      const o = orientFor(c, n, flow);
      c.rot = o.rot;
      c.flip = o.flip;
      // Reversed horizontal strands: rot 180 instead of a mirror when that turns connected side ports towards their partner.
      if (flow === 'W' && o.flip) preferRot180(c, s, byId, rowCoord);
      let center: Vec;
      if (isHanging(n)) {
        // Single-port terminal: hangs off the row end, below a left → right row, above a right → left row
        // (outside the space between supply and extract), right of a downward column, left of an upward one.
        const side: Dir = ({ E: 'S', W: 'N', S: 'E', N: 'W' } as const)[flow];
        const want = ({ S: 'N', N: 'S', E: 'W', W: 'E' } as const)[side];
        const natural = symbolFor(c).ports[0]!.dir;
        c.flip = false;
        c.rot = ([0, 90, 180, 270] as Rotation[]).find((r) => rotateDir(natural, r, false) === want) ?? 0;
        // Left ↔ right only: mirror instead of turning upside down (e.g. a tap keeps its spout down).
        if (c.rot === 180 && horizontal(natural)) {
          c.rot = 0;
          c.flip = true;
        }
        const b = componentBox({ ...c, pos: [0, 0] });
        const d = gap + (H ? b.h / 2 : b.w / 2);
        const sv = DIR_VEC[side];
        center = H ? [alongPos, rowCoord + sv[1] * d] : [rowCoord + sv[0] * d, alongPos];
      } else {
        // The flow port sits on the row line (the outlet for generators with both ports on one side).
        const outSide = n.outPort && symbolFor(c).ports.find((p) => p.id === n.outPort)?.dir;
        const inSide = n.inPort && symbolFor(c).ports.find((p) => p.id === n.inPort)?.dir;
        const pid = inSide && inSide === outSide ? n.outPort : (n.inPort ?? n.outPort);
        const p = c.type === 'junction' || !pid ? null : portPlace({ ...c, pos: [0, 0] }, pid);
        const off = p ? (H ? p.at[1] : p.at[0]) : 0;
        center = H ? [alongPos, rowCoord - off] : [rowCoord - off, alongPos];
      }
      c.pos = [snap(center[0], g), snap(center[1], g)];
      placedNow.add(c.id);
    };
    const half = (n: Node) => {
      const c = byId.get(n.id)!;
      if (c.type === 'junction') return n.inPort ? branchGirth(c.id) / 2 : 0;
      if (isHanging(n)) return componentBox({ ...c, pos: [0, 0] }).w / 2;
      return along(c) / 2;
    };
    const alongOf = (p: Vec) => (H ? p[0] : p[1]);
    const sign = H ? v[0] : v[1];
    const anchor = st.nodes[anchorIdx]!;
    const anchorAlong = alongOf(anchorPos);
    set(byId.get(anchor.id)!, anchor, anchorAlong);
    const known = (c: Component) => c.pos && (fixed.has(c.id) || placedNow.has(c.id));
    let cur = anchorAlong;
    for (let k = anchorIdx + 1; k < st.nodes.length; k++) {
      const prev = st.nodes[k - 1]!,
        n = st.nodes[k]!;
      const c = byId.get(n.id)!;
      cur += sign * (half(prev) + gap + (extra[prev.id] ?? 0) + half(n));
      if (known(c)) {
        cur = alongOf(c.pos!);
        continue;
      }
      set(c, n, cur);
    }
    cur = anchorAlong;
    for (let k = anchorIdx - 1; k >= 0; k--) {
      const next = st.nodes[k + 1]!,
        n = st.nodes[k]!;
      const c = byId.get(n.id)!;
      cur -= sign * (half(next) + gap + (extra[n.id] ?? 0) + half(n));
      if (known(c)) {
        cur = alongOf(c.pos!);
        continue;
      }
      set(c, n, cur);
    }
  };

  const flowAt = (c: Component, n: Node): Dir | null => {
    const pid = n.inPort ?? n.outPort;
    if (!pid) return null;
    const p = portPlace(c, pid);
    if (!p) return null;
    return n.inPort ? FLOW_DIR[p.dir] : p.dir;
  };

  let guard = 0;
  while (done.size < all.length && guard++ < 1000) {
    // 1. A strand through an already placed component.
    let progressed = false;
    for (const st of all) {
      if (done.has(st)) continue;
      const k = st.nodes.findIndex((n) => byId.get(n.id)!.pos && byId.get(n.id)!.type !== 'junction');
      if (k >= 0) {
        const c = byId.get(st.nodes[k]!.id)!;
        const flow = flowAt(c, st.nodes[k]!) ?? 'E';
        // Row through the anchor's in (or out) port.
        const pid = st.nodes[k]!.inPort ?? st.nodes[k]!.outPort!;
        const p = portPlace(c, pid)!;
        const anchor: Vec = flow === 'E' || flow === 'W' ? [c.pos![0], p.at[1]] : [p.at[0], c.pos![1]];
        placeStrand(st, k, anchor, flow);
        done.add(st);
        progressed = true;
        break;
      }
      // 2. A branch from a placed junction.
      if (st.from && byId.get(st.from.id)?.pos) {
        const j = byId.get(st.from.id)!;
        const flow = symbolOf('junction').ports.find((p) => p.id === st.from!.port)!.dir;
        const nodes = [{ id: j.id, inPort: null, outPort: st.from.port }, ...st.nodes];
        placeStrand({ nodes, from: st.from }, 0, j.pos!, flow);
        done.add(st);
        progressed = true;
        break;
      }
      // 2b. A hydraulic return ending at a placed generator: the row ends right of it, below the flow row.
      const gen = returnInto(st);
      if (gen) {
        const last = st.nodes[st.nodes.length - 1]!;
        const lc = byId.get(last.id)!;
        const gb = componentBox(gen.c);
        const half = lc.type === 'junction' ? branchGirth(lc.id) / 2 : extentAlong(lc, 'W') / 2;
        const y = Math.max(gb.y + gb.h + gap, gen.out[1] + style.layout.rowGap * 0.6);
        placeStrand(st, st.nodes.length - 1, [snap(gb.x + gb.w + gap + half, g), snap(y, g)], 'W');
        done.add(st);
        progressed = true;
        break;
      }
      // 3. A strand linked to a placed component by a side connection (e.g. KVS water pipes): align above/below it.
      const link = sideLink(st, s, byId);
      if (link) {
        const { k, partner } = link;
        const up = extractish(st);
        const ret = !up && returnish(st);
        const y = up ? partner.pos![1] - style.layout.rowGap : partner.pos![1] + style.layout.rowGap * (ret ? 0.5 : 1);
        placeStrand(st, k, [partner.pos![0], y], up || ret ? 'W' : 'E');
        done.add(st);
        progressed = true;
        break;
      }
    }
    if (progressed) continue;
    // 4. A free strand: main row first, then rows above (extract) or below.
    const st = all.find((x) => !done.has(x))!;
    const first = done.size === 0;
    const up = !first && extractish(st);
    if (!first && returnish(st)) {
      const b = unionBox(comps.filter((c) => c.pos && !isBackground(c)).map(componentBox));
      placeStrand(
        st,
        0,
        [b ? b.x + b.w - 5 : area.x + area.w - 30, mainY + style.layout.rowGap * 0.5 * ++rowsBelow],
        'W',
      );
      done.add(st);
      continue;
    }
    const y = first
      ? mainY
      : up
        ? mainY - style.layout.rowGap * ++rowsAbove
        : mainY + style.layout.rowGap * ++rowsBelow;
    if (up) {
      // Extract rows start at the right end of what is placed so far.
      const b = unionBox(comps.filter((c) => c.pos && !isBackground(c)).map(componentBox));
      placeStrand(st, 0, [b ? b.x + b.w - 5 : area.x + area.w - 30, y], 'W');
    } else placeStrand(st, 0, [area.x + 25, y], 'E');
    done.add(st);
  }

  // Terminals hanging at the right-hand row ends line up vertically (e.g. supply and extract terminal of one room).
  const rightEnds: Component[] = [];
  for (const st of all) {
    const flowOf = (n: Node) => {
      const c = byId.get(n.id)!;
      return c.pos ? c : null;
    };
    const last = st.nodes[st.nodes.length - 1],
      first = st.nodes[0];
    for (const n of [last, first]) {
      if (!n) continue;
      const c = flowOf(n);
      if (!c || !placedNow.has(c.id) || symbolFor(c).ports.length !== 1) continue;
      const p = portPlace(c, symbolFor(c).ports[0]!.id)!;
      if (p.dir === 'N' || p.dir === 'S') {
        // Only terminals right of their neighbour (right-hand end of a row).
        const con = input.connections.find((x) => x.from[0] === c.id || x.to[0] === c.id);
        const other = con && byId.get(con.from[0] === c.id ? con.to[0] : con.from[0]);
        if (other?.pos && other.pos[0] < c.pos![0]) rightEnds.push(c);
      }
    }
  }
  if (rightEnds.length > 1) {
    const x = Math.max(...rightEnds.map((c) => c.pos![0]));
    for (const c of rightEnds) c.pos = [x, c.pos![1]];
  }

  // Sensors back onto their ducts: centred in the gap they reserved, stem on the duct line.
  const routesBefore = sensorOn;
  for (const [sid, conId] of routesBefore) {
    const sc = byId.get(sid)!;
    if (!movable(sc)) continue;
    const con = input.connections.find((c) => c.id === conId)!;
    const a = byId.get(con.from[0]),
      b = byId.get(con.to[0]);
    if (!a?.pos || !b?.pos) continue;
    const pa = portPlace(a, con.from[1])!,
      pb = portPlace(b, con.to[1])!;
    const def = symbolFor(sc);
    sc.rot = 0;
    sc.flip = false;
    sc.pos = [snap((pa.at[0] + pb.at[0]) / 2, g), snap(pa.at[1] - def.size[1] / 2, g)];
  }

  // Centre the movable content when nothing is fixed.
  if (!fixed.size) centre(comps, area, g);
  return placeMissing({ ...s, components: comps }, style);
}

function preferRot180(c: Component, s: Schema, byId: Map<string, Component>, rowY: number) {
  const def = symbolFor(c);
  const flowPorts = new Set(flowPairs(c).flat());
  for (const p of def.ports) {
    if (flowPorts.has(p.id)) continue;
    const con = s.connections.find(
      (x) => (x.from[0] === c.id && x.from[1] === p.id) || (x.to[0] === c.id && x.to[1] === p.id),
    );
    if (!con) continue;
    const other = byId.get(con.from[0] === c.id ? con.to[0] : con.from[0]);
    if (!other?.pos) continue;
    const below = other.pos[1] > rowY;
    if (below && p.dir === 'N') {
      c.rot = 180;
      c.flip = false;
      return;
    }
  }
}

function sideLink(st: Strand, s: Schema, byId: Map<string, Component>): { k: number; partner: Component } | null {
  for (let k = 0; k < st.nodes.length; k++) {
    const id = st.nodes[k]!.id;
    const flowPorts = new Set(flowPairs(byId.get(id)!).flat());
    for (const con of s.connections) {
      const mine = con.from[0] === id ? con.from : con.to[0] === id ? con.to : null;
      if (!mine || flowPorts.has(mine[1])) continue;
      const other = byId.get(con.from[0] === id ? con.to[0] : con.from[0]);
      if (other?.pos) return { k, partner: other };
    }
  }
  return null;
}

/** Sensors (control symbols with a stem) that sit on a straight duct between two components. */
function sensorsOnDucts(s: Schema): Map<string, string> {
  const res = new Map<string, string>();
  const byId = new Map(s.components.map((c) => [c.id, c]));
  for (const sc of s.components) {
    if (!IS_SENSOR(sc) || !sc.pos) continue;
    const def = symbolFor(sc);
    const tip: Vec = [sc.pos[0], sc.pos[1] + def.size[1] / 2];
    for (const con of s.connections) {
      if (medium(con.medium)?.kind === 'signal') continue;
      const a = byId.get(con.from[0]),
        b = byId.get(con.to[0]);
      if (!a?.pos || !b?.pos) continue;
      const pa = portPlace(a, con.from[1]),
        pb = portPlace(b, con.to[1]);
      if (!pa || !pb) continue;
      if (
        Math.abs(pa.at[1] - pb.at[1]) < 1e-6 &&
        Math.abs(pa.at[1] - tip[1]) < 1e-6 &&
        tip[0] > Math.min(pa.at[0], pb.at[0]) &&
        tip[0] < Math.max(pa.at[0], pb.at[0])
      ) {
        res.set(sc.id, con.id);
        break;
      }
    }
  }
  return res;
}

function centre(comps: Component[], area: Box, g: number) {
  const b = unionBox(comps.filter((c) => c.pos && !isBackground(c)).map(componentBox));
  if (!b) return;
  const dx = snap(area.x + (area.w - b.w) / 2 - b.x, g),
    dy = snap(area.y + (area.h - b.h) / 2 - b.y, g);
  for (const c of comps) if (c.pos) c.pos = [c.pos[0] + dx, c.pos[1] + dy];
}
