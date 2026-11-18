// SPDX-License-Identifier: AGPL-3.0-or-later
// Orthogonal connection routing on the sheet grid: A* with bend, crossing and overlap costs, detours around
// symbols. Manual waypoints win: a connection with waypoints is drawn through them as given.
import type { Connection, Dir, Schema, Vec } from '../model/types.ts';
import { DIR_VEC, isBackground, obstacleBox, portPlace, r, type Box } from '../model/geometry.ts';
import { paperSize } from '../model/sheet.ts';

export type Route = Vec[];

const OPP: Record<Dir, Dir> = { N: 'S', S: 'N', E: 'W', W: 'E' };
const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
const COST = { step: 1, bend: 4, cross: 3, overlap: 25, nearSymbol: 0.6 };

class Heap {
  private a: { k: number; v: number }[] = [];
  push(k: number, v: number) {
    const a = this.a;
    a.push({ k, v });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]!.k <= a[i]!.k) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): number | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0]!.v;
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          rr = l + 1;
        let m = i;
        if (l < a.length && a[l]!.k < a[m]!.k) m = l;
        if (rr < a.length && a[rr]!.k < a[m]!.k) m = rr;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

interface Grid {
  g: number;
  nx: number;
  ny: number;
  blocked: Uint8Array;
  near: Uint8Array;
  /** Occupancy by routed lines: bit 1 = horizontal, bit 2 = vertical. */
  used: Uint8Array;
}

function makeGrid(s: Schema, boxes: Box[]): Grid {
  const g = s.sheet.grid;
  const [W, H] = paperSize(s.sheet);
  const nx = Math.floor(W / g) + 1,
    ny = Math.floor(H / g) + 1;
  const blocked = new Uint8Array(nx * ny),
    near = new Uint8Array(nx * ny);
  for (const b of boxes) {
    const m = 0.9; // a line must keep this distance from a symbol body
    for (let i = Math.ceil((b.x - m) / g); i <= Math.floor((b.x + b.w + m) / g); i++)
      for (let j = Math.ceil((b.y - m) / g); j <= Math.floor((b.y + b.h + m) / g); j++) {
        if (i < 0 || j < 0 || i >= nx || j >= ny) continue;
        const x = i * g,
          y = j * g;
        if (x > b.x - m && x < b.x + b.w + m && y > b.y - m && y < b.y + b.h + m) blocked[j * nx + i] = 1;
      }
    for (let i = Math.floor((b.x - g) / g); i <= Math.ceil((b.x + b.w + g) / g); i++)
      for (let j = Math.floor((b.y - g) / g); j <= Math.ceil((b.y + b.h + g) / g); j++)
        if (i >= 0 && j >= 0 && i < nx && j < ny) near[j * nx + i] = 1;
  }
  return { g, nx, ny, blocked, near, used: new Uint8Array(nx * ny) };
}

function cell(grid: Grid, p: Vec): [number, number] {
  return [Math.round(p[0] / grid.g), Math.round(p[1] / grid.g)];
}

/** A* from cell a (leaving in dir da) to cell b (arriving in dir db). Returns cell path or null. */
function astar(
  grid: Grid,
  a: [number, number],
  da: Dir,
  b: [number, number],
  db: Dir,
  free: Set<number>,
): [number, number][] | null {
  const { nx, ny } = grid;
  const N = nx * ny * 4;
  const gScore = new Float64Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const heap = new Heap();
  const sid = (i: number, j: number, d: number) => ((j * nx + i) << 2) | d;
  const h = (i: number, j: number) => Math.abs(i - b[0]) + Math.abs(j - b[1]);
  const start = sid(a[0], a[1], DIRS.indexOf(da));
  gScore[start] = 0;
  heap.push(h(a[0], a[1]), start);
  const goalDir = DIRS.indexOf(db);
  let best = -1;
  let iter = 0;
  while (heap.size && iter++ < 400000) {
    const s = heap.pop()!;
    const d = s & 3,
      c = s >> 2,
      i = c % nx,
      j = (c / nx) | 0;
    if (i === b[0] && j === b[1]) {
      if (d === goalDir) {
        best = s;
        break;
      }
      continue;
    }
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d + 2) % 4) continue; // no U-turn
      const [vx, vy] = DIR_VEC[DIRS[nd]!];
      const ni = i + vx,
        nj = j + vy;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny) continue;
      const nc = nj * nx + ni;
      if (grid.blocked[nc] && !free.has(nc)) continue;
      const horiz = nd === 1 || nd === 3;
      let cost = COST.step;
      if (nd !== d) cost += COST.bend;
      const u = grid.used[nc]!;
      if (u & (horiz ? 1 : 2)) cost += COST.overlap;
      else if (u & (horiz ? 2 : 1)) cost += COST.cross;
      if (grid.near[nc]) cost += COST.nearSymbol;
      const ns = (nc << 2) | nd;
      const ng = gScore[s]! + cost;
      if (ng < gScore[ns]!) {
        gScore[ns] = ng;
        prev[ns] = s;
        heap.push(ng + h(ni, nj), ns);
      }
    }
  }
  if (best < 0) return null;
  const path: [number, number][] = [];
  for (let s = best; s >= 0; s = prev[s]!) {
    const c = s >> 2;
    path.push([c % nx, (c / nx) | 0]);
    if (s === start) break;
  }
  return path.reverse();
}

export function simplify(pts: Vec[]): Vec[] {
  const out: Vec[] = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.abs(q[0] - p[0]) < 1e-6 && Math.abs(q[1] - p[1]) < 1e-6) continue;
    out.push([r(p[0]), r(p[1])]);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3) as [Vec, Vec, Vec];
      const col =
        (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(b[0] - c[0]) < 1e-6) ||
        (Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(b[1] - c[1]) < 1e-6);
      if (!col) break;
      out.splice(out.length - 2, 1);
    }
  }
  return out;
}

/** Orthogonal polyline through fixed points: an elbow is inserted where two points are not aligned. */
export function throughPoints(pts: Vec[], firstDir: Dir): Vec[] {
  const out: Vec[] = [pts[0]!];
  let horizontalFirst = firstDir === 'E' || firstDir === 'W';
  for (let k = 1; k < pts.length; k++) {
    const a = out[out.length - 1]!,
      b = pts[k]!;
    if (Math.abs(a[0] - b[0]) > 1e-6 && Math.abs(a[1] - b[1]) > 1e-6)
      out.push(horizontalFirst ? [b[0], a[1]] : [a[0], b[1]]);
    out.push(b);
    const last = out[out.length - 2]!;
    horizontalFirst = Math.abs(last[1] - b[1]) < 1e-6 ? false : true;
  }
  return simplify(out);
}

function mark(grid: Grid, pts: Vec[]) {
  for (let k = 1; k < pts.length; k++) {
    const [i0, j0] = cell(grid, pts[k - 1]!),
      [i1, j1] = cell(grid, pts[k]!);
    const horiz = j0 === j1;
    const steps = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0));
    for (let t = 0; t <= steps; t++) {
      const i = i0 + Math.sign(i1 - i0) * t,
        j = j0 + Math.sign(j1 - j0) * t;
      if (i >= 0 && j >= 0 && i < grid.nx && j < grid.ny) grid.used[j * grid.nx + i]! |= horiz ? 1 : 2;
    }
  }
}

export interface RouteResult {
  routes: Map<string, Route>;
  /** Connections that fell back to a direct elbow (no free path). */
  failed: string[];
}

export function routeAll(s: Schema): RouteResult {
  const comps = new Map(s.components.filter((c) => c.pos).map((c) => [c.id, c]));
  const boxes = [...comps.values()].filter((c) => c.type !== 'junction' && !isBackground(c)).map(obstacleBox);
  const grid = makeGrid(s, boxes);
  const routes = new Map<string, Route>();
  const failed: string[] = [];
  // Fixed connections first, so free ones avoid them.
  const ordered = [...s.connections].sort((a, b) => Number(b.waypoints.length > 0) - Number(a.waypoints.length > 0));
  for (const con of ordered) {
    const pts = routeOne(s, con, comps, grid);
    if (!pts) continue;
    if (pts.failed) failed.push(con.id);
    routes.set(con.id, pts.pts);
    mark(grid, pts.pts);
  }
  return { routes, failed };
}

function routeOne(s: Schema, con: Connection, comps: Map<string, import('../model/types.ts').Component>, grid: Grid) {
  const A = comps.get(con.from[0]),
    B = comps.get(con.to[0]);
  if (!A || !B) return null;
  const pa = portPlace(A, con.from[1]),
    pb = portPlace(B, con.to[1]);
  if (!pa || !pb) return null;
  if (con.waypoints.length) return { pts: throughPoints([pa.at, ...con.waypoints, pb.at], pa.dir), failed: false };
  const g = grid.g;
  // Straight line between facing, aligned ports.
  const [ax, ay] = pa.at,
    [bx, by] = pb.at;
  if (
    Math.abs(ay - by) < 1e-6 &&
    ((pa.dir === 'E' && pb.dir === 'W' && bx > ax) || (pa.dir === 'W' && pb.dir === 'E' && bx < ax)) &&
    lineFree(grid, pa.at, pb.at)
  )
    return { pts: [pa.at, pb.at], failed: false };
  if (
    Math.abs(ax - bx) < 1e-6 &&
    ((pa.dir === 'S' && pb.dir === 'N' && by > ay) || (pa.dir === 'N' && pb.dir === 'S' && by < ay)) &&
    lineFree(grid, pa.at, pb.at)
  )
    return { pts: [pa.at, pb.at], failed: false };
  const sa: Vec = [ax + DIR_VEC[pa.dir][0] * g, ay + DIR_VEC[pa.dir][1] * g];
  const sb: Vec = [bx + DIR_VEC[pb.dir][0] * g, by + DIR_VEC[pb.dir][1] * g];
  const ca = cell(grid, sa),
    cb = cell(grid, sb);
  const free = new Set([ca[1] * grid.nx + ca[0], cb[1] * grid.nx + cb[0]]);
  const path = astar(grid, ca, pa.dir, cb, OPP[pb.dir], free);
  if (!path) return { pts: throughPoints([pa.at, sa, sb, pb.at], pa.dir), failed: true };
  return { pts: simplify([pa.at, ...path.map(([i, j]) => [i * g, j * g] as Vec), pb.at]), failed: false };
}

function lineFree(grid: Grid, a: Vec, b: Vec): boolean {
  const [i0, j0] = cell(grid, a),
    [i1, j1] = cell(grid, b);
  const steps = Math.max(Math.abs(i1 - i0), Math.abs(j1 - j0));
  for (let t = 1; t < steps; t++) {
    const i = i0 + Math.sign(i1 - i0) * t,
      j = j0 + Math.sign(j1 - j0) * t;
    const c = j * grid.nx + i;
    if (grid.blocked[c] || grid.used[c]) return false;
  }
  return true;
}
