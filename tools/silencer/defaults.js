// SPDX-License-Identifier: AGPL-3.0-or-later
// Input schema, normalisation and the example project (Kilian chain, docs/silencer-plan.md section 2).
//
// inputs = { density, paths: [{ id, name, flow, rows: [...], receiver: {...} }], catalogs: { roomTypes, sensitivities, lsv } }
// A path is a plain list of rows from the first source to the receiver (no tree). Row ids are unique in the whole
// file. Database silencers keep a copy of their data row (`row`), so a file stays reproducible when the data
// changes; the full database is not part of the inputs.
// Beta: files of older input versions are not migrated (AGENTS.md), normalizeInputs only must not throw.

import { lookupRow, rowCopy, rowMatches, snapRect, snapRound, RHO_TABLE } from './calc.js';

export const TOOL_ID = 'silencer';
export const INPUT_VERSION = 2;

/** Row types: source (+ L_W), loss (− D), branch (− ΔL from the flows), silencer (− D_e, + flow noise). */
export const ROW_TYPES = ['source', 'loss', 'branch', 'silencer'];
/** Unit of a level line: dB or dB(A). The calculation runs in dB(A); dB lines get an A-weighting line. */
export const UNITS = ['dB', 'dBA'];
export const SILENCER_KINDS = ['rect', 'round', 'manual'];
export const INSTALLS = ['duct', 'freeInlet', 'freeOutlet'];
/** Directivity Q of the receiver. */
export const DIRECTIVITIES = [1, 2, 4, 8];
/** Target of a receiver: room type (indoor, SIA), LSV (outdoor) or a value typed in. */
export const TARGET_BASES = ['room', 'lsv', 'manual'];
export const SENSITIVITIES = ['none', 'low', 'medium', 'high'];
/** Room target: minimum or raised requirement of SIA 181, or the recommended design value of SIA 2024 (where given). */
export const REQUIREMENTS = ['min', 'raised', 'design'];
/** LSV: limit (Planungswert for new installations, Art. 7; Immissionsgrenzwert for changed ones, Art. 8), K2 / K3 steps. */
export const LSV_LIMITS = ['planning', 'immission'];
export const LSV_CORRECTIONS = [0, 2, 4, 6];

// ---- catalogues (saved with every file) -------------------------------------------------------

/**
 * Noise sensitivity classes with the limit L_H for continuous noise of building services [dB(A)],
 * SIA 181:2020 (minimum and raised requirement). Applies to ventilation within a unit too (SIA 382/1:2025, 2.2.7.10).
 */
export function defaultSensitivities() {
  return [
    { id: 'low', name: 'gering', min: 33, raised: 29 },
    { id: 'medium', name: 'mittel', min: 28, raised: 25 },
    { id: 'high', name: 'hoch', min: 25, raised: 25 },
  ];
}

// Footnotes of SIA 2024:2021, table 12 (short form).
const N1 = 'evtl. akustische Konditionierung nötig (Grösse, Nutzung, Belegung)';
const N2 = 'Ablufthaube mittlerer Betrieb';
const N3 = 'individuelle Festlegung möglich, z. B. 5 bis 10 dB unter dem mittleren Betriebsschalldruckpegel (30 bis 85 dB)';
const N4 = 'mechanische Lüftung von Wohngebäuden nach SIA 382/5, Ziffer 2.2.8';

/**
 * Room uses of SIA 2024:2021, Anhang A, table 12: noise sensitivity per SIA 181 and the recommended design value
 * L_H for continuous noise [dB(A)] (`design`, only where the table gives one). `note`: footnote of the table.
 */
export function defaultRoomTypes() {
  return [
    { id: '1.01', name: 'Wohnen MFH', sensitivity: 'medium', design: 25, note: N4 },
    { id: '1.02', name: 'Wohnen EFH', sensitivity: 'medium', design: 25, note: N4 },
    { id: '2.01', name: 'Hotelzimmer', sensitivity: 'medium', design: 25 },
    { id: '2.02', name: 'Empfang, Lobby', sensitivity: 'low' },
    { id: '3.01', name: 'Einzel-, Gruppenbüro', sensitivity: 'medium', design: 25 },
    { id: '3.02', name: 'Grossraumbüro', sensitivity: 'low', note: N1 },
    { id: '3.03', name: 'Sitzungszimmer', sensitivity: 'low' },
    { id: '3.04', name: 'Schalterhalle, Empfang', sensitivity: 'low' },
    { id: '4.01', name: 'Schulzimmer', sensitivity: 'medium' },
    { id: '4.02', name: 'Lehrerzimmer, Aufenthaltsraum', sensitivity: 'low' },
    { id: '4.03', name: 'Bibliothek', sensitivity: 'medium' },
    { id: '4.04', name: 'Hörsaal', sensitivity: 'medium' },
    { id: '4.05', name: 'Schulfachraum', sensitivity: 'medium' },
    { id: '5.01', name: 'Lebensmittelverkauf', sensitivity: 'low' },
    { id: '5.02', name: 'Fachgeschäft', sensitivity: 'low' },
    { id: '5.03', name: 'Verkauf Möbel, Bau, Garten', sensitivity: 'low' },
    { id: '6.01', name: 'Restaurant', sensitivity: 'low' },
    { id: '6.02', name: 'Selbstbedienungsrestaurant', sensitivity: 'low' },
    { id: '6.03', name: 'Küche zu 6.1', sensitivity: 'low', note: N2 },
    { id: '6.04', name: 'Küche zu 6.2', sensitivity: 'low', note: N2 },
    { id: '7.01', name: 'Vorstellungsraum', sensitivity: 'medium' },
    { id: '7.02', name: 'Mehrzweckhalle', sensitivity: 'low' },
    { id: '7.03', name: 'Ausstellungshalle', sensitivity: 'low' },
    { id: '8.01', name: 'Bettenzimmer', sensitivity: 'medium', design: 25 },
    { id: '8.02', name: 'Stationszimmer', sensitivity: 'low' },
    { id: '8.03', name: 'Behandlungsraum', sensitivity: 'low' },
    { id: '9.01', name: 'Produktion (grobe Arbeit)', sensitivity: 'low', note: N3 },
    { id: '9.02', name: 'Produktion (feine Arbeit)', sensitivity: 'low', note: N3 },
    { id: '9.03', name: 'Laborraum', sensitivity: 'low' },
    { id: '10.01', name: 'Lagerraum', sensitivity: 'none' },
    { id: '11.01', name: 'Turnhalle', sensitivity: 'low' },
    { id: '11.02', name: 'Fitnessraum', sensitivity: 'low' },
    { id: '11.03', name: 'Schwimmhalle', sensitivity: 'low' },
    { id: '12.01', name: 'Verkehrsfläche', sensitivity: 'low' },
    { id: '12.02', name: 'Verkehrsfläche 24 h', sensitivity: 'low' },
    { id: '12.03', name: 'Treppenhaus', sensitivity: 'none' },
    { id: '12.04', name: 'Nebenraum', sensitivity: 'none' },
    { id: '12.05', name: 'Küche, Teeküche', sensitivity: 'low' },
    { id: '12.06', name: 'WC, Bad, Dusche', sensitivity: 'low' },
    { id: '12.07', name: 'WC', sensitivity: 'low' },
    { id: '12.08', name: 'Garderobe, Dusche', sensitivity: 'low' },
    { id: '12.09', name: 'Parkhaus', sensitivity: 'none' },
    { id: '12.10', name: 'Wasch- und Trockenraum', sensitivity: 'none' },
    { id: '12.11', name: 'Kühlraum', sensitivity: 'none' },
    { id: '12.12', name: 'Serverraum', sensitivity: 'none' },
  ];
}

/** LSV Anhang 6 Ziff. 2 (Stand 1.11.2024): Planungswert and Immissionsgrenzwert L_r [dB(A)] per sensitivity level ES. */
export function defaultLsv() {
  return [
    { es: 1, planningDay: 50, planningNight: 40, immissionDay: 55, immissionNight: 45 },
    { es: 2, planningDay: 55, planningNight: 45, immissionDay: 60, immissionNight: 50 },
    { es: 3, planningDay: 60, planningNight: 50, immissionDay: 65, immissionNight: 55 },
    { es: 4, planningDay: 65, planningNight: 55, immissionDay: 70, immissionNight: 60 },
  ];
}

export function defaultCatalogs() {
  return { roomTypes: defaultRoomTypes(), sensitivities: defaultSensitivities(), lsv: defaultLsv() };
}

function normalizeCatalogs(cat = {}) {
  const item = (x) => (x && typeof x === 'object' ? x : {});
  return {
    roomTypes: (Array.isArray(cat.roomTypes) ? cat.roomTypes : defaultRoomTypes()).map(item).map((t) => ({
      id: str(t.id),
      name: str(t.name),
      sensitivity: pick(t.sensitivity, SENSITIVITIES, 'medium'),
      design: num(t.design),
      note: str(t.note),
    })),
    sensitivities: (Array.isArray(cat.sensitivities) ? cat.sensitivities : defaultSensitivities()).map(item).map((s) => ({ id: str(s.id), name: str(s.name), min: num(s.min), raised: num(s.raised) })),
    lsv: (Array.isArray(cat.lsv) ? cat.lsv : defaultLsv()).map(item).map((r) => ({
      es: num(r.es),
      planningDay: num(r.planningDay),
      planningNight: num(r.planningNight),
      immissionDay: num(r.immissionDay),
      immissionNight: num(r.immissionNight),
    })),
  };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v) => (v == null ? '' : String(v));
const pick = (v, list, fallback) => (list.includes(v) ? v : fallback);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
/** Spectrum of 8 octave values, empty cells null. */
const spectrum = (arr) => Array.from({ length: 8 }, (_, i) => num(Array.isArray(arr) ? arr[i] : null));

// ---- ids --------------------------------------------------------------------------------

function nextId(items, prefix) {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const it of items) {
    const m = re.exec(it.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}${max + 1}`;
}

export const nextPathId = (paths) => nextId(paths, 'w');
/** Row ids are unique in the file, so pass the rows of all paths. */
export const nextRowId = (rows) => nextId(rows, 'r');
export const allRows = (inputs) => inputs.paths.flatMap((p) => p.rows);

// ---- rows -------------------------------------------------------------------------------------

export function defaultRect() {
  return { series: 'trox-xk', d: 200, s: 100, L: 1500, B: null, H: null };
}

export function defaultRound() {
  return { series: 'trox-ca', dn: 315, insulation: 50, core: null, L: 1000 };
}

function normalizeRect(r) {
  if (!r || typeof r !== 'object') return defaultRect();
  return { series: str(r.series || defaultRect().series), d: num(r.d), s: num(r.s), L: num(r.L), B: num(r.B), H: num(r.H) };
}

function normalizeRound(r) {
  if (!r || typeof r !== 'object') return defaultRound();
  return { series: str(r.series || defaultRound().series), dn: num(r.dn), insulation: num(r.insulation), core: num(r.core), L: num(r.L) };
}

/**
 * Stored data row of a database silencer: kept while it fits the selection, else taken from the current
 * data (null if the selection is not a product). Manual silencers have no row.
 */
function storedRow(sd) {
  if (sd.kind === 'manual') return null;
  const spec = sd[sd.kind];
  if (sd.row && rowMatches(sd.row, sd.kind, spec)) return rowCopy(sd.row, sd.kind);
  return rowCopy(lookupRow(sd.kind, spec), sd.kind);
}

/** Bring a row into the schema of its type. A silencer keeps all three sources, so switching kind keeps the values. */
export function normalizeRow(e = {}) {
  e = obj(e);
  const type = pick(e.type, ROW_TYPES, 'source');
  const base = { id: str(e.id), type, name: str(e.name) };
  switch (type) {
    case 'source':
      return { ...base, lw: spectrum(e.lw), unit: pick(e.unit, UNITS, 'dB') };
    case 'loss':
      return { ...base, d: spectrum(e.d) };
    case 'branch':
      return { ...base, flow: num(e.flow), dl: num(e.dl) };
    default: {
      const m = obj(e.manual);
      const sd = {
        ...base,
        kind: pick(e.kind, SILENCER_KINDS, 'rect'),
        install: pick(e.install, INSTALLS, 'duct'),
        rect: normalizeRect(e.rect),
        round: normalizeRound(e.round),
        manual: { de: spectrum(m.de), lwFlow: spectrum(m.lwFlow), unit: pick(m.unit, UNITS, 'dB'), dp: num(m.dp) },
        row: e.row ?? null,
      };
      sd.row = storedRow(sd);
      return sd;
    }
  }
}

export function newRow(inputs, type, overrides = {}) {
  const row = normalizeRow({ id: nextRowId(allRows(inputs)), type, ...overrides });
  if (row.type === 'silencer') {
    row.rect = snapRect(row.rect);
    row.round = snapRound(row.round);
    row.row = storedRow(row);
  }
  return row;
}

// ---- receiver and paths ----------------------------------------------------------------------

export function normalizeReceiver(e) {
  e = obj(e);
  const room = obj(e.room);
  const lsv = obj(e.lsv);
  const hours = (v) => (num(v) == null ? null : Math.min(12, Math.max(0, v)));
  return {
    name: str(e.name),
    r: num(e.r),
    q: pick(num(e.q), DIRECTIVITIES, 2),
    area: num(e.area),
    volume: num(e.volume),
    reverb: num(e.reverb),
    basis: pick(e.basis, TARGET_BASES, 'room'),
    target: num(e.target),
    room: { type: str(room.type || '3.01'), requirement: pick(room.requirement, REQUIREMENTS, 'min') },
    lsv: {
      es: pick(num(lsv.es), [1, 2, 3, 4], 2),
      limit: pick(lsv.limit, LSV_LIMITS, 'planning'),
      business: lsv.business === true,
      k2: pick(num(lsv.k2), LSV_CORRECTIONS, 0),
      k3: pick(num(lsv.k3), LSV_CORRECTIONS, 0),
      hoursDay: hours(lsv.hoursDay),
      hoursNight: hours(lsv.hoursNight),
    },
  };
}

export function normalizePath(p) {
  p = obj(p);
  return {
    id: str(p.id),
    name: str(p.name),
    flow: num(p.flow),
    rows: (Array.isArray(p.rows) ? p.rows : []).map(normalizeRow),
    receiver: normalizeReceiver(p.receiver),
  };
}

/** New path with one empty source row (in dB). */
export function newPath(inputs, overrides = {}) {
  const path = normalizePath({ id: nextPathId(inputs.paths), ...overrides });
  path.rows.push(normalizeRow({ id: nextRowId(allRows(inputs)), type: 'source' }));
  return path;
}

/** Copy of a path with new ids. */
export function duplicatePath(inputs, path) {
  const copy = normalizePath(JSON.parse(JSON.stringify(path)));
  copy.id = nextPathId(inputs.paths);
  const taken = allRows(inputs).slice();
  for (const row of copy.rows) {
    row.id = nextRowId(taken);
    taken.push(row);
  }
  return copy;
}

/**
 * Bring any input object into the current schema. Idempotent.
 * Path ids and row ids (unique in the whole file) are repaired if empty or doubled. A file always has a path.
 */
export function normalizeInputs(raw = {}) {
  raw = obj(raw);
  const paths = (Array.isArray(raw.paths) ? raw.paths : []).map(normalizePath);
  const seenPaths = new Set();
  for (const p of paths) {
    if (!p.id || seenPaths.has(p.id)) p.id = nextPathId(paths);
    seenPaths.add(p.id);
  }
  const rows = paths.flatMap((p) => p.rows);
  const seen = new Set();
  for (const r of rows) {
    if (!r.id || seen.has(r.id)) r.id = nextRowId(rows);
    seen.add(r.id);
  }
  const inputs = {
    density: num(raw.density) > 0 ? raw.density : RHO_TABLE,
    paths,
    catalogs: normalizeCatalogs(obj(raw.catalogs)),
  };
  if (!paths.length) paths.push(newPath(inputs));
  return inputs;
}

export function emptyInputs() {
  return normalizeInputs({});
}

/**
 * Example: the owner's Excel sheet "Beispiel Kilian" (one path, values typed in, all in dB) and a second path with a
 * splitter silencer from the data and a branch.
 */
export function exampleInputs() {
  return normalizeInputs({
    paths: [
      {
        id: 'w1',
        name: 'Zuluft Büro',
        flow: null,
        rows: [
          { id: 'r1', type: 'source', name: 'Ventilator', unit: 'dB', lw: [78, 85, 87, 89, 78, 79, 78, 74] },
          { id: 'r2', type: 'silencer', name: 'SD 1', kind: 'manual', manual: { de: [4, 15, 28, 38, 43, 33, 18, 11], lwFlow: [41, 36, 32, 28, 25, 22, 19, 15], unit: 'dB' } },
          { id: 'r3', type: 'source', name: 'VAV', unit: 'dB', lw: [69, 61, 53, 50, 50, 53, 48, 43] },
          { id: 'r4', type: 'silencer', name: 'SD 2', kind: 'manual', manual: { de: [6, 14, 21, 43, 50, 50, 35, 26], lwFlow: [49, 44, 40, 36, 32, 28, 25, 22], unit: 'dB' } },
        ],
        receiver: { name: 'Büro', r: 2, q: 2, basis: 'room', room: { type: '3.01' } },
      },
      {
        id: 'w2',
        name: 'Zuluft Sitzung',
        flow: 5000,
        rows: [
          { id: 'r5', type: 'source', name: 'Ventilator', unit: 'dB', lw: [84, 88, 89, 87, 84, 81, 77, 72] },
          { id: 'r6', type: 'silencer', name: 'SD 3', kind: 'rect', rect: { series: 'trox-xk', d: 200, s: 100, L: 1500, B: 900, H: 1000 } },
          { id: 'r7', type: 'branch', name: 'Abzweig', flow: 1500 },
          { id: 'r8', type: 'loss', name: 'Bogen, Auslass', d: [2, 3, 4, 5, 5, 5, 5, 5] },
        ],
        receiver: { name: 'Sitzung', r: 2, q: 2, volume: 150, reverb: 0.6, basis: 'room', room: { type: '3.03' } },
      },
    ],
  });
}
