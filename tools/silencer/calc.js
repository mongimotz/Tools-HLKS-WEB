// Silencer calculation: sound power per octave band along each strand, from the sources to the receivers,
// with insertion loss, pressure loss and flow noise of the silencers. Pure functions, no DOM: runs in the
// browser and in Node tests. Method: docs/silencer-method.md, data: docs/silencer-data.md.
//
// Units: lengths in mm (inputs) and m (calculation), flow in m³/h, velocity in m/s, pressure in Pa,
// levels in dB / dB(A). Spectra are arrays of 8 values for OCTAVES; "no sound" is -Infinity.

export const CALC_VERSION = '1.0.0';

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

export { OCTAVES, A_WEIGHTING, DATA_VERSION };

/** The manufacturer tables refer to standard air; ζ is derived with this density. */
export const RHO_TABLE = 1.2;
/** Basis of the straight-duct Δp model: galvanised duct [mm], air at 20 °C. */
export const DUCT_ROUGHNESS = 0.15;
export const DUCT_TEMPERATURE = 20;

const BANDS = OCTAVES.length;
const LG = Math.log10;

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

/** A-weighted total of a spectrum [dB(A)]. */
export function aWeighted(spectrum) {
  return sumLevels(spectrum.map((l, i) => l + A_WEIGHTING[i]));
}

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
 * 4 … 20 m/s) + 10·lg A, octaves from the relative spectrum. v ≤ 0 → null.
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
export function targetChecks(el, lpa, catalogs) {
  if (!Number.isFinite(lpa)) return [];
  if (el.basis === 'manual') return el.target != null ? [{ period: null, level: lpa, limit: el.target }] : [];
  if (el.basis === 'room') {
    const room = catalogs.roomTypes.find((t) => t.id === el.room.type);
    const sens = room && catalogs.sensitivities.find((s) => s.id === room.sensitivity);
    if (!sens) return [];
    const req = el.room.requirement;
    const limit = req === 'raised' ? sens.raised : req === 'design' ? room.design ?? sens.min : sens.min;
    return limit != null ? [{ period: null, level: lpa, limit }] : [];
  }
  const row = catalogs.lsv.find((r) => r.es === el.lsv.es);
  if (!row) return [];
  const bonus = el.lsv.business && el.lsv.es <= 3 ? LSV_BUSINESS_BONUS : 0;
  const out = [];
  for (const period of ['day', 'night']) {
    const hours = el.lsv[period === 'day' ? 'hoursDay' : 'hoursNight'] ?? LSV_PERIOD_HOURS;
    const base = row[`${el.lsv.limit === 'immission' ? 'immission' : 'planning'}${period === 'day' ? 'Day' : 'Night'}`];
    if (!(hours > 0) || base == null) continue;
    const level = lpa + LSV_K1[period] + el.lsv.k2 + el.lsv.k3 + 10 * LG(Math.min(hours, LSV_PERIOD_HOURS) / LSV_PERIOD_HOURS);
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

// Choices for the selects: only combinations that exist in the data. Each level is filtered by the levels
// before it (rect: series → d → s → L; round: series → dn → L → insulation → core).

const uniqueSorted = (xs) => [...new Set(xs)].sort((a, b) => a - b);
const nearest = (list, v) => (list.includes(v) ? v : list.reduce((best, x) => (best == null || Math.abs(x - v) < Math.abs(best - v) ? x : best), null));

export const RECT_KEYS = ['d', 's', 'L'];
export const ROUND_KEYS = ['dn', 'L', 'insulation', 'core'];

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
/** Values of dn, L, insulation, core that exist for the selection (round silencers). */
export const roundChoices = (spec) => choicesOf(ROUND_ROWS, ROUND_KEYS, spec);
/** The selection moved to the nearest existing row (level by level). Other keys (n, H, B) stay. */
export const snapRect = (spec) => snapOf(SPLITTER_ROWS, RECT_KEYS, spec, SPLITTER_SERIES.map((s) => s.id));
export const snapRound = (spec) => snapOf(ROUND_ROWS, ROUND_KEYS, spec, ROUND_SERIES.map((s) => s.id));
export { SPLITTER_SERIES, ROUND_SERIES };

const n0 = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const numbers = (arr) => (Array.isArray(arr) ? arr.map((v) => n0(v)) : []);
const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));

/**
 * Copy of a data row as stored in the element (the file stays reproducible when the data changes).
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

/** The row a database silencer uses: its stored copy if it fits the selection, else the current data. */
export function rowOf(el) {
  if (el.kind !== 'rect' && el.kind !== 'round') return null;
  const spec = el[el.kind];
  if (rowMatches(el.row, el.kind, spec)) return el.row;
  return rowCopy(lookupRow(el.kind, spec), el.kind, DATA_VERSION);
}

/**
 * Database silencers whose stored row differs from the current data (or is no longer in it).
 * For the hint after import: [{ strandId, elementId, missing }].
 */
export function staleRows(inputs) {
  const out = [];
  const strip = (r) => JSON.stringify({ ...r, dataVersion: '' });
  for (const strand of inputs.strands) {
    for (const el of strand.elements) {
      if (el.type !== 'silencer' || !el.row || (el.kind !== 'rect' && el.kind !== 'round')) continue;
      const current = lookupRow(el.kind, el.row);
      if (!current) out.push({ strandId: strand.id, elementId: el.id, missing: true });
      else if (strip(rowCopy(current, el.kind)) !== strip(el.row)) out.push({ strandId: strand.id, elementId: el.id, missing: false });
    }
  }
  return out;
}

// ---- silencers ---------------------------------------------------------------------------

/**
 * Rectangular splitter silencer. B = n·(d + s), A_free = n·s·H, v_s = V̇ / A_free,
 * Δp = ζ(v_s)·ρ/2·v_s² × installation factor, flow noise from the Trox table with A = B·H.
 * Without flow: geometry and D_e only.
 */
export function splitterSilencer({ row, n, H, flow, density, install = 'duct' }) {
  const B = n * (row.d + row.s);
  const out = { de: row.de.slice(), B, H, n, aFree: (n * row.s * H) / 1e6, face: (B * H) / 1e6, v: null, zeta: null, dp: null, lwFlow: null, lwaFlow: null };
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

// ---- tree ------------------------------------------------------------------------------------

/**
 * Resolve the tree of a strand: predecessor (`after`) of each element, successors, DFS order, depth.
 * Unknown predecessors and cycles are cut and reported.
 */
export function resolveTree(elements) {
  const byId = new Map(elements.map((e) => [e.id, e]));
  const parent = new Map();
  const issues = [];
  for (const e of elements) {
    let p = e.after ?? null;
    if (p !== null && (!byId.has(p) || p === e.id)) {
      issues.push({ elementId: e.id, severity: 'error', code: 'after-missing' });
      p = null;
    }
    parent.set(e.id, p);
  }
  for (const e of elements) {
    const seen = new Set([e.id]);
    let cur = parent.get(e.id);
    while (cur !== null) {
      if (seen.has(cur)) {
        issues.push({ elementId: e.id, severity: 'error', code: 'cycle' });
        parent.set(e.id, null);
        break;
      }
      seen.add(cur);
      cur = parent.get(cur);
    }
  }
  const children = new Map(elements.map((e) => [e.id, []]));
  for (const e of elements) {
    const p = parent.get(e.id);
    if (p !== null) children.get(p).push(e.id);
  }
  const order = [];
  const depth = new Map();
  const visit = (id, d) => {
    order.push(id);
    depth.set(id, d);
    for (const c of children.get(id)) visit(c, d + 1);
  };
  for (const e of elements) if (parent.get(e.id) === null) visit(e.id, 0);
  return { parent, children, order, depth, issues };
}

/** Ids of all elements after `id` (to prevent cycles when choosing a predecessor). */
export function descendantsOf(elements, id) {
  const { children } = resolveTree(elements);
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

// ---- main calculation ------------------------------------------------------------------------

/** Silencer element: D_e, Δp, flow noise and warnings. `lwIn` is the spectrum before the silencer. */
function silencerResult(el, flow, density, lwIn, issue) {
  const r = { kind: el.kind, de: null, lwFlow: null, lwaFlow: null, v: null, dp: null };
  if (el.kind === 'manual') {
    r.de = losses(el.manual.de);
    r.dp = el.manual.dp;
    if (hasValue(el.manual.lwFlow)) {
      r.lwFlow = levels(el.manual.lwFlow);
      r.lwaFlow = aWeighted(r.lwFlow);
    }
    if (el.manual.de.some((v) => v > LIMITS.insertionLossCap.value)) issue('warning', 'de-cap', { limit: LIMITS.insertionLossCap.value });
  } else {
    const row = rowOf(el);
    if (!row) {
      issue('error', 'row-missing');
      r.de = losses(null);
      return r;
    }
    r.row = row;
    if (row.note) issue('warning', 'row-note', { note: row.note });
    if (el.kind === 'rect') {
      const { n, H } = el.rect;
      if (!(n > 0 && H > 0)) {
        issue('error', 'geometry-missing');
        r.de = row.de.slice();
        return r;
      }
      Object.assign(r, splitterSilencer({ row, n, H, flow, density, install: el.install }));
      const series = seriesOf('rect', row.series);
      if (el.rect.B != null && Math.abs(el.rect.B - r.B) > 0.5) issue('warning', 'edge-gap', { value: el.rect.B, limit: r.B });
      if (series?.maker === 'Trox') {
        const min = Math.max(LIMITS.troxGapMin.value, 0.25 * row.d);
        const max = LIMITS.troxGapMaxFactor.value * row.d;
        if (row.s < min - 1e-9 || row.s > max + 1e-9) issue('warning', 'trox-gap', { value: row.s, min, max });
      }
      if (series?.dpValidHeight && H !== series.dpValidHeight) issue('info', 'height-dp', { value: H, limit: series.dpValidHeight });
    } else {
      Object.assign(r, roundSilencer({ row, flow, density }));
    }
    if (!(flow > 0)) issue('warning', 'flow-missing');
  }
  if (r.v != null && r.v > LIMITS.vGapMax.value + 1e-9) issue('warning', 'velocity-high', { value: r.v, limit: LIMITS.vGapMax.value });
  if (r.dp != null && r.dp > LIMITS.dpPerSilencer.value + 1e-9) issue('warning', 'dp-high', { value: r.dp, limit: LIMITS.dpPerSilencer.value });
  // Net effect: the flow noise must stay clearly below the level the silencer lets through.
  const lwaThrough = aWeighted(lwIn.map((l, i) => l - r.de[i]));
  if (r.lwaFlow != null && Number.isFinite(lwaThrough) && lwaThrough - r.lwaFlow < LIMITS.flowNoiseMargin.value - 1e-9) {
    issue('warning', 'flow-noise', { value: lwaThrough - r.lwaFlow, limit: LIMITS.flowNoiseMargin.value });
  }
  return r;
}

/**
 * Receiver element: L_p per octave, L_pA and the checks against the target. `governing` is the check with the
 * smallest margin; `level`, `target`, `margin` and `status` are taken from it.
 */
function receiverResult(el, lwIn, issue, catalogs) {
  const r = { area: absorptionArea(el), term: null, lp: null, lpa: null, checks: [], governing: null, level: null, target: null, margin: null, status: null };
  if (!(el.r > 0 && el.q > 0)) {
    issue('warning', 'receiver-incomplete');
    return r;
  }
  if (el.basis === 'room') {
    const note = catalogs.roomTypes.find((t) => t.id === el.room.type)?.note;
    if (note) issue('info', 'room-note', { note });
  }
  r.term = roomTerm({ r: el.r, q: el.q, area: r.area });
  r.lp = lwIn.map((l) => l + r.term);
  r.lpa = aWeighted(r.lp);
  for (const c of targetChecks(el, r.lpa, catalogs)) {
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

/** Worst receiver of a list of receiver results: largest excess over the target, else the loudest. */
function worstOf(receivers) {
  let worst = null;
  const key = (r) => (r.margin != null ? [1, -r.margin] : [0, r.lpa]);
  for (const r of receivers) {
    if (!Number.isFinite(r.lpa)) continue;
    if (!worst) {
      worst = r;
      continue;
    }
    const [a1, a2] = key(r);
    const [b1, b2] = key(worst);
    if (a1 > b1 || (a1 === b1 && a2 > b2)) worst = r;
  }
  return worst;
}

/** Calculate one strand. `catalogs` holds the target tables (defaults.js). */
export function computeStrand(strand, { density = RHO_TABLE, catalogs }) {
  const tree = resolveTree(strand.elements);
  const byId = new Map(strand.elements.map((e) => [e.id, e]));
  const issues = tree.issues.map((it) => ({ strandId: strand.id, ...it }));
  const results = new Map();

  for (const id of tree.order) {
    const el = byId.get(id);
    const parentId = tree.parent.get(id);
    const p = parentId ? results.get(parentId) : null;
    const r = {
      id,
      type: el.type,
      parent: parentId,
      children: tree.children.get(id),
      depth: tree.depth.get(id),
      flow: el.flow > 0 ? el.flow : p ? p.flow : strand.flow > 0 ? strand.flow : null,
      split: 0,
      issues: [],
    };
    const issue = (severity, code, params = {}) => {
      const it = { strandId: strand.id, elementId: id, severity, code, ...params };
      r.issues.push(it);
      issues.push(it);
    };

    // Branch split: sound power divides with the volume flow (or a manual value in dB).
    if (p) {
      if (Number.isFinite(el.split)) r.split = el.split;
      else if (r.flow > 0 && p.flow > 0 && r.flow < p.flow) r.split = 10 * LG(r.flow / p.flow);
    }
    r.lwIn = p ? p.lwOut.map((l) => l + r.split) : silent();

    if (!p && el.type !== 'source') issue('error', 'root-not-source');
    switch (el.type) {
      case 'source':
        if (!hasValue(el.lw)) issue('warning', 'lw-missing');
        r.lwOut = p ? addSpectra(r.lwIn, levels(el.lw)) : levels(el.lw);
        break;
      case 'component': {
        const d = losses(el.d);
        r.lwOut = addSpectra(r.lwIn.map((l, i) => l - d[i]), levels(el.lw));
        break;
      }
      case 'silencer': {
        Object.assign(r, silencerResult(el, r.flow, density, r.lwIn, issue));
        r.lwOut = addSpectra(r.lwIn.map((l, i) => l - r.de[i]), r.lwFlow ?? silent());
        break;
      }
      case 'receiver':
        r.lwOut = r.lwIn.slice();
        Object.assign(r, receiverResult(el, r.lwIn, issue, catalogs));
        break;
      default:
        r.lwOut = r.lwIn.slice();
    }
    r.lwaIn = aWeighted(r.lwIn);
    r.lwaOut = aWeighted(r.lwOut);
    results.set(id, r);
  }

  // Flows of the successors: own flows must not add up to more than the predecessor carries;
  // at a branch point every successor needs its own flow (or a manual split), else nothing is split.
  for (const r of results.values()) {
    const own = r.children.map((c) => byId.get(c)).filter((e) => e.flow > 0);
    const sum = own.reduce((acc, e) => acc + e.flow, 0);
    if (own.length && r.flow > 0 && sum > r.flow * 1.005) {
      const it = { strandId: strand.id, elementId: r.id, severity: 'warning', code: 'flow-continuity', value: sum, limit: r.flow };
      r.issues.push(it);
      issues.push(it);
    }
    if (r.children.length < 2) continue;
    for (const c of r.children) {
      const e = byId.get(c);
      if (e.flow > 0 || Number.isFinite(e.split)) continue;
      const it = { strandId: strand.id, elementId: c, severity: 'info', code: 'split-missing' };
      results.get(c).issues.push(it);
      issues.push(it);
    }
  }

  const receivers = tree.order.map((id) => results.get(id)).filter((r) => r.type === 'receiver');
  const worst = worstOf(receivers);
  return { id: strand.id, elements: results, order: tree.order, receivers: receivers.map((r) => r.id), worstId: worst?.id ?? null, issues };
}

/** Calculate the whole file: every strand on its own (no cross talk between strands). */
export function compute(inputs) {
  const strands = inputs.strands.map((s) => computeStrand(s, { density: inputs.density, catalogs: inputs.catalogs }));
  const all = strands.flatMap((s) => s.receivers.map((id) => ({ strandId: s.id, ...s.elements.get(id) })));
  const worst = worstOf(all);
  return {
    strands,
    issues: strands.flatMap((s) => s.issues),
    worst: worst
      ? { strandId: worst.strandId, elementId: worst.id, lpa: worst.lpa, period: worst.governing?.period ?? null, level: worst.level, target: worst.target, margin: worst.margin, status: worst.status }
      : null,
  };
}

// ---- proposal (mode "Vorschlag") ----------------------------------------------------------------

/** Search limits used when the element sets none. */
export const PROPOSE_DEFAULTS = { vMax: LIMITS.vGapPlan.value, dpMax: LIMITS.dpPerSilencer.value };
/** Without B max, n grows from the smallest n with v ≤ v max by at most this many splitters. */
const N_SEARCH = 30;

/**
 * Candidates for one silencer element: every data row of the kind (rect: with the number of splitters n, see
 * below) is put into the strand in place of the element; the rest of the strand stays as it is.
 * A candidate fits when v ≤ v max, Δp ≤ Δp max, the flow noise keeps its margin and every receiver after the
 * element meets its target.
 *   rect with B max:    n = the largest n with n·(d + s) ≤ B max (lowest v, Δp and flow noise of the row)
 *   rect without B max: n = the smallest n that fits (the most compact silencer of the row)
 * One candidate per data row. Ranking: Δp, then L. If nothing fits, `closest` is the candidate that misses least
 * (limits kept first, then the largest receiver margin).
 */
export function proposeSilencer(inputs, strandId, elementId) {
  const strand = inputs.strands.find((s) => s.id === strandId);
  const el = strand?.elements.find((e) => e.id === elementId);
  if (!el || el.type !== 'silencer') return null;
  const p = el.propose ?? {};
  const kind = el.kind === 'round' ? 'round' : 'rect';
  const vMax = p.vMax ?? PROPOSE_DEFAULTS.vMax;
  const dpMax = p.dpMax ?? PROPOSE_DEFAULTS.dpMax;
  const tree = resolveTree(strand.elements);
  const receivers = [];
  const stack = [...(tree.children.get(elementId) ?? [])];
  while (stack.length) {
    const id = stack.pop();
    if (strand.elements.find((e) => e.id === id)?.type === 'receiver') receivers.push(id);
    stack.push(...tree.children.get(id));
  }

  const evaluate = (spec, row) => {
    const trial = { ...el, kind, [kind]: spec, row, propose: null };
    const res = computeStrand({ ...strand, elements: strand.elements.map((e) => (e.id === el.id ? trial : e)) }, { density: inputs.density, catalogs: inputs.catalogs });
    const r = res.elements.get(el.id);
    const margins = receivers.map((id) => res.elements.get(id)).filter((x) => x.margin != null);
    const lwaThrough = aWeighted(r.lwIn.map((l, i) => l - r.de[i]));
    const noiseMargin = r.lwaFlow != null && Number.isFinite(lwaThrough) ? lwaThrough - r.lwaFlow : null;
    const limitsOk = r.v != null && r.v <= vMax + 1e-9 && r.dp != null && r.dp <= dpMax + 1e-9 && (noiseMargin == null || noiseMargin >= LIMITS.flowNoiseMargin.value - 1e-9);
    const targetsOk = margins.every((x) => x.status === 'ok');
    return {
      kind,
      spec,
      row,
      de: r.de,
      v: r.v,
      dp: r.dp,
      lwaFlow: r.lwaFlow,
      B: r.B ?? null,
      noiseMargin,
      margin: margins.length ? Math.min(...margins.map((x) => x.margin)) : null,
      limitsOk,
      ok: limitsOk && targetsOk,
    };
  };

  const all = [];
  if (kind === 'rect') {
    const H = p.H ?? el.rect.H;
    if (!(H > 0) || !(strandFlowAt(strand, tree, elementId) > 0)) return { kind, tried: 0, all: [], fitting: [], closest: null, receivers: receivers.length };
    const flow = strandFlowAt(strand, tree, elementId);
    for (const r of SPLITTER_ROWS) {
      if ((p.series && r.series !== p.series) || (p.lMax != null && r.L > p.lMax)) continue;
      const row = rowCopy(r, 'rect', DATA_VERSION);
      const nMin = Math.max(1, Math.ceil(flow / 3600 / (vMax * (r.s / 1000) * (H / 1000)) - 1e-9));
      const spec = (n) => ({ series: r.series, d: r.d, s: r.s, L: r.L, n, H, B: null });
      if (p.bMax != null) {
        const n = Math.floor(p.bMax / (r.d + r.s) + 1e-9);
        if (n >= 1) all.push(evaluate(spec(n), row));
        continue;
      }
      let first = null;
      for (let n = nMin; n <= nMin + N_SEARCH; n++) {
        const c = evaluate(spec(n), row);
        first ??= c;
        if (c.ok) {
          first = c;
          break;
        }
      }
      if (first) all.push(first);
    }
  } else {
    const dnMin = p.dnMin ?? p.dn ?? el.round.dn;
    const dnMax = p.dnMax ?? p.dn ?? el.round.dn;
    for (const r of ROUND_ROWS) {
      if (p.series && r.series !== p.series) continue;
      if (r.dn < dnMin || r.dn > dnMax || (p.lMax != null && r.L > p.lMax) || (p.dOuterMax != null && r.dOuter > p.dOuterMax)) continue;
      const row = rowCopy(r, 'round', DATA_VERSION);
      all.push(evaluate({ series: r.series, dn: r.dn, L: r.L, insulation: r.insulation, core: r.core }, row));
    }
  }
  const byDp = (a, b) => a.dp - b.dp || a.spec.L - b.spec.L;
  const fitting = all.filter((c) => c.ok).sort(byDp);
  let closest = null;
  if (!fitting.length) {
    for (const c of all) {
      if (!closest || (c.limitsOk && !closest.limitsOk) || (c.limitsOk === closest.limitsOk && (c.margin ?? -Infinity) > (closest.margin ?? -Infinity))) closest = c;
    }
  }
  return { kind, tried: all.length, all, fitting, closest, receivers: receivers.length };
}

/** Volume flow at an element (own, else inherited), without calculating the strand. */
function strandFlowAt(strand, tree, id) {
  for (let cur = id; cur; cur = tree.parent.get(cur)) {
    const e = strand.elements.find((x) => x.id === cur);
    if (e?.flow > 0) return e.flow;
  }
  return strand.flow > 0 ? strand.flow : null;
}

/** Element ids from the start of the strand to `id` (a strand result from computeStrand). */
export function pathTo(strandResult, id) {
  const path = [];
  for (let cur = id; cur; cur = strandResult.elements.get(cur)?.parent) path.unshift(cur);
  return path;
}

/** Key results stored in the envelope for regression checks (never used as input). */
export function snapshotOf(result) {
  const round = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
  const receivers = {};
  for (const s of result.strands) for (const id of s.receivers) receivers[id] = round(s.elements.get(id).lpa);
  return {
    worst: result.worst ? { strandId: result.worst.strandId, elementId: result.worst.elementId, lpa: round(result.worst.lpa) } : null,
    receivers,
  };
}
