// Cross-section drawing of a duct with dimension lines in mm, fitted to the drawing area. No DOM:
// crossSectionLayout() returns plain shapes that the page draws as SVG and report.js draws into the PDF.
// Coordinates: y downwards (SVG and the PDF writer use the same convention).

import { fmt } from '../../lib/core/format.js';

/** Drawing area on the page (as in the first version). */
export const SCREEN = { width: 640, height: 340 };

const r2 = (v) => Math.round(v * 100) / 100;

/** SVG path of the outline in the box (x, y, w, h). Flat oval: half circles of diameter h at both ends. */
export function outlinePath(shape, x, y, w, h) {
  if (shape === 'round' || (shape === 'oval' && w <= h)) {
    const r = r2(Math.min(w, h) / 2);
    const cy = r2(y + h / 2);
    const x0 = r2(x + w / 2 - r);
    return `M${x0} ${cy}A${r} ${r} 0 1 0 ${r2(x0 + 2 * r)} ${cy}A${r} ${r} 0 1 0 ${x0} ${cy}Z`;
  }
  if (shape === 'oval') {
    const r = r2(h / 2);
    return `M${r2(x + r)} ${r2(y)}H${r2(x + w - r)}A${r} ${r} 0 0 1 ${r2(x + w - r)} ${r2(y + h)}H${r2(x + r)}A${r} ${r} 0 0 1 ${r2(x + r)} ${r2(y)}Z`;
  }
  return `M${r2(x)} ${r2(y)}H${r2(x + w)}V${r2(y + h)}H${r2(x)}Z`;
}

/** Filled arrowhead with its tip at (x, y), pointing in direction (dx, dy) (unit vector). */
function arrowPath(x, y, dx, dy, length) {
  const half = length * 0.35;
  const bx = x - dx * length;
  const by = y - dy * length;
  return `M${r2(x)} ${r2(y)}L${r2(bx - dy * half)} ${r2(by + dx * half)}L${r2(bx + dy * half)} ${r2(by - dx * half)}Z`;
}

/**
 * Shapes for a cross-section. dims: { diameter } or { width, height } in mm.
 * Returns { outline, lines: [{ kind: 'dim' | 'ext', x1, y1, x2, y2 }], arrows: [path],
 * texts: [{ kind: 'dim', x, y, text, anchor, rotate }], handles: [{ kind, x, y }], scale, cx, cy }.
 * Text y is the baseline; scale is drawing units per mm (fixed with opts.scale, e.g. while dragging).
 * Non-round: the width is dimensioned above, the height on the left, so the drag handles (right edge,
 * bottom edge, bottom right corner) stay clear of the dimensions. Round: diameter through the centre,
 * handle on the outline at the bottom right. The PDF passes a smaller area.
 */
export function crossSectionLayout(shape, dims, opts = {}) {
  const {
    width = SCREEN.width,
    height = SCREEN.height,
    cx = width / 2 + 17, // room for the height dimension on the left
    cy = height / 2 + 12, // room for the width dimension above
    radius = 112, // round duct
    maxW = 440, // non-round duct
    maxH = 196,
    gap = 4, // object → extension line
    over = 6, // extension line beyond the dimension line
    off = 22, // object → dimension line
    label = 7, // dimension line → label
    arrow = 7,
    rotate = true, // height label along its dimension line
    scale = null, // drawing units per mm; null: fit to the area
  } = opts;
  const out = { outline: '', lines: [], arrows: [], texts: [], handles: [], scale: 1, cx, cy };
  const dimension = (x1, y1, x2, y2) => {
    out.lines.push({ kind: 'dim', x1, y1, x2, y2 });
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const dx = (x2 - x1) / len;
    const dy = (y2 - y1) / len;
    out.arrows.push(arrowPath(x1, y1, -dx, -dy, arrow), arrowPath(x2, y2, dx, dy, arrow));
  };

  if (shape === 'round') {
    const ox = opts.cx ?? width / 2;
    const oy = opts.cy ?? height / 2;
    const rad = scale ? (dims.diameter * scale) / 2 : radius;
    out.cx = ox;
    out.cy = oy;
    out.scale = (2 * rad) / dims.diameter;
    out.outline = outlinePath('round', ox - rad, oy - rad, 2 * rad, 2 * rad);
    dimension(ox - rad, oy, ox + rad, oy);
    out.texts.push({ kind: 'dim', x: ox, y: oy - label - 3, text: `Ø ${fmt(dims.diameter, 0)}`, anchor: 'middle' });
    out.handles.push({ kind: 'diameter', x: ox + rad * Math.SQRT1_2, y: oy + rad * Math.SQRT1_2 });
    return out;
  }

  const s = scale ?? Math.min(maxW / dims.width, maxH / dims.height);
  out.scale = s;
  const w = dims.width * s;
  const h = dims.height * s;
  const x = cx - w / 2;
  const y = cy - h / 2;
  out.outline = outlinePath(shape, x, y, w, h);

  // width above
  out.lines.push({ kind: 'ext', x1: x, y1: y - gap, x2: x, y2: y - off - over });
  out.lines.push({ kind: 'ext', x1: x + w, y1: y - gap, x2: x + w, y2: y - off - over });
  dimension(x, y - off, x + w, y - off);
  out.texts.push({ kind: 'dim', x: cx, y: y - off - label, text: fmt(dims.width, 0), anchor: 'middle' });

  // height on the left
  out.lines.push({ kind: 'ext', x1: x - gap, y1: y, x2: x - off - over, y2: y });
  out.lines.push({ kind: 'ext', x1: x - gap, y1: y + h, x2: x - off - over, y2: y + h });
  dimension(x - off, y + h, x - off, y);
  out.texts.push(
    rotate
      ? { kind: 'dim', x: x - off - label, y: cy, text: fmt(dims.height, 0), anchor: 'middle', rotate: -90 }
      : { kind: 'dim', x: x - off - label + 2, y: cy + 3, text: fmt(dims.height, 0), anchor: 'end' },
  );
  // both: bottom right corner, on a flat oval the point of the arc at 45°
  const r = Math.min(w, h) / 2;
  const both = shape === 'oval' ? { x: x + w - r + r * Math.SQRT1_2, y: cy + r * Math.SQRT1_2 } : { x: x + w, y: y + h };
  out.handles.push({ kind: 'width', x: x + w, y: cy }, { kind: 'height', x: cx, y: y + h }, { kind: 'both', ...both });
  return out;
}

const HANDLE_LABELS = { diameter: 'Durchmesser', width: 'Breite', height: 'Höhe', both: 'Breite und Höhe' };

/**
 * SVG markup of a position result: drawing paper, outline, dimensions and drag handles (data-handle).
 * opts.scale fixes the scale (while dragging). Empty paper if incomplete.
 */
export function crossSectionSvg(r, { scale = null } = {}) {
  const { width, height } = SCREEN;
  const paper = `<defs><pattern id="xs-grid" width="16" height="16" patternUnits="userSpaceOnUse"><path class="xs-grid" d="M16 0H0V16"/></pattern></defs>
    <rect width="${width}" height="${height}" fill="url(#xs-grid)"/>`;
  const open = `<svg class="xs" viewBox="0 0 ${width} ${height}"`;
  if (!r || r.status !== 'ok') return `${open} aria-hidden="true">${paper}</svg>`;
  const dims = r.shape === 'round' ? { diameter: r.diameter } : { width: r.width, height: r.height };
  const L = crossSectionLayout(r.shape, dims, { scale });
  const label = r.shape === 'round' ? `Ø ${fmt(r.diameter, 0)} mm` : `${fmt(r.width, 0)} × ${fmt(r.height, 0)} mm`;
  const value = { diameter: r.diameter, width: r.width, height: r.height };
  const handle = (hd) => `<g class="xs-handle" data-handle="${hd.kind}" tabindex="0" role="slider" aria-label="${HANDLE_LABELS[hd.kind]}"
      aria-valuenow="${value[hd.kind] ?? r.width}" aria-valuetext="${hd.kind === 'both' ? label : `${fmt(value[hd.kind], 0)} mm`}">
      <circle class="xs-hit" cx="${r2(hd.x)}" cy="${r2(hd.y)}" r="28"/><circle class="xs-knob" cx="${r2(hd.x)}" cy="${r2(hd.y)}" r="6"/></g>`;
  const text = (t) => {
    const rot = t.rotate ? ` transform="rotate(${t.rotate} ${r2(t.x)} ${r2(t.y)})"` : '';
    return `<text class="xs-t-${t.kind}" x="${r2(t.x)}" y="${r2(t.y)}" text-anchor="${t.anchor}"${rot}>${t.text}</text>`;
  };
  return `${open} role="group" aria-label="Querschnitt ${label}" data-scale="${L.scale}" data-cx="${L.cx}" data-cy="${L.cy}">${paper}
    <path class="xs-shape" d="${L.outline}"/>
    ${L.lines.map((l) => `<line class="xs-${l.kind}" x1="${r2(l.x1)}" y1="${r2(l.y1)}" x2="${r2(l.x2)}" y2="${r2(l.y2)}"/>`).join('')}
    ${L.arrows.map((d) => `<path class="xs-arrow" d="${d}"/>`).join('')}
    ${L.texts.map(text).join('')}
    ${L.handles.map(handle).join('')}
  </svg>`;
}
