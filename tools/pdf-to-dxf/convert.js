// SPDX-License-Identifier: AGPL-3.0-or-later
// Conversion service of the PDF → DXF tool: open, extract, render, process (pipeline + preview data) and
// export (DXF bytes). The worker (worker.js) calls it; tests call it directly in Node. No DOM.

import { PdfError } from './backend.js';
import { runPipeline, toDxfEntities, makeTransform, linetypePatterns, PT_MM } from './pipeline.js';
import { writeDxf } from './dxf.js';
import { flattenArc, flattenBezier } from './geometry.js';
import { entitiesBounds } from './ir.js';
import { normalizeInputs } from './defaults.js';

const MM_PT = 72 / 25.4;
/** Gap between pages placed side by side, pt (20 mm on paper). */
export const PAGE_GAP = 20 * MM_PT;

/** Extraction options that follow from the settings. */
export function extractionOptions(s) {
  return {
    hiddenLayers: !!s.hiddenLayers,
    textOutlines: s.text === 'outline' ? 'all' : s.text === 'text' ? 'unmapped' : 'none',
    curveTol: s.tol.flatten * MM_PT,
  };
}

/** Does the page look like a scan? Almost no vectors and an image over most of the page. */
export function looksScanned(page) {
  const area = page.width * page.height;
  const imageArea = page.images.reduce((s, im) => s + Math.max(0, im.bbox[2] - im.bbox[0]) * Math.max(0, im.bbox[3] - im.bbox[1]), 0);
  return page.stats.segments < 50 && page.stats.texts < 20 && imageArea >= 0.6 * area;
}

/** Warnings for the status line: [{ code, count? }]. */
export function pageWarnings(page) {
  const w = [];
  if (page.stats.unmapped) w.push({ code: 'unmapped', count: page.stats.unmapped });
  if (looksScanned(page)) w.push({ code: 'scan' });
  else if (page.images.length) w.push({ code: 'images', count: page.images.length });
  if (page.stats.shadings) w.push({ code: 'shadings', count: page.stats.shadings });
  if (page.errors?.length) w.push({ code: 'damaged', count: page.errors.length });
  return w;
}

/**
 * Preview data per layer for the canvas: polylines as Float32Array (x, y in pt) with start indices and
 * flags, texts as objects. Arcs, circles and Béziers are flattened coarsely (0.15 pt).
 */
export function previewData(entities, layers) {
  const byLayer = new Map(layers.map((l) => [l.name, { ...l, coords: [], starts: [], closed: [], fill: [], texts: [] }]));
  const add = (L, pts, closed, fill) => {
    L.starts.push(L.coords.length / 2);
    for (let i = 0; i < pts.length; i++) L.coords.push(pts[i]);
    L.closed.push(closed ? 1 : 0);
    L.fill.push(fill ? 1 : 0);
  };
  for (const e of entities) {
    const L = byLayer.get(e.a.layer);
    if (!L) continue;
    switch (e.kind) {
      case 'line':
      case 'polyline':
        add(L, e.pts, e.kind === 'polyline' && e.closed, e.a.source === 'fill' && e.closed);
        break;
      case 'cubic':
        add(L, flattenBezier(e.pts, 0.15, [e.pts[0], e.pts[1]]), false, false);
        break;
      case 'arc':
        add(L, flattenArc(e.cx, e.cy, e.r, e.start, e.end, 0.15), false, false);
        break;
      case 'circle':
        add(L, flattenArc(e.cx, e.cy, e.r, 0, 360, 0.15), true, false);
        break;
      case 'text':
        L.texts.push({ x: e.x, y: e.y, height: e.height, rot: e.rot, str: e.str, width: e.width });
        break;
      default:
        break;
    }
  }
  const out = [];
  const transfer = [];
  for (const L of byLayer.values()) {
    const coords = Float32Array.from(L.coords);
    const starts = Uint32Array.from(L.starts);
    const closed = Uint8Array.from(L.closed);
    const fill = Uint8Array.from(L.fill);
    transfer.push(coords.buffer, starts.buffer, closed.buffer, fill.buffer);
    out.push({ name: L.name, rgb: L.rgb, lw: L.lw, count: L.count, off: L.off, pdf: L.pdf, visible: L.visible, coords, starts, closed, fill, texts: L.texts });
  }
  return { layers: out, transfer };
}

/** File name of an export: base name of the PDF, page number when needed, .dxf. */
export function dxfFileName(base, pageIndex = null) {
  const clean = String(base || 'plan')
    .replace(/\.pdf$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '')
    .trim()
    .slice(0, 100) || 'plan';
  return pageIndex == null ? `${clean}.dxf` : `${clean}_S${pageIndex + 1}.dxf`;
}

/** Service around one backend. Every method returns { value, transfer? } (transfer: buffers for postMessage). */
export function createService(backend) {
  const cache = new Map(); // extracted pages by page index and extraction options

  function extractCached(page, options = {}) {
    const key = `${page}|${!!options.hiddenLayers}|${options.textOutlines ?? 'none'}|${options.curveTol ?? 0.05}`;
    let p = cache.get(key);
    if (!p) {
      p = backend.extract(page, options);
      if (cache.size > 6) cache.delete(cache.keys().next().value);
      cache.set(key, p);
    }
    return p;
  }

  /** Pipeline for one page. The area selection belongs to the current page only. */
  function processPage(index, s, ctx) {
    const page = extractCached(index, extractionOptions(s));
    const settings = index === s.page ? s : { ...s, area: null };
    const result = runPipeline(page, settings, ctx);
    return { page, ...result };
  }

  /** DXF bytes for a list of processed pages placed side by side (one page: no offset). */
  function buildDxf(processed, s) {
    let x = 0;
    const all = [];
    const placed = processed.map((p) => {
      const offset = [x, 0];
      x += p.page.width + PAGE_GAP;
      return { ...p, offset };
    });
    const bounds = (() => {
      const b = [Infinity, Infinity, -Infinity, -Infinity];
      for (const p of placed) {
        const eb = entitiesBounds(p.entities);
        if (!eb) continue;
        b[0] = Math.min(b[0], eb[0] + p.offset[0]);
        b[1] = Math.min(b[1], eb[1] + p.offset[1]);
        b[2] = Math.max(b[2], eb[2] + p.offset[0]);
        b[3] = Math.max(b[3], eb[3] + p.offset[1]);
      }
      return b[0] <= b[2] ? b : [0, 0, 0, 0];
    })();
    let linetypes = {};
    const layerMap = new Map();
    for (const p of placed) {
      const xf = makeTransform({ scale: s.scale, unit: s.unit, origin: s.origin, bounds, offset: p.offset });
      linetypes = { ...linetypePatterns(p.entities, xf), ...linetypes };
      for (const e of toDxfEntities(p.entities, xf, { splines: s.curves === 'spline' && s.version !== 'R12', fillsAsHatch: s.fills === 'hatch', curveTol: s.tol.flatten * MM_PT })) all.push(e);
      for (const l of p.layers) if (!l.off && !layerMap.has(l.name)) layerMap.set(l.name, { name: l.name, rgb: l.rgb });
    }
    return writeDxf({ layers: [...layerMap.values()], entities: all }, { version: s.version, units: s.unit, trueColor: s.trueColor, linetypes });
  }

  return {
    backend,
    extractCached,
    processPage,
    buildDxf,

    open({ bytes }) {
      cache.clear();
      backend.open(bytes);
      const pageCount = backend.getPageCount();
      const pages = [];
      for (let i = 0; i < pageCount; i++) pages.push(backend.getPageInfo(i));
      return { value: { pageCount, pages, layers: backend.getLayers() } };
    },

    extract({ page, options }) {
      return { value: extractCached(page, options) };
    },

    render({ page, dpi, maxPixels }) {
      if (!Number.isInteger(page)) throw new PdfError('page');
      const r = backend.renderPage(page, dpi, maxPixels ? { maxPixels } : undefined);
      return { value: r, transfer: [r.data.buffer] };
    },

    /** Pipeline for the current page, with preview data. */
    process({ settings }, ctx = {}) {
      const s = normalizeInputs(settings);
      if (s.page >= backend.getPageCount()) throw new PdfError('page');
      ctx.progress?.(0.05, 'extract');
      const t = Date.now();
      const r = processPage(s.page, s, ctx);
      const extractMs = Date.now() - t - r.stats.ms;
      const { layers, transfer } = previewData(r.entities, r.layers);
      return {
        value: {
          page: s.page,
          width: r.page.width,
          height: r.page.height,
          layers,
          stats: { ...r.stats, extractMs: Math.max(0, extractMs) },
          warnings: pageWarnings(r.page),
          scanned: looksScanned(r.page),
          pdfLayers: r.page.layers,
        },
        transfer,
      };
    },

    /** DXF export. Returns { files: [{ name, bytes }] }. */
    export({ settings, name }, ctx = {}) {
      const s = normalizeInputs(settings);
      const n = backend.getPageCount();
      const pages = s.pages === 'current' ? [s.page] : [...Array(n).keys()];
      const processed = [];
      pages.forEach((i, k) => {
        ctx.progress?.(k / pages.length, 'page');
        processed.push(processPage(i, s, { isCancelled: ctx.isCancelled }));
      });
      const files = [];
      if (s.pages === 'each') {
        for (const p of processed) files.push({ name: dxfFileName(name, p.page.index), bytes: buildDxf([p], s).bytes });
      } else {
        files.push({ name: dxfFileName(name, s.pages === 'current' && n > 1 ? s.page : null), bytes: buildDxf(processed, s).bytes });
      }
      ctx.progress?.(1, 'done');
      return { value: { files }, transfer: files.map((f) => f.bytes.buffer) };
    },
  };
}

export { PT_MM };
