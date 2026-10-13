// SPDX-License-Identifier: AGPL-3.0-or-later
// Silencer calculation: sound power per octave band along a path, from the first source to the receiver,
// with insertion loss, pressure loss and flow noise of the silencers. Pure functions, no DOM: runs in the
// browser and in Node tests. Method: docs/silencer-method.md, data: docs/silencer-data.md.
//
// A path is a plain list of rows, like the owner's Excel sheet. The level runs through the rows in dB(A) per
// octave: rows entered in dB are A-weighted on the way in, losses are differences and need no weighting.
// Units: lengths in mm (inputs) and m (calculation), flow in m³/h, velocity in m/s, pressure in Pa.
// Spectra are arrays of 8 values for OCTAVES; "no sound" is -Infinity.

export const CALC_VERSION = '2.0.0';

import { dynamicViscosity, frictionFactor } from '../../lib/core/air.js';
import {
  DATA_VERSION,
  OCTAVES,
  SPLITTER_SERIES,
  SPLITTER_ROWS,
  ROUND_SERIES,
  ROUND_ROWS,
  TROX_FLOW_NOISE,
  TROX_FLOW_NOISE_FIT,
  FLOW_NOISE_SPECTRUM,
  A_WEIGHTING,
  INSTALL_FACTORS,
  LIMITS,
} from './data/index.js';

export { OCTAVES, A_WEIGHTING, DATA_VERSION, LIMITS, SPLITTER_SERIES, ROUND_SERIES };

/** The manufacturer tables refer to standard air; ζ is derived with this density. */
export const RHO_TABLE = 1.2;
/** Basis of the straight-duct Δp model: galvanised duct [mm], air at 20 °C. */
export const DUCT_ROUGHNESS = 0.15;
export const DUCT_TEMPERATURE = 20;

const BANDS = OCTAVES.length;
const LG = Math.log10;
const EPS = 1e-9;

// ---- levels -------------------------------------------------------------------------

export const silent = () => new Array(BANDS).fill(-Infinity);

/** Energetic sum 10·lg Σ 10^(L/10); no finite level → -Infinity. */
export function sumLevels(levels) {
  let e = 0;
  for (const l of levels) if (Number.isFinite(l)) e += 10 ** (l / 10);
  return e > 0 ? 10 * LG(e) : -Infinity;
}

/** Octave-wise energetic sum of two spectra. */
export function addSpectra(a, b) {
  return a.map((l, i) => sumLevels([l, b[i]]));
}

/** A-weighted total of a spectrum in dB [dB(A)]. */
export function aWeighted(spectrum) {
  return sumLevels(spectrum.map((l, i) => l + A_WEIGHTING[i]));
}

/** Spectrum in dB(A) per octave from a spectrum in `unit` ('dB' or 'dBA'). */
export const toA = (spectrum, unit) => (unit === 'dBA' ? spectrum.slice() : spectrum.map((l, i) => l + A_WEIGHTING[i]));

/** Input spectrum of levels: empty cells carry no sound. */
const levels = (arr) => Array.from({ length: BANDS }, (_, i) => (Number.isFinite(arr?.[i]) ? arr[i] : -Infinity));
/** Input spectrum of losses: empty cells are 0 dB. */
const losses = (arr) => Array.from({ length: BANDS }, (_, i) => (Number.isFinite(arr?.[i]) ? arr[i] : 0));
const hasValue = (arr) => Array.isArray(arr) && arr.some(Number.isFinite);

// ---- helpers --------------------------------------------------------------------------

/** Linear interpolation of ys over xs (ascending); outside the table the end values are held. */
export function interpolate(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  const last = xs.length - 1;
  if (x >= xs[last]) return ys[last];
  let i = 1;
  while (xs[i] < x) i++;
  const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return ys[i - 1] + t * (ys[i] - ys[i - 1]);
}

const zetaAt = (pa, v) => pa / ((RHO_TABLE / 2) * v * v);
const circle = (dMm) => (Math.PI / 4) * (dMm / 1000) ** 2;

/** ζ from a table { v, pa }: ζ per point, interpolated linearly over v, end values held. */
export function zetaFromVelocityTable(dp, v) {
  return interpolate(dp.v, dp.v.map((vi, i) => zetaAt(dp.pa[i], vi)), v);
}

/** ζ from measured points { q [m³/h], pa } of a round silencer: mean of ζ_i, v_i = q_i / A. */
export function zetaFromFlowPoints(dp, area) {
  const z = dp.q.map((q, i) => zetaAt(dp.pa[i], q / 3600 / area));
  return z.reduce((a, b) => a + b, 0) / z.length;
}

/** Δp [Pa] of a straight galvanised duct (Colebrook-White). */
export function ductLoss({ v, dMm, lengthMm, density }) {
  const d = dMm / 1000;
  const nu = dynamicViscosity(DUCT_TEMPERATURE) / density;
  const lambda = frictionFactor((v * d) / nu, DUCT_ROUGHNESS / dMm);
  return { lambda, dp: ((lambda * lengthMm) / dMm) * (density / 2) * v * v };
}

/**
 * Flow noise after the Trox table: L_WA for 1 m² face area over v (interpolated over lg v, own fit outside
 * 4 … 20 m/s) + 10·lg A, octaves in dB from the relative spectrum. v ≤ 0 → null.
 */
export function flowNoise(v, area) {
  if (!(v > 0 && area > 0)) return null;
  const { v: vs, lwa: ls } = TROX_FLOW_NOISE;
  const perArea =
    v < vs[0] || v > vs[vs.length - 1]
      ? TROX_FLOW_NOISE_FIT.a + TROX_FLOW_NOISE_FIT.b * LG(v)
      : interpolate(vs.map(LG), ls, LG(v));
  const lwa = perArea + 10 * LG(area / TROX_FLOW_NOISE.refArea);
  return { lwa, lw: FLOW_NOISE_SPECTRUM.dl.map((dl) => lwa + dl) };
}

// ---- targets ----------------------------------------------------------------------------

/** LSV Anhang 6 Ziff. 33 Abs. 1 Bst. d: level correction K1 for heating, ventilation and air conditioning [dB]. */
export const LSV_K1 = { day: 5, night: 10 };
/** LSV Anhang 6 Ziff. 31: t0 = 720 min per period (day 07 to 19 h, night 19 to 07 h). */
export const LSV_PERIOD_HOURS = 12;
/** LSV Art. 42: planning and immission limits 5 dB higher for rooms in businesses in ES I to III. */
export const LSV_BUSINESS_BONUS = 5;

/**
 * Checks of a receiver against its target. One check for a room (SIA) or a manual target, one per period
 * (day, night) for LSV. Level compared: L_pA, for LSV the rating level L_r = L_pA + K1 + K2 + K3 + 10·lg(t/t0).
 * Returns [{ period, level, limit }]; periods without operation (t = 0) and rooms without requirement drop out.
 */
export function targetChecks(rc, lpa, catalogs) {
  if (!Number.isFinite(lpa)) return [];
  if (rc.basis === 'manual') return rc.target != null ? [{ period: null, level: lpa, limit: rc.target }] : [];
  if (rc.basis === 'room') {
    const room = catalogs.roomTypes.find((t) => t.id === rc.room.type);
    const sens = room && catalogs.sensitivities.find((s) => s.id === room.sensitivity);
    if (!sens) return [];
    const req = rc.room.requirement;
    const limit = req === 'raised' ? sens.raised : req === 'design' ? room.design ?? sens.min : sens.min;
    return limit != null ? [{ period: null, level: lpa, limit }] : [];
  }
  const row = catalogs.lsv.find((r) => r.es === rc.lsv.es);
  if (!row) return [];
  const bonus = rc.lsv.business && rc.lsv.es <= 3 ? LSV_BUSINESS_BONUS : 0;
  const out = [];
  for (const period of ['day', 'night']) {
    const hours = rc.lsv[period === 'day' ? 'hoursDay' : 'hoursNight'] ?? LSV_PERIOD_HOURS;
    const base = row[`${rc.lsv.limit === 'immission' ? 'immission' : 'planning'}${period === 'day' ? 'Day' : 'Night'}`];
    if (!(hours > 0) || base == null) continue;
    const level = lpa + LSV_K1[period] + rc.lsv.k2 + rc.lsv.k3 + 10 * LG(Math.min(hours, LSV_PERIOD_HOURS) / LSV_PERIOD_HOURS);
    out.push({ period, level, limit: base + bonus });
  }
  return out;
}

/** Receiver term 10·lg(Q / (4π r²) + 4 / A) [dB]; A empty → free field only. */
export function roomTerm({ r, q, area }) {
  return 10 * LG(q / (4 * Math.PI * r * r) + (area > 0 ? 4 / area : 0));
}

/** Equivalent absorption area [m²]: given, or Sabine A = 0.163·V / T. Null = free field. */
export function absorptionArea({ area, volume, reverb }) {
  if (area > 0) return area;
  if (volume > 0 && reverb > 0) return (0.163 * volume) / reverb;
  return null;
}

// ---- data rows ---------------------------------------------------------------------------

const SPLITTER_SERIES_BY_ID = new Map(SPLITTER_SERIES.map((s) => [s.id, s]));
const ROUND_SERIES_BY_ID = new Map(ROUND_SERIES.map((s) => [s.id, s]));

export const seriesOf = (kind, id) => (kind === 'rect' ? SPLITTER_SERIES_BY_ID : ROUND_SERIES_BY_ID).get(id) ?? null;

/** True if the row belongs to the selection (rect: series, d, s, L; round: series, dn, L, insulation, core). */
export function rowMatches(row, kind, spec) {
  if (!row || !spec || row.series !== spec.series) return false;
  if (kind === 'rect') return row.d === spec.d && row.s === spec.s && row.L === spec.L;
  return row.dn === spec.dn && row.L === spec.L && row.insulation === spec.insulation && (spec.core == null || row.core === spec.core);
}

/** The data row for a selection, or null. Round: core empty → the first row of the size. */
export function lookupRow(kind, spec) {
  const rows = kind === 'rect' ? SPLITTER_ROWS : kind === 'round' ? ROUND_ROWS : [];
  return rows.find((r) => rowMatches(r, kind, spec)) ?? null;
}

// Choices for the selection: only combinations that exist in the data. Each level is filtered by the levels
// before it (rect: series → d → s → L; round: series → dn → insulation → core → L).

const uniqueSorted = (xs) => [...new Set(xs)].sort((a, b) => a - b);
const nearest = (list, v) => (list.includes(v) ? v : list.reduce((best, x) => (best == null || Math.abs(x - v) < Math.abs(best - v) ? x : best), null));

export const RECT_KEYS = ['d', 's', 'L'];
export const ROUND_KEYS = ['dn', 'insulation', 'core', 'L'];

function choicesOf(rows, keys, spec) {
  const out = {};
  let pool = rows.filter((r) => r.series === spec.series);
  for (const k of keys) {
    out[k] = uniqueSorted(pool.map((r) => r[k]).filter((v) => v != null));
    pool = pool.filter((r) => r[k] === spec[k]);
  }
  return out;
}

function snapOf(rows, keys, spec, seriesIds) {
  const out = { ...spec, series: seriesIds.includes(spec.series) ? spec.series : seriesIds[0] };
  let pool = rows.filter((r) => r.series === out.series);
  for (const k of keys) {
    const values = uniqueSorted(pool.map((r) => r[k]).filter((v) => v != null));
    out[k] = values.length ? nearest(values, out[k] ?? values[0]) : null;
    pool = pool.filter((r) => r[k] === out[k]);
  }
  return out;
}

/** Values of d, s, L that exist for the selection (rectangular splitter silencers). */
export const rectChoices = (spec) => choicesOf(SPLITTER_ROWS, RECT_KEYS, spec);
/** Values of dn, insulation, core, L that exist for the selection (round silencers). */
export const roundChoices = (spec) => choicesOf(ROUND_ROWS, ROUND_KEYS, spec);
/** The selection moved to the nearest existing row (level by level). Other keys (B, H) stay. */
export const snapRect = (spec) => snapOf(SPLITTER_ROWS, RECT_KEYS, spec, SPLITTER_SERIES.map((s) => s.id));
export const snapRound = (spec) => snapOf(ROUND_ROWS, ROUND_KEYS, spec, ROUND_SERIES.map((s) => s.id));

const n0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const numbers = (arr) => (Array.isArray(arr) ? arr.map((v) => n0(v)) : []);
const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));

/**
 * Copy of a data row as stored in the silencer row (the file stays reproducible when the data changes).
 * Also the normaliser of stored rows: same keys in the same order, idempotent.
 */
export function rowCopy(row, kind, dataVersion = row?.dataVersion ?? DATA_VERSION) {
  if (!row || typeof row !== 'object') return null;
  const de = Array.from({ length: BANDS }, (_, i) => n0(row.de?.[i]) ?? 0);
  const str = (v) => (v == null ? '' : String(v));
  if (kind === 'rect') {
    return {
      series: str(row.series),
      d: n0(row.d),
      s: n0(row.s),
      L: n0(row.L),
      de,
      dp: { v: numbers(row.dp?.v), pa: numbers(row.dp?.pa) },
      flags: row.flags && typeof row.flags === 'object' ? clone(row.flags) : null,
      note: str(row.note),
      dataVersion: str(dataVersion),
    };
  }
  const series = ROUND_SERIES_BY_ID.get(row.series);
  const dpModel = str(row.dpModel || series?.dpModel || 'duct');
  let dp = null;
  if (dpModel === 'flow-points' && row.dp) dp = { q: numbers(row.dp.q), pa: numbers(row.dp.pa) };
  if (dpModel === 'velocity-table' && row.dp) dp = { v: numbers(row.dp.v), pa: numbers(row.dp.pa) };
  return {
    series: str(row.series),
    dn: n0(row.dn),
    dIn: n0(row.dIn),
    L: n0(row.L),
    insulation: n0(row.insulation),
    core: n0(row.core),
    dOuter: n0(row.dOuter),
    de,
    dpModel,
    dp,
    dpFromDn: n0(row.dpFromDn),
    note: str(row.note),
    dataVersion: str(dataVersion),
  };
}

/** The data row a database silencer uses: its stored copy if it fits the selection, else the current data. */
export function rowOf(sd) {
  if (sd.kind !== 'rect' && sd.kind !== 'round') return null;
  const spec = sd[sd.kind];
  if (rowMatches(sd.row, sd.kind, spec)) return sd.row;
  return rowCopy(lookupRow(sd.kind, spec), sd.kind, DATA_VERSION);
}

/** Database silencers whose stored row differs from the current data (or is no longer in it): [{ pathId, rowId, missing }]. */
export function staleRows(inputs) {
  const out = [];
  const strip = (r) => JSON.stringify({ ...r, dataVersion: '' });
  for (const path of inputs.paths) {
    for (const row of path.rows) {
      if (row.type !== 'silencer' || !row.row || (row.kind !== 'rect' && row.kind !== 'round')) continue;
      const current = lookupRow(row.kind, row.row);
      if (!current) out.push({ pathId: path.id, rowId: row.id, missing: true });
      else if (strip(rowCopy(current, row.kind)) !== strip(row.row)) out.push({ pathId: path.id, rowId: row.id, missing: false });
    }
  }
  return out;
}

// ---- silencers ---------------------------------------------------------------------------

/** Gap deviation a variant may have: |s′ − s| ≤ this share of s. */
export const GAP_TOLERANCE = 0.2;

/**
 * Number of splitters in a housing of width B: n = round(B / (d + s)), at least 1; 0 if B ≤ d.
 * The splitters sit evenly: gap s′ = B / n − d, half a gap at each wall, so n·(d + s′) = B.
 */
export function splitterCount(B, d, s) {
  if (!(B > d)) return 0;
  return Math.max(1, Math.round(B / (d + s)));
}

/**
 * Rectangular splitter silencer in a housing B × H (inner size, given by the user), splitters evenly spaced:
 * n = splitterCount, gap s′ = B / n − d. D_e is the value of the data row (gap s); s′ ≠ s is reported.
 * A_free = n·s′·H, v = V̇ / A_free, Δp = ζ(v)·ρ/2·v² × installation factor, flow noise from the Trox table
 * with the face area B·H. Without flow: geometry and D_e only.
 */
export function splitterSilencer({ row, B, H, flow, density, install = 'duct' }) {
  const n = splitterCount(B, row.d, row.s);
  const gap = n > 0 ? B / n - row.d : null;
  const out = {
    de: row.de.slice(),
    B,
    H,
    n,
    gap,
    aFree: n > 0 && H > 0 ? (n * gap * H) / 1e6 : 0,
    face: B > 0 && H > 0 ? (B * H) / 1e6 : 0,
    v: null,
    zeta: null,
    dp: null,
    lwFlow: null,
    lwaFlow: null,
  };
  if (!(flow > 0) || !(out.aFree > 0)) return out;
  out.v = flow / 3600 / out.aFree;
  out.installFactor = INSTALL_FACTORS[install] ?? 1;
  out.zeta = zetaFromVelocityTable(row.dp, out.v);
  out.dp = out.zeta * (density / 2) * out.v * out.v * out.installFactor;
  const noise = flowNoise(out.v, out.face);
  out.lwFlow = noise.lw;
  out.lwaFlow = noise.lwa;
  return out;
}

/**
 * Round duct silencer. A_duct = π/4·dn²; free cross-section π/4·d0² − T·d0 with d0 = dIn (or dn) and T the core
 * width (the core spans the full diameter). Δp per dpModel; flow noise only with a core (v in the free
 * cross-section, A = A_duct). v = velocity in the free cross-section.
 */
export function roundSilencer({ row, flow, density }) {
  const area = circle(row.dn);
  const d0 = row.dIn ?? row.dn;
  const aFree = circle(d0) - ((row.core ?? 0) * d0) / 1e6;
  const out = { de: row.de.slice(), area, aFree, v: null, vDuct: null, zeta: null, lambda: null, dp: null, lwFlow: null, lwaFlow: null };
  if (!(flow > 0) || !(aFree > 0)) return out;
  out.vDuct = flow / 3600 / area;
  out.v = flow / 3600 / aFree;
  if (row.dpModel === 'duct') {
    const r = ductLoss({ v: out.vDuct, dMm: row.dn, lengthMm: row.L, density });
    out.lambda = r.lambda;
    out.dp = r.dp;
  } else if (row.dpModel === 'flow-points' && row.dp) {
    out.zeta = zetaFromFlowPoints(row.dp, area);
    out.dp = out.zeta * (density / 2) * out.vDuct * out.vDuct;
  } else if (row.dpModel === 'velocity-table' && row.dp) {
    out.zeta = zetaFromVelocityTable(row.dp, out.v);
    out.dp = out.zeta * (density / 2) * out.v * out.v;
  }
  if (row.core > 0) {
    const noise = flowNoise(out.v, area);
    out.lwFlow = noise.lw;
    out.lwaFlow = noise.lwa;
  }
  return out;
}

/** Silencer row: D_e, Δp, flow noise (dB and dB(A) per octave) and warnings. `levelIn` is the level before it [dB(A)]. */
function silencerResult(sd, flow, density, levelIn, issue) {
  const r = { kind: sd.kind, de: null, lwFlow: null, lwFlowA: null, lwaFlow: null, v: null, dp: null };
  if (sd.kind === 'manual') {
    r.de = losses(sd.manual.de);
    r.dp = sd.manual.dp;
    if (hasValue(sd.manual.lwFlow)) {
      r.lwFlowA = toA(levels(sd.manual.lwFlow), sd.manual.unit);
      r.lwaFlow = sumLevels(r.lwFlowA);
    }
    if (sd.manual.de.some((v) => v > LIMITS.insertionLossCap.value)) issue('warning', 'de-cap', { limit: LIMITS.insertionLossCap.value });
  } else {
    const row = rowOf(sd);
    if (!row) {
      issue('error', 'row-missing');
      r.de = losses(null);
      return r;
    }
    r.row = row;
    if (row.note) issue('warning', 'row-note', { note: row.note });
    if (sd.kind === 'rect') {
      const { B, H } = sd.rect;
      Object.assign(r, splitterSilencer({ row, B, H, flow, density, install: sd.install }));
      if (!(B > 0 && H > 0)) issue('error', 'geometry-missing');
      else if (r.n < 1) issue('error', 'housing-small', { value: B, limit: row.d });
      else if (Math.abs(r.gap - row.s) > 0.5) issue(Math.abs(r.gap - row.s) > GAP_TOLERANCE * row.s + EPS ? 'warning' : 'info', 'gap-deviation', { value: r.gap, limit: row.s });
      const series = seriesOf('rect', row.series);
      if (series?.maker === 'Trox') {
        const min = Math.max(LIMITS.troxGapMin.value, 0.25 * row.d);
        const max = LIMITS.troxGapMaxFactor.value * row.d;
        if (row.s < min - EPS || row.s > max + EPS) issue('warning', 'trox-gap', { value: row.s, min, max });
      }
      if (series?.dpValidHeight && H > 0 && H !== series.dpValidHeight) issue('info', 'height-dp', { value: H, limit: series.dpValidHeight });
    } else {
      Object.assign(r, roundSilencer({ row, flow, density }));
    }
    if (r.lwFlow) r.lwFlowA = toA(r.lwFlow, 'dB');
    if (!(flow > 0)) issue('warning', 'flow-missing');
  }
  if (r.v != null && r.v > LIMITS.vGapMax.value + EPS) issue('warning', 'velocity-high', { value: r.v, limit: LIMITS.vGapMax.value });
  if (r.dp != null && r.dp > LIMITS.dpPerSilencer.value + EPS) issue('warning', 'dp-high', { value: r.dp, limit: LIMITS.dpPerSilencer.value });
  // Net effect: the flow noise must stay clearly below the level the silencer lets through.
  const through = sumLevels(levelIn.map((l, i) => l - r.de[i]));
  r.noiseMargin = r.lwaFlow != null && Number.isFinite(through) ? through - r.lwaFlow : null;
  if (r.noiseMargin != null && r.noiseMargin < LIMITS.flowNoiseMargin.value - EPS) {
    issue('warning', 'flow-noise', { value: r.noiseMargin, limit: LIMITS.flowNoiseMargin.value });
  }
  return r;
}

/**
 * Receiver at the end of a path: L_p per octave [dB(A)], L_pA and the checks against the target. `governing` is
 * the check with the smallest margin; `level`, `target`, `margin` and `status` are taken from it.
 */
function receiverResult(rc, levelIn, issue, catalogs) {
  const r = { area: absorptionArea(rc), term: null, lp: null, lpa: null, checks: [], governing: null, level: null, target: null, margin: null, status: null };
  if (rc.basis === 'room') {
    const note = catalogs.roomTypes.find((t) => t.id === rc.room.type)?.note;
    if (note) issue('info', 'room-note', { note });
  }
  if (!(rc.r > 0 && rc.q > 0)) {
    issue('warning', 'receiver-incomplete');
    return r;
  }
  r.term = roomTerm({ r: rc.r, q: rc.q, area: r.area });
  r.lp = levelIn.map((l) => l + r.term);
  r.lpa = sumLevels(r.lp);
  for (const c of targetChecks(rc, r.lpa, catalogs)) {
    c.margin = c.limit - c.level;
    // Judged on the shown value (one decimal), so "35.0 dB(A)" never fails a target of 35.
    c.status = Math.round(c.level * 10) / 10 <= c.limit ? 'ok' : 'over';
    if (c.status === 'over') issue('error', 'target-exceeded', { value: c.level, limit: c.limit, period: c.period });
    r.checks.push(c);
    if (!r.governing || c.margin < r.governing.margin) r.governing = c;
  }
  if (r.governing) Object.assign(r, { level: r.governing.level, target: r.governing.limit, margin: r.governing.margin, status: r.governing.status });
  return r;
}

// ---- main calculation ------------------------------------------------------------------------

/**
 * Calculate one path: the rows in order, then the receiver.
 * Every row gives its lines as shown in the table and the PDF (one line per operation, like the Excel sheet):
 *   { rowId, kind, op ('+' | '−'), unit ('dB' | 'dBA' | null for differences), values, total (dB(A) or null), edit }
 *   kind: source | aweight | loss | branch | de | flow; `edit` names the input array of an editable line.
 * `level` is the spectrum after the last row [dB(A) per octave].
 */
export function computePath(path, { density = RHO_TABLE, catalogs }) {
  const issues = [];
  const rows = new Map();
  const lines = [];
  let level = silent();
  let flow = path.flow > 0 ? path.flow : null;

  for (const row of path.rows) {
    const r = { id: row.id, type: row.type, flow, levelIn: level, lwaIn: sumLevels(level), issues: [] };
    const issue = (severity, code, params = {}) => {
      const it = { pathId: path.id, rowId: row.id, severity, code, ...params };
      r.issues.push(it);
      issues.push(it);
    };
    const line = (kind, op, values, extra = {}) => lines.push({ rowId: row.id, kind, op, unit: null, values, total: null, edit: null, ...extra });
    const aweight = () => line('aweight', '+', A_WEIGHTING.slice(), { unit: 'dB' });

    switch (row.type) {
      case 'source': {
        if (!hasValue(row.lw)) issue('warning', 'lw-missing');
        const lwA = toA(levels(row.lw), row.unit);
        r.lwa = sumLevels(lwA);
        level = addSpectra(level, lwA);
        line('source', '+', row.lw.slice(), { unit: row.unit, total: r.lwa, edit: 'lw' });
        if (row.unit === 'dB') aweight();
        break;
      }
      case 'loss': {
        const d = losses(row.d);
        level = level.map((l, i) => l - d[i]);
        line('loss', '−', row.d.slice(), { edit: 'd' });
        break;
      }
      case 'branch': {
        // Sound power divides with the volume flow: ΔL = 10·lg(V̇ before / V̇ after), or a value typed in.
        r.flowAfter = row.flow > 0 ? row.flow : flow;
        if (Number.isFinite(row.dl)) r.dl = row.dl;
        else if (!(row.flow > 0) || !(flow > 0)) issue('warning', 'branch-flow-missing');
        else if (row.flow > flow * (1 + EPS)) issue('warning', 'branch-flow', { value: row.flow, limit: flow });
        else r.dl = 10 * LG(flow / row.flow);
        level = level.map((l) => l - (r.dl ?? 0));
        flow = r.flowAfter;
        line('branch', '−', new Array(BANDS).fill(r.dl ?? null));
        break;
      }
      case 'silencer': {
        Object.assign(r, silencerResult(row, flow, density, level, issue));
        level = addSpectra(level.map((l, i) => l - r.de[i]), r.lwFlowA ?? silent());
        const manual = row.kind === 'manual';
        line('de', '−', manual ? row.manual.de.slice() : r.de.slice(), { edit: manual ? 'manual.de' : null });
        if (manual) {
          line('flow', '+', row.manual.lwFlow.slice(), { unit: row.manual.unit, total: r.lwaFlow, edit: 'manual.lwFlow' });
          if (row.manual.unit === 'dB') aweight();
        } else if (row.kind === 'rect' || rowOf(row)?.core > 0) {
          // flow noise line also without a value yet (flow or housing missing), so the table keeps its lines
          line('flow', '+', r.lwFlowA ? r.lwFlowA.slice() : new Array(BANDS).fill(null), { unit: 'dBA', total: r.lwaFlow });
        }
        break;
      }
    }
    r.levelOut = level;
    r.lwaOut = sumLevels(level);
    rows.set(row.id, r);
  }

  const receiver = receiverResult(path.receiver, level, (severity, code, params = {}) => issues.push({ pathId: path.id, rowId: null, severity, code, ...params }), catalogs);
  return { id: path.id, rows, lines, level, lwa: sumLevels(level), flow, receiver, issues };
}

/** Worst of a list of path results: largest excess over the target, else the loudest receiver. */
function worstOf(results) {
  let worst = null;
  const key = (p) => (p.receiver.margin != null ? [1, -p.receiver.margin] : [0, p.receiver.lpa]);
  for (const p of results) {
    if (!Number.isFinite(p.receiver.lpa)) continue;
    if (!worst) {
      worst = p;
      continue;
    }
    const [a1, a2] = key(p);
    const [b1, b2] = key(worst);
    if (a1 > b1 || (a1 === b1 && a2 > b2)) worst = p;
  }
  return worst;
}

/** Calculate the whole file: every path on its own (no cross talk between paths). */
export function compute(inputs) {
  const paths = inputs.paths.map((p) => computePath(p, { density: inputs.density, catalogs: inputs.catalogs }));
  const worst = worstOf(paths);
  const rc = worst?.receiver;
  return {
    paths,
    issues: paths.flatMap((p) => p.issues),
    worst: worst
      ? { pathId: worst.id, lpa: rc.lpa, period: rc.governing?.period ?? null, level: rc.level, target: rc.target, margin: rc.margin, status: rc.status }
      : null,
  };
}

// ---- variants (silencer design) ----------------------------------------------------------------

/** Limits a variant must keep (planning values of docs/silencer-data.md). */
export const VARIANT_LIMITS = { vMax: LIMITS.vGapPlan.value, dpMax: LIMITS.dpPerSilencer.value };

/**
 * Variants for one database silencer, in the housing the user gave (rect: B × H) or for its size (round: dn).
 * Every variant is the silencer row put into the path in place of the current one; the rest stays as it is.
 *   rect:  one variant per splitter thickness d and gap s of the series that fits B: n from splitterCount, the
 *          real gap s′ within GAP_TOLERANCE of s
 *   round: one variant per insulation and core of the series at dn
 * Within a variant the length L is chosen: with a target the shortest L that meets it, else (or if no L meets
 * it) the L with the lowest L_pA. A variant fits when v ≤ v max, Δp ≤ Δp max, the flow noise keeps its margin
 * and the receiver meets its target.
 * Ranking: fitting variants first (Δp, then L), then the others (limits kept first, then the lowest L_pA).
 * Returns { kind, missing: null | 'geometry' | 'flow', list }.
 */
export function silencerVariants(inputs, pathId, rowId) {
  const path = inputs.paths.find((p) => p.id === pathId);
  const sd = path?.rows.find((r) => r.id === rowId);
  if (!sd || sd.type !== 'silencer' || (sd.kind !== 'rect' && sd.kind !== 'round')) return null;
  const kind = sd.kind;
  const spec0 = sd[kind];
  const ctx = { density: inputs.density, catalogs: inputs.catalogs };
  const flowAt = computePath(path, ctx).rows.get(rowId)?.flow;
  if (kind === 'rect' && !(spec0.B > 0 && spec0.H > 0)) return { kind, missing: 'geometry', list: [] };
  if (!(flowAt > 0)) return { kind, missing: 'flow', list: [] };

  const evaluate = (dataRow) => {
    const spec = kind === 'rect'
      ? { ...spec0, d: dataRow.d, s: dataRow.s, L: dataRow.L }
      : { ...spec0, dn: dataRow.dn, insulation: dataRow.insulation, core: dataRow.core, L: dataRow.L };
    const row = rowCopy(dataRow, kind, DATA_VERSION);
    const trial = { ...sd, [kind]: spec, row };
    const res = computePath({ ...path, rows: path.rows.map((r) => (r.id === rowId ? trial : r)) }, ctx);
    const r = res.rows.get(rowId);
    const rc = res.receiver;
    const limitsOk = (kind === 'round' || r.n >= 1) && r.v != null && r.v <= VARIANT_LIMITS.vMax + EPS && r.dp != null && r.dp <= VARIANT_LIMITS.dpMax + EPS
      && (r.noiseMargin == null || r.noiseMargin >= LIMITS.flowNoiseMargin.value - EPS);
    return {
      spec,
      n: r.n ?? null,
      gap: r.gap ?? null,
      v: r.v,
      dp: r.dp,
      lwaFlow: r.lwaFlow,
      lpa: rc.lpa,
      margin: rc.margin,
      limitsOk,
      ok: limitsOk && (rc.status == null || rc.status === 'ok'),
      hasTarget: rc.status != null,
    };
  };

  const pool = kind === 'rect'
    ? fittingSplitterRows(spec0.series, spec0.B)
    : ROUND_ROWS.filter((r) => r.series === spec0.series && r.dn === spec0.dn);
  const groups = new Map();
  for (const r of pool) {
    const key = kind === 'rect' ? `${r.d}/${r.s}` : `${r.insulation}/${r.core ?? ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const lower = (a, b) => (Number.isFinite(a.lpa) ? a.lpa : Infinity) < (Number.isFinite(b.lpa) ? b.lpa : Infinity);
  const list = [];
  for (const rows of groups.values()) {
    const cands = rows.slice().sort((a, b) => a.L - b.L).map(evaluate);
    const fit = cands.find((c) => c.ok && c.hasTarget);
    if (fit) {
      list.push(fit);
      continue;
    }
    let best = null;
    for (const c of cands) if (!best || (c.limitsOk && !best.limitsOk) || (c.limitsOk === best.limitsOk && lower(c, best))) best = c;
    list.push(best);
  }
  list.sort((a, b) => {
    if (a.ok !== b.ok) return a.ok ? -1 : 1;
    if (a.ok) return a.dp - b.dp || a.spec.L - b.spec.L;
    if (a.limitsOk !== b.limitsOk) return a.limitsOk ? -1 : 1;
    return (a.lpa ?? Infinity) - (b.lpa ?? Infinity);
  });
  return { kind, missing: null, list };
}

/**
 * Data rows of a series that fit a housing width B: the real gap s′ within GAP_TOLERANCE of s. Two gaps s of the
 * same d that give the same n (the same silencer) keep only the s closest to s′.
 */
export function fittingSplitterRows(series, B) {
  const best = new Map();
  for (const r of SPLITTER_ROWS) {
    if (r.series !== series) continue;
    const n = splitterCount(B, r.d, r.s);
    const dev = n > 0 ? Math.abs(B / n - r.d - r.s) : Infinity;
    if (dev > GAP_TOLERANCE * r.s + EPS) continue;
    const key = `${r.d}/${n}`;
    const cur = best.get(key);
    if (!cur || dev < cur.dev - EPS) best.set(key, { s: r.s, dev });
  }
  return SPLITTER_ROWS.filter((r) => r.series === series && best.get(`${r.d}/${splitterCount(B, r.d, r.s)}`)?.s === r.s);
}

/** Key results stored in the envelope for regression checks (never used as input). */
export function snapshotOf(result) {
  const round = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
  const paths = {};
  for (const p of result.paths) paths[p.id] = { lwa: round(p.lwa), lpa: round(p.receiver.lpa) };
  return {
    worst: result.worst ? { pathId: result.worst.pathId, lpa: round(result.worst.lpa) } : null,
    paths,
  };
}
