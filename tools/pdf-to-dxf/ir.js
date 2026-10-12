// SPDX-License-Identifier: AGPL-3.0-or-later
// Intermediate model (IR) of the PDF → DXF tool. No DOM.
//
// Unit: PDF points, y up, origin at the bottom left of the page as a viewer shows it (after /Rotate
// and CropBox). Points are flat Float64Arrays [x0, y0, x1, y1, …], never one object per point.
//
//   line      { kind, pts: [x0 y0 x1 y1], a }
//   polyline  { kind, pts: [x0 y0 …], closed, a }
//   cubic     { kind, pts: [p0 c1 c2 p3], chain, a }      chain: subpath id, consecutive cubics share it
//   arc       { kind, cx, cy, r, start, end, a }          degrees, counter-clockwise from start to end
//   circle    { kind, cx, cy, r, a }
//   text      { kind, x, y, height, rot, str, width, unmapped, a }   x, y: start of the baseline
//
// Attributes `a` (shared between entities of one paint operation, treat as read-only):
//   { ocg, layer, rgb: [r, g, b] (0…255), lineWidthPt, dash: number[] | null, source, clipId }
//   ocg:    name of the PDF layer (optional content group) or null
//   layer:  output layer, set by the pipeline (pipeline.js assignLayers)
//   source: 'stroke' | 'fill' | 'text' | 'scan'
//   clipId: innermost clip (page.clips), 0 = none

export const KINDS = ['line', 'polyline', 'cubic', 'arc', 'circle', 'text'];

export function attrs({ ocg = null, layer = null, rgb = [0, 0, 0], lineWidthPt = 0, dash = null, source = 'stroke', clipId = 0 } = {}) {
  return { ocg, layer, rgb, lineWidthPt, dash, source, clipId };
}

/** Same attributes with some fields changed (a new object, the old one may be shared). */
export const withAttrs = (a, changes) => ({ ...a, ...changes });

export const line = (x0, y0, x1, y1, a) => ({ kind: 'line', pts: Float64Array.of(x0, y0, x1, y1), a });

export const polyline = (pts, closed, a) => ({ kind: 'polyline', pts: pts instanceof Float64Array ? pts : Float64Array.from(pts), closed: !!closed, a });

export const cubic = (pts, chain, a) => ({ kind: 'cubic', pts: pts instanceof Float64Array ? pts : Float64Array.from(pts), chain, a });

export const arc = (cx, cy, r, start, end, a) => ({ kind: 'arc', cx, cy, r, start, end, a });

export const circle = (cx, cy, r, a) => ({ kind: 'circle', cx, cy, r, a });

export const text = ({ x, y, height, rot = 0, str, width = 0, unmapped = false }, a) => ({ kind: 'text', x, y, height, rot, str, width, unmapped, a });

/** Empty page result, as returned by backend.extract(). */
export function emptyPage(index, width, height) {
  return {
    index,
    width,
    height,
    entities: [],
    clips: [null], // clips[id] = { id, parent, rect: [x0 y0 x1 y1] } | { id, parent, rings: Float64Array[], evenOdd } | { id, parent, none: true }
    layers: [], // [{ name, visible, count }] PDF layers on this page
    images: [], // [{ bbox, w, h }]
    stats: { paths: 0, segments: 0, texts: 0, unmapped: 0, images: 0, shadings: 0, invisibleText: 0 },
  };
}

// ---- readable form (truth files, tests, debugging) ---------------------------------------------

const pairs = (pts) => {
  const out = [];
  for (let i = 0; i < pts.length; i += 2) out.push([pts[i], pts[i + 1]]);
  return out;
};

export function toPlain(e) {
  const a = e.a ?? {};
  const base = { rgb: a.rgb, lineWidthPt: a.lineWidthPt, dash: a.dash ?? null, source: a.source, layer: a.ocg ?? null };
  switch (e.kind) {
    case 'line':
    case 'cubic':
      return { kind: e.kind, pts: pairs(e.pts), ...base };
    case 'polyline':
      return { kind: e.kind, pts: pairs(e.pts), closed: e.closed, ...base };
    case 'arc':
      return { kind: e.kind, c: [e.cx, e.cy], r: e.r, start: e.start, end: e.end, ...base };
    case 'circle':
      return { kind: e.kind, c: [e.cx, e.cy], r: e.r, ...base };
    case 'text':
      return { kind: e.kind, pos: [e.x, e.y], height: e.height, rot: e.rot, str: e.str, unmapped: e.unmapped, rgb: a.rgb, layer: a.ocg ?? null };
    default:
      throw new Error(`unknown kind ${e.kind}`);
  }
}

/** Readable form → entity. Colours in the readable form may be 0…1 (truth files) or 0…255. */
export function fromPlain(p) {
  const rgb = (p.rgb ?? [0, 0, 0]).every((v) => v <= 1) ? p.rgb.map((v) => Math.round(v * 255)) : p.rgb;
  const a = attrs({ ocg: p.layer ?? null, rgb, lineWidthPt: p.lineWidthPt ?? 0, dash: p.dash ?? null, source: p.source ?? (p.kind === 'text' ? 'text' : 'stroke') });
  const flat = (pts) => Float64Array.from(pts.flat());
  switch (p.kind) {
    case 'line':
      return { kind: 'line', pts: flat(p.pts), a };
    case 'polyline':
      return polyline(flat(p.pts), p.closed, a);
    case 'cubic':
      return cubic(flat(p.pts), p.chain ?? 0, a);
    case 'arc':
      return arc(p.c[0], p.c[1], p.r, p.start, p.end, a);
    case 'circle':
      return circle(p.c[0], p.c[1], p.r, a);
    case 'text':
      return text({ x: p.pos[0], y: p.pos[1], height: p.height, rot: p.rot ?? 0, str: p.str, unmapped: !!p.noUnicode }, a);
    default:
      throw new Error(`unknown kind ${p.kind}`);
  }
}

// ---- measures ---------------------------------------------------------------------------------

/** Number of straight or curved pieces (statistics and the performance budget). */
export function segmentCount(e) {
  switch (e.kind) {
    case 'line':
    case 'cubic':
    case 'arc':
    case 'circle':
      return 1;
    case 'polyline':
      return e.pts.length / 2 - 1 + (e.closed ? 1 : 0);
    default:
      return 0;
  }
}

export function countSegments(entities) {
  let n = 0;
  for (const e of entities) n += segmentCount(e);
  return n;
}

/** Bounding box [x0, y0, x1, y1] of entities (text: start point only). */
export function entitiesBounds(entities) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x, y) => {
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  };
  for (const e of entities) {
    if (e.pts) for (let i = 0; i < e.pts.length; i += 2) add(e.pts[i], e.pts[i + 1]);
    else if (e.kind === 'arc' || e.kind === 'circle') {
      add(e.cx - e.r, e.cy - e.r);
      add(e.cx + e.r, e.cy + e.r);
    } else if (e.kind === 'text') add(e.x, e.y);
  }
  return b[0] <= b[2] ? b : null;
}
