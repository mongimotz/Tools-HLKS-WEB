// SPDX-License-Identifier: AGPL-3.0-or-later
// Pipeline of the PDF → DXF tool: IR entities (pt) → cleaned IR entities → DXF entities in output units.
// No DOM. Step order (docs/dev/pdf-to-dxf/DECISIONS.md, D9):
//   select + layers → curves (arc fit) → clip → dedupe → hatch → join → dashes → area → layer list → filter
// then toDxfEntities() transforms to output units.

import {
  EPS,
  flattenBezier,
  flattenArc,
  bezierPoint,
  clipSegmentRect,
  segmentCrossT,
  pointInRings,
  polylineLength,
  sweepCcw,
  angleDeg,
  normAngle,
  SpatialHash,
} from './geometry.js';
import { withAttrs, line as lineEntity, polyline as polyEntity, arc as arcEntity, circle as circleEntity, countSegments } from './ir.js';
import { lineweight } from './dxf.js';

export const PT_MM = 25.4 / 72; // mm per pt
const MM_PT = 72 / 25.4;

/** Cap height of a typical sans font relative to the font size: DXF text height means the capital height. */
export const TEXT_HEIGHT_RATIO = 0.7;

export const HATCH_LAYER = 'PDF_SCHRAFFUR';
export const TEXT_LAYER = 'PDF_TEXT';

/** Hatch heuristic: at least this many parallel, equally spaced short lines. */
export const HATCH_MIN_LINES = 8;
const HATCH_MAX_LEN_MM = 100; // paper
const HATCH_MAX_GAP_MM = 10; // paper

const UNIT_MM = { mm: 1, cm: 10, m: 1000 };

// =================================================================================================
// Transform (phase 4)
// =================================================================================================

/**
 * Transform from IR (pt, page) to the DXF (output units, real size).
 * options: { scale: M (1:M), unit: 'mm' | 'cm' | 'm', origin: 'page' | 'center', bounds: [x0 y0 x1 y1] (pt, for 'center'),
 *            offset: [dx, dy] (pt, e.g. pages side by side) }
 * Returns { k, ox, oy, unit, scale }: out = (p − (ox, oy)) · k.
 */
export function makeTransform({ scale = 100, unit = 'mm', origin = 'page', bounds = null, offset = [0, 0] } = {}) {
  const k = (PT_MM * scale) / (UNIT_MM[unit] ?? 1);
  let ox = 0;
  let oy = 0;
  if (origin === 'center' && bounds) {
    ox = (bounds[0] + bounds[2]) / 2;
    oy = (bounds[1] + bounds[3]) / 2;
  }
  return { k, ox: ox - offset[0], oy: oy - offset[1], unit: UNIT_MM[unit] ? unit : 'mm', scale };
}

/** Plan scale 1:M from two points (pt) and their real distance in mm. Null if the points coincide. */
export function calibrate(x0, y0, x1, y1, realMm) {
  const paperMm = Math.hypot(x1 - x0, y1 - y0) * PT_MM;
  if (!(paperMm > EPS) || !(realMm > 0)) return null;
  return realMm / paperMm;
}

/** Text for a scale: 1:100, 1:98.7 (one decimal unless whole). */
export function scaleLabel(m) {
  if (!Number.isFinite(m) || m <= 0) return '–';
  const r = Math.round(m * 10) / 10;
  return `1:${Number.isInteger(r) ? r : r.toFixed(1)}`;
}

/**
 * Nearest end point (line, polyline vertex, arc end, cubic end) within `radius` pt of (x, y), or null.
 * Used by the calibration to snap clicks onto line ends.
 */
export function snapPoint(entities, x, y, radius) {
  let best = null;
  let bestD = radius;
  const test = (px, py) => {
    const d = Math.hypot(px - x, py - y);
    if (d <= bestD) {
      bestD = d;
      best = [px, py];
    }
  };
  for (const e of entities) {
    if (e.kind === 'line' || e.kind === 'polyline') for (let i = 0; i < e.pts.length; i += 2) test(e.pts[i], e.pts[i + 1]);
    else if (e.kind === 'cubic') {
      test(e.pts[0], e.pts[1]);
      test(e.pts[6], e.pts[7]);
    } else if (e.kind === 'arc') {
      const a0 = (e.start * Math.PI) / 180;
      const a1 = (e.end * Math.PI) / 180;
      test(e.cx + e.r * Math.cos(a0), e.cy + e.r * Math.sin(a0));
      test(e.cx + e.r * Math.cos(a1), e.cy + e.r * Math.sin(a1));
    }
  }
  return best;
}

// =================================================================================================
// 1. Selection and layers
// =================================================================================================

const rgbName = (c) => `RGB_${c[0]}-${c[1]}-${c[2]}`;
export const rgbHex = (c) => c.map((v) => v.toString(16).padStart(2, '0')).join('');
const isWhite = (c) => c[0] >= 250 && c[1] >= 250 && c[2] >= 250;

/** Output layer name of an entity. PDF layers win; otherwise the layer mode decides. */
export function layerNameFor(e, mode) {
  const a = e.a;
  if (a.ocg) return a.ocg;
  if (mode === 'single') return 'PDF';
  if (e.kind === 'text' || a.source === 'text') return TEXT_LAYER;
  const lw = (lineweight(a.lineWidthPt * PT_MM) / 100).toFixed(2);
  if (a.source === 'scan') return mode === 'color' ? 'SCAN' : `SCAN_${lw}`;
  const fill = a.source === 'fill';
  if (mode === 'color') return `PDF_${rgbName(a.rgb)}`;
  if (mode === 'width') return fill ? 'PDF_FILL' : `PDF_${lw}`;
  return fill ? `PDF_${rgbName(a.rgb)}_FILL` : `PDF_${rgbName(a.rgb)}_${lw}`;
}

/** Drop what the settings exclude and set the output layer of every entity. */
export function selectAndAssign(entities, s) {
  const out = [];
  const cache = new Map();
  for (const e of entities) {
    const a = e.a;
    if (e.kind === 'text' && s.text === 'omit') continue;
    if (a.source === 'text' && e.kind !== 'text' && s.text === 'omit') continue;
    if (a.source === 'fill') {
      if (s.fills === 'ignore') continue;
      if (isWhite(a.rgb)) continue; // white fills mask other content; their outline is noise
    }
    const name = layerNameFor(e, s.layerMode);
    let na = cache.get(a);
    if (!na || na.layer !== name) {
      na = withAttrs(a, { layer: name });
      cache.set(a, na);
    }
    out.push({ ...e, a: na });
  }
  return out;
}

// =================================================================================================
// 2. Curves: arc fit, flattening
// =================================================================================================

/** Circle through three points, or null. */
function circle3(x1, y1, x2, y2, x3, y3) {
  const d = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
  if (Math.abs(d) < 1e-12) return null;
  const s1 = x1 * x1 + y1 * y1;
  const s2 = x2 * x2 + y2 * y2;
  const s3 = x3 * x3 + y3 * y3;
  const cx = (s1 * (y2 - y3) + s2 * (y3 - y1) + s3 * (y1 - y2)) / d;
  const cy = (s1 * (x3 - x2) + s2 * (x1 - x3) + s3 * (x2 - x1)) / d;
  return { cx, cy, r: Math.hypot(x1 - cx, y1 - cy) };
}

/**
 * Fit one cubic as a circular arc. The standard Bézier arc has its ends and its midpoint exactly on the
 * circle, so the circle through these three points is checked against 16 samples.
 * Returns { cx, cy, r, a0, a1, ccw } (a0 at the cubic's start, a1 at its end) or null.
 */
export function fitArc(b, tol) {
  const m = bezierPoint(b, 0.5);
  const c = circle3(b[0], b[1], m[0], m[1], b[6], b[7]);
  if (!c || c.r > 1e5) return null;
  const allowed = Math.max(tol, 3e-4 * c.r); // a 90° Bézier arc is off by up to 2.7e-4 · r
  for (let i = 1; i < 16; i++) {
    const [x, y] = bezierPoint(b, i / 16);
    if (Math.abs(Math.hypot(x - c.cx, y - c.cy) - c.r) > allowed) return null;
  }
  // counter-clockwise when the midpoint lies right of the chord start → end; at most 180° per cubic
  const ccw = (m[0] - b[0]) * (b[7] - b[1]) - (m[1] - b[1]) * (b[6] - b[0]) > 0;
  const a0 = angleDeg(c.cx, c.cy, b[0], b[1]);
  const a1 = angleDeg(c.cx, c.cy, b[6], b[7]);
  const sweep = ccw ? sweepCcw(a0, a1) : sweepCcw(a1, a0);
  if (sweep > 181) return null;
  return { ...c, a0, a1, ccw, sweep };
}

/** Is the cubic straight within tol? */
function cubicIsStraight(b, tol) {
  const dx = b[6] - b[0];
  const dy = b[7] - b[1];
  const len = Math.hypot(dx, dy);
  if (len < EPS) return false;
  const d1 = Math.abs((b[2] - b[0]) * dy - (b[3] - b[1]) * dx) / len;
  const d2 = Math.abs((b[4] - b[0]) * dy - (b[5] - b[1]) * dx) / len;
  // control points must also lie between the ends (no overshoot)
  const t1 = ((b[2] - b[0]) * dx + (b[3] - b[1]) * dy) / (len * len);
  const t2 = ((b[4] - b[0]) * dx + (b[5] - b[1]) * dy) / (len * len);
  return d1 <= tol && d2 <= tol && t1 >= -0.01 && t1 <= 1.01 && t2 >= -0.01 && t2 <= 1.01;
}

/**
 * Cubics → arcs and circles (when they fit), lines (when straight), polylines or kept cubics (splines).
 * Consecutive cubics of one subpath (same chain) on the same circle merge into one arc; 360° gives a circle.
 */
export function fitCurves(entities, { arcs = true, curves = 'polyline', arcTol, flattenTol }) {
  const out = [];
  let run = null; // current merged arc { cx, cy, r, start, end, a, chain, sweep }
  const flushRun = () => {
    if (!run) return;
    if (run.sweep >= 359.5) out.push(circleEntity(run.cx, run.cy, run.r, run.a));
    else out.push(arcEntity(run.cx, run.cy, run.r, normAngle(run.start), normAngle(run.end), run.a));
    run = null;
  };
  const curveFallback = (e) => {
    if (curves === 'spline') out.push(e);
    else out.push(polyEntity(flattenBezier(e.pts, flattenTol, [e.pts[0], e.pts[1]]), false, e.a));
  };
  for (const e of entities) {
    if (e.kind !== 'cubic') {
      flushRun();
      out.push(e);
      continue;
    }
    const b = e.pts;
    if (cubicIsStraight(b, flattenTol)) {
      flushRun();
      out.push(lineEntity(b[0], b[1], b[6], b[7], e.a));
      continue;
    }
    const f = arcs ? fitArc(b, arcTol) : null;
    if (!f) {
      flushRun();
      curveFallback(e);
      continue;
    }
    // counter-clockwise arc from start to end
    const start = f.ccw ? f.a0 : f.a1;
    const end = f.ccw ? f.a1 : f.a0;
    const same =
      run &&
      run.chain === e.chain &&
      run.a === e.a &&
      run.ccw === f.ccw &&
      Math.hypot(run.cx - f.cx, run.cy - f.cy) <= Math.max(arcTol, 1e-3 * f.r) &&
      Math.abs(run.r - f.r) <= Math.max(arcTol, 1e-3 * f.r) &&
      // continuous: this piece starts where the run ended (in drawing direction)
      Math.hypot(run.lastX - b[0], run.lastY - b[1]) <= Math.max(arcTol, 1e-6 * f.r);
    if (same) {
      if (f.ccw) run.end = end;
      else run.start = start;
      run.sweep += f.sweep;
      run.lastX = b[6];
      run.lastY = b[7];
      continue;
    }
    flushRun();
    run = { cx: f.cx, cy: f.cy, r: f.r, start, end, sweep: f.sweep, ccw: f.ccw, a: e.a, chain: e.chain, lastX: b[6], lastY: b[7] };
  }
  flushRun();
  return out;
}

// =================================================================================================
// 3. Clipping
// =================================================================================================

function bboxOf(e) {
  if (e.pts) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    const p = e.pts;
    for (let i = 0; i < p.length; i += 2) {
      if (p[i] < x0) x0 = p[i];
      if (p[i] > x1) x1 = p[i];
      if (p[i + 1] < y0) y0 = p[i + 1];
      if (p[i + 1] > y1) y1 = p[i + 1];
    }
    return [x0, y0, x1, y1];
  }
  if (e.kind === 'arc' || e.kind === 'circle') return [e.cx - e.r, e.cy - e.r, e.cx + e.r, e.cy + e.r];
  return [e.x, e.y, e.x, e.y];
}

const inside = (b, r, tol = 1e-6) => b[0] >= r[0] - tol && b[1] >= r[1] - tol && b[2] <= r[2] + tol && b[3] <= r[3] + tol;
const disjoint = (b, r) => b[2] < r[0] || b[0] > r[2] || b[3] < r[1] || b[1] > r[3];

/** Clip region from page.clips: { rect } or { rings, evenOdd, box }. */
function clipRegion(c) {
  if (c.rect) return { rect: c.rect, box: c.rect };
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of c.rings)
    for (let i = 0; i < r.length; i += 2) {
      box[0] = Math.min(box[0], r[i]);
      box[1] = Math.min(box[1], r[i + 1]);
      box[2] = Math.max(box[2], r[i]);
      box[3] = Math.max(box[3], r[i + 1]);
    }
  return { rings: c.rings, evenOdd: !!c.evenOdd, box };
}

/** Parameter ranges [[t0, t1], …] of segment a–b inside the region. */
function segmentInside(ax, ay, bx, by, reg) {
  if (reg.rect) {
    const t = clipSegmentRect(ax, ay, bx, by, reg.rect);
    return t ? [t] : [];
  }
  const ts = [0, 1];
  for (const ring of reg.rings) {
    const n = ring.length;
    for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
      const t = segmentCrossT(ax, ay, bx, by, ring[j], ring[j + 1], ring[i], ring[i + 1]);
      if (t != null && t > 0 && t < 1) ts.push(t);
    }
  }
  ts.sort((p, q) => p - q);
  const out = [];
  for (let k = 0; k + 1 < ts.length; k++) {
    const t0 = ts[k];
    const t1 = ts[k + 1];
    if (t1 - t0 < 1e-9) continue;
    const tm = (t0 + t1) / 2;
    if (pointInRings(ax + (bx - ax) * tm, ay + (by - ay) * tm, reg.rings, reg.evenOdd)) {
      if (out.length && Math.abs(out.at(-1)[1] - t0) < 1e-9) out.at(-1)[1] = t1;
      else out.push([t0, t1]);
    }
  }
  return out;
}

/** Clip a point chain (flat array) to a region; returns open chains (flat arrays). */
function clipChain(pts, closed, reg) {
  const n = pts.length / 2;
  const segs = closed ? n : n - 1;
  const chains = [];
  let cur = null;
  let firstStartsAtZero = false;
  let lastEndsAtOne = false;
  for (let s = 0; s < segs; s++) {
    const i = s * 2;
    const j = ((s + 1) % n) * 2;
    const ax = pts[i];
    const ay = pts[i + 1];
    const bx = pts[j];
    const by = pts[j + 1];
    const ranges = segmentInside(ax, ay, bx, by, reg);
    for (const [t0, t1] of ranges) {
      const x0 = ax + (bx - ax) * t0;
      const y0 = ay + (by - ay) * t0;
      const x1 = ax + (bx - ax) * t1;
      const y1 = ay + (by - ay) * t1;
      if (cur && t0 < 1e-9 && Math.abs(cur.at(-2) - x0) < 1e-9 && Math.abs(cur.at(-1) - y0) < 1e-9) {
        cur.push(x1, y1);
      } else {
        if (s === 0 && t0 < 1e-9) firstStartsAtZero = true;
        cur = [x0, y0, x1, y1];
        chains.push(cur);
      }
      lastEndsAtOne = s === segs - 1 && t1 > 1 - 1e-9;
      if (t1 < 1 - 1e-9) cur = null;
    }
    if (!ranges.length) cur = null;
  }
  // a closed ring that is cut: the last chain continues into the first one
  if (closed && chains.length > 1 && firstStartsAtZero && lastEndsAtOne) {
    const first = chains.shift();
    const last = chains.at(-1);
    last.push(...first.slice(2));
  }
  return chains;
}

function clipOne(e, reg, tol) {
  const b = bboxOf(e);
  if (disjoint(b, reg.box)) return [];
  if (reg.rect && inside(b, reg.rect)) return [e];
  switch (e.kind) {
    case 'text':
      return reg.rect ? [e] : pointInRings(e.x, e.y, reg.rings, reg.evenOdd) ? [e] : [];
    case 'line':
    case 'polyline': {
      const closed = e.kind === 'polyline' && e.closed;
      const chains = clipChain(e.pts, closed, reg);
      // unchanged closed ring stays closed
      if (closed && chains.length === 1 && chains[0].length === e.pts.length + 2) return [e];
      return chains.map((c) => (c.length === 4 ? lineEntity(c[0], c[1], c[2], c[3], e.a) : polyEntity(c, false, e.a)));
    }
    case 'arc':
    case 'circle':
    case 'cubic': {
      const pts =
        e.kind === 'cubic'
          ? flattenBezier(e.pts, tol, [e.pts[0], e.pts[1]])
          : e.kind === 'arc'
            ? flattenArc(e.cx, e.cy, e.r, e.start, e.end, tol)
            : flattenArc(e.cx, e.cy, e.r, 0, 360, tol);
      if (!reg.rect) {
        let all = true;
        for (let i = 0; i < pts.length && all; i += 2) all = pointInRings(pts[i], pts[i + 1], reg.rings, reg.evenOdd);
        if (all) return [e];
      }
      const closed = e.kind === 'circle';
      const chains = clipChain(closed ? pts.slice(0, -2) : pts, closed, reg);
      return chains.map((c) => polyEntity(c, false, e.a));
    }
    default:
      return [e];
  }
}

/** Apply the clip paths of the page. Clips nest: an entity is clipped by its clip and all its parents. */
export function applyClips(entities, clips, tol) {
  const chainCache = new Map();
  const chainOf = (id) => {
    let ch = chainCache.get(id);
    if (!ch) {
      ch = [];
      for (let c = clips[id]; c; c = clips[c.parent]) if (!c.none) ch.push(clipRegion(c));
      chainCache.set(id, ch);
    }
    return ch;
  };
  const out = [];
  for (const e of entities) {
    const id = e.a.clipId;
    if (!id) {
      out.push(e);
      continue;
    }
    let pieces = [e];
    for (const reg of chainOf(id)) {
      const next = [];
      for (const p of pieces) for (const q of clipOne(p, reg, tol)) next.push(q);
      pieces = next;
      if (!pieces.length) break;
    }
    for (const p of pieces) out.push(p);
  }
  return out;
}

/** Keep only what lies inside the rectangle (area selection). */
export function cropToRect(entities, rect, tol) {
  const reg = { rect, box: rect };
  const out = [];
  for (const e of entities) for (const p of clipOne(e, reg, tol)) out.push(p);
  return out;
}

// =================================================================================================
// 4.–6. Segments: dedupe, hatch, join
// =================================================================================================

/** Key of the attributes that must match for two pieces to be joined. */
const joinKey = (a) => `${a.layer}|${a.rgb}|${a.lineWidthPt}|${a.dash ?? ''}`;

/**
 * Flat segment store: xy (4 per segment), attribute index and paint order. Lines and polylines
 * (except fills kept as hatch and glyph outlines) are taken apart into segments.
 */
class Segments {
  constructor(cap) {
    this.xy = new Float64Array(cap * 4);
    this.attr = new Int32Array(cap);
    this.n = 0;
  }
  push(x0, y0, x1, y1, ai) {
    if (this.n * 4 >= this.xy.length) {
      const xy = new Float64Array(this.xy.length * 2 + 64);
      xy.set(this.xy);
      this.xy = xy;
      const at = new Int32Array(this.attr.length * 2 + 16);
      at.set(this.attr);
      this.attr = at;
    }
    const i = this.n++;
    this.xy[4 * i] = x0;
    this.xy[4 * i + 1] = y0;
    this.xy[4 * i + 2] = x1;
    this.xy[4 * i + 3] = y1;
    this.attr[i] = ai;
  }
}

/** Stroke beats fill; among equals the later one (painted on top) wins. */
function priority(a, order) {
  return (a.source === 'stroke' ? 2 : a.source === 'fill' ? 1 : 0) * 1e9 + order;
}

/**
 * Remove duplicate and overlapping collinear pieces. Segments on one line (same direction within the
 * tolerance, offset ≤ tol) are merged per interval: each part of the line keeps the attributes of the
 * strongest piece covering it (stroke over fill, later over earlier). Pieces on different PDF layers never merge.
 */
export function dedupeSegments(segs, attrs, tol) {
  const n = segs.n;
  const xy = segs.xy;
  const theta = new Float64Array(n);
  const rho = new Float64Array(n);
  const len = new Float64Array(n);
  const idx = [];
  for (let i = 0; i < n; i++) {
    let x0 = xy[4 * i];
    let y0 = xy[4 * i + 1];
    let x1 = xy[4 * i + 2];
    let y1 = xy[4 * i + 3];
    const l = Math.hypot(x1 - x0, y1 - y0);
    len[i] = l;
    if (l < 1e-9) continue;
    if (x1 < x0 || (x1 === x0 && y1 < y0)) [x0, y0, x1, y1] = [x1, y1, x0, y0];
    let t = Math.atan2(y1 - y0, x1 - x0); // −π/2 … π/2
    let r = -x0 * Math.sin(t) + y0 * Math.cos(t);
    if (t > Math.PI / 2 - 1e-3 && t <= Math.PI / 2) {
      // nearly vertical upwards and downwards meet at ±π/2: map to one side
      t -= Math.PI;
      r = -r;
    }
    theta[i] = t;
    rho[i] = r;
    idx.push(i);
  }
  idx.sort((p, q) => rho[p] - rho[q]);
  // union–find over pairs on one line
  const parent = new Int32Array(n).map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const ocgOf = (i) => attrs[segs.attr[i]].ocg ?? null;
  for (let p = 0; p < idx.length; p++) {
    const i = idx[p];
    for (let q = p + 1; q < idx.length; q++) {
      const j = idx[q];
      if (rho[j] - rho[i] > tol) break;
      const lmax = Math.max(len[i], len[j]);
      if (Math.abs(theta[i] - theta[j]) > Math.max(2 * tol / lmax, 1e-7)) continue;
      if (ocgOf(i) !== ocgOf(j)) continue;
      // both ends of the shorter piece within tol of the longer piece's line
      const [a, b] = len[i] >= len[j] ? [i, j] : [j, i];
      const ax = xy[4 * a];
      const ay = xy[4 * a + 1];
      const ux = (xy[4 * a + 2] - ax) / len[a];
      const uy = (xy[4 * a + 3] - ay) / len[a];
      const d0 = Math.abs((xy[4 * b] - ax) * uy - (xy[4 * b + 1] - ay) * ux);
      const d1 = Math.abs((xy[4 * b + 2] - ax) * uy - (xy[4 * b + 3] - ay) * ux);
      if (d0 > tol || d1 > tol) continue;
      parent[find(b)] = find(a);
    }
  }
  const groups = new Map();
  for (const i of idx) {
    const r = find(i);
    let g = groups.get(r);
    if (!g) groups.set(r, (g = []));
    g.push(i);
  }
  const out = new Segments(n);
  for (let i = 0; i < n; i++) if (len[i] < 1e-9) out.push(xy[4 * i], xy[4 * i + 1], xy[4 * i + 2], xy[4 * i + 3], segs.attr[i]);
  let removed = 0;
  for (const g of groups.values()) {
    if (g.length === 1) {
      const i = g[0];
      out.push(xy[4 * i], xy[4 * i + 1], xy[4 * i + 2], xy[4 * i + 3], segs.attr[i]);
      continue;
    }
    // reference line: the longest piece
    let ref = g[0];
    for (const i of g) if (len[i] > len[ref]) ref = i;
    const ox = xy[4 * ref];
    const oy = xy[4 * ref + 1];
    const ux = (xy[4 * ref + 2] - ox) / len[ref];
    const uy = (xy[4 * ref + 3] - oy) / len[ref];
    const iv = g.map((i) => {
      const s0 = (xy[4 * i] - ox) * ux + (xy[4 * i + 1] - oy) * uy;
      const s1 = (xy[4 * i + 2] - ox) * ux + (xy[4 * i + 3] - oy) * uy;
      return { s0: Math.min(s0, s1), s1: Math.max(s0, s1), i, pr: priority(attrs[segs.attr[i]], i) };
    });
    // elementary intervals between all interval ends (ends closer than tol are the same point)
    const cuts = iv.flatMap((v) => [v.s0, v.s1]).sort((p, q) => p - q);
    const pts = [cuts[0]];
    for (const c of cuts) if (c - pts.at(-1) > tol) pts.push(c);
    const snap = (s) => {
      let best = pts[0];
      for (const p of pts) if (Math.abs(p - s) < Math.abs(best - s)) best = p;
      return best;
    };
    for (const v of iv) {
      v.s0 = snap(v.s0);
      v.s1 = snap(v.s1);
    }
    let curA = -1;
    let curS = 0;
    let curE = 0;
    const emit = () => {
      if (curA >= 0 && curE - curS > 1e-9) out.push(ox + ux * curS, oy + uy * curS, ox + ux * curE, oy + uy * curE, curA);
    };
    for (let k = 0; k + 1 < pts.length; k++) {
      const s0 = pts[k];
      const s1 = pts[k + 1];
      let win = null;
      for (const v of iv) if (v.s0 <= s0 + 1e-9 && v.s1 >= s1 - 1e-9 && (!win || v.pr > win.pr)) win = v;
      const a = win ? segs.attr[win.i] : -1;
      if (a === curA && Math.abs(curE - s0) < 1e-9) {
        curE = s1;
      } else {
        emit();
        curA = a;
        curS = s0;
        curE = s1;
      }
    }
    emit();
    removed += g.length;
  }
  return { segs: out, merged: removed };
}

/**
 * Hatch heuristic: at least HATCH_MIN_LINES parallel lines on one layer, equally spaced (gap ≤ 10 mm paper,
 * ±10 %), each at most 100 mm long, next to each other (their extents along the direction overlap).
 * Returns a Uint8Array flag per segment.
 */
export function detectHatch(segs, attrs, tol) {
  const n = segs.n;
  const xy = segs.xy;
  const flag = new Uint8Array(n);
  const maxLen = HATCH_MAX_LEN_MM * MM_PT;
  const maxGap = HATCH_MAX_GAP_MM * MM_PT;
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    let x0 = xy[4 * i];
    let y0 = xy[4 * i + 1];
    let x1 = xy[4 * i + 2];
    let y1 = xy[4 * i + 3];
    const l = Math.hypot(x1 - x0, y1 - y0);
    if (l < 2 * tol || l > maxLen) continue;
    if (x1 < x0 || (x1 === x0 && y1 < y0)) [x0, y0, x1, y1] = [x1, y1, x0, y0];
    let t = Math.atan2(y1 - y0, x1 - x0);
    if (t > Math.PI / 2 - 1e-3) t -= Math.PI;
    const bucket = Math.round((t * 180) / Math.PI / 0.5); // 0.5° buckets
    const key = `${attrs[segs.attr[i]].layer}|${bucket}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { t: bucket * 0.5 * (Math.PI / 180), items: [] }));
    g.items.push(i);
  }
  for (const g of groups.values()) {
    if (g.items.length < HATCH_MIN_LINES) continue;
    const ux = Math.cos(g.t);
    const uy = Math.sin(g.t);
    // rows: pieces on the same line (offset within tol) belong together
    const items = g.items.map((i) => {
      const x0 = xy[4 * i];
      const y0 = xy[4 * i + 1];
      const x1 = xy[4 * i + 2];
      const y1 = xy[4 * i + 3];
      const r = -((x0 + x1) / 2) * uy + ((y0 + y1) / 2) * ux;
      const s0 = x0 * ux + y0 * uy;
      const s1 = x1 * ux + y1 * uy;
      return { i, r, s0: Math.min(s0, s1), s1: Math.max(s0, s1) };
    });
    items.sort((p, q) => p.r - q.r);
    const rows = [];
    for (const it of items) {
      const last = rows.at(-1);
      if (last && it.r - last.r <= tol) {
        last.items.push(it.i);
        last.s0 = Math.min(last.s0, it.s0);
        last.s1 = Math.max(last.s1, it.s1);
      } else rows.push({ r: it.r, items: [it.i], s0: it.s0, s1: it.s1 });
    }
    // runs of equal gaps between neighbouring rows that overlap along the direction
    const pairOk = (k) => {
      const gap = rows[k].r - rows[k - 1].r;
      const overlap = Math.min(rows[k].s1, rows[k - 1].s1) - Math.max(rows[k].s0, rows[k - 1].s0) > -gap;
      return gap > tol && gap <= maxGap && overlap;
    };
    const close = (start, end) => {
      if (end - start + 1 >= HATCH_MIN_LINES) for (let k = start; k <= end; k++) for (const i of rows[k].items) flag[i] = 1;
    };
    let start = 0;
    let ref = null;
    for (let k = 1; k < rows.length; k++) {
      const gap = rows[k].r - rows[k - 1].r;
      const ok = pairOk(k) && (ref == null || Math.abs(gap - ref) <= Math.max(0.1 * ref, tol));
      if (ok) {
        ref ??= gap;
        continue;
      }
      close(start, k - 1);
      // the pair (k−1, k) may still start a new run with its own gap
      if (pairOk(k)) {
        start = k - 1;
        ref = gap;
      } else {
        start = k;
        ref = null;
      }
    }
    close(start, rows.length - 1);
  }
  return flag;
}

/**
 * Join segments with shared end points (within tol) into polylines. Only segments with equal layer,
 * colour, line weight and dash join. Chains end at junctions (three or more pieces); loops become closed polylines.
 */
export function joinSegments(segs, attrs, tol) {
  const n = segs.n;
  const xy = segs.xy;
  // group by join key
  const keyOf = attrs.map(joinKey);
  const byKey = new Map();
  for (let i = 0; i < n; i++) {
    const k = keyOf[segs.attr[i]];
    let g = byKey.get(k);
    if (!g) byKey.set(k, (g = []));
    g.push(i);
  }
  const out = [];
  const hash = new SpatialHash(Math.max(tol, 1e-6) * 2);
  for (const list of byKey.values()) {
    // nodes: end points clustered within tol
    hash.map.clear();
    const nodeX = [];
    const nodeY = [];
    const nodeOf = (x, y) => {
      let found = -1;
      hash.near(x, y, (id) => {
        if (found < 0 && Math.abs(nodeX[id] - x) <= tol && Math.abs(nodeY[id] - y) <= tol) found = id;
      });
      if (found >= 0) return found;
      const id = nodeX.length;
      nodeX.push(x);
      nodeY.push(y);
      hash.insert(x, y, id);
      return id;
    };
    const ends = new Int32Array(list.length * 2);
    const adj = [];
    list.forEach((s, k) => {
      const a = nodeOf(xy[4 * s], xy[4 * s + 1]);
      const b = nodeOf(xy[4 * s + 2], xy[4 * s + 3]);
      ends[2 * k] = a;
      ends[2 * k + 1] = b;
      (adj[a] ??= []).push(k);
      (adj[b] ??= []).push(k);
    });
    const used = new Uint8Array(list.length);
    const a = attrs[segs.attr[list[0]]];
    const walk = (startNode, firstEdge) => {
      const pts = [nodeX[startNode], nodeY[startNode]];
      let node = startNode;
      let edge = firstEdge;
      for (;;) {
        used[edge] = 1;
        const other = ends[2 * edge] === node ? ends[2 * edge + 1] : ends[2 * edge];
        pts.push(nodeX[other], nodeY[other]);
        node = other;
        if (node === startNode) return { pts, closed: true };
        if (adj[node].length !== 2) return { pts, closed: false };
        const next = adj[node][0] === edge ? adj[node][1] : adj[node][0];
        if (used[next]) return { pts, closed: false };
        edge = next;
      }
    };
    const emit = ({ pts, closed }) => {
      if (closed) pts.length -= 2;
      if (pts.length === 4 && !closed) {
        if (pts[0] !== pts[2] || pts[1] !== pts[3]) out.push(lineEntity(pts[0], pts[1], pts[2], pts[3], a));
      } else if (pts.length >= 4) out.push(polyEntity(pts, closed && pts.length >= 6, a));
    };
    // open chains from nodes that are not in the middle of a chain
    for (let node = 0; node < nodeX.length; node++) {
      if (!adj[node] || adj[node].length === 2) continue;
      for (const e of adj[node]) if (!used[e]) emit(walk(node, e));
    }
    // what is left are loops
    for (let k = 0; k < list.length; k++) if (!used[k]) emit(walk(ends[2 * k], k));
  }
  return out;
}

// =================================================================================================
// 7. Dashes
// =================================================================================================

/** Split a flat point chain into dash pieces by a dash array (lengths in pt). */
function dashChain(pts, closed, dash, phase = 0) {
  const pattern = dash.length % 2 ? [...dash, ...dash] : dash;
  const total = pattern.reduce((s, v) => s + v, 0);
  if (!(total > EPS)) return [pts];
  const chain = closed ? [...pts, pts[0], pts[1]] : Array.from(pts);
  const out = [];
  let k = 0;
  let left = pattern[0];
  // phase: skip into the pattern
  let ph = ((phase % total) + total) % total;
  while (ph > 0) {
    if (ph >= left) {
      ph -= left;
      k = (k + 1) % pattern.length;
      left = pattern[k];
    } else {
      left -= ph;
      ph = 0;
    }
  }
  let cur = k % 2 === 0 ? [chain[0], chain[1]] : null;
  for (let i = 2; i < chain.length; i += 2) {
    let x = chain[i - 2];
    let y = chain[i - 1];
    const ex = chain[i];
    const ey = chain[i + 1];
    let seg = Math.hypot(ex - x, ey - y);
    while (seg > EPS) {
      const step = Math.min(left, seg);
      x += ((ex - x) * step) / seg;
      y += ((ey - y) * step) / seg;
      if (cur) cur.push(x, y);
      seg -= step;
      left -= step;
      if (left <= EPS) {
        // pattern element done: close a dash or start one
        if (cur && cur.length >= 4) out.push(cur);
        k = (k + 1) % pattern.length;
        left = pattern[k];
        cur = k % 2 === 0 ? [x, y] : null;
      }
    }
  }
  if (cur && cur.length >= 4) out.push(cur);
  // zero-length dashes (dots) have no length in CAD and are dropped
  return out.filter((c) => polylineLength(c) > EPS);
}

/** Dashed entities → solid dash pieces (option "in Einzelstriche auflösen"). */
export function explodeDashes(entities, tol) {
  const out = [];
  const solid = new Map();
  for (const e of entities) {
    const dash = e.a?.dash;
    if (!dash || e.kind === 'text') {
      out.push(e);
      continue;
    }
    let na = solid.get(e.a);
    if (!na) solid.set(e.a, (na = withAttrs(e.a, { dash: null })));
    let pts;
    let closed = false;
    if (e.kind === 'line' || e.kind === 'polyline') {
      pts = e.pts;
      closed = e.kind === 'polyline' && e.closed;
    } else if (e.kind === 'arc') pts = flattenArc(e.cx, e.cy, e.r, e.start, e.end, tol);
    else if (e.kind === 'circle') pts = flattenArc(e.cx, e.cy, e.r, 0, 360, tol);
    else if (e.kind === 'cubic') pts = flattenBezier(e.pts, tol, [e.pts[0], e.pts[1]]);
    else {
      out.push(e);
      continue;
    }
    for (const c of dashChain(pts, closed, dash)) out.push(c.length === 4 ? lineEntity(c[0], c[1], c[2], c[3], na) : polyEntity(c, false, na));
  }
  return out;
}

// =================================================================================================
// Pipeline
// =================================================================================================

function entityLength(e) {
  switch (e.kind) {
    case 'line':
    case 'polyline':
      return polylineLength(e.pts, e.kind === 'polyline' && e.closed);
    case 'arc':
      return ((e.r * Math.PI) / 180) * (sweepCcw(e.start, e.end) || 360);
    case 'circle':
      return 2 * Math.PI * e.r;
    case 'cubic':
      return polylineLength(flattenBezier(e.pts, 0.05, [e.pts[0], e.pts[1]]));
    default:
      return Infinity;
  }
}

/** Remove duplicate arcs, circles and texts (same geometry within tol). */
function dedupeOthers(entities, tol) {
  const seen = new Map();
  const out = [];
  const q = (v) => Math.round(v / tol);
  for (const e of entities) {
    let key = null;
    if (e.kind === 'circle') key = `c|${e.a.ocg}|${q(e.cx)}|${q(e.cy)}|${q(e.r)}`;
    else if (e.kind === 'arc') key = `a|${e.a.ocg}|${q(e.cx)}|${q(e.cy)}|${q(e.r)}|${Math.round(e.start * 10)}|${Math.round(e.end * 10)}`;
    else if (e.kind === 'text') key = `t|${e.a.ocg}|${q(e.x)}|${q(e.y)}|${q(e.height)}|${e.str}`;
    if (key == null) {
      out.push(e);
      continue;
    }
    const prev = seen.get(key);
    if (prev == null) {
      seen.set(key, out.length);
      out.push(e);
    } else if (priority(e.a, 0) >= priority(out[prev].a, 0)) out[prev] = e;
  }
  return out;
}

/**
 * Run the pipeline on one extracted page.
 * settings: see defaults.js. ctx: { isCancelled?, progress? }.
 * Returns { entities (IR, pt), layers: [{ name, rgb, lw, count, off, pdf, visible }], stats }.
 */
export function runPipeline(page, settings, ctx = {}) {
  const s = settings;
  const t0 = Date.now();
  const tol = {
    join: s.tol.join * MM_PT,
    arc: s.tol.arc * MM_PT,
    flatten: s.tol.flatten * MM_PT,
  };
  const check = (label, value) => {
    if (ctx.isCancelled?.()) throw Object.assign(new Error('cancelled'), { code: 'cancelled' });
    ctx.progress?.(value, label);
  };
  const stats = { before: page.entities.length, segmentsBefore: countSegments(page.entities), steps: {} };
  const step = (name, fn) => {
    const t = Date.now();
    const r = fn();
    stats.steps[name] = Date.now() - t;
    return r;
  };

  let ents = step('select', () => selectAndAssign(page.entities, s));
  check('curves', 0.15);
  ents = step('curves', () => fitCurves(ents, { arcs: s.arcs, curves: s.curves === 'spline' && s.version !== 'R12' ? 'spline' : 'polyline', arcTol: tol.arc, flattenTol: tol.flatten }));
  check('clip', 0.3);
  if (s.clip === 'apply') ents = step('clip', () => applyClips(ents, page.clips, tol.flatten));

  // segments: lines and polylines take part in dedupe, hatch and join
  check('dedupe', 0.45);
  const keepFillsAsHatch = s.fills === 'hatch';
  const segmentable = (e) => (e.kind === 'line' || e.kind === 'polyline') && e.a.source !== 'text' && !(keepFillsAsHatch && e.a.source === 'fill');
  const useSegments = s.dedupe || s.join || s.hatch !== 'keep';
  let others = [];
  if (useSegments) {
    const attrs = [];
    const attrIndex = new Map();
    const ai = (a) => {
      let k = attrIndex.get(a);
      if (k == null) {
        k = attrs.length;
        attrs.push(a);
        attrIndex.set(a, k);
      }
      return k;
    };
    let segs = new Segments(1024);
    for (const e of ents) {
      if (!segmentable(e)) {
        others.push(e);
        continue;
      }
      const k = ai(e.a);
      const p = e.pts;
      const m = p.length / 2;
      for (let i = 1; i < m; i++) segs.push(p[2 * i - 2], p[2 * i - 1], p[2 * i], p[2 * i + 1], k);
      if (e.kind === 'polyline' && e.closed) segs.push(p[2 * m - 2], p[2 * m - 1], p[0], p[1], k);
    }
    if (s.dedupe) {
      const r = step('dedupe', () => dedupeSegments(segs, attrs, tol.join));
      segs = r.segs;
      stats.merged = r.merged;
    }
    check('hatch', 0.6);
    if (s.hatch !== 'keep') {
      const flag = step('hatch', () => detectHatch(segs, attrs, tol.join));
      let hatchCount = 0;
      const moved = new Map();
      const kept = new Segments(segs.n);
      for (let i = 0; i < segs.n; i++) {
        let k = segs.attr[i];
        if (flag[i]) {
          hatchCount++;
          if (s.hatch === 'remove') continue;
          let nk = moved.get(k);
          if (nk == null) {
            nk = ai(withAttrs(attrs[k], { layer: HATCH_LAYER }));
            moved.set(k, nk);
          }
          k = nk;
        }
        kept.push(segs.xy[4 * i], segs.xy[4 * i + 1], segs.xy[4 * i + 2], segs.xy[4 * i + 3], k);
      }
      segs = kept;
      stats.hatchLines = hatchCount;
    }
    check('join', 0.75);
    let joined;
    if (s.join) joined = step('join', () => joinSegments(segs, attrs, tol.join));
    else {
      joined = [];
      for (let i = 0; i < segs.n; i++) joined.push(lineEntity(segs.xy[4 * i], segs.xy[4 * i + 1], segs.xy[4 * i + 2], segs.xy[4 * i + 3], attrs[segs.attr[i]]));
    }
    if (s.dedupe) others = dedupeOthers(others, tol.join);
    ents = [...joined, ...others];
  }

  check('dashes', 0.85);
  if (s.dashes === 'explode') ents = step('dashes', () => explodeDashes(ents, tol.flatten));
  if (s.area) ents = step('area', () => cropToRect(ents, s.area, tol.flatten));

  // layer list (before the layer filter, so switched-off layers still show up)
  const layers = new Map();
  const pdfLayers = new Map((page.layers ?? []).map((l) => [l.name, l]));
  for (const e of ents) {
    const name = e.a.layer;
    let l = layers.get(name);
    if (!l) {
      const pl = pdfLayers.get(name);
      l = { name, rgb: e.a.rgb, lw: lineweight(e.a.lineWidthPt * PT_MM), count: 0, pdf: !!pl, visible: pl ? pl.visible : true, off: false };
      layers.set(name, l);
    }
    l.count++;
  }

  // filters
  const layersOff = new Set(s.layersOff);
  const colorsOff = new Set(s.colorsOff);
  const widthsOff = new Set(s.widthsOff);
  const minLen = s.minLengthMm * MM_PT;
  const kept = [];
  for (const e of ents) {
    if (layersOff.has(e.a.layer)) continue;
    if (colorsOff.size && colorsOff.has(rgbHex(e.a.rgb))) continue;
    if (widthsOff.size && e.kind !== 'text' && widthsOff.has(lineweight(e.a.lineWidthPt * PT_MM))) continue;
    if (minLen > 0 && e.kind !== 'text' && entityLength(e) < minLen) continue;
    kept.push(e);
  }
  for (const l of layers.values()) l.off = layersOff.has(l.name);

  stats.after = kept.length;
  stats.segmentsAfter = countSegments(kept);
  stats.byKind = {};
  for (const e of kept) stats.byKind[e.kind] = (stats.byKind[e.kind] ?? 0) + 1;
  stats.ms = Date.now() - t0;
  check('done', 1);
  return { entities: kept, layers: [...layers.values()].sort((p, q) => p.name.localeCompare(q.name, 'de')), stats };
}

// =================================================================================================
// IR → DXF entities (output units)
// =================================================================================================

/** DXF line type for a PDF dash array: DASHED for dash–gap, DASHDOT for longer patterns. */
export function linetypeFor(dash) {
  if (!dash || !dash.length) return null;
  return dash.length >= 4 ? 'DASHDOT' : 'DASHED';
}

/** Line type patterns (output units) from the first dash array of each kind among the entities. */
export function linetypePatterns(entities, xf) {
  const out = {};
  for (const e of entities) {
    const d = e.a?.dash;
    const t = linetypeFor(d);
    if (!t || out[t]) continue;
    const arr = d.length % 2 ? [...d, ...d] : d; // [3] means 3 on, 3 off
    out[t] = arr.map((v, i) => (i % 2 ? -1 : 1) * Math.max(v, 0) * xf.k);
  }
  return out;
}

/**
 * IR entities (pt) → DXF entities (output units).
 * options: { splines: false (cubics as SPLINE, else flattened), fillsAsHatch: false, curveTol (pt) }
 */
export function toDxfEntities(entities, xf, options = {}) {
  const { k, ox, oy } = xf;
  const { splines = false, fillsAsHatch = false, curveTol = 0.05, defaultLayer = 'PDF' } = options;
  const out = [];
  const P = (pts) => {
    const r = new Array(pts.length);
    for (let i = 0; i < pts.length; i += 2) {
      r[i] = (pts[i] - ox) * k;
      r[i + 1] = (pts[i + 1] - oy) * k;
    }
    return r;
  };
  for (const e of entities) {
    const a = e.a ?? {};
    const base = { layer: a.layer ?? defaultLayer, rgb: a.rgb ?? [0, 0, 0], lw: (a.lineWidthPt ?? 0) * PT_MM, linetype: linetypeFor(a.dash) };
    switch (e.kind) {
      case 'line':
        out.push({ kind: 'line', pts: P(e.pts), ...base });
        break;
      case 'polyline':
        if (fillsAsHatch && a.source === 'fill' && e.closed) out.push({ kind: 'hatch', rings: [P(e.pts)], ...base, lw: null, linetype: null });
        else out.push({ kind: 'polyline', pts: P(e.pts), closed: e.closed, ...base });
        break;
      case 'cubic':
        if (splines) out.push({ kind: 'spline', pts: P(e.pts), ...base });
        else out.push({ kind: 'polyline', pts: P(flattenBezier(e.pts, curveTol, [e.pts[0], e.pts[1]])), closed: false, ...base });
        break;
      case 'arc':
        out.push({ kind: 'arc', cx: (e.cx - ox) * k, cy: (e.cy - oy) * k, r: e.r * k, start: e.start, end: e.end, ...base });
        break;
      case 'circle':
        out.push({ kind: 'circle', cx: (e.cx - ox) * k, cy: (e.cy - oy) * k, r: e.r * k, ...base });
        break;
      case 'text':
        out.push({ kind: 'text', x: (e.x - ox) * k, y: (e.y - oy) * k, height: e.height * TEXT_HEIGHT_RATIO * k, rot: e.rot, str: e.str, ...base, lw: null, linetype: null });
        break;
      default:
        break;
    }
  }
  return out;
}

/** Flattened points of an arc entity (for previews). */
export const arcPoints = (e, tol) => flattenArc(e.cx, e.cy, e.r, e.start, e.end, tol);
