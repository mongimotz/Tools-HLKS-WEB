// SPDX-License-Identifier: AGPL-3.0-or-later
// Input schema of the h,x diagram, normalisation and the example. No DOM.
//
// inputs = { site: { altitude }, calculations: [{ id, name, flow, range, blocks }] }
// `range` is the visible part of the diagram { tMin, tMax, xMin, xMax } (screen and PDF).
// A block is a point (given by two properties, each a number or a reference to an earlier point plus an
// offset) or a process. Each process takes earlier points and yields one new point (WRG: two); `line` only
// connects two points, `comfort` only draws a zone. Block ids double as point ids; the second outlet of a WRG
// is `<id>.b`. Every block may carry an own `color` (a chart token) instead of the process colour.

import { DEFAULT_RANGE, cleanRange } from './chart.js';

export const TOOL_ID = 'hx-diagram';
export const INPUT_VERSION = 4;

/** Properties a point can be given by (phi in %). */
export const GIVEN_KEYS = ['t', 'phi', 'x', 'h', 'td', 'tw'];

/** Block types with their parameters and defaults. `modes` lists the alternative targets. */
export const BLOCKS = {
  point: { params: {} },
  heater: { modes: ['t', 'q'], params: { mode: 't', t: 20, q: null, vl: null, rl: null } },
  cooler: { modes: ['t', 'q', 'bf'], params: { mode: 't', t: 16, q: null, bf: 0.1, ts: null, vl: 6, rl: 12 } },
  steam: { modes: ['x', 'phi', 'm'], params: { mode: 'x', x: 7, phi: null, m: null, ts: 100 } },
  adiabatic: { modes: ['eta', 'x', 'phi'], params: { mode: 'eta', eta: 85, x: null, phi: null } },
  hrv: { modes: ['sensible', 'enthalpy'], params: { mode: 'sensible', eta: 75, etaX: 65, tFrost: 0 } },
  mix: { modes: ['share', 'flows'], params: { mode: 'share', share: 30 } },
  fan: { params: { dt: 1 } },
  room: { params: { qs: 5, mw: 2 } },
  line: { params: {} },
  comfort: { params: { tMin: 19.8, tMax: 26.1, phiMin: 30, phiMax: 60, xMax: null } },
};

/**
 * Comfort zone presets after SIA 382/1:2025: room temperature from the lower heating limit to the upper cooling
 * limit of table 6 (IEQ category), relative humidity from the humidifying to the dehumidifying design value of
 * table 35 (IDA (H2O) category). Default: category II (SIA 382/1, 2.2.6.2).
 */
export const COMFORT_PRESETS = {
  I: { tMin: 21.1, tMax: 25.2, phiMin: 40, phiMax: 50, xMax: null },
  II: { tMin: 19.8, tMax: 26.1, phiMin: 30, phiMax: 60, xMax: null },
  III: { tMin: 18.8, tMax: 26.8, phiMin: 20, phiMax: 70, xMax: null },
};
export const BLOCK_TYPES = Object.keys(BLOCKS);

/** Blocks with one inlet `from`; mix and line take `from` and `to`, WRG `from` (outdoor) and `to` (extract). */
export const TWO_INPUTS = new Set(['mix', 'line', 'hrv']);

export const LABEL_MAX = 24;

/** Own colours a block may take (tokens.css); '' keeps the process colour. */
export const COLORS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6', 'chart-7', 'chart-8'];

/** Blocks that yield no point. */
export const NO_POINT = new Set(['line', 'comfort']);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (v == null ? '' : String(v));
const object = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export function defaultSite() {
  return { altitude: 500 };
}

function normalizeGiven(list) {
  const out = [];
  for (const g of Array.isArray(list) ? list : []) {
    const row = object(g);
    if (!GIVEN_KEYS.includes(row.key) || out.some((o) => o.key === row.key)) continue;
    const item = { key: row.key, value: num(row.value) };
    if (row.ref && typeof row.ref === 'string') item.ref = row.ref;
    out.push(item);
  }
  return out.slice(-2);
}

export function normalizeBlock(raw = {}) {
  raw = object(raw);
  const type = BLOCK_TYPES.includes(raw.type) ? raw.type : 'point';
  const spec = BLOCKS[type];
  const block = { id: str(raw.id), type, label: str(raw.label).trim().slice(0, LABEL_MAX), color: COLORS.includes(raw.color) ? raw.color : '' };
  if (type === 'point') {
    block.given = normalizeGiven(raw.given);
    block.flow = num(raw.flow);
    return block;
  }
  if (type === 'comfort') {
    for (const [key, def] of Object.entries(spec.params)) block[key] = Object.hasOwn(raw, key) ? num(raw[key]) : def;
    return block;
  }
  block.from = str(raw.from);
  if (TWO_INPUTS.has(type)) block.to = str(raw.to);
  if (type === 'mix') block.parts = (Array.isArray(raw.parts) ? raw.parts : []).map((q) => ({ from: str(object(q).from), share: num(object(q).share) }));
  if (type === 'hrv') block.label2 = str(raw.label2).trim().slice(0, LABEL_MAX);
  for (const [key, def] of Object.entries(spec.params)) {
    if (key === 'mode') block.mode = spec.modes.includes(raw.mode) ? raw.mode : def;
    else block[key] = Object.hasOwn(raw, key) ? num(raw[key]) : def;
  }
  return block;
}

export function nextBlockId(blocks) {
  let n = 1;
  const ids = new Set(blocks.map((b) => b.id));
  while (ids.has(`b${n}`)) n++;
  return `b${n}`;
}

export function normalizeCalculation(raw = {}, id = 'c1') {
  raw = object(raw);
  const blocks = (Array.isArray(raw.blocks) ? raw.blocks : []).map(normalizeBlock);
  const taken = new Set(blocks.map((b) => b.id).filter((id) => /^b\d+$/.test(id)));
  const seen = new Set();
  for (const b of blocks) {
    if (!/^b\d+$/.test(b.id) || seen.has(b.id)) {
      let n = 1;
      while (taken.has(`b${n}`)) n++;
      b.id = `b${n}`;
      taken.add(b.id);
    }
    seen.add(b.id);
  }
  return { id, name: str(raw.name).trim(), flow: num(raw.flow), range: cleanRange(object(raw.range)), blocks };
}

export function newCalculation(id = 'c1') {
  return normalizeCalculation({ flow: null, range: { ...DEFAULT_RANGE }, blocks: [] }, id);
}

export function nextCalculationId(calculations) {
  let n = 1;
  const ids = new Set(calculations.map((c) => c.id));
  while (ids.has(`c${n}`)) n++;
  return `c${n}`;
}

export function calculationName(calculation, index) {
  return calculation.name || `Berechnung ${index + 1}`;
}

/** Current beta schema only. Old or foreign data is reset safely, without migration. Idempotent. */
export function normalizeInputs(raw = {}) {
  raw = object(raw);
  const site = { ...defaultSite(), ...object(raw.site) };
  const source = Array.isArray(raw.calculations) && raw.calculations.length ? raw.calculations : [{}];
  const ids = new Set();
  const calculations = source.map((value, index) => {
    const row = object(value);
    let id = str(row.id);
    if (!/^c\d+$/.test(id) || ids.has(id)) {
      let n = index + 1;
      while (ids.has(`c${n}`)) n++;
      id = `c${n}`;
    }
    ids.add(id);
    return normalizeCalculation(row, id);
  });
  const altitude = num(site.altitude);
  return { site: { altitude: altitude == null ? 0 : Math.min(4000, Math.max(-500, altitude)) }, calculations };
}

export function emptyInputs() {
  return normalizeInputs({});
}

/** A new block of a type: processes take the last point (and the one before for two inputs). */
export function newBlock(type, blocks, at = null) {
  const id = nextBlockId(blocks);
  const block = normalizeBlock({ id, type });
  if (type === 'point') {
    block.given = at ? [{ key: 't', value: at.t }, { key: 'x', value: at.x }] : [{ key: 't', value: 20 }, { key: 'phi', value: 50 }];
    return block;
  }
  if (type === 'comfort') return block;
  const points = pointIds(blocks);
  if (TWO_INPUTS.has(type) && points.length >= 2) {
    block.from = points.at(-2);
    block.to = points.at(-1);
  } else block.from = points.at(-1) ?? '';
  return block;
}

/** Ids of all points the blocks yield, in order. */
export function pointIds(blocks) {
  return blocks.flatMap((b) => (NO_POINT.has(b.type) ? [] : b.type === 'hrv' ? [b.id, `${b.id}.b`] : [b.id]));
}

/** Winter and summer case of a supply air unit with WRG. */
export function exampleInputs() {
  return normalizeInputs({
    site: { altitude: 400 },
    calculations: [
      {
        id: 'c1',
        name: 'Winter',
        flow: 5000,
        blocks: [
          { id: 'b1', type: 'point', label: 'AU', given: [{ key: 't', value: -8 }, { key: 'phi', value: 80 }] },
          { id: 'b2', type: 'point', label: 'AB', given: [{ key: 't', value: 22 }, { key: 'phi', value: 35 }] },
          { id: 'b3', type: 'hrv', label: 'WRG', label2: 'FO', from: 'b1', to: 'b2', mode: 'sensible', eta: 75 },
          { id: 'b4', type: 'heater', label: 'NE', from: 'b3', mode: 't', t: 22, vl: 50, rl: 35 },
          { id: 'b5', type: 'steam', label: 'ZU', from: 'b4', mode: 'x', x: 6 },
        ],
      },
      {
        id: 'c2',
        name: 'Sommer',
        flow: 5000,
        range: { tMin: 5, tMax: 40, xMin: 4, xMax: 18 },
        blocks: [
          { id: 'b1', type: 'point', label: 'AU', given: [{ key: 't', value: 32 }, { key: 'phi', value: 40 }] },
          { id: 'b2', type: 'point', label: 'AB', given: [{ key: 't', value: 26 }, { key: 'phi', value: 50 }] },
          { id: 'b3', type: 'hrv', label: 'WRG', label2: 'FO', from: 'b1', to: 'b2', mode: 'sensible', eta: 75 },
          { id: 'b4', type: 'cooler', label: 'KÜ', from: 'b3', mode: 't', t: 16, vl: 6, rl: 12 },
          { id: 'b5', type: 'fan', label: 'ZU', from: 'b4', dt: 1 },
          { id: 'b6', type: 'room', label: 'RA', from: 'b5', qs: 12, mw: 3 },
          { id: 'b7', type: 'comfort' },
        ],
      },
    ],
  });
}
