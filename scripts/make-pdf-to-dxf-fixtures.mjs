// SPDX-License-Identifier: AGPL-3.0-or-later
// Write the test corpus of the PDF → DXF tool to tests/fixtures/pdf-to-dxf/: one PDF per case plus
// <name>.truth.json with the expected geometry. Run it when the corpus changes and commit the result:
//   node scripts/make-pdf-to-dxf-fixtures.mjs
//
// Truth coordinates are PDF points, y up, origin at the bottom left of the page as a viewer shows it
// (after /Rotate and CropBox). Entities use the readable form of the IR (tools/pdf-to-dxf/ir.js):
//   { kind: 'line' | 'polyline' | 'cubic', pts: [[x, y], …], closed?, rgb, lineWidthPt, dash, source, layer }
//   { kind: 'text', pos: [x, y], height, rot, str }
// `expect` holds what the pipeline must produce for that case (clipping, dedupe, arcs, scale …).
// The scans are rendered from a vector page with MuPDF; the dirty one is skewed, noisy and grey.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import {
  PDFDocument,
  PDFName,
  PDFString,
  PDFArray,
  degrees,
  rgb,
} from '../lib/vendor/pdf-lib/pdf-lib.esm.min.js';
import fontkit from '../lib/vendor/fontkit/fontkit.esm.min.js';
import * as mupdf from '../lib/vendor/mupdf/mupdf.js';

const OUT = new URL('../tests/fixtures/pdf-to-dxf/', import.meta.url);
const FONT = new URL('../assets/fonts/pdf/sans-400.ttf', import.meta.url);

const A4 = [595.28, 841.89];
const A3_LANDSCAPE = [1190.55, 841.89];
const A1 = [1683.78, 2383.94];
const A5_LANDSCAPE = [595.28, 419.53];
const MM = 72 / 25.4; // pt per mm

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const num = (v) => String(r4(v));
const BLACK = [0, 0, 0];

// ---- content stream builder: raw operators, and the truth entities they draw ---------------------

class Sheet {
  constructor() {
    this.ops = [];
    this.entities = [];
    this.state = { rgb: BLACK, fill: BLACK, lw: 1, dash: null, layer: null };
    this.stack = [];
  }
  op(s) {
    this.ops.push(s);
    return this;
  }
  save() {
    this.stack.push({ ...this.state });
    return this.op('q');
  }
  restore() {
    this.state = this.stack.pop();
    return this.op('Q');
  }
  stroke(c) {
    this.state.rgb = c;
    return this.op(`${c.map(num).join(' ')} RG`);
  }
  fillColor(c) {
    this.state.fill = c;
    return this.op(`${c.map(num).join(' ')} rg`);
  }
  width(w) {
    this.state.lw = w;
    return this.op(`${num(w)} w`);
  }
  dash(arr, phase = 0) {
    this.state.dash = arr && arr.length ? arr : null;
    return this.op(`[${(arr ?? []).map(num).join(' ')}] ${num(phase)} d`);
  }
  beginLayer(tag, name) {
    this.state.layer = name;
    return this.op(`/OC /${tag} BDC`);
  }
  endLayer() {
    this.state.layer = null;
    return this.op('EMC');
  }
  attrs(source) {
    const s = this.state;
    return source === 'fill'
      ? { rgb: s.fill, lineWidthPt: 0, dash: null, source, layer: s.layer }
      : { rgb: s.rgb, lineWidthPt: s.lw, dash: s.dash, source, layer: s.layer };
  }
  /** Path from points; `closed` adds h. Paint: 'S' stroke, 'f' fill, 'B' both, 'n' none (clip). */
  path(pts, { closed = false, paint = 'S', record = true } = {}) {
    pts = pts.map(([x, y]) => [r4(x), r4(y)]);
    const d = pts.map(([x, y], i) => `${num(x)} ${num(y)} ${i ? 'l' : 'm'}`).join(' ');
    this.op(`${d}${closed ? ' h' : ''} ${paint}`);
    if (record) this.recordPoly(pts, closed, paint);
    return this;
  }
  recordPoly(pts, closed, paint) {
    const ent = (source) => {
      // A fill is always closed. Two points make a line.
      const isClosed = closed || source === 'fill';
      if (pts.length === 2 && !isClosed) return { kind: 'line', pts, ...this.attrs(source) };
      return { kind: 'polyline', pts, closed: isClosed, ...this.attrs(source) };
    };
    if (paint === 'f' || paint === 'B') this.entities.push(ent('fill'));
    if (paint === 'S' || paint === 'B') this.entities.push(ent('stroke'));
  }
  rect(x, y, w, h, paint = 'S') {
    this.op(`${num(x)} ${num(y)} ${num(w)} ${num(h)} re ${paint}`);
    const pts = [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ].map(([a, b]) => [r4(a), r4(b)]);
    this.recordPoly(pts, true, paint);
    return this;
  }
  line(x0, y0, x1, y1) {
    return this.path([
      [x0, y0],
      [x1, y1],
    ]);
  }
  /** One subpath of cubic segments [[p0, c1, c2, p3], …]; every segment starts where the last ended. */
  curves(segs, { closed = false, paint = 'S' } = {}) {
    segs = segs.map((s) => s.map(([x, y]) => [r4(x), r4(y)]));
    const p = (q) => `${num(q[0])} ${num(q[1])}`;
    let d = `${p(segs[0][0])} m`;
    for (const [, c1, c2, p3] of segs) d += ` ${p(c1)} ${p(c2)} ${p(p3)} c`;
    this.op(`${d}${closed ? ' h' : ''} ${paint}`);
    for (const s of segs) this.entities.push({ kind: 'cubic', pts: s, ...this.attrs('stroke') });
    return this;
  }
  clipRect(x, y, w, h) {
    return this.op(`${num(x)} ${num(y)} ${num(w)} ${num(h)} re W n`);
  }
  clipPoly(pts) {
    return this.path(pts, { closed: true, paint: 'W n', record: false });
  }
  toString() {
    return this.ops.join('\n') + '\n';
  }
}

/** Cubic Bézier for a circular arc from a0 to a1 (degrees, ≤ 90° apart). */
function arcBezier([cx, cy], r, a0, a1) {
  const t0 = (a0 * Math.PI) / 180;
  const t1 = (a1 * Math.PI) / 180;
  const k = (4 / 3) * Math.tan((t1 - t0) / 4);
  const p0 = [cx + r * Math.cos(t0), cy + r * Math.sin(t0)];
  const p3 = [cx + r * Math.cos(t1), cy + r * Math.sin(t1)];
  const c1 = [p0[0] - k * r * Math.sin(t0), p0[1] + k * r * Math.cos(t0)];
  const c2 = [p3[0] + k * r * Math.sin(t1), p3[1] - k * r * Math.cos(t1)];
  return [p0, c1, c2, p3];
}

/** Bézier segments of an arc, split into pieces of at most 90°. */
function arcSegments(c, r, a0, a1) {
  const n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 90 - 1e-9));
  const out = [];
  for (let i = 0; i < n; i++) out.push(arcBezier(c, r, a0 + ((a1 - a0) * i) / n, a0 + ((a1 - a0) * (i + 1)) / n));
  return out;
}

function ellipseSegments([cx, cy], rx, ry) {
  const k = 0.5522847498;
  const P = (x, y) => [cx + x, cy + y];
  return [
    [P(rx, 0), P(rx, k * ry), P(k * rx, ry), P(0, ry)],
    [P(0, ry), P(-k * rx, ry), P(-rx, k * ry), P(-rx, 0)],
    [P(-rx, 0), P(-rx, -k * ry), P(-k * rx, -ry), P(0, -ry)],
    [P(0, -ry), P(k * rx, -ry), P(rx, -k * ry), P(rx, 0)],
  ];
}

// ---- PDF assembly ---------------------------------------------------------------------------------

async function newDoc() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setCreator('HLKS-Tools test corpus');
  doc.setProducer('pdf-lib');
  const fixed = new Date('2026-10-12T00:00:00Z');
  doc.setCreationDate(fixed);
  doc.setModificationDate(fixed);
  return doc;
}

function addSheet(doc, size, sheet) {
  const page = doc.addPage(size);
  const ref = doc.context.register(doc.context.stream(sheet.toString()));
  page.node.addContentStream(ref);
  return page;
}

const pageTruth = ([width, height], entities) => ({ width, height, entities });

async function save(name, doc, truth) {
  const bytes = await doc.save({ useObjectStreams: false });
  await writeFile(new URL(`${name}.pdf`, OUT), bytes);
  await writeFile(new URL(`${name}.truth.json`, OUT), JSON.stringify({ name, ...truth }, null, 1) + '\n');
  console.log(`${name}.pdf  ${(bytes.length / 1024).toFixed(1)} kB`);
  return bytes;
}

// ---- cases ------------------------------------------------------------------------------------------

async function lines() {
  const doc = await newDoc();
  const s = new Sheet();
  s.stroke(BLACK).width(0.5).rect(50, 600, 200, 100);
  s.stroke([1, 0, 0]).width(1).path(
    [
      [300, 600],
      [500, 600],
      [500, 750],
      [300, 750],
    ],
    { closed: true },
  );
  s.stroke([0, 0, 1]).width(0.25).line(60, 400, 260, 550);
  s.stroke(BLACK).width(0.7).path([
    [300, 300],
    [350, 350],
    [400, 300],
    [450, 350],
  ]);
  // control distance: exactly 100 mm on paper
  const len = 100 * MM;
  s.stroke(BLACK).width(0.35 * MM).line(100, 200, 100 + len, 200);
  addSheet(doc, A4, s);
  await save('lines', doc, {
    description: 'Rectangles, lines, open polyline, control distance of exactly 100 mm on paper',
    pages: [pageTruth(A4, s.entities)],
    expect: { control: { p0: [100, 200], p1: [r4(100 + len), 200], paperMm: 100 } },
  });
}

async function curves() {
  const doc = await newDoc();
  const s = new Sheet();
  s.stroke(BLACK).width(0.5);
  s.curves(arcSegments([150, 650], 50, 0, 360), { closed: true }); // full circle, 4 Béziers
  s.curves(arcSegments([350, 650], 60, 0, 90)); // quarter arc
  s.curves(arcSegments([150, 450], 40, 0, 180)); // half arc, 2 Béziers
  s.curves(arcSegments([400, 450], 30, 200, 245)); // 45° arc, one Bézier
  s.curves([
    [
      [300, 300],
      [350, 400],
      [400, 200],
      [450, 300],
    ],
  ]); // free S curve
  s.curves(ellipseSegments([200, 200], 60, 30), { closed: true }); // ellipse: no arcs
  addSheet(doc, A4, s);
  await save('curves', doc, {
    description: 'Full circle, quarter, half and 45° arcs as Béziers, a free S curve and an ellipse',
    pages: [pageTruth(A4, s.entities)],
    expect: {
      circles: [{ c: [150, 650], r: 50 }],
      arcs: [
        { c: [350, 650], r: 60, start: 0, end: 90 },
        { c: [150, 450], r: 40, start: 0, end: 180 },
        { c: [400, 450], r: 30, start: 200, end: 245 },
      ],
      freeCurves: 2,
    },
  });
}

async function layers() {
  const doc = await newDoc();
  const ctx = doc.context;
  const names = ['Waende', 'Moebel', 'Bemassung'];
  const ocgs = names.map((n) => ctx.register(ctx.obj({ Type: 'OCG', Name: PDFString.of(n) })));
  const arr = (refs) => {
    const a = PDFArray.withContext(ctx);
    refs.forEach((r) => a.push(r));
    return a;
  };
  doc.catalog.set(
    PDFName.of('OCProperties'),
    ctx.obj({
      OCGs: arr(ocgs),
      D: ctx.obj({ Order: arr(ocgs), ON: arr(ocgs.slice(0, 2)), OFF: arr(ocgs.slice(2)) }),
    }),
  );
  const s = new Sheet();
  s.stroke(BLACK).width(1);
  s.beginLayer('oc1', 'Waende').rect(50, 500, 400, 250).rect(60, 510, 380, 230).endLayer();
  s.beginLayer('oc2', 'Moebel').stroke([0.5, 0.25, 0]).width(0.5).rect(100, 550, 80, 40).rect(250, 600, 60, 60).endLayer();
  s.beginLayer('oc3', 'Bemassung').stroke([0, 0, 1]).width(0.25).line(50, 470, 450, 470).line(50, 460, 50, 480).line(450, 460, 450, 480).endLayer();
  s.stroke(BLACK).width(0.5).line(50, 300, 450, 300); // outside any layer
  const page = addSheet(doc, A4, s);
  const props = ctx.obj({ oc1: ocgs[0], oc2: ocgs[1], oc3: ocgs[2] });
  page.node.Resources().set(PDFName.of('Properties'), props);
  await save('layers', doc, {
    description: 'Three optional content groups (Waende, Moebel, Bemassung); Bemassung is off by default',
    pages: [pageTruth(A4, s.entities)],
    expect: {
      layers: [
        { name: 'Waende', visible: true, count: 2 },
        { name: 'Moebel', visible: true, count: 2 },
        { name: 'Bemassung', visible: false, count: 3 },
      ],
      noLayer: 1,
    },
  });
}

async function clip() {
  const doc = await newDoc();
  const s = new Sheet();
  s.stroke(BLACK).width(0.5);
  // rectangular clip (100, 500)–(300, 650)
  s.save().clipRect(100, 500, 200, 150);
  s.line(50, 575, 350, 575); // → 100…300
  s.rect(150, 450, 100, 250); // → two vertical pieces, 500…650
  s.line(320, 520, 380, 620); // completely outside → removed
  s.line(120, 520, 280, 620); // completely inside → unchanged
  s.restore();
  // triangular clip (100, 100), (400, 100), (250, 350)
  s.save().clipPoly([
    [100, 100],
    [400, 100],
    [250, 350],
  ]);
  s.line(50, 200, 450, 200); // → 160…340
  s.line(250, 50, 250, 400); // → 100…350
  s.restore();
  s.line(400, 400, 500, 400); // no clip
  addSheet(doc, A4, s);
  await save('clip', doc, {
    description: 'Rectangular clip with overhanging lines and a rectangle, triangular clip',
    pages: [pageTruth(A4, s.entities)],
    expect: {
      clipped: [
        { kind: 'line', pts: [[100, 575], [300, 575]] },
        { kind: 'line', pts: [[150, 500], [150, 650]] },
        { kind: 'line', pts: [[250, 500], [250, 650]] },
        { kind: 'line', pts: [[120, 520], [280, 620]] },
        { kind: 'line', pts: [[160, 200], [340, 200]] },
        { kind: 'line', pts: [[250, 100], [250, 350]] },
        { kind: 'line', pts: [[400, 400], [500, 400]] },
      ],
    },
  });
}

async function text() {
  const doc = await newDoc();
  const font = await doc.embedFont(await readFile(FONT), { subset: true });
  const bare = await doc.embedFont(await readFile(FONT), { subset: true });
  const page = doc.addPage(A4);
  const texts = [
    { str: 'Büro 3.50 m²', pos: [100, 700], height: 12, rot: 0 },
    { str: 'Ø 160', pos: [100, 650], height: 10, rot: 0 },
    { str: 'Vertikal', pos: [300, 500], height: 10, rot: 90 },
    { str: 'Schräg 30°', pos: [100, 400], height: 14, rot: 30 },
  ];
  for (const t of texts) page.drawText(t.str, { x: t.pos[0], y: t.pos[1], size: t.height, font, rotate: degrees(t.rot), color: rgb(0, 0, 0) });
  // same font without ToUnicode: the glyphs cannot be mapped back to characters
  const hidden = { str: 'Ohne Zuordnung', pos: [100, 300], height: 10, rot: 0, noUnicode: true };
  page.drawText(hidden.str, { x: hidden.pos[0], y: hidden.pos[1], size: hidden.height, font: bare, color: rgb(0, 0, 0) });
  await doc.flush();
  doc.context.lookup(bare.ref).delete(PDFName.of('ToUnicode'));
  await save('text', doc, {
    description: 'Text with umlauts, ², Ø and °, rotated 90° and 30°, and one text without ToUnicode',
    pages: [pageTruth(A4, [...texts, hidden].map((t) => ({ kind: 'text', ...t })))],
    expect: { texts: [...texts, hidden] },
  });
}

async function hatch() {
  const doc = await newDoc();
  const s = new Sheet();
  const [x0, y0, x1, y1] = [100, 500, 300, 650];
  s.stroke(BLACK).width(0.5).rect(x0, y0, x1 - x0, y1 - y0);
  // 45° hatch lines inside the rectangle, 8 pt apart (perpendicular)
  s.width(0.18);
  const step = 8 * Math.SQRT2; // offset of x − y between lines
  const hatchLines = [];
  for (let c = x0 - y1 + step; c < x1 - y0; c += step) {
    // line x − y = c inside the rectangle
    const pts = [];
    for (const x of [x0, x1]) if (x - c >= y0 - 1e-9 && x - c <= y1 + 1e-9) pts.push([x, x - c]);
    for (const y of [y0, y1]) if (y + c >= x0 - 1e-9 && y + c <= x1 + 1e-9) pts.push([y + c, y]);
    pts.sort((a, b) => a[0] - b[0]);
    const a = pts[0];
    const b = pts.at(-1);
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1) continue;
    s.line(a[0], a[1], b[0], b[1]);
    hatchLines.push([a, b]);
  }
  // filled triangle, no outline
  s.fillColor([0.6, 0.6, 0.6]).path(
    [
      [350, 500],
      [500, 500],
      [425, 650],
    ],
    { closed: true, paint: 'f' },
  );
  addSheet(doc, A4, s);
  await save('hatch', doc, {
    description: 'Rectangle with 45° line hatching, filled triangle without outline',
    pages: [pageTruth(A4, s.entities)],
    expect: { hatchLines: hatchLines.length, outline: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], fill: [[350, 500], [500, 500], [425, 650]] },
  });
}

async function dash() {
  const doc = await newDoc();
  const s = new Sheet();
  s.stroke(BLACK).width(0.5);
  s.dash([6, 3]).line(100, 700, 400, 700);
  s.dash([8, 3, 1, 3]).line(100, 650, 400, 650);
  s.dash([4, 2]).rect(100, 450, 200, 150);
  s.dash([]).line(100, 400, 400, 400);
  addSheet(doc, A4, s);
  await save('dash', doc, {
    description: 'Dashed and dash-dot lines, a dashed rectangle and a solid line',
    pages: [pageTruth(A4, s.entities)],
    expect: {
      dashed: [
        { y: 700, dash: [6, 3], pieces: 34 },
        { y: 650, dash: [8, 3, 1, 3], pieces: 40 },
      ],
    },
  });
}

async function dupes() {
  const doc = await newDoc();
  const s = new Sheet();
  s.stroke(BLACK).width(0.5);
  // filled and stroked (one path, fill + outline)
  s.fillColor([0.85, 0.85, 0.85]).rect(100, 600, 150, 100, 'B');
  // the same line twice
  s.line(300, 600, 500, 700).line(300, 600, 500, 700);
  // reversed duplicate
  s.line(300, 550, 500, 550).line(500, 550, 300, 550);
  // one line in four segments
  s.line(100, 300, 200, 300).line(200, 300, 300, 300).line(300, 300, 400, 300).line(400, 300, 500, 300);
  // overlapping collinear pieces
  s.line(100, 250, 300, 250).line(200, 250, 400, 250);
  // rectangle from four loose segments
  s.line(100, 400, 250, 400).line(250, 400, 250, 500).line(250, 500, 100, 500).line(100, 500, 100, 400);
  addSheet(doc, A4, s);
  await save('dupes', doc, {
    description: 'Fill plus outline, doubled and reversed lines, a line in four segments, overlaps, a rectangle from loose segments',
    pages: [pageTruth(A4, s.entities)],
    expect: {
      result: [
        { kind: 'polyline', closed: true, pts: [[100, 600], [250, 600], [250, 700], [100, 700]] },
        { kind: 'line', pts: [[300, 600], [500, 700]] },
        { kind: 'line', pts: [[300, 550], [500, 550]] },
        { kind: 'line', pts: [[100, 300], [500, 300]] },
        { kind: 'line', pts: [[100, 250], [400, 250]] },
        { kind: 'polyline', closed: true, pts: [[100, 400], [250, 400], [250, 500], [100, 500]] },
      ],
    },
  });
}

async function rotated() {
  const doc = await newDoc();
  const s = new Sheet();
  s.stroke(BLACK).width(1);
  s.path([
    [100, 200],
    [100, 400],
    [250, 400],
  ]); // L shape
  s.rect(300, 500, 100, 50);
  const page = addSheet(doc, A4, s);
  const crop = [50, 100, 545.28, 741.89]; // x0 y0 x1 y1
  page.setCropBox(crop[0], crop[1], crop[2] - crop[0], crop[3] - crop[1]);
  page.setRotation(degrees(90));
  // /Rotate 90 turns the page clockwise: (x, y) → (y − y0, x1 − x)
  const map = ([x, y]) => [r4(y - crop[1]), r4(crop[2] - x)];
  const entities = s.entities.map((e) => ({ ...e, pts: e.pts.map(map) }));
  await save('rotated', doc, {
    description: '/Rotate 90 and a CropBox that does not start at the origin',
    pages: [pageTruth([r4(crop[3] - crop[1]), r4(crop[2] - crop[0])], entities)],
    expect: { rotate: 90, cropBox: crop },
  });
}

async function multipage() {
  const doc = await newDoc();
  const pages = [];
  for (const [i, size] of [A4, A3_LANDSCAPE, A1].entries()) {
    const s = new Sheet();
    s.stroke(BLACK).width(0.5).rect(20, 20, size[0] - 40, size[1] - 40);
    for (let k = 0; k <= i; k++) s.line(40, 40 + k * 10, 140, 40 + k * 10); // page number as line count
    addSheet(doc, size, s);
    pages.push(pageTruth(size, s.entities));
  }
  await save('multipage', doc, { description: 'Three pages: A4 portrait, A3 landscape, A1 portrait', pages, expect: { pageCount: 3 } });
}

// ---- scans --------------------------------------------------------------------------------------------

/** Vector plan for the scans: rooms, a door with its swing, a diagonal, short walls. */
function scanPlan() {
  const s = new Sheet();
  const L = (x0, y0, x1, y1) => s.line(x0, y0, x1, y1);
  s.stroke(BLACK).width(2).rect(40, 40, 515, 340); // outer walls
  s.width(1.2);
  L(240, 40, 240, 250);
  L(240, 290, 240, 380);
  L(40, 200, 200, 200);
  L(240, 220, 555, 220);
  L(400, 220, 400, 380);
  L(120, 40, 120, 120);
  s.width(0.7);
  L(60, 300, 180, 340); // diagonal
  L(300, 80, 500, 80);
  L(300, 80, 300, 180);
  L(300, 180, 500, 180);
  L(500, 80, 500, 180);
  L(420, 260, 520, 260);
  L(420, 340, 520, 340);
  s.width(0.5).curves(arcSegments([240, 250], 40, 90, 180)); // door swing
  L(240, 250, 240, 290);
  const lines = s.entities.flatMap((e) => {
    if (e.kind === 'line') return [e.pts];
    if (e.kind === 'polyline') return e.pts.map((p, i) => [p, e.pts[(i + 1) % e.pts.length]]);
    return [];
  });
  return { sheet: s, lines };
}

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Grey raster of a vector PDF page with MuPDF (white 255, ink 0). */
function renderGray(bytes, dpi) {
  const doc = mupdf.Document.openDocument(bytes, 'application/pdf');
  const page = doc.loadPage(0);
  const z = dpi / 72;
  const pix = page.toPixmap(mupdf.Matrix.scale(z, z), mupdf.ColorSpace.DeviceGray, false);
  const w = pix.getWidth();
  const h = pix.getHeight();
  const stride = pix.getStride();
  const src = pix.getPixels();
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) out.set(src.subarray(y * stride, y * stride + w), y * w);
  return { w, h, data: out };
}

function grayPixmap({ w, h, data }, dpi) {
  const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceGray, [0, 0, w, h], false);
  const px = pix.getPixels();
  const stride = pix.getStride();
  for (let y = 0; y < h; y++) px.set(data.subarray(y * w, y * w + w), y * stride);
  pix.setResolution(dpi, dpi);
  return pix;
}

/** Skew (counter-clockwise as seen), grey uneven background, noise, specks and a few blots. */
function dirty({ w, h, data }, skewDeg, seed) {
  const rand = mulberry32(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
  const out = new Uint8Array(w * h);
  const t = (skewDeg * Math.PI) / 180;
  const [c, s] = [Math.cos(t), Math.sin(t)];
  const [cx, cy] = [w / 2, h / 2];
  const sample = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    if (x0 < 0 || y0 < 0 || x0 >= w - 1 || y0 >= h - 1) return 255;
    const fx = x - x0;
    const fy = y - y0;
    const i = y0 * w + x0;
    return (data[i] * (1 - fx) + data[i + 1] * fx) * (1 - fy) + (data[i + w] * (1 - fx) + data[i + w + 1] * fx) * fy;
  };
  for (let v = 0; v < h; v++) {
    for (let u = 0; u < w; u++) {
      const dx = u - cx;
      const dy = v - cy;
      const ink = 1 - sample(cx + dx * c - dy * s, cy + dx * s + dy * c) / 255;
      const bg = 212 + 10 * Math.sin(u / 610) * Math.cos(v / 470);
      out[v * w + u] = Math.max(0, Math.min(255, Math.round(bg * (1 - ink) + 40 * ink + 6 * gauss())));
    }
  }
  const spot = (x, y, r, val) => {
    for (let j = -r; j <= r; j++)
      for (let i = -r; i <= r; i++) {
        const xx = Math.round(x + i);
        const yy = Math.round(y + j);
        if (i * i + j * j <= r * r && xx >= 0 && yy >= 0 && xx < w && yy < h) out[yy * w + xx] = val;
      }
  };
  for (let k = 0; k < (w * h) / 4000; k++) spot(rand() * w, rand() * h, rand() < 0.8 ? 0 : 1, 60 + rand() * 60);
  for (let k = 0; k < 12; k++) spot(rand() * w, rand() * h, 3 + rand() * 4, 70 + rand() * 50);
  return { w, h, data: out };
}

async function scans() {
  const dpi = 300;
  const { sheet, lines } = scanPlan();
  const vec = await newDoc();
  addSheet(vec, A5_LANDSCAPE, sheet);
  const vecBytes = await vec.save({ useObjectStreams: false });
  const clean = renderGray(vecBytes, dpi);
  const truth = {
    pages: [pageTruth(A5_LANDSCAPE, [])],
    expect: { dpi, lines, arcs: [{ c: [240, 250], r: 40, start: 90, end: 180 }] },
  };
  for (const [name, raster, skew] of [
    ['scan_clean', clean, 0],
    ['scan_dirty', dirty(clean, 1.5, 12345), 1.5],
  ]) {
    const doc = await newDoc();
    const page = doc.addPage(A5_LANDSCAPE);
    const pix = grayPixmap(raster, dpi);
    const img = skew ? await doc.embedJpg(pix.asJPEG(75)) : await doc.embedPng(pix.asPNG());
    page.drawImage(img, { x: 0, y: 0, width: A5_LANDSCAPE[0], height: A5_LANDSCAPE[1] });
    await save(name, doc, {
      description: skew ? `Scan at ${dpi} dpi, skewed ${skew}°, grey background, noise and specks (JPEG)` : `Clean scan at ${dpi} dpi (PNG)`,
      ...truth,
      expect: { ...truth.expect, skewDeg: skew },
    });
  }
}

await mkdir(OUT, { recursive: true });
await lines();
await curves();
await layers();
await clip();
await text();
await hatch();
await dash();
await dupes();
await rotated();
await multipage();
await scans();
