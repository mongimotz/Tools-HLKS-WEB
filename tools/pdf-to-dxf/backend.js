// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF backend of the PDF → DXF tool: reads pages into the IR (ir.js). No DOM; runs in the worker and in Node.
//
// interface PdfBackend {
//   open(bytes: Uint8Array): void                 throws PdfError
//   getPageCount(): number
//   getLayers(): { name, visible }[]               PDF layers (optional content groups) of the document
//   getPageInfo(i): { index, width, height, rotate, mediaBox, cropBox }
//   extract(i, options): page                      see ir.js emptyPage()
//   renderPage(i, dpi, options): { width, height, dpi, data: Uint8Array }   grey, 0 = black, 255 = white
//   close(): void
// }
//
// The implementation uses MuPDF.js (lib/vendor/mupdf, AGPL-3.0), loaded on demand.

import { concat, matrixScale, flattenBezier, ringAsRect, IDENTITY } from './geometry.js';
import { attrs, emptyPage, line, polyline, cubic, text as textEntity } from './ir.js';

export class PdfError extends Error {
  /** code: 'damaged' | 'password' | 'empty' | 'page' */
  constructor(code, message = code) {
    super(message);
    this.name = 'PdfError';
    this.code = code;
  }
}

let mupdfModule = null;

/** Load MuPDF once (10 MB of WebAssembly, so only when the tool needs it). */
export async function loadMupdf() {
  mupdfModule ??= await import('../../lib/vendor/mupdf/mupdf.js');
  return mupdfModule;
}

export async function createBackend() {
  return new MuPdfBackend(await loadMupdf());
}

// ---- colours --------------------------------------------------------------------------------------

const to255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));

/** RGB 0…255 from a MuPDF colour space and its components. */
export function toRgb(cs, color) {
  const n = color?.length ?? 0;
  let type = 'RGB';
  try {
    type = cs?.getType?.() ?? (n === 1 ? 'Gray' : n === 4 ? 'CMYK' : 'RGB');
  } catch {
    /* unknown colour space: guess from the number of components */
  }
  if (type === 'Separation' && n === 1) {
    const g = 1 - color[0]; // tint 1 = full ink
    return [to255(g), to255(g), to255(g)];
  }
  if (n === 1) return [to255(color[0]), to255(color[0]), to255(color[0])];
  if (n === 3 && type !== 'Lab') return [to255(color[0]), to255(color[1]), to255(color[2])];
  if (n === 4) {
    const [c, m, y, k] = color;
    return [to255((1 - c) * (1 - k)), to255((1 - m) * (1 - k)), to255((1 - y) * (1 - k))];
  }
  return [0, 0, 0];
}

// ---- path → IR ---------------------------------------------------------------------------------------

const SAME = 1e-9;

/**
 * Walk a MuPDF path through matrix m (user space → IR) and return its subpaths:
 * [{ items: [{ line: [x0 y0 x1 y1 …] } | { curve: [8 numbers] }], closed, start: [x, y] }].
 */
function walkPath(path, m) {
  const subs = [];
  let cur = null;
  let px = 0;
  let py = 0;
  let sx = 0;
  let sy = 0;
  const X = (x, y) => m[0] * x + m[2] * y + m[4];
  const Y = (x, y) => m[1] * x + m[3] * y + m[5];
  const begin = (x, y) => {
    cur = { items: [], closed: false, start: [x, y] };
    subs.push(cur);
    sx = px = x;
    sy = py = y;
  };
  const lineItem = () => {
    const last = cur.items.at(-1);
    if (last?.line) return last.line;
    const l = [px, py];
    cur.items.push({ line: l });
    return l;
  };
  path.walk({
    moveTo(x, y) {
      begin(X(x, y), Y(x, y));
    },
    lineTo(x, y) {
      const tx = X(x, y);
      const ty = Y(x, y);
      if (!cur || cur.closed) begin(px, py);
      lineItem().push(tx, ty);
      px = tx;
      py = ty;
    },
    curveTo(x1, y1, x2, y2, x3, y3) {
      if (!cur || cur.closed) begin(px, py);
      const c = [px, py, X(x1, y1), Y(x1, y1), X(x2, y2), Y(x2, y2), X(x3, y3), Y(x3, y3)];
      cur.items.push({ curve: c });
      px = c[6];
      py = c[7];
    },
    closePath() {
      if (!cur) return;
      if (Math.abs(px - sx) > SAME || Math.abs(py - sy) > SAME) {
        // closing segment: a line back to the start
        lineItem().push(sx, sy);
      }
      cur.closed = true;
      px = sx;
      py = sy;
    },
  });
  return subs;
}

/** Remove consecutive duplicate points of a flat array. */
function dedupePoints(pts) {
  const out = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    if (Math.abs(pts[i] - out[out.length - 2]) > SAME || Math.abs(pts[i + 1] - out[out.length - 1]) > SAME) out.push(pts[i], pts[i + 1]);
  }
  return out;
}

/**
 * Subpaths → IR entities. Straight runs become line or polyline, every Bézier one cubic (sharing a chain id
 * per subpath). Fills are closed. A run that ends where it began is closed.
 */
function subpathsToEntities(subs, a, isFill, nextChain, out) {
  for (const sub of subs) {
    if (!sub.items.length) continue; // a lone moveTo
    const onlyLines = sub.items.every((it) => it.line);
    if (onlyLines) {
      let pts = dedupePoints(sub.items.flatMap((it) => it.line));
      const n = pts.length / 2;
      if (n < 2) continue;
      let closed = sub.closed || isFill;
      const ends = Math.abs(pts[0] - pts[pts.length - 2]) <= SAME && Math.abs(pts[1] - pts[pts.length - 1]) <= SAME;
      if (ends && n >= 3) {
        pts = pts.slice(0, -2);
        closed = true;
      }
      if (pts.length === 4) {
        if (pts[0] === pts[2] && pts[1] === pts[3]) continue; // a dot
        out.push(line(pts[0], pts[1], pts[2], pts[3], a));
      } else if (pts.length >= 6) out.push(polyline(pts, closed, a));
      continue;
    }
    const chain = nextChain();
    for (const it of sub.items) {
      if (it.curve) {
        out.push(cubic(it.curve, chain, a));
        continue;
      }
      const pts = dedupePoints(it.line);
      if (pts.length === 4) out.push(line(pts[0], pts[1], pts[2], pts[3], a));
      else if (pts.length > 4) out.push(polyline(pts, false, a));
    }
    // a fill is closed: add the closing edge when the subpath does not end at its start
    if (isFill && !sub.closed) {
      const first = sub.start;
      const lastItem = sub.items.at(-1);
      const end = lastItem.curve ? lastItem.curve.slice(6) : lastItem.line.slice(-2);
      if (Math.abs(end[0] - first[0]) > SAME || Math.abs(end[1] - first[1]) > SAME) out.push(line(end[0], end[1], first[0], first[1], a));
    }
  }
}

/** Flat rings of a clip path (curves flattened). */
function clipRings(subs, tol) {
  const rings = [];
  for (const sub of subs) {
    const ring = [sub.start[0], sub.start[1]];
    for (const it of sub.items) {
      if (it.line) ring.push(...it.line.slice(2));
      else flattenBezier(it.curve, tol, ring);
    }
    const n = ring.length;
    if (n >= 8 && Math.abs(ring[0] - ring[n - 2]) <= SAME && Math.abs(ring[1] - ring[n - 1]) <= SAME) ring.length = n - 2;
    if (ring.length >= 6) rings.push(Float64Array.from(ring));
  }
  return rings;
}

// ---- text runs -------------------------------------------------------------------------------------

const COS_1DEG = Math.cos(Math.PI / 180);

/**
 * Collects glyphs into strings: consecutive glyphs on one baseline (same size, direction, colour, layer)
 * with a gap below half the font height. A gap above 0.15 font heights without a space glyph adds a space.
 */
class TextCollector {
  constructor(out, stats) {
    this.out = out;
    this.stats = stats;
    this.run = null;
  }
  sameAttrs(a, b) {
    return a.ocg === b.ocg && a.clipId === b.clipId && a.rgb[0] === b.rgb[0] && a.rgb[1] === b.rgb[1] && a.rgb[2] === b.rgb[2];
  }
  glyph(g) {
    const r = this.run;
    if (r && this.sameAttrs(r.a, g.a) && Math.abs(g.size - r.size) <= 0.02 * r.size && g.ux * r.ux + g.uy * r.uy >= COS_1DEG) {
      const vx = g.x - r.ex;
      const vy = g.y - r.ey;
      const along = vx * r.ux + vy * r.uy;
      const perp = Math.abs(vx * r.uy - vy * r.ux);
      if (perp <= 0.1 * r.size && along >= -0.3 * r.size && along <= 0.5 * r.size) {
        if (g.ch !== ' ' && along > 0.15 * r.size && !r.str.endsWith(' ')) r.str += ' ';
        r.str += g.ch;
        r.ex = g.x + g.ux * g.adv;
        r.ey = g.y + g.uy * g.adv;
        if (g.ch !== ' ') {
          r.endX = r.ex;
          r.endY = r.ey;
        }
        r.unmapped ||= g.unmapped;
        return;
      }
    }
    this.flush();
    if (g.ch === ' ') return; // a run never starts with a space
    this.run = {
      x: g.x,
      y: g.y,
      ux: g.ux,
      uy: g.uy,
      size: g.size,
      rot: g.rot,
      str: g.ch,
      ex: g.x + g.ux * g.adv,
      ey: g.y + g.uy * g.adv,
      endX: g.x + g.ux * g.adv,
      endY: g.y + g.uy * g.adv,
      unmapped: g.unmapped,
      a: g.a,
    };
  }
  flush() {
    const r = this.run;
    this.run = null;
    if (!r) return;
    const str = r.str.trimEnd();
    if (!str) return;
    const width = Math.hypot(r.endX - r.x, r.endY - r.y);
    this.out.push(textEntity({ x: r.x, y: r.y, height: r.size, rot: r.rot, str, width, unmapped: r.unmapped }, r.a));
    this.stats.texts++;
    if (r.unmapped) this.stats.unmapped++;
  }
}

// ---- glyph outlines (text as outline) via MuPDF's SVG writer ----------------------------------------

const NUM = /[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

/** SVG path data → subpaths of flat points (curves flattened with tol, in the path's own units). */
export function parseSvgPath(d, tol) {
  const tok = d.match(NUM) ?? [];
  const rings = [];
  let ring = null;
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const isCmd = (t) => /^[a-zA-Z]$/.test(t);
  const n = () => Number(tok[i++]);
  while (i < tok.length) {
    if (isCmd(tok[i])) cmd = tok[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') {
      if (ring) ring.closed = true;
      x = sx;
      y = sy;
      ring = null;
      continue;
    }
    if (C === 'M') {
      x = (rel ? x : 0) + n();
      y = (rel ? y : 0) + n();
      sx = x;
      sy = y;
      ring = { pts: [x, y], closed: false };
      rings.push(ring);
      cmd = rel ? 'l' : 'L'; // further pairs are lines
      continue;
    }
    if (!ring) {
      ring = { pts: [x, y], closed: false };
      rings.push(ring);
    }
    if (C === 'L') {
      x = (rel ? x : 0) + n();
      y = (rel ? y : 0) + n();
      ring.pts.push(x, y);
    } else if (C === 'H') {
      x = (rel ? x : 0) + n();
      ring.pts.push(x, y);
    } else if (C === 'V') {
      y = (rel ? y : 0) + n();
      ring.pts.push(x, y);
    } else if (C === 'C') {
      const ox = rel ? x : 0;
      const oy = rel ? y : 0;
      const b = [x, y, ox + n(), oy + n(), ox + n(), oy + n(), ox + n(), oy + n()];
      flattenBezier(b, tol, ring.pts);
      x = b[6];
      y = b[7];
    } else if (C === 'Q') {
      const ox = rel ? x : 0;
      const oy = rel ? y : 0;
      const qx = ox + n();
      const qy = oy + n();
      const ex = ox + n();
      const ey = oy + n();
      const b = [x, y, x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey];
      flattenBezier(b, tol, ring.pts);
      x = ex;
      y = ey;
    } else {
      i++; // unsupported command: skip a number
    }
  }
  return rings;
}

/** Glyph outlines of one text object: [{ pts (IR), closed }]. `f` maps device space → IR. */
function textOutlines(mupdf, bounds, textObj, ctm, cs, color, alpha, f, tolPt) {
  const buf = new mupdf.Buffer();
  const writer = new mupdf.DocumentWriter(buf, 'svg', 'text=path');
  const dev = writer.beginPage(bounds);
  dev.fillText(textObj, ctm, cs, color, alpha);
  writer.endPage();
  writer.close();
  const svg = buf.asString();
  const defs = new Map();
  for (const m of svg.matchAll(/<path id="([^"]+)"[^>]*\sd="([^"]*)"/g)) defs.set(m[1], m[2]);
  const out = [];
  for (const m of svg.matchAll(/<use\b[^>]*?xlink:href="#([^"]+)"[^>]*?transform="matrix\(([^)]+)\)"/g)) {
    const d = defs.get(m[1]);
    if (!d) continue;
    const mm = m[2].split(/[\s,]+/).map(Number);
    const full = concat(mm, f);
    const scale = matrixScale(mm) || 1;
    for (const ring of parseSvgPath(d, tolPt / scale)) {
      const pts = ring.pts;
      for (let i = 0; i < pts.length; i += 2) {
        const gx = pts[i];
        const gy = pts[i + 1];
        pts[i] = full[0] * gx + full[2] * gy + full[4];
        pts[i + 1] = full[1] * gx + full[3] * gy + full[5];
      }
      if (pts.length >= 6) out.push({ pts, closed: true });
    }
  }
  return out;
}

// ---- MuPDF backend ------------------------------------------------------------------------------

export class MuPdfBackend {
  constructor(mupdf) {
    this.mupdf = mupdf;
    this.doc = null;
    this.pdf = null;
  }

  open(bytes) {
    this.close();
    const { mupdf } = this;
    let doc;
    try {
      doc = mupdf.Document.openDocument(bytes, 'application/pdf');
    } catch (e) {
      throw new PdfError('damaged', String(e?.message ?? e));
    }
    if (doc.needsPassword()) {
      // an empty user password still opens many "protected" PDFs
      if (!doc.authenticatePassword('')) throw new PdfError('password');
    }
    let n = 0;
    try {
      n = doc.countPages();
    } catch (e) {
      throw new PdfError('damaged', String(e?.message ?? e));
    }
    if (!n) throw new PdfError('empty');
    this.doc = doc;
    this.pdf = doc.asPDF?.() ?? null;
  }

  getPageCount() {
    return this.doc ? this.doc.countPages() : 0;
  }

  getLayers() {
    const out = [];
    if (!this.pdf) return out;
    const n = this.pdf.countLayers();
    for (let i = 0; i < n; i++) out.push({ name: this.pdf.getLayerName(i), visible: this.pdf.isLayerVisible(i) });
    return out;
  }

  loadPage(i) {
    if (!this.doc || i < 0 || i >= this.getPageCount()) throw new PdfError('page');
    try {
      return this.doc.loadPage(i);
    } catch (e) {
      throw new PdfError('damaged', String(e?.message ?? e));
    }
  }

  getPageInfo(i) {
    const page = this.loadPage(i);
    const b = page.getBounds();
    let rotate = 0;
    let mediaBox = null;
    let cropBox = null;
    try {
      const obj = page.getObject?.();
      if (obj) {
        const r = obj.getInheritable('Rotate');
        rotate = r && !r.isNull() ? ((r.asNumber() % 360) + 360) % 360 : 0;
      }
      mediaBox = page.getBounds('MediaBox');
      cropBox = page.getBounds('CropBox');
    } catch {
      /* not a PDF page or no boxes: keep the defaults */
    }
    return { index: i, width: b[2] - b[0], height: b[3] - b[1], rotate, mediaBox, cropBox };
  }

  /**
   * Read one page into the IR.
   * options.hiddenLayers: also read PDF layers that are switched off (entities keep their layer name,
   *   page.layers says which layers are visible by default).
   * options.textOutlines: 'none' (default) | 'all' | 'unmapped': glyph outlines as closed polylines
   *   (source 'text') instead of, or in addition to, the text entities (see `outlined` on the page).
   * options.curveTol: flattening tolerance for clip paths and glyph outlines, pt (default 0.05).
   */
  extract(i, options = {}) {
    const { mupdf } = this;
    const { hiddenLayers = false, textOutlines: outlineMode = 'none', curveTol = 0.05 } = options;
    const page = this.loadPage(i);
    const bounds = page.getBounds();
    const [b0, , , b3] = bounds;
    const result = emptyPage(i, bounds[2] - bounds[0], bounds[3] - bounds[1]);
    result.outlined = 0; // text objects replaced by glyph outlines
    const { entities, clips, stats } = result;
    const f = [1, 0, 0, -1, -b0, b3]; // device (y down) → IR (y up)

    // PDF layers: default visibility by name; optionally switch all on for this run
    const docLayers = this.getLayers();
    const defaultVisible = new Map();
    for (const l of docLayers) defaultVisible.set(l.name, (defaultVisible.get(l.name) ?? false) || l.visible);
    const restore = [];
    if (hiddenLayers && this.pdf) {
      docLayers.forEach((l, k) => {
        if (!l.visible) {
          this.pdf.setLayerVisible(k, true);
          restore.push(k);
        }
      });
    }
    const layerCount = new Map();

    const ocgStack = [];
    const clipStack = [0];
    let maskDepth = 0;
    let tileDepth = 0;
    let chain = 0;
    const nextChain = () => ++chain;
    const texts = new TextCollector(entities, stats);
    const attrCache = new Map();
    const skip = () => maskDepth > 0 || tileDepth > 0;

    const currentOcg = () => (ocgStack.length ? ocgStack.at(-1) : null);
    const makeAttrs = (rgb, lineWidthPt, dash, source) => {
      const ocg = currentOcg();
      const clipId = clipStack.at(-1);
      const key = `${ocg}|${clipId}|${rgb}|${lineWidthPt}|${dash}|${source}`;
      let a = attrCache.get(key);
      if (!a) attrCache.set(key, (a = attrs({ ocg, rgb, lineWidthPt, dash, source, clipId })));
      return a;
    };
    const countLayer = (n) => {
      const ocg = currentOcg();
      if (ocg != null) layerCount.set(ocg, (layerCount.get(ocg) ?? 0) + n);
    };
    const pushClip = (clip) => {
      clip.id = clips.length;
      clip.parent = clipStack.at(-1);
      clips.push(clip);
      clipStack.push(clip.id);
    };

    const addPath = (path, ctm, cs, color, alpha, isFill, stroke) => {
      if (skip() || alpha === 0) return;
      const m = concat(ctm, f);
      const scale = matrixScale(ctm);
      const rgb = toRgb(cs, color);
      let lw = 0;
      let dash = null;
      if (stroke) {
        lw = Math.round(stroke.getLineWidth() * scale * 1e4) / 1e4;
        const d = stroke.getDashes?.();
        if (d && d.length && d.some((v) => v > 0)) dash = d.map((v) => Math.round(v * scale * 1e4) / 1e4);
      }
      const a = makeAttrs(rgb, lw, dash, isFill ? 'fill' : 'stroke');
      const before = entities.length;
      subpathsToEntities(walkPath(path, m), a, isFill, nextChain, entities);
      stats.paths++;
      for (let k = before; k < entities.length; k++) {
        const e = entities[k];
        stats.segments += e.kind === 'polyline' ? e.pts.length / 2 - (e.closed ? 0 : 1) : 1;
      }
      countLayer(entities.length - before);
    };

    const addText = (textObj, ctm, cs, color, alpha) => {
      if (skip() || alpha === 0) return;
      const a = makeAttrs(toRgb(cs, color), 0, null, 'text');
      const cf = concat(ctm, f);
      let unmapped = false;
      const glyphs = [];
      textObj.walk({
        showGlyph(font, trm, gid, unicode, wmode) {
          const m = concat(trm, cf);
          const xs = Math.hypot(m[0], m[1]);
          const size = Math.hypot(m[2], m[3]);
          if (!(xs > 0) || !(size > 0)) return;
          const ux = m[0] / xs;
          const uy = m[1] / xs;
          let adv = 0;
          try {
            adv = font.advanceGlyph(gid, wmode) * xs;
          } catch {
            adv = 0.5 * xs;
          }
          const bad = !unicode || unicode === 0xfffd || unicode < 32;
          if (bad) unmapped = true;
          glyphs.push({ x: m[4], y: m[5], ux, uy, size, adv, rot: (Math.atan2(m[1], m[0]) * 180) / Math.PI, ch: bad ? '�' : String.fromCodePoint(unicode), unmapped: bad, a });
        },
      });
      const outline = outlineMode === 'all' || (outlineMode === 'unmapped' && unmapped);
      if (outline) {
        try {
          const rings = textOutlines(mupdf, bounds, textObj, ctm, cs, color, alpha, f, curveTol);
          for (const r of rings) entities.push(polyline(r.pts, r.closed, a));
          result.outlined++;
          countLayer(rings.length);
          return;
        } catch {
          /* outline not available: keep the text */
        }
      }
      for (const g of glyphs) texts.glyph(g);
      countLayer(1);
    };

    const imageBox = (ctm) => {
      const m = concat(ctm, f);
      const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
      const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    };

    const errors = [];
    const guard =
      (fn) =>
      (...args) => {
        try {
          return fn(...args);
        } catch (e) {
          if (errors.length < 5) errors.push(String(e?.message ?? e));
          return undefined;
        }
      };

    const dev = new mupdf.Device({
      fillPath: guard((path, evenOdd, ctm, cs, color, alpha) => addPath(path, ctm, cs, color, alpha, true, null)),
      strokePath: guard((path, stroke, ctm, cs, color, alpha) => addPath(path, ctm, cs, color, alpha, false, stroke)),
      clipPath: guard((path, evenOdd, ctm) => {
        const rings = clipRings(walkPath(path, concat(ctm, f)), curveTol);
        const rect = rings.length === 1 ? ringAsRect(rings[0], 1e-4) : null;
        pushClip(rect ? { rect } : rings.length ? { rings, evenOdd } : { none: true });
      }),
      clipStrokePath: guard(() => pushClip({ none: true })),
      clipText: guard(() => pushClip({ none: true })),
      clipStrokeText: guard(() => pushClip({ none: true })),
      clipImageMask: guard(() => pushClip({ none: true })),
      popClip: guard(() => {
        if (clipStack.length > 1) clipStack.pop();
      }),
      fillText: guard((t, ctm, cs, color, alpha) => addText(t, ctm, cs, color, alpha)),
      strokeText: guard((t, stroke, ctm, cs, color, alpha) => addText(t, ctm, cs, color, alpha)),
      ignoreText: guard(() => {
        stats.invisibleText++;
      }),
      fillShade: guard(() => {
        stats.shadings++;
      }),
      fillImage: guard((image, ctm) => {
        if (skip()) return;
        stats.images++;
        result.images.push({ bbox: imageBox(ctm), w: image.getWidth(), h: image.getHeight() });
      }),
      fillImageMask: guard((image, ctm) => {
        if (skip()) return;
        stats.images++;
        result.images.push({ bbox: imageBox(ctm), w: image.getWidth(), h: image.getHeight(), mask: true });
      }),
      beginMask: guard(() => {
        maskDepth++;
      }),
      endMask: guard(() => {
        maskDepth = Math.max(0, maskDepth - 1);
        pushClip({ none: true }); // the mask is popped like a clip
      }),
      beginTile: guard(() => {
        tileDepth++;
        return 0;
      }),
      endTile: guard(() => {
        tileDepth = Math.max(0, tileDepth - 1);
      }),
      beginLayer: guard((name) => ocgStack.push(name)),
      endLayer: guard(() => ocgStack.pop()),
    });

    try {
      page.run(dev, IDENTITY);
    } catch (e) {
      if (!entities.length) throw new PdfError('damaged', String(e?.message ?? e));
      errors.push(String(e?.message ?? e));
    } finally {
      try {
        dev.close();
      } catch {
        /* already closed */
      }
      for (const k of restore) this.pdf.setLayerVisible(k, false);
    }
    texts.flush();
    for (const [name, count] of layerCount) result.layers.push({ name, visible: defaultVisible.get(name) ?? true, count });
    for (const l of docLayers) if (!layerCount.has(l.name) && !result.layers.some((x) => x.name === l.name)) result.layers.push({ name: l.name, visible: l.visible, count: 0 });
    if (errors.length) result.errors = errors;
    return result;
  }

  /** Grey raster of a page. Large pages get a lower resolution so the raster stays below maxPixels. */
  renderPage(i, dpi = 150, { maxPixels = 40e6 } = {}) {
    const { mupdf } = this;
    const page = this.loadPage(i);
    const b = page.getBounds();
    const w = b[2] - b[0];
    const h = b[3] - b[1];
    let z = dpi / 72;
    if (w * h * z * z > maxPixels) z = Math.sqrt(maxPixels / (w * h));
    const pix = page.toPixmap(mupdf.Matrix.scale(z, z), mupdf.ColorSpace.DeviceGray, false);
    const width = pix.getWidth();
    const height = pix.getHeight();
    const stride = pix.getStride();
    const src = pix.getPixels();
    const data = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) data.set(src.subarray(y * stride, y * stride + width), y * width);
    try {
      pix.destroy?.();
    } catch {
      /* freed by the garbage collector */
    }
    return { width, height, dpi: z * 72, data };
  }

  close() {
    try {
      this.doc?.destroy?.();
    } catch {
      /* ignore */
    }
    this.doc = null;
    this.pdf = null;
  }
}
