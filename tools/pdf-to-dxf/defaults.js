// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings of the PDF → DXF tool: defaults, presets, INPUT_VERSION, normalizeInputs. No DOM.
// The settings are the tool's only saved data (browser draft); the PDF itself is never stored.

export const TOOL_ID = 'pdf-to-dxf';
export const INPUT_VERSION = 1;

export const SCALES = [1, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
export const UNITS = ['mm', 'cm', 'm'];
export const ORIGINS = ['page', 'center'];
export const VERSIONS = ['R2000', 'R12'];
export const LAYER_MODES = ['single', 'color', 'width', 'colorWidth'];
export const CLIP_MODES = ['apply', 'ignore'];
export const CURVE_MODES = ['polyline', 'spline'];
export const TEXT_MODES = ['text', 'outline', 'omit'];
export const DASH_MODES = ['solid', 'explode'];
export const HATCH_MODES = ['layer', 'remove', 'keep'];
export const FILL_MODES = ['outline', 'ignore', 'hatch'];
export const PAGE_MODES = ['current', 'each', 'sideBySide'];
export const SCAN_MODES = ['centerline', 'outline'];
export const PRESET_NAMES = ['nova', 'geometry', 'compat', 'custom'];

/** Fields a preset sets. Everything else (scale, unit, origin, layers, area …) stays as it is. */
const NOVA = {
  version: 'R2000',
  trueColor: true,
  join: true,
  dedupe: true,
  arcs: true,
  curves: 'polyline',
  text: 'text',
  hatch: 'layer',
  fills: 'outline',
  clip: 'apply',
  dashes: 'solid',
};

export const PRESETS = {
  nova: NOVA,
  geometry: { ...NOVA, text: 'omit', hatch: 'remove', fills: 'ignore' },
  compat: { ...NOVA, version: 'R12', trueColor: false, arcs: false, text: 'outline' },
};

export const PRESET_FIELDS = Object.freeze(Object.keys(NOVA));

export function defaultSettings() {
  return {
    preset: 'nova',
    scale: 100,
    calibrated: false, // true: scale comes from a two-point calibration
    unit: 'mm',
    origin: 'page',
    ...PRESETS.nova,
    layerMode: 'colorWidth', // without PDF layers: one layer per colour and line weight
    hiddenLayers: false,
    minLengthMm: 0, // paper mm; shorter pieces are dropped
    pages: 'current',
    tol: { join: 0.05, arc: 0.02, flatten: 0.05 }, // paper mm
    scan: { dpi: 300, mode: 'centerline', snapDeg: 2 },
    // per document (reset when another PDF is opened)
    page: 0,
    scanOn: false, // vectorise the raster of a scanned page
    area: null, // [x0, y0, x1, y1] in pt of the current page: keep only this rectangle
    layersOff: [], // output layer names that are not exported
    colorsOff: [], // 'rrggbb'
    widthsOff: [], // DXF line weights (1/100 mm)
  };
}

const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);
const numIn = (v, min, max, fallback) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
};
const strList = (v, re) => (Array.isArray(v) ? [...new Set(v.filter((s) => typeof s === 'string' && re.test(s)))] : []);

/** Repair old or incomplete settings. Idempotent: normalizeInputs(normalizeInputs(x)) equals normalizeInputs(x). */
export function normalizeInputs(raw) {
  const d = defaultSettings();
  const s = raw && typeof raw === 'object' ? raw : {};
  const tol = s.tol && typeof s.tol === 'object' ? s.tol : {};
  const scan = s.scan && typeof s.scan === 'object' ? s.scan : {};
  const area =
    Array.isArray(s.area) && s.area.length === 4 && s.area.every((v) => Number.isFinite(v)) && s.area[2] > s.area[0] && s.area[3] > s.area[1]
      ? s.area.map(Number)
      : null;
  const out = {
    preset: pick(s.preset, PRESET_NAMES, d.preset),
    scale: numIn(s.scale, 0.001, 1e6, d.scale),
    calibrated: bool(s.calibrated, d.calibrated),
    unit: pick(s.unit, UNITS, d.unit),
    origin: pick(s.origin, ORIGINS, d.origin),
    version: pick(s.version, VERSIONS, d.version),
    trueColor: bool(s.trueColor, d.trueColor),
    join: bool(s.join, d.join),
    dedupe: bool(s.dedupe, d.dedupe),
    arcs: bool(s.arcs, d.arcs),
    curves: pick(s.curves, CURVE_MODES, d.curves),
    text: pick(s.text, TEXT_MODES, d.text),
    hatch: pick(s.hatch, HATCH_MODES, d.hatch),
    fills: pick(s.fills, FILL_MODES, d.fills),
    clip: pick(s.clip, CLIP_MODES, d.clip),
    dashes: pick(s.dashes, DASH_MODES, d.dashes),
    layerMode: pick(s.layerMode, LAYER_MODES, d.layerMode),
    hiddenLayers: bool(s.hiddenLayers, d.hiddenLayers),
    minLengthMm: numIn(s.minLengthMm, 0, 1000, d.minLengthMm),
    pages: pick(s.pages, PAGE_MODES, d.pages),
    tol: {
      join: numIn(tol.join, 0.001, 5, d.tol.join),
      arc: numIn(tol.arc, 0.001, 5, d.tol.arc),
      flatten: numIn(tol.flatten, 0.001, 5, d.tol.flatten),
    },
    scan: {
      dpi: Math.round(numIn(scan.dpi, 200, 600, d.scan.dpi)),
      mode: pick(scan.mode, SCAN_MODES, d.scan.mode),
      snapDeg: numIn(scan.snapDeg, 0, 10, d.scan.snapDeg),
    },
    page: Math.round(numIn(s.page, 0, 1e5, d.page)),
    scanOn: bool(s.scanOn, d.scanOn),
    area,
    layersOff: strList(s.layersOff, /^.{1,300}$/s),
    colorsOff: strList(s.colorsOff, /^[0-9a-f]{6}$/),
    widthsOff: Array.isArray(s.widthsOff) ? [...new Set(s.widthsOff.filter((v) => Number.isInteger(v) && v >= 0 && v <= 211))] : [],
  };
  // R12 has no true colour
  if (out.version === 'R12') out.trueColor = false;
  out.preset = presetOf(out);
  return out;
}

/** Name of the preset the settings match, or 'custom'. */
export function presetOf(settings) {
  for (const [name, p] of Object.entries(PRESETS)) {
    if (Object.entries(p).every(([k, v]) => settings[k] === v)) return name;
  }
  return 'custom';
}

/** Apply a preset (returns new settings). */
export function applyPreset(settings, name) {
  const p = PRESETS[name];
  if (!p) return { ...settings, preset: 'custom' };
  return normalizeInputs({ ...settings, ...p, preset: name });
}

/** Per-document fields back to their defaults (another PDF was opened). */
export function resetDocumentFields(settings) {
  const d = defaultSettings();
  // a calibrated scale belongs to one plan: back to the nearest standard scale
  const scale = settings.calibrated ? SCALES.reduce((p, q) => (Math.abs(Math.log(q / settings.scale)) < Math.abs(Math.log(p / settings.scale)) ? q : p)) : settings.scale;
  return { ...settings, scale, calibrated: false, page: d.page, scanOn: false, area: d.area, layersOff: [], colorsOff: [], widthsOff: [] };
}
