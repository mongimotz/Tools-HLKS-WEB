// SPDX-License-Identifier: AGPL-3.0-or-later
// Default catalogues (SIA 382/1:2025 tables 49 and 50, size series), input schema normalisation and the example.
// Catalogue values are guide values ("Richtwerte") and are saved with every file.
//
// inputs = { calculations: [{ id, system, current, positions }], catalogs, settings }
// `current` is the position in the input panel, `positions` are the pinned ones (in the PDF and the CSV).

export const TOOL_ID = 'duct-sizing';
export const INPUT_VERSION = 3;

export const SHAPES = ['round', 'rect', 'oval'];

/** Modes per shape: size from v max (round: Ø; non-round: with an aspect ratio), fixed height, check given sizes. */
export const MODES = { round: ['size', 'check'], rect: ['size', 'height', 'check'], oval: ['size', 'height', 'check'] };

/** Grid for the sides of rectangular and oval ducts [mm]; 0 = whole millimetres. */
export const RECT_STEPS = [0, 5, 10, 25, 50, 100];

/** Choices of the aspect ratio 1/n; flat oval starts at 1/2 (table 50 has no factor for 1/1). */
export const RATIOS = { rect: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], oval: [2, 3, 4, 5, 6, 7, 8, 9, 10] };

/** Presets of the full load hours field: the columns of table 49 [h/a]. */
export const HOUR_PRESETS = [2000, 4000, 8000];

/** Round duct series [mm] (company list of the first version: Ø 80 to 1000 without 63/112/140/150, then 1120 to 2000). */
export function defaultDiameters() {
  return [80, 100, 125, 160, 180, 200, 224, 250, 280, 300, 315, 355, 400, 450, 500, 560, 630, 710, 800, 900, 1000, 1120, 1250, 1400, 1500, 1600, 1800, 2000];
}

/** Standard heights of flat oval ducts [mm]. */
export function defaultOvalHeights() {
  return [100, 125, 160, 200, 250, 315, 400, 500];
}

/**
 * SIA 382/1:2025, table 49: maximum velocity in round ducts [m/s] by design flow and electrical full load hours.
 * A row applies to flows below `below` [m³/h] (the last row, below = null, to all larger flows).
 */
export function defaultVelocityLimits() {
  return [
    { below: 40, v2000: 2.5, v4000: 2.5, v8000: 2.5 },
    { below: 1000, v2000: 3, v4000: 3, v8000: 3 },
    { below: 2000, v2000: 4, v4000: 4, v8000: 3.5 },
    { below: 4000, v2000: 5, v4000: 5, v8000: 4 },
    { below: 10000, v2000: 6, v4000: 5.5, v8000: 4.5 },
    { below: null, v2000: 7, v4000: 6, v8000: 5 },
  ];
}

/** SIA 382/1:2025, table 50: reduction factor f_va,du for non-round ducts by aspect ratio 1/n (oval: none for 1/1). */
export function defaultReductionFactors() {
  return [
    { ratio: 1, rect: 0.941, oval: null },
    { ratio: 2, rect: 0.914, oval: 0.933 },
    { ratio: 3, rect: 0.876, oval: 0.893 },
    { ratio: 4, rect: 0.842, oval: 0.857 },
    { ratio: 5, rect: 0.813, oval: 0.825 },
    { ratio: 6, rect: 0.788, oval: 0.798 },
    { ratio: 7, rect: 0.766, oval: 0.775 },
    { ratio: 8, rect: 0.746, oval: 0.754 },
    { ratio: 9, rect: 0.729, oval: 0.736 },
    { ratio: 10, rect: 0.714, oval: 0.72 },
  ];
}

export function defaultCatalogs() {
  return {
    velocityLimits: defaultVelocityLimits(),
    reductionFactors: defaultReductionFactors(),
    diameters: defaultDiameters(),
    ovalHeights: defaultOvalHeights(),
  };
}

/** Operating stages for the full load hours estimate (flow in % of the design flow, duration in h/a). */
export function defaultStages() {
  return [
    { flow: 100, hours: 2500 },
    { flow: 60, hours: 3500 },
    { flow: 0, hours: 0 },
  ];
}

export function defaultSystem() {
  return { simple: true, hours: 2000, stages: defaultStages(), exponent: 2.5, rectStep: 50 };
}

/** Basis of the pressure gradient R: roughness k [mm] and air temperature [°C]. */
export function defaultSettings() {
  return { roughness: 0.15, temperature: 20 };
}

/** The input panel of a new calculation (values of the first version). */
export function defaultCurrent() {
  return { id: 'current', flow: 1000, shape: 'round', mode: 'size', ratio: 3, width: null, height: null, diameter: null };
}

// ---- positions ------------------------------------------------------------------

export function nextPositionId(positions) {
  let max = 0;
  for (const p of positions) {
    const m = /^p(\d+)$/.exec(p.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `p${max + 1}`;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (v == null ? '' : String(v));

/** Mode valid for the shape (switching round ↔ non-round keeps the mode where it exists). */
export function modeFor(shape, mode) {
  return MODES[shape].includes(mode) ? mode : 'size';
}

export function normalizePosition(p = {}) {
  p = object(p);
  const shape = SHAPES.includes(p.shape) ? p.shape : 'round';
  return {
    id: str(p.id),
    flow: num(p.flow),
    shape,
    mode: modeFor(shape, p.mode),
    ratio: num(p.ratio),
    width: num(p.width),
    height: num(p.height),
    diameter: num(p.diameter),
  };
}

/** Same duct (all inputs except the id). */
export function samePosition(a, b) {
  const { id: _a, ...x } = a;
  const { id: _b, ...y } = b;
  return JSON.stringify(x) === JSON.stringify(y);
}

/** Positions in the PDF and the CSV: the pinned ones, plus the input panel if it is not pinned. */
export function printedPositions(inputs) {
  const list = [...inputs.positions];
  if (!list.some((p) => samePosition(p, inputs.current))) list.push(inputs.current);
  return list;
}

const numList = (list, fallback) =>
  (Array.isArray(list) ? list : fallback).map(num).filter((v) => v > 0).sort((a, b) => a - b);

const object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});
const rows = (value, fallback) => (Array.isArray(value) ? value : fallback).map(object);

export function nextCalculationId(calculations) {
  let n = 1;
  const ids = new Set(calculations.map((c) => c.id));
  while (ids.has(`c${n}`)) n++;
  return `c${n}`;
}

/** Calculation-local inputs. Catalogue and pressure-gradient settings belong to the project. */
export function normalizeCalculation(raw = {}, id = 'c1') {
  raw = object(raw);
  const sys = { ...defaultSystem(), ...(raw.system ?? {}) };
  const positions = (Array.isArray(raw.positions) ? raw.positions : []).map(normalizePosition);
  const seen = new Set(['current']);
  for (const p of positions) {
    if (!p.id || seen.has(p.id)) p.id = nextPositionId(positions);
    seen.add(p.id);
  }
  return {
    id,
    name: str(raw.name).trim(),
    system: {
      simple: sys.simple !== false,
      hours: num(sys.hours),
      stages: (Array.isArray(sys.stages) ? sys.stages : []).map((s) => ({ flow: num(s?.flow), hours: num(s?.hours) })),
      exponent: sys.exponent === 1.5 ? 1.5 : 2.5,
      rectStep: RECT_STEPS.includes(sys.rectStep) ? sys.rectStep : 50,
    },
    current: normalizePosition({ ...defaultCurrent(), ...(raw.current ?? {}), id: 'current' }),
    positions,
  };
}

export function newCalculation(id = 'c1') {
  return normalizeCalculation({}, id);
}

/** A writable calculation view: all properties refer to the authoritative project inputs. */
export function calculationInputs(inputs, id = inputs.calculations[0]?.id) {
  const calculation = inputs.calculations.find((c) => c.id === id) ?? inputs.calculations[0];
  return {
    get system() { return calculation.system; },
    get current() { return calculation.current; },
    set current(value) { calculation.current = value; },
    get positions() { return calculation.positions; },
    set positions(value) { calculation.positions = value; },
    get catalogs() { return inputs.catalogs; },
    get settings() { return inputs.settings; },
    set settings(value) { inputs.settings = value; },
  };
}

export function calculationName(calculation, index) {
  return calculation.name || `Berechnung ${index + 1}`;
}

/** Current beta schema only. Old or foreign data is safely reset, without migration. Idempotent. */
export function normalizeInputs(raw = {}) {
  raw = object(raw);
  const cat = object(raw.catalogs);
  const settings = { ...defaultSettings(), ...object(raw.settings) };
  const source = Array.isArray(raw.calculations) && raw.calculations.length ? raw.calculations : [{}];
  const ids = new Set();
  const calculations = source.map((value, index) => {
    const row = object(value);
    let id = str(row.id);
    if (!id || ids.has(id)) {
      let n = index + 1;
      while (ids.has(`c${n}`)) n++;
      id = `c${n}`;
    }
    ids.add(id);
    return normalizeCalculation(row, id);
  });
  return {
    calculations,
    catalogs: {
      velocityLimits: rows(cat.velocityLimits, defaultVelocityLimits()).map((r) => ({
        below: num(r.below),
        v2000: num(r.v2000),
        v4000: num(r.v4000),
        v8000: num(r.v8000),
      })),
      reductionFactors: rows(cat.reductionFactors, defaultReductionFactors()).map((r) => ({
        ratio: num(r.ratio),
        rect: num(r.rect),
        oval: num(r.oval),
      })),
      diameters: numList(cat.diameters, defaultDiameters()),
      ovalHeights: numList(cat.ovalHeights, defaultOvalHeights()),
    },
    settings: { roughness: num(settings.roughness) ?? 0, temperature: num(settings.temperature) ?? 20 },
  };
}

export function emptyInputs() {
  return normalizeInputs({});
}

/** The example of SIA 382/1, 5.11.5.7 and 5.11.5.8 (5'800 m³/h, 2'740 h/a): round in the panel, variants pinned; corridor and meeting room as own calculations. */
export function exampleInputs() {
  const system = { ...defaultSystem(), simple: false, hours: 2740 };
  return normalizeInputs({
    calculations: [
      {
        id: 'c1',
        name: 'Hauptleitung',
        system,
        current: { flow: 5800, shape: 'round', mode: 'size', ratio: 5 },
        positions: [
          { id: 'p1', flow: 5800, shape: 'round', mode: 'size', ratio: 5 },
          { id: 'p2', flow: 5800, shape: 'rect', mode: 'size', ratio: 5 },
          { id: 'p3', flow: 5800, shape: 'oval', mode: 'size', ratio: 5 },
        ],
      },
      { id: 'c2', name: 'Korridor', system, current: { flow: 2900, shape: 'rect', mode: 'height', ratio: 3, height: 300 } },
      { id: 'c3', name: 'Sitzungszimmer', system, current: { flow: 800, shape: 'round', mode: 'check', ratio: 3, diameter: 315 } },
    ],
  });
}
