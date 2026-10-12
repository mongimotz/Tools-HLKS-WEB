// SPDX-License-Identifier: AGPL-3.0-or-later
// Input schema, normalisation and the example project (Kilian chain, docs/silencer-plan.md section 2).
//
// inputs = { mode, density, strands: [{ id, name, flow, elements: [...] }], catalogs: { roomTypes, sensitivities, lsv } }
// Elements form a tree per strand (`after` = predecessor, null = start of the strand). Element ids are unique
// in the whole file. Database silencers keep a copy of their data row (`row`), so a file stays reproducible
// when the data changes; the full database is not part of the inputs.

import { lookupRow, rowCopy, rowMatches, RHO_TABLE } from './calc.js';

export const TOOL_ID = 'silencer';
export const INPUT_VERSION = 1;

export const MODES = ['check', 'propose'];
export const ELEMENT_TYPES = ['source', 'component', 'silencer', 'receiver'];
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
  return {
    roomTypes: (cat.roomTypes ?? defaultRoomTypes()).map((t) => ({
      id: str(t.id),
      name: str(t.name),
      sensitivity: pick(t.sensitivity, SENSITIVITIES, 'medium'),
      design: num(t.design),
      note: str(t.note),
    })),
    sensitivities: (cat.sensitivities ?? defaultSensitivities()).map((s) => ({ id: str(s.id), name: str(s.name), min: num(s.min), raised: num(s.raised) })),
    lsv: (cat.lsv ?? defaultLsv()).map((r) => ({
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

export const nextStrandId = (strands) => nextId(strands, 'st');
/** Element ids are unique in the file, so pass the elements of all strands. */
export const nextElementId = (elements) => nextId(elements, 'e');
export const allElements = (inputs) => inputs.strands.flatMap((s) => s.elements);

// ---- elements -------------------------------------------------------------------------------

export function defaultRect() {
  return { series: 'trox-xk', d: 200, s: 100, L: 1500, n: null, H: 1000, B: null };
}

export function defaultRound() {
  return { series: 'trox-ca', dn: 315, L: 1000, insulation: 50, core: null };
}

export function defaultManual() {
  return { de: spectrum(), dp: null, lwFlow: spectrum() };
}

function normalizeRect(r = {}) {
  const d = defaultRect();
  return { series: str(r.series ?? d.series), d: num(r.d), s: num(r.s), L: num(r.L), n: num(r.n), H: num(r.H), B: num(r.B) };
}

function normalizeRound(r = {}) {
  const d = defaultRound();
  return { series: str(r.series ?? d.series), dn: num(r.dn), L: num(r.L), insulation: num(r.insulation), core: num(r.core) };
}

/**
 * Stored data row of a database silencer: kept while it fits the selection, else taken from the current
 * data (null if the selection is not a product). Manual silencers have no row.
 */
function normalizeRow(el) {
  if (el.kind === 'manual') return null;
  const spec = el[el.kind];
  if (el.row && rowMatches(el.row, el.kind, spec)) return rowCopy(el.row, el.kind);
  return rowCopy(lookupRow(el.kind, spec), el.kind);
}

/**
 * Constraints of the proposal (mode "Vorschlag"); null until the element is searched once. `active` marks the one
 * element that is searched. Empty values: no limit (v max and Δp max: PROPOSE_DEFAULTS in calc.js).
 * rect: series, H, bMax, lMax; round: series, dn (fixed) or dnMin … dnMax, dOuterMax, lMax; both: vMax, dpMax.
 */
function normalizePropose(p) {
  if (!p || typeof p !== 'object') return null;
  return {
    active: p.active === true,
    series: str(p.series),
    H: num(p.H),
    bMax: num(p.bMax),
    lMax: num(p.lMax),
    dn: num(p.dn),
    dnMin: num(p.dnMin),
    dnMax: num(p.dnMax),
    dOuterMax: num(p.dOuterMax),
    vMax: num(p.vMax),
    dpMax: num(p.dpMax),
  };
}

/** Bring an element into the schema of its type. All silencer sources stay, so switching kind keeps the values. */
export function normalizeElement(e = {}) {
  const type = pick(e.type, ELEMENT_TYPES, 'source');
  const base = {
    id: str(e.id),
    nr: str(e.nr),
    after: e.after ? str(e.after) : null,
    type,
    name: str(e.name),
    flow: num(e.flow),
    split: num(e.split),
  };
  switch (type) {
    case 'source':
      return { ...base, lw: spectrum(e.lw) };
    case 'component':
      return { ...base, d: spectrum(e.d), lw: spectrum(e.lw) };
    case 'silencer': {
      const el = {
        ...base,
        kind: pick(e.kind, SILENCER_KINDS, 'rect'),
        install: pick(e.install, INSTALLS, 'duct'),
        rect: e.rect ? normalizeRect(e.rect) : defaultRect(),
        round: e.round ? normalizeRound(e.round) : defaultRound(),
        manual: {
          de: spectrum(e.manual?.de),
          dp: num(e.manual?.dp),
          lwFlow: spectrum(e.manual?.lwFlow),
        },
        row: e.row ?? null,
        propose: normalizePropose(e.propose),
      };
      el.row = normalizeRow(el);
      return el;
    }
    case 'receiver': {
      const hours = (v) => (num(v) == null ? null : Math.min(12, Math.max(0, v)));
      return {
        ...base,
        r: num(e.r),
        q: pick(num(e.q), DIRECTIVITIES, 2),
        area: num(e.area),
        volume: num(e.volume),
        reverb: num(e.reverb),
        basis: pick(e.basis, TARGET_BASES, 'room'),
        target: num(e.target),
        room: { type: str(e.room?.type ?? '3.01'), requirement: pick(e.room?.requirement, REQUIREMENTS, 'min') },
        lsv: {
          es: pick(num(e.lsv?.es), [1, 2, 3, 4], 2),
          limit: pick(e.lsv?.limit, LSV_LIMITS, 'planning'),
          business: e.lsv?.business === true,
          k2: pick(num(e.lsv?.k2), LSV_CORRECTIONS, 0),
          k3: pick(num(e.lsv?.k3), LSV_CORRECTIONS, 0),
          hoursDay: hours(e.lsv?.hoursDay),
          hoursNight: hours(e.lsv?.hoursNight),
        },
      };
    }
  }
}

export function newElement(inputs, type, overrides = {}) {
  return normalizeElement({ id: nextElementId(allElements(inputs)), type, ...overrides });
}

// ---- structure editing ----------------------------------------------------------------------
// The table shows the elements in array order. An element directly after its predecessor in the array is the
// continuation of the path; later successors are branches (they sit below the subtree of the branch point).

function childrenOf(els) {
  const ids = new Set(els.map((e) => e.id));
  const map = new Map(els.map((e) => [e.id, []]));
  for (const e of els) if (e.after && ids.has(e.after)) map.get(e.after).push(e.id);
  return map;
}

/** All elements after `id` (its subtree without itself). */
export function subtreeOf(els, id) {
  const children = childrenOf(els);
  const out = new Set();
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const c = stack.pop();
    if (out.has(c)) continue;
    out.add(c);
    stack.push(...(children.get(c) ?? []));
  }
  return out;
}

/**
 * Automatic numbers: the main path 1, 2, 3 …; the branches of element N continue as N.1, N.2 … (all branches of
 * N share the counter), their branches as N.k.1 … The first successor of an element is its continuation.
 */
export function autoNumbers(els) {
  const children = childrenOf(els);
  const ids = new Set(els.map((e) => e.id));
  const out = new Map();
  const walk = (id, prefix, start) => {
    let i = start;
    for (let cur = id; cur && !out.has(cur); i++) {
      const nr = `${prefix}${i}`;
      out.set(cur, nr);
      const [next, ...branches] = children.get(cur);
      let j = 1;
      for (const b of branches) j = walk(b, `${nr}.`, j);
      cur = next;
    }
    return i;
  };
  let k = 1;
  for (const e of els) if (!e.after || !ids.has(e.after)) k = walk(e.id, '', k);
  return out;
}

/** True while the numbers are the automatic ones (or empty): then they follow every change of the structure. */
export function isAutoNumbered(els) {
  const auto = autoNumbers(els);
  return els.every((e) => e.nr === '' || e.nr === auto.get(e.id));
}

/** Branch depth of every element: 0 on the main path, +1 for each branch on the way. */
export function branchDepths(els) {
  const children = childrenOf(els);
  const out = new Map();
  const visit = (id, d) => {
    out.set(id, d);
    children.get(id).forEach((c, i) => visit(c, i === 0 ? d : d + 1));
  };
  const ids = new Set(els.map((e) => e.id));
  for (const e of els) if (!e.after || !ids.has(e.after)) visit(e.id, 0);
  return out;
}

/** Apply a structural change; keeps automatic numbers automatic. */
function restructure(strand, change) {
  const auto = isAutoNumbered(strand.elements);
  const result = change(strand.elements);
  if (auto) {
    const nrs = autoNumbers(strand.elements);
    for (const e of strand.elements) e.nr = nrs.get(e.id) ?? '';
  }
  return result;
}

/** New element directly after `afterId` (null: at the start); the elements after it now follow the new one. */
export function insertAfter(inputs, strand, afterId, type, overrides = {}) {
  const el = newElement(inputs, type, overrides);
  return restructure(strand, (els) => {
    el.after = afterId ?? null;
    for (const e of els) if ((e.after ?? null) === (afterId ?? null) && (afterId != null || els.indexOf(e) === 0)) e.after = el.id;
    const idx = afterId ? els.findIndex((e) => e.id === afterId) + 1 : 0;
    els.splice(idx, 0, el);
    return el;
  });
}

/** New element directly before `beforeId` (only that element moves behind it, not its siblings). */
export function insertBefore(inputs, strand, beforeId, type, overrides = {}) {
  const el = newElement(inputs, type, overrides);
  return restructure(strand, (els) => {
    const target = els.find((e) => e.id === beforeId);
    el.after = target.after;
    target.after = el.id;
    els.splice(els.indexOf(target), 0, el);
    return el;
  });
}

/** New branch from `fromId`: placed below the subtree of the branch point. */
export function branchFrom(inputs, strand, fromId, type, overrides = {}) {
  const el = newElement(inputs, type, { ...overrides, after: fromId });
  return restructure(strand, (els) => {
    const sub = subtreeOf(els, fromId);
    let idx = els.findIndex((e) => e.id === fromId);
    for (let i = idx + 1; i < els.length && sub.has(els[i].id); i++) idx = i;
    els.splice(idx + 1, 0, el);
    return el;
  });
}

/**
 * New predecessor for an element. The element and everything after it move below the subtree of the new
 * predecessor, so the element becomes a branch there (or the continuation if it had no successors).
 */
export function setPredecessor(strand, id, afterId) {
  return restructure(strand, (els) => {
    const el = els.find((e) => e.id === id);
    if (!el || !afterId || afterId === id || subtreeOf(els, id).has(afterId)) return false;
    const moving = new Set([id, ...subtreeOf(els, id)]);
    const block = els.filter((e) => moving.has(e.id));
    const rest = els.filter((e) => !moving.has(e.id));
    el.after = afterId;
    const sub = subtreeOf(rest, afterId);
    let idx = rest.findIndex((e) => e.id === afterId);
    for (let i = idx + 1; i < rest.length && sub.has(rest[i].id); i++) idx = i;
    rest.splice(idx + 1, 0, ...block);
    els.splice(0, els.length, ...rest);
    return true;
  });
}

/** Remove an element; its successors move to its predecessor. */
export function removeElement(strand, id) {
  return restructure(strand, (els) => {
    const idx = els.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    const [el] = els.splice(idx, 1);
    for (const e of els) if (e.after === id) e.after = el.after;
    return el;
  });
}

/**
 * Swap an element with its predecessor on the path (up) or with its only successor (down).
 * The branches stay at their branch point. Returns false if the move is not possible.
 */
export function moveElement(strand, id, direction) {
  const els = strand.elements;
  const el = els.find((e) => e.id === id);
  if (!el) return false;
  if (direction > 0) {
    const kids = els.filter((e) => e.after === id);
    return kids.length === 1 ? moveElement(strand, kids[0].id, -1) : false;
  }
  const p = els.find((e) => e.id === el.after);
  if (!p || els.find((e) => e.after === p.id) !== el) return false; // only the continuation, not a branch start
  restructure(strand, () => {
    for (const e of els) if (e.after === el.id) e.after = p.id;
    el.after = p.after;
    p.after = el.id;
    const i = els.indexOf(el);
    const j = els.indexOf(p);
    [els[i], els[j]] = [els[j], els[i]];
  });
  return true;
}

/** Copy of a strand with new ids (elements keep their structure). */
export function duplicateStrand(inputs, strand) {
  const copy = JSON.parse(JSON.stringify(strand));
  copy.id = nextStrandId(inputs.strands);
  const all = allElements(inputs);
  const map = new Map();
  for (const e of copy.elements) {
    const id = nextElementId([...all, ...[...map.values()].map((x) => ({ id: x }))]);
    map.set(e.id, id);
  }
  for (const e of copy.elements) {
    e.id = map.get(e.id);
    e.after = e.after ? map.get(e.after) ?? null : null;
  }
  return normalizeStrand(copy);
}

// ---- strands --------------------------------------------------------------------------------

export function normalizeStrand(s = {}) {
  return {
    id: str(s.id),
    name: str(s.name),
    flow: num(s.flow),
    elements: (Array.isArray(s.elements) ? s.elements : []).map(normalizeElement),
  };
}

export function newStrand(inputs, overrides = {}) {
  const strand = normalizeStrand({ id: nextStrandId(inputs.strands), ...overrides });
  const all = allElements(inputs);
  const source = normalizeElement({ id: nextElementId(all), nr: '1', type: 'source' });
  const receiver = normalizeElement({ id: nextElementId([...all, source]), nr: '2', after: source.id, type: 'receiver' });
  strand.elements.push(source, receiver);
  return strand;
}

/**
 * Bring any (older / partial) input object into the current schema. Idempotent.
 * Strand ids and element ids (unique in the whole file) are repaired if empty or doubled.
 */
export function normalizeInputs(raw = {}) {
  const strands = (Array.isArray(raw.strands) ? raw.strands : []).map(normalizeStrand);
  const seenStrands = new Set();
  for (const s of strands) {
    if (!s.id || seenStrands.has(s.id)) s.id = nextStrandId(strands);
    seenStrands.add(s.id);
  }
  const elements = strands.flatMap((s) => s.elements);
  const seen = new Set();
  for (const e of elements) {
    if (!e.id || seen.has(e.id)) e.id = nextElementId(elements);
    seen.add(e.id);
  }
  // Only one element is searched at a time (mode "Vorschlag").
  let active = false;
  for (const e of elements) {
    if (!e.propose?.active) continue;
    if (active) e.propose.active = false;
    active = true;
  }
  return {
    mode: pick(raw.mode, MODES, 'check'),
    density: num(raw.density) > 0 ? raw.density : RHO_TABLE,
    strands,
    catalogs: normalizeCatalogs(raw.catalogs),
  };
}

export function emptyInputs() {
  const inputs = normalizeInputs({});
  inputs.strands.push(newStrand(inputs));
  return inputs;
}

/** The owner's Excel sheet "Beispiel Kilian": one chain with manual values. */
export function exampleInputs() {
  return normalizeInputs({
    strands: [
      {
        id: 'st1',
        name: 'Zuluft',
        flow: null,
        elements: [
          { id: 'e1', nr: '1', after: null, type: 'source', name: 'Ventilator', lw: [78, 85, 87, 89, 78, 79, 78, 74] },
          {
            id: 'e2', nr: '2', after: 'e1', type: 'silencer', name: 'Schalldämpfer 1', kind: 'manual',
            manual: { de: [4, 15, 28, 38, 43, 33, 18, 11], dp: null, lwFlow: [41, 36, 32, 28, 25, 22, 19, 15] },
          },
          { id: 'e3', nr: '3', after: 'e2', type: 'component', name: 'VAV', lw: [69, 61, 53, 50, 50, 53, 48, 43] },
          {
            id: 'e4', nr: '4', after: 'e3', type: 'silencer', name: 'Schalldämpfer 2', kind: 'manual',
            manual: { de: [6, 14, 21, 43, 50, 50, 35, 26], dp: null, lwFlow: [49, 44, 40, 36, 32, 28, 25, 22] },
          },
          { id: 'e5', nr: '5', after: 'e4', type: 'receiver', name: 'Büro', r: 2, q: 2, basis: 'room', room: { type: '3.01' } },
        ],
      },
    ],
  });
}
