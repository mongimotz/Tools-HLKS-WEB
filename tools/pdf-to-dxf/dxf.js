// SPDX-License-Identifier: AGPL-3.0-or-later
// DXF writer of the PDF → DXF tool: AutoCAD R2000 (AC1015, full structure with handles and owners) and
// R12 (AC1009, plain entities). No DOM. Output: Windows-1252 bytes with CRLF line ends; characters outside
// Windows-1252 are written as \U+XXXX (R2000) or ? (R12).
//
// Input (already in output units, y up):
//   doc.layers:   [{ name, rgb: [r, g, b] }]   names are cleaned here (see cleanLayerNames)
//   doc.entities: { kind, layer, rgb?, lw? (mm on paper), linetype? ('DASHED' | 'DASHDOT'), ... }
//     line      pts: [x0 y0 x1 y1]
//     polyline  pts: [x0 y0 …], closed, bulges? (one per vertex)
//     arc       cx, cy, r, start, end   (degrees, counter-clockwise)
//     circle    cx, cy, r
//     text      x, y, height, rot, str
//     hatch     rings: [[x0 y0 …], …]   solid fill (R2000 only; R12 writes the outlines)
//     spline    pts: [p0 c1 c2 p3]      one cubic Bézier (R2000 only; R12 needs it flattened before)
//   options: { version: 'R2000' | 'R12', units: 'mm' | 'cm' | 'm', trueColor: true,
//              linetypes: { DASHED: [dash, -gap, …], DASHDOT: [...] } (output units) }

// ---- numbers, text, colours ----------------------------------------------------------------------

/** DXF real: plain decimal, at most 6 decimals, never exponent notation. */
export function num(v) {
  if (!Number.isFinite(v)) return '0.0';
  let s = v.toFixed(6);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '.0');
  if (s === '-0.0') s = '0.0';
  return s;
}

const CP1252_HIGH = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
const CP1252_BACK = Object.fromEntries(Object.entries(CP1252_HIGH).map(([u, b]) => [b, Number(u)]));

/** Windows-1252 byte of a code point, or -1. */
export function cp1252Byte(cp) {
  if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) return cp;
  return CP1252_HIGH[cp] ?? -1;
}

/** Code point of a Windows-1252 byte (for reading DXF back). */
export const cp1252Char = (b) => (b < 0x80 || b >= 0xa0 ? b : (CP1252_BACK[b] ?? 0xfffd));

/** Encode DXF text (already escaped, so only Windows-1252 characters) into bytes. */
export function encodeCp1252(str) {
  const out = new Uint8Array(str.length);
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const b = cp1252Byte(str.charCodeAt(i));
    out[n++] = b < 0 ? 0x3f : b;
  }
  return out.subarray(0, n);
}

/** Text value for a DXF string: no line breaks, %% escaped, characters outside Windows-1252 as \U+XXXX. */
export function escapeText(str, version = 'R2000') {
  let out = '';
  for (const ch of String(str).replace(/[\r\n]+/g, ' ')) {
    const cp = ch.codePointAt(0);
    if (cp < 32) continue;
    if (cp1252Byte(cp) >= 0) out += ch;
    else if (version === 'R12') out += '?';
    else out += `\\U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
  }
  return out.replace(/%%/g, '%%%%%%'); // %%% is one literal percent sign
}

/** AutoCAD colour index palette (1…255) as RGB. */
export const ACI = (() => {
  const pal = new Array(256);
  pal[0] = [0, 0, 0];
  const basic = [
    [255, 0, 0], [255, 255, 0], [0, 255, 0], [0, 255, 255], [0, 0, 255], [255, 0, 255], [255, 255, 255], [128, 128, 128], [192, 192, 192],
  ];
  basic.forEach((c, i) => (pal[i + 1] = c));
  const V = [255, 204, 153, 127, 76];
  for (let h = 0; h < 24; h++) {
    for (let k = 0; k < 10; k++) {
      const v = V[k >> 1];
      const s = k % 2 ? 0.5 : 1;
      const hue = h * 15;
      const c = v;
      const lo = v * (1 - s);
      const x = (hue % 60) / 60;
      const seg = Math.floor(hue / 60);
      const up = lo + (c - lo) * x;
      const down = c - (c - lo) * x;
      const rgb = [
        [c, up, lo], [down, c, lo], [lo, c, up], [lo, down, c], [up, lo, c], [c, lo, down],
      ][seg];
      pal[10 + h * 10 + k] = rgb.map((t) => Math.floor(t));
    }
  }
  [51, 91, 132, 173, 214, 255].forEach((g, i) => (pal[250 + i] = [g, g, g]));
  return pal;
})();

const isBlackOrWhite = ([r, g, b]) => (r <= 8 && g <= 8 && b <= 8) || (r >= 247 && g >= 247 && b >= 247);

/** Nearest ACI for an RGB colour. Black and white map to 7 (shown black or white by the CAD background). */
export function nearestAci(rgb) {
  if (!rgb || isBlackOrWhite(rgb)) return 7;
  let best = 7;
  let bestD = Infinity;
  for (let i = 1; i < 256; i++) {
    if (i === 7 || i === 255) continue;
    const [r, g, b] = ACI[i];
    // weighted distance (the eye is most sensitive to green)
    const d = 2 * (r - rgb[0]) ** 2 + 4 * (g - rgb[1]) ** 2 + 3 * (b - rgb[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

const trueColor = ([r, g, b]) => (r << 16) | (g << 8) | b;

/** Valid DXF lineweights in 1/100 mm. */
export const LINEWEIGHTS = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];

/** Nearest valid lineweight (1/100 mm) for a width in mm. */
export function lineweight(mm) {
  const v = Math.max(0, mm) * 100;
  let best = 0;
  for (const w of LINEWEIGHTS) if (Math.abs(w - v) < Math.abs(best - v)) best = w;
  return best;
}

/**
 * Clean and deduplicate layer names. R2000: up to 255 characters, none of < > / \ " : ; ? * | = `.
 * R12: up to 31 characters A–Z 0–9 _ - $. Returns a Map original → clean.
 */
export function cleanLayerNames(names, version = 'R2000') {
  const map = new Map();
  const used = new Set(['0']);
  for (const name of names) {
    if (map.has(name)) continue;
    let s = String(name ?? '').replace(/[\x00-\x1f]/g, '');
    if (version === 'R12') {
      s = s
        .toUpperCase()
        .replace(/[ÄÀÁÂ]/g, 'A')
        .replace(/[ÖÒÓÔ]/g, 'O')
        .replace(/[ÜÙÚÛ]/g, 'U')
        .replace(/[^A-Z0-9_$-]/g, '_')
        .slice(0, 31);
    } else {
      s = s.replace(/[<>/\\":;?*|=`]/g, '_').trim().slice(0, 255);
      s = [...s].map((ch) => (cp1252Byte(ch.codePointAt(0)) >= 0 ? ch : '_')).join('');
    }
    if (!s) s = 'PDF';
    if (name === '0') {
      map.set(name, '0');
      continue;
    }
    let candidate = s;
    for (let k = 2; used.has(candidate.toUpperCase()); k++) {
      const suffix = `_${k}`;
      candidate = s.slice(0, (version === 'R12' ? 31 : 255) - suffix.length) + suffix;
    }
    used.add(candidate.toUpperCase());
    map.set(name, candidate);
  }
  return map;
}

// ---- output buffer --------------------------------------------------------------------------------

class Out {
  constructor() {
    this.parts = [];
    this.buf = [];
  }
  /** One group: code right-aligned in three columns, then the value. */
  g(code, value) {
    this.buf.push(code < 10 ? `  ${code}` : code < 100 ? ` ${code}` : String(code), String(value));
    if (this.buf.length > 65536) this.flush();
  }
  r(code, v) {
    this.g(code, num(v));
  }
  flush() {
    if (this.buf.length) this.parts.push(this.buf.join('\r\n') + '\r\n');
    this.buf = [];
  }
  bytes() {
    this.flush();
    const chunks = this.parts.map(encodeCp1252);
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  }
}

const hex = (n) => n.toString(16).toUpperCase();

// Fixed handles of the R2000 skeleton; layers and entities count up from FIRST_FREE.
const H = {
  LAYER_T: 1, LTYPE_T: 2, APPID_T: 3, DIMSTYLE_T: 4, STYLE_T: 5, UCS_T: 6, VIEW_T: 7, VPORT_T: 8, BLOCK_RECORD_T: 9,
  ROOT: 0xa, GROUP_D: 0xb, LAYOUT_D: 0xc, MLINESTYLE_D: 0xd, PLOTSETTINGS_D: 0xe, PLOTSTYLE_D: 0xf, PLACEHOLDER: 0x10,
  MODEL_BR: 0x11, PAPER_BR: 0x12, MODEL_BLOCK: 0x13, MODEL_ENDBLK: 0x14, PAPER_BLOCK: 0x15, PAPER_ENDBLK: 0x16,
  MODEL_LAYOUT: 0x17, PAPER_LAYOUT: 0x18, VPORT_ACTIVE: 0x19,
  LT_BYBLOCK: 0x1a, LT_BYLAYER: 0x1b, LT_CONTINUOUS: 0x1c, LT_DASHED: 0x1d, LT_DASHDOT: 0x1e,
  STYLE_STANDARD: 0x1f, APPID_ACAD: 0x20, DIMSTYLE_STANDARD: 0x21, MLINESTYLE_STANDARD: 0x22, LAYER_0: 0x23,
  FIRST_FREE: 0x30,
};

const UNITS = { mm: 4, cm: 5, m: 6 };

// ---- writer --------------------------------------------------------------------------------------

/** Extents [x0, y0, x1, y1] of DXF entities. */
export function extentsOf(entities) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  const add = (x, y) => {
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  };
  for (const e of entities) {
    if (e.pts) for (let i = 0; i < e.pts.length; i += 2) add(e.pts[i], e.pts[i + 1]);
    if (e.rings) for (const r of e.rings) for (let i = 0; i < r.length; i += 2) add(r[i], r[i + 1]);
    if (e.kind === 'arc' || e.kind === 'circle') {
      add(e.cx - e.r, e.cy - e.r);
      add(e.cx + e.r, e.cy + e.r);
    }
    if (e.kind === 'text') add(e.x, e.y);
  }
  return b[0] <= b[2] ? b : [0, 0, 0, 0];
}

/**
 * Write a DXF file. Returns { bytes, layerNames (Map original → written), counts: { LINE: n, … } }.
 */
export function writeDxf(doc, options = {}) {
  const version = options.version === 'R12' ? 'R12' : 'R2000';
  const units = UNITS[options.units] ? options.units : 'mm';
  const useTrueColor = version === 'R2000' && options.trueColor !== false;
  const linetypes = options.linetypes ?? {};
  const entities = doc.entities ?? [];

  // layers: '0' first, then the document's layers and every layer an entity uses
  const layerList = [{ name: '0', rgb: [0, 0, 0] }];
  const layerByName = new Map([['0', layerList[0]]]);
  for (const l of doc.layers ?? []) {
    if (!layerByName.has(l.name)) {
      layerByName.set(l.name, l);
      layerList.push(l);
    }
  }
  for (const e of entities) {
    const name = e.layer ?? '0';
    if (!layerByName.has(name)) {
      const l = { name, rgb: e.rgb ?? [0, 0, 0] };
      layerByName.set(name, l);
      layerList.push(l);
    }
  }
  const names = cleanLayerNames(layerList.map((l) => l.name), version);
  const layerAci = new Map(layerList.map((l) => [l.name, nearestAci(l.rgb)]));

  const usedLinetypes = new Set(entities.map((e) => e.linetype).filter((t) => t === 'DASHED' || t === 'DASHDOT'));
  const pattern = (name) => {
    const p = linetypes[name];
    if (Array.isArray(p) && p.length >= 2 && p.some((v) => v !== 0)) return p;
    return name === 'DASHED' ? [5, -2.5] : [6, -1.5, 0.5, -1.5];
  };

  const ext = doc.extents ?? extentsOf(entities);
  const out = new Out();
  const counts = {};
  const count = (k) => (counts[k] = (counts[k] ?? 0) + 1);
  let next = H.FIRST_FREE;
  const layerHandle = new Map(layerList.map((l) => [l.name, l.name === '0' ? H.LAYER_0 : next++]));
  const r2000 = version === 'R2000';

  // ---- HEADER
  out.g(0, 'SECTION');
  out.g(2, 'HEADER');
  const hv = (name, ...pairs) => {
    out.g(9, name);
    for (let i = 0; i < pairs.length; i += 2) out.g(pairs[i], pairs[i + 1]);
  };
  hv('$ACADVER', 1, r2000 ? 'AC1015' : 'AC1009');
  if (r2000) hv('$ACADMAINTVER', 70, 6);
  hv('$DWGCODEPAGE', 3, 'ANSI_1252');
  hv('$INSBASE', 10, '0.0', 20, '0.0', 30, '0.0');
  hv('$EXTMIN', 10, num(ext[0]), 20, num(ext[1]), 30, '0.0');
  hv('$EXTMAX', 10, num(ext[2]), 20, num(ext[3]), 30, '0.0');
  hv('$LIMMIN', 10, num(ext[0]), 20, num(ext[1]));
  hv('$LIMMAX', 10, num(ext[2]), 20, num(ext[3]));
  hv('$ORTHOMODE', 70, 0);
  hv('$LTSCALE', 40, '1.0');
  hv('$TEXTSTYLE', 7, 'Standard');
  hv('$CLAYER', 8, '0');
  hv('$CELTYPE', 6, 'ByLayer');
  hv('$CECOLOR', 62, 256);
  if (r2000) hv('$CELWEIGHT', 370, -1);
  hv('$LUNITS', 70, 2);
  hv('$LUPREC', 70, 4);
  hv('$AUNITS', 70, 0);
  hv('$AUPREC', 70, 2);
  if (r2000) {
    hv('$PSLTSCALE', 70, 1);
    hv('$DIMSTYLE', 2, 'Standard');
    hv('$MEASUREMENT', 70, 1);
    hv('$INSUNITS', 70, UNITS[units]);
    hv('$LWDISPLAY', 290, 1);
  }
  // $HANDSEED: next free handle. Every entity takes exactly one handle.
  const handseed = next + entities.length + 1;
  if (r2000) hv('$HANDSEED', 5, hex(handseed));
  out.g(0, 'ENDSEC');

  // ---- CLASSES (R2000): the class objects used in OBJECTS
  if (r2000) {
    out.g(0, 'SECTION');
    out.g(2, 'CLASSES');
    for (const [dxf, cpp] of [
      ['ACDBDICTIONARYWDFLT', 'AcDbDictionaryWithDefault'],
      ['ACDBPLACEHOLDER', 'AcDbPlaceHolder'],
      ['LAYOUT', 'AcDbLayout'],
    ]) {
      out.g(0, 'CLASS');
      out.g(1, dxf);
      out.g(2, cpp);
      out.g(3, 'ObjectDBX Classes');
      out.g(90, 0);
      out.g(280, 0);
      out.g(281, 0);
    }
    out.g(0, 'ENDSEC');
  }

  // ---- TABLES
  out.g(0, 'SECTION');
  out.g(2, 'TABLES');
  const table = (name, handle, n, extra) => {
    out.g(0, 'TABLE');
    out.g(2, name);
    if (r2000) {
      out.g(5, hex(handle));
      out.g(330, 0);
      out.g(100, 'AcDbSymbolTable');
    }
    out.g(70, n);
    extra?.();
  };
  const record = (type, handle, owner, subclass, handleCode = 5) => {
    out.g(0, type);
    if (r2000) {
      out.g(handleCode, hex(handle));
      out.g(330, hex(owner));
      out.g(100, 'AcDbSymbolTableRecord');
      out.g(100, subclass);
    }
  };
  const endtab = () => out.g(0, 'ENDTAB');

  // VPORT: the view shows the extents
  table('VPORT', H.VPORT_T, 1);
  record('VPORT', H.VPORT_ACTIVE, H.VPORT_T, 'AcDbViewportTableRecord');
  {
    const w = Math.max(ext[2] - ext[0], 1);
    const h = Math.max(ext[3] - ext[1], 1);
    out.g(2, '*Active');
    out.g(70, 0);
    for (const [c, v] of [[10, 0], [20, 0], [11, 1], [21, 1], [12, (ext[0] + ext[2]) / 2], [22, (ext[1] + ext[3]) / 2], [13, 0], [23, 0], [14, 10], [24, 10], [15, 10], [25, 10], [16, 0], [26, 0], [36, 1], [17, 0], [27, 0], [37, 0], [40, h * 1.1], [41, Math.min(Math.max(w / h, 0.2), 5)], [42, 50], [43, 0], [44, 0], [50, 0], [51, 0]]) out.r(c, v);
    for (const [c, v] of [[71, 0], [72, 1000], [73, 1], [74, 3], [75, 0], [76, 0], [77, 0], [78, 0]]) out.g(c, v);
    if (r2000) {
      out.g(281, 0);
      out.g(65, 0);
      out.r(146, 0);
    }
  }
  endtab();

  // LTYPE
  const ltypes = [
    ['ByBlock', H.LT_BYBLOCK, '', []],
    ['ByLayer', H.LT_BYLAYER, '', []],
    ['Continuous', H.LT_CONTINUOUS, 'Solid line', []],
  ];
  if (usedLinetypes.has('DASHED')) ltypes.push(['DASHED', H.LT_DASHED, 'Dashed __ __ __', pattern('DASHED')]);
  if (usedLinetypes.has('DASHDOT')) ltypes.push(['DASHDOT', H.LT_DASHDOT, 'Dash dot __ . __ .', pattern('DASHDOT')]);
  const ltypeList = r2000 ? ltypes : ltypes.filter(([n]) => n !== 'ByBlock' && n !== 'ByLayer');
  table('LTYPE', H.LTYPE_T, ltypeList.length);
  for (const [name, handle, desc, pat] of ltypeList) {
    record('LTYPE', handle, H.LTYPE_T, 'AcDbLinetypeTableRecord');
    out.g(2, name);
    out.g(70, 0);
    out.g(3, desc);
    out.g(72, 65);
    out.g(73, pat.length);
    out.r(40, pat.reduce((s, v) => s + Math.abs(v), 0));
    for (const v of pat) {
      out.r(49, v);
      if (r2000) out.g(74, 0);
    }
  }
  endtab();

  // LAYER
  table('LAYER', H.LAYER_T, layerList.length);
  for (const l of layerList) {
    record('LAYER', layerHandle.get(l.name), H.LAYER_T, 'AcDbLayerTableRecord');
    out.g(2, names.get(l.name));
    out.g(70, 0);
    out.g(62, layerAci.get(l.name));
    out.g(6, 'Continuous');
    if (r2000) {
      out.g(370, -3);
      out.g(390, hex(H.PLACEHOLDER));
    }
  }
  endtab();

  // STYLE
  table('STYLE', H.STYLE_T, 1);
  record('STYLE', H.STYLE_STANDARD, H.STYLE_T, 'AcDbTextStyleTableRecord');
  out.g(2, 'Standard');
  out.g(70, 0);
  out.r(40, 0);
  out.r(41, 1);
  out.r(50, 0);
  out.g(71, 0);
  out.r(42, 2.5);
  out.g(3, r2000 ? 'arial.ttf' : 'txt');
  out.g(4, '');
  endtab();

  table('VIEW', H.VIEW_T, 0);
  endtab();
  table('UCS', H.UCS_T, 0);
  endtab();

  table('APPID', H.APPID_T, 1);
  record('APPID', H.APPID_ACAD, H.APPID_T, 'AcDbRegAppTableRecord');
  out.g(2, 'ACAD');
  out.g(70, 0);
  endtab();

  table('DIMSTYLE', H.DIMSTYLE_T, 1, () => r2000 && out.g(100, 'AcDbDimStyleTable'));
  record('DIMSTYLE', H.DIMSTYLE_STANDARD, H.DIMSTYLE_T, 'AcDbDimStyleTableRecord', 105);
  out.g(2, 'Standard');
  out.g(70, 0);
  out.g(3, '');
  out.g(4, '');
  if (!r2000) for (const c of [5, 6, 7]) out.g(c, '');
  for (const [c, v] of [[40, 1], [41, 2.5], [42, 0.625], [43, 3.75], [44, 1.25], [45, 0], [46, 0], [47, 0], [48, 0], [140, 2.5], [141, 2.5], [142, 0], [143, 0.03937007874], [144, 1], [145, 0], [146, 1], [147, 0.625]]) out.r(c, v);
  if (r2000) out.r(148, 0);
  for (const [c, v] of [[71, 0], [72, 0], [73, 0], [74, 0], [75, 0], [76, 0], [77, 1], [78, 8]]) out.g(c, v);
  if (r2000) out.g(79, 3);
  for (const [c, v] of [[170, 0], [171, 3], [172, 1], [173, 0], [174, 0], [175, 0], [176, 0], [177, 0], [178, 0]]) out.g(c, v);
  if (r2000) {
    for (const [c, v] of [[179, 2], [271, 2], [272, 2], [273, 2], [274, 3], [275, 0], [276, 0], [277, 2], [278, 44], [279, 0], [280, 0], [281, 0], [282, 0], [283, 0], [284, 8], [285, 0], [286, 0], [288, 0], [289, 3], [371, -2], [372, -2]]) out.g(c, v);
  }
  endtab();

  if (r2000) {
    table('BLOCK_RECORD', H.BLOCK_RECORD_T, 2);
    record('BLOCK_RECORD', H.MODEL_BR, H.BLOCK_RECORD_T, 'AcDbBlockTableRecord');
    out.g(2, '*Model_Space');
    out.g(340, hex(H.MODEL_LAYOUT));
    record('BLOCK_RECORD', H.PAPER_BR, H.BLOCK_RECORD_T, 'AcDbBlockTableRecord');
    out.g(2, '*Paper_Space');
    out.g(340, hex(H.PAPER_LAYOUT));
    endtab();
  }
  out.g(0, 'ENDSEC');

  // ---- BLOCKS
  out.g(0, 'SECTION');
  out.g(2, 'BLOCKS');
  if (r2000) {
    for (const [name, br, b, e, paper] of [
      ['*Model_Space', H.MODEL_BR, H.MODEL_BLOCK, H.MODEL_ENDBLK, false],
      ['*Paper_Space', H.PAPER_BR, H.PAPER_BLOCK, H.PAPER_ENDBLK, true],
    ]) {
      out.g(0, 'BLOCK');
      out.g(5, hex(b));
      out.g(330, hex(br));
      out.g(100, 'AcDbEntity');
      if (paper) out.g(67, 1);
      out.g(8, '0');
      out.g(100, 'AcDbBlockBegin');
      out.g(2, name);
      out.g(70, 0);
      out.r(10, 0);
      out.r(20, 0);
      out.r(30, 0);
      out.g(3, name);
      out.g(1, '');
      out.g(0, 'ENDBLK');
      out.g(5, hex(e));
      out.g(330, hex(br));
      out.g(100, 'AcDbEntity');
      if (paper) out.g(67, 1);
      out.g(8, '0');
      out.g(100, 'AcDbBlockEnd');
    }
  }
  out.g(0, 'ENDSEC');

  // ---- ENTITIES
  out.g(0, 'SECTION');
  out.g(2, 'ENTITIES');
  const head = (type, e, subclass) => {
    count(type);
    out.g(0, type);
    const layer = e.layer ?? '0';
    if (r2000) {
      out.g(5, hex(next++));
      out.g(330, hex(H.MODEL_BR));
      out.g(100, 'AcDbEntity');
    }
    out.g(8, names.get(layer));
    if (e.linetype && usedLinetypes.has(e.linetype)) out.g(6, e.linetype);
    const rgb = e.rgb;
    const lrgb = layerByName.get(layer)?.rgb;
    const sameAsLayer = !rgb || (lrgb && rgb[0] === lrgb[0] && rgb[1] === lrgb[1] && rgb[2] === lrgb[2]);
    if (!sameAsLayer) {
      const aci = nearestAci(rgb);
      if (aci !== layerAci.get(layer) || useTrueColor) out.g(62, aci);
    }
    if (r2000 && e.lw != null) out.g(370, lineweight(e.lw));
    if (useTrueColor && !sameAsLayer && !isBlackOrWhite(rgb)) out.g(420, trueColor(rgb));
    if (r2000 && subclass) out.g(100, subclass);
  };
  const pt = (cx, cy, x, y) => {
    out.r(cx, x);
    out.r(cy, y);
    out.r(cx + 20, 0);
  };

  for (const e of entities) {
    switch (e.kind) {
      case 'line':
        head('LINE', e, 'AcDbLine');
        pt(10, 20, e.pts[0], e.pts[1]);
        pt(11, 21, e.pts[2], e.pts[3]);
        break;
      case 'polyline': {
        const n = e.pts.length / 2;
        if (n < 2) break;
        if (r2000) {
          head('LWPOLYLINE', e, 'AcDbPolyline');
          out.g(90, n);
          out.g(70, e.closed ? 1 : 0);
          for (let i = 0; i < n; i++) {
            out.r(10, e.pts[2 * i]);
            out.r(20, e.pts[2 * i + 1]);
            if (e.bulges?.[i]) out.r(42, e.bulges[i]);
          }
        } else {
          head('POLYLINE', e);
          out.g(66, 1);
          pt(10, 20, 0, 0);
          out.g(70, e.closed ? 1 : 0);
          for (let i = 0; i < n; i++) {
            out.g(0, 'VERTEX');
            out.g(8, names.get(e.layer ?? '0'));
            pt(10, 20, e.pts[2 * i], e.pts[2 * i + 1]);
            if (e.bulges?.[i]) out.r(42, e.bulges[i]);
            out.g(70, 0);
          }
          out.g(0, 'SEQEND');
          out.g(8, names.get(e.layer ?? '0'));
        }
        break;
      }
      case 'arc':
        head('ARC', e, 'AcDbCircle');
        pt(10, 20, e.cx, e.cy);
        out.r(40, e.r);
        if (r2000) out.g(100, 'AcDbArc');
        out.r(50, e.start);
        out.r(51, e.end);
        break;
      case 'circle':
        head('CIRCLE', e, 'AcDbCircle');
        pt(10, 20, e.cx, e.cy);
        out.r(40, e.r);
        break;
      case 'text': {
        const str = escapeText(e.str, version);
        if (!str.trim()) break;
        head('TEXT', e, 'AcDbText');
        pt(10, 20, e.x, e.y);
        out.r(40, e.height);
        out.g(1, str);
        if (e.rot) out.r(50, ((e.rot % 360) + 360) % 360);
        out.g(7, 'Standard');
        if (r2000) out.g(100, 'AcDbText');
        break;
      }
      case 'hatch': {
        const rings = (e.rings ?? []).filter((r) => r.length >= 6);
        if (!rings.length) break;
        if (!r2000) {
          for (const r of rings) {
            head('POLYLINE', e);
            out.g(66, 1);
            pt(10, 20, 0, 0);
            out.g(70, 1);
            for (let i = 0; i < r.length; i += 2) {
              out.g(0, 'VERTEX');
              out.g(8, names.get(e.layer ?? '0'));
              pt(10, 20, r[i], r[i + 1]);
              out.g(70, 0);
            }
            out.g(0, 'SEQEND');
            out.g(8, names.get(e.layer ?? '0'));
          }
          break;
        }
        head('HATCH', e, 'AcDbHatch');
        pt(10, 20, 0, 0);
        out.r(210, 0);
        out.r(220, 0);
        out.r(230, 1);
        out.g(2, 'SOLID');
        out.g(70, 1);
        out.g(71, 0);
        out.g(91, rings.length);
        rings.forEach((r, k) => {
          out.g(92, k === 0 ? 3 : 2);
          out.g(72, 0);
          out.g(73, 1);
          out.g(93, r.length / 2);
          for (let i = 0; i < r.length; i += 2) {
            out.r(10, r[i]);
            out.r(20, r[i + 1]);
          }
          out.g(97, 0);
        });
        out.g(75, 0);
        out.g(76, 1);
        out.g(98, 0);
        break;
      }
      case 'spline': {
        if (!r2000) break;
        head('SPLINE', e, 'AcDbSpline');
        out.g(70, 8);
        out.g(71, 3);
        out.g(72, 8);
        out.g(73, 4);
        out.g(74, 0);
        for (const k of [0, 0, 0, 0, 1, 1, 1, 1]) out.r(40, k);
        for (let i = 0; i < 8; i += 2) pt(10, 20, e.pts[i], e.pts[i + 1]);
        break;
      }
      default:
        break;
    }
  }
  out.g(0, 'ENDSEC');

  // ---- OBJECTS (R2000)
  if (r2000) {
    out.g(0, 'SECTION');
    out.g(2, 'OBJECTS');
    const dict = (handle, owner, entries, type = 'DICTIONARY') => {
      out.g(0, type);
      out.g(5, hex(handle));
      out.g(330, hex(owner));
      out.g(100, 'AcDbDictionary');
      out.g(281, 1);
      for (const [name, h] of entries) {
        out.g(3, name);
        out.g(350, hex(h));
      }
    };
    dict(H.ROOT, 0, [
      ['ACAD_GROUP', H.GROUP_D],
      ['ACAD_LAYOUT', H.LAYOUT_D],
      ['ACAD_MLINESTYLE', H.MLINESTYLE_D],
      ['ACAD_PLOTSETTINGS', H.PLOTSETTINGS_D],
      ['ACAD_PLOTSTYLENAME', H.PLOTSTYLE_D],
    ]);
    dict(H.GROUP_D, H.ROOT, []);
    dict(H.LAYOUT_D, H.ROOT, [
      ['Model', H.MODEL_LAYOUT],
      ['Layout1', H.PAPER_LAYOUT],
    ]);
    dict(H.MLINESTYLE_D, H.ROOT, [['Standard', H.MLINESTYLE_STANDARD]]);
    dict(H.PLOTSETTINGS_D, H.ROOT, []);
    dict(H.PLOTSTYLE_D, H.ROOT, [['Normal', H.PLACEHOLDER]], 'ACDBDICTIONARYWDFLT');
    out.g(100, 'AcDbDictionaryWithDefault');
    out.g(340, hex(H.PLACEHOLDER));
    out.g(0, 'ACDBPLACEHOLDER');
    out.g(5, hex(H.PLACEHOLDER));
    out.g(330, hex(H.PLOTSTYLE_D));

    for (const [handle, name, br, flags, tab] of [
      [H.MODEL_LAYOUT, 'Model', H.MODEL_BR, 1024, 0],
      [H.PAPER_LAYOUT, 'Layout1', H.PAPER_BR, 0, 1],
    ]) {
      out.g(0, 'LAYOUT');
      out.g(5, hex(handle));
      out.g(330, hex(H.LAYOUT_D));
      out.g(100, 'AcDbPlotSettings');
      out.g(1, '');
      out.g(4, 'A3');
      out.g(6, '');
      for (const [c, v] of [[40, 7.5], [41, 20], [42, 7.5], [43, 20], [44, 420], [45, 297], [46, 0], [47, 0], [48, 0], [49, 0], [140, 0], [141, 0], [142, 1], [143, 1]]) out.r(c, v);
      out.g(70, flags);
      out.g(72, 1);
      out.g(73, 0);
      out.g(74, 5);
      out.g(7, '');
      out.g(75, 16);
      out.r(147, 1);
      out.r(148, 0);
      out.r(149, 0);
      out.g(100, 'AcDbLayout');
      out.g(1, name);
      out.g(70, 1);
      out.g(71, tab);
      for (const [c, v] of [[10, 0], [20, 0], [11, 420], [21, 297], [12, 0], [22, 0], [32, 0], [14, ext[0]], [24, ext[1]], [34, 0], [15, ext[2]], [25, ext[3]], [35, 0], [146, 0], [13, 0], [23, 0], [33, 0], [16, 1], [26, 0], [36, 0], [17, 0], [27, 1], [37, 0]]) out.r(c, v);
      out.g(76, 0);
      out.g(330, hex(br));
    }

    out.g(0, 'MLINESTYLE');
    out.g(5, hex(H.MLINESTYLE_STANDARD));
    out.g(330, hex(H.MLINESTYLE_D));
    out.g(100, 'AcDbMlineStyle');
    out.g(2, 'Standard');
    out.g(70, 0);
    out.g(3, '');
    out.g(62, 256);
    out.r(51, 90);
    out.r(52, 90);
    out.g(71, 2);
    out.r(49, 0.5);
    out.g(62, 256);
    out.g(6, 'BYLAYER');
    out.r(49, -0.5);
    out.g(62, 256);
    out.g(6, 'BYLAYER');
    out.g(0, 'ENDSEC');
  }
  out.g(0, 'EOF');

  if (r2000 && next >= handseed) throw new Error('handle seed too small'); // cannot happen: 1 handle per entity
  return { bytes: out.bytes(), layerNames: names, counts };
}
