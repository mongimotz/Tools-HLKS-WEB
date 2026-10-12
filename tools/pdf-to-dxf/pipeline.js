// SPDX-License-Identifier: AGPL-3.0-or-later
// Pipeline of the PDF → DXF tool: IR entities (pt) → cleaned IR entities → DXF entities in output units.
// No DOM. Step order (see docs/dev/pdf-to-dxf/DECISIONS.md):
//   layers → curves (arc fit) → clip → fills → dedupe → hatch → join → dashes → filter → transform

import { flattenBezier, flattenArc, EPS } from './geometry.js';

export const PT_MM = 25.4 / 72; // mm per pt

/** Cap height of a typical sans font relative to the font size: DXF text height means the capital height. */
export const TEXT_HEIGHT_RATIO = 0.7;

const UNIT_MM = { mm: 1, cm: 10, m: 1000 };

// ---- transform (phase 4) ---------------------------------------------------------------------

/**
 * Transform from IR (pt, page) to the DXF (output units, real size).
 * options: { scale: M (1:M), unit: 'mm' | 'cm' | 'm', origin: 'page' | 'center', bounds: [x0 y0 x1 y1] (pt, for 'center'),
 *            offset: [dx, dy] (pt, e.g. pages side by side) }
 * Returns { k, ox, oy, unit, scale }: out = (p + offset − origin) · k.
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

// ---- IR → DXF entities --------------------------------------------------------------------------

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

/** Flattened points of an arc entity (for R12 fall-backs and previews). */
export const arcPoints = (e, tol) => flattenArc(e.cx, e.cy, e.r, e.start, e.end, tol);
