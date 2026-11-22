// SPDX-License-Identifier: AGPL-3.0-or-later
// Placement maths: symbol-local mm → sheet mm. pos = symbol centre; flip mirrors on the local vertical axis
// before the clockwise rotation.
import type { Component, Dir, PortDef, Rotation, Schema, SymbolDef, Vec } from './types.ts';
import { symbolFor } from '../symbols/library.ts';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DIRS: Dir[] = ['N', 'E', 'S', 'W'];

export function rotateDir(d: Dir, rot: Rotation, flip: boolean): Dir {
  let dir = d;
  if (flip) dir = dir === 'E' ? 'W' : dir === 'W' ? 'E' : dir;
  return DIRS[(DIRS.indexOf(dir) + rot / 90) % 4]!;
}

export const DIR_VEC: Record<Dir, Vec> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };

export function localToSheet(def: SymbolDef, c: Pick<Component, 'pos' | 'rot' | 'flip'>, p: Vec): Vec {
  let x = p[0] - def.size[0] / 2;
  const y = p[1] - def.size[1] / 2;
  if (c.flip) x = -x;
  const [cx, cy] = c.pos ?? [0, 0];
  switch (c.rot) {
    case 90:
      return [cx - y, cy + x];
    case 180:
      return [cx - x, cy - y];
    case 270:
      return [cx + y, cy - x];
    default:
      return [cx + x, cy + y];
  }
}

/** SVG transform that maps symbol-local coordinates onto the sheet. */
export function symbolTransform(def: SymbolDef, c: Component): string {
  const [cx, cy] = c.pos ?? [0, 0];
  const parts = [`translate(${r(cx)} ${r(cy)})`];
  if (c.rot) parts.push(`rotate(${c.rot})`);
  if (c.flip) parts.push('scale(-1 1)');
  parts.push(`translate(${r(-def.size[0] / 2)} ${r(-def.size[1] / 2)})`);
  return parts.join(' ');
}

export function r(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export interface PortPlace {
  def: PortDef;
  at: Vec;
  dir: Dir;
}

export function portPlace(c: Component, portId: string): PortPlace | undefined {
  const def = symbolFor(c);
  const p = def.ports.find((x) => x.id === portId);
  if (!p) return undefined;
  return { def: p, at: localToSheet(def, c, p.at), dir: rotateDir(p.dir, c.rot, c.flip) };
}

/** Bounding box of the symbol drawing (the size box, or `bounds` for drawings beyond it), in sheet mm. */
export function componentBox(c: Component): Box {
  const def = symbolFor(c);
  if (def.bounds) return localBox(def, c, def.bounds);
  const [w, h] = c.rot === 90 || c.rot === 270 ? [def.size[1], def.size[0]] : def.size;
  const [cx, cy] = c.pos ?? [0, 0];
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** The size box alone (ports sit on its edge), in sheet mm. */
export function sizeBox(c: Component): Box {
  const def = symbolFor(c);
  return localBox(def, c, [0, 0, def.size[0], def.size[1]]);
}

function localBox(def: SymbolDef, c: Component, [x, y, w, h]: [number, number, number, number]): Box {
  const a = localToSheet(def, c, [x, y]),
    b = localToSheet(def, c, [x + w, y + h]);
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
}

/** Box that routed lines must avoid (symbol obstacle or the whole box). */
export function obstacleBox(c: Component): Box {
  const def = symbolFor(c);
  if (!def.obstacle) return componentBox(c);
  return localBox(def, c, def.obstacle);
}

export function isBackground(c: Component): boolean {
  return !!symbolFor(c).background;
}

/** Flow pairs of a component's symbol. */
export function flowPairs(c: Pick<Component, 'type' | 'variant'>): [string, string][] {
  const def = symbolFor(c);
  if (def.flow) return def.flow;
  const ids = def.ports.map((p) => p.id);
  return ids.includes('in') && ids.includes('out') ? [['in', 'out']] : [];
}

export function boxesOverlap(a: Box, b: Box, gap = 0): boolean {
  return a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function snap(n: number, grid: number): number {
  return Math.round(n / grid) * grid;
}

export function snapVec(v: Vec, grid: number): Vec {
  return [r(snap(v[0], grid)), r(snap(v[1], grid))];
}

export function componentById(s: Schema, id: string): Component | undefined {
  return s.components.find((c) => c.id === id);
}
