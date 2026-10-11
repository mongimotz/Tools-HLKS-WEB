// Duct sizing after SIA 382/1:2025, 5.11.5.7 and 5.11.5.8 (tables 49 and 50). Pure functions, no DOM:
// runs in the browser and in Node tests.
//
// Units: duct sizes in mm, flow in m³/h, velocity in m/s, area in m², pressure gradient in Pa/m,
// full load hours in h/a.

import { airState, frictionFactor } from '../../lib/core/air.js';

export const CALC_VERSION = '1.0.0';

/** Hour columns of table 49 [h/a]. Below the first and above the last column the edge column applies. */
export const HOUR_COLUMNS = [2000, 4000, 8000];
const HOURS_PER_YEAR = 8760;

/** Above this aspect ratio SIA 382/1 does not recommend non-round ducts (grey area of table 50). */
export const RECOMMENDED_MAX_RATIO = 5;

/** Smallest side of a rectangular or oval duct [mm]. */
export const MIN_SIDE = 100;

const EPS = 1e-9;
const MAX_STEPS = 5000;

// ---- full load hours -------------------------------------------------------------

/**
 * Electrical full load hours from operating stages (SIA 382/1, 1.1.13.7 and G.3.1.5):
 * t_el = Σ (q_i / q_max)^n · t_i, rounded to 10 h. n = 2.5, or 1.5 with constant pressure parts (VAV boxes).
 * stages: [{ flow [% of the design flow], hours [h/a] }].
 */
export function stageHours(stages, exponent = 2.5) {
  let total = 0;
  let sum = 0;
  const parts = stages.map((s) => {
    const share = Math.max(0, s.flow ?? 0) / 100;
    const h = Math.max(0, s.hours ?? 0);
    const equivalent = Math.pow(share, exponent) * h;
    total += h;
    sum += equivalent;
    return { share, hours: h, equivalent };
  });
  return { hours: Math.round(sum / 10) * 10, total, parts };
}

// ---- table 49 and 50 -----------------------------------------------------------------

/** Row of table 49 for a flow: the first row with flow < below; the row with below = null takes all larger flows. */
export function limitRow(flow, table) {
  if (!(flow > 0) || !table?.length) return null;
  const rows = [...table].sort((a, b) => (a.below ?? Infinity) - (b.below ?? Infinity));
  return rows.find((r) => r.below == null || flow < r.below) ?? rows[rows.length - 1];
}

const lerp = (a, b, t) => a + (b - a) * t;

/** Maximum velocity in round ducts v_a,du,rd [m/s] (table 49), linear between the hour columns. Null if missing. */
export function roundVelocityLimit(flow, hours, table) {
  const row = limitRow(flow, table);
  if (!row) return null;
  const [c1, c2, c3] = HOUR_COLUMNS;
  const t = Math.min(Math.max(hours ?? c1, c1), c3);
  const v = t <= c2 ? lerp(row.v2000, row.v4000, (t - c1) / (c2 - c1)) : lerp(row.v4000, row.v8000, (t - c2) / (c3 - c2));
  return Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * Reduction factor f_va,du (table 50) for a non-round shape ('rect' | 'oval') and aspect ratio n ≥ 1,
 * linear between the rows. Outside the table the edge value applies; `clamped` then names that ratio.
 */
export function reductionFactor(shape, n, table) {
  const rows = table.filter((r) => r.ratio > 0 && Number.isFinite(r[shape])).sort((a, b) => a.ratio - b.ratio);
  if (!rows.length) return { factor: null, clamped: null };
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (n < first.ratio - EPS) return { factor: first[shape], clamped: first.ratio };
  if (n > last.ratio + EPS) return { factor: last[shape], clamped: last.ratio };
  for (let i = 1; i < rows.length; i++) {
    const lo = rows[i - 1];
    const hi = rows[i];
    if (n <= hi.ratio + EPS) return { factor: lerp(lo[shape], hi[shape], (n - lo.ratio) / (hi.ratio - lo.ratio)), clamped: null };
  }
  return { factor: first[shape], clamped: null };
}

// ---- geometry --------------------------------------------------------------------------

/**
 * Cross-section in mm: round { diameter }, rect and oval { width, height }.
 * Flat oval: two half circles of diameter H joined by straight sides; needs B ≥ H.
 * Returns area [m²], perimeter [m], hydraulic diameter [m] and aspect ratio n = long / short side.
 */
export function crossSection(shape, dims) {
  if (shape === 'round') {
    const d = dims.diameter / 1000;
    return { area: (Math.PI * d * d) / 4, perimeter: Math.PI * d, dh: d, ratio: 1 };
  }
  const b = dims.width / 1000;
  const h = dims.height / 1000;
  const ratio = Math.max(b, h) / Math.min(b, h);
  if (shape === 'oval') {
    const area = (Math.PI * h * h) / 4 + h * (b - h);
    const perimeter = Math.PI * h + 2 * (b - h);
    return { area, perimeter, dh: (4 * area) / perimeter, ratio };
  }
  return { area: b * h, perimeter: 2 * (b + h), dh: (2 * b * h) / (b + h), ratio };
}

const ceilTo = (v, step) => (step > 0 ? Math.ceil(v / step - EPS) * step : Math.ceil(v - EPS));

/** Smallest diameter of the series ≥ d; above the series: d rounded up to 50 mm (`over`). */
export function snapDiameter(d, series) {
  const hit = series.find((x) => x >= d - EPS);
  return hit != null ? { diameter: hit, over: false } : { diameter: ceilTo(d, 50), over: true };
}

/** Side of a rectangular or oval duct rounded up to the grid, at least MIN_SIDE. */
export function snapSide(mm, step) {
  return Math.max(MIN_SIDE, ceilTo(mm, step));
}

/** Height of a flat oval duct: smallest standard height ≥ h, above the list: rounded like a side. */
export function snapOvalHeight(h, heights, step) {
  return heights.find((x) => x >= h - EPS) ?? snapSide(h, step);
}

/** Rounded heights next to a required height h: the one above first, then the one below (if allowed). */
function heightCandidates(h, shape, ctx) {
  if (shape === 'oval') {
    const up = snapOvalHeight(h, ctx.catalogs.ovalHeights, ctx.step);
    const down = [...ctx.catalogs.ovalHeights].reverse().find((x) => x <= h + EPS);
    return down != null && down !== up ? [up, down] : [up];
  }
  const up = snapSide(h, ctx.step);
  const down = ctx.step > 0 ? Math.floor(h / ctx.step + EPS) * ctx.step : Math.floor(h + EPS);
  return down >= MIN_SIDE && down !== up ? [up, down] : [up];
}

// ---- sizing ------------------------------------------------------------------------------

/** Everything a position needs from the system, the catalogues and the settings. */
export function context(inputs) {
  const { system, catalogs, settings } = inputs;
  const simple = system.simple;
  const issues = [];
  // The stage estimate is always calculated; it counts as used once its value is taken over as the hours.
  const stages = stageHours(system.stages, system.exponent);
  stages.used = !simple && stages.total > 0 && stages.hours === system.hours;
  let hours = HOUR_COLUMNS[0];
  if (!simple) {
    hours = system.hours;
    if (!(hours > 0)) {
      issues.push({ positionId: null, severity: 'error', code: 'hours-missing', limit: HOUR_COLUMNS[0] });
      hours = HOUR_COLUMNS[0];
    } else if (hours > HOUR_COLUMNS[2]) {
      issues.push({ positionId: null, severity: 'info', code: 'hours-high', value: hours, limit: HOUR_COLUMNS[2] });
    }
    if (stages.used && stages.total > HOURS_PER_YEAR) {
      issues.push({ positionId: null, severity: 'warning', code: 'stages-long', value: stages.total, limit: HOURS_PER_YEAR });
    }
  }
  const air = airState({ temperature: settings.temperature, altitude: 0, humidity: 0 });
  return { simple, hours, stages, issues, catalogs, step: system.rectStep, roughness: settings.roughness, air };
}

/**
 * Size or check one position. Modes:
 * - size:   round: smallest series diameter with v ≤ v_max; non-round: sides close to the aspect ratio 1/n (B ≥ H)
 * - height: non-round, height H given: width B
 * - check:  sizes given: velocity against the limit
 * Calculated sides are rounded up to the grid and widened until v ≤ v_max holds with the final aspect ratio.
 */
export function sizePosition(p, ctx) {
  const r = { id: p.id, status: 'ok', shape: p.shape, mode: p.mode, issues: [] };
  const issue = (severity, code, params = {}) => r.issues.push({ positionId: p.id, severity, code, ...params });
  const fail = (severity, code, params) => {
    r.status = 'incomplete';
    issue(severity, code, params);
    return r;
  };

  if (!(p.flow > 0)) return fail('info', 'flow-missing');
  const vRound = roundVelocityLimit(p.flow, ctx.hours, ctx.catalogs.velocityLimits);
  if (!vRound) return fail('error', 'limit-missing');
  r.vmaxRound = vRound;
  const q = p.flow / 3600;
  const nonRound = p.shape !== 'round';

  /** Limit and factor for an aspect ratio. */
  const limit = (n) => {
    if (!nonRound || ctx.simple) return { vmax: vRound, factor: null, clamped: null };
    const f = reductionFactor(p.shape, n, ctx.catalogs.reductionFactors);
    return { vmax: vRound * (f.factor ?? 1), factor: f.factor, clamped: f.clamped };
  };
  const evaluate = (dims) => {
    const g = crossSection(p.shape, dims);
    return { ...g, ...limit(g.ratio), velocity: q / g.area };
  };
  const ok = (e) => e.velocity <= e.vmax + EPS;
  const step = ctx.step > 0 ? ctx.step : 1;

  /** Widen B until v ≤ v_max (the factor changes with the rounded sides). */
  const widen = (dims) => {
    for (let i = 0; i < MAX_STEPS; i++) {
      if (ok(evaluate(dims))) return dims;
      dims.width += step;
    }
    return null;
  };

  /** Width B ≥ minWidth for a fixed height H, before and after rounding. */
  const widthFor = (H, minWidth = 0) => {
    let v = limit(1).vmax;
    let B = H;
    let round = false;
    for (let i = 0; i < 60; i++) {
      const A = (q / v) * 1e6; // mm²
      if (p.shape === 'oval') {
        const rest = A - (Math.PI * H * H) / 4;
        round = rest <= 0;
        B = round ? H : rest / H + H;
      } else {
        B = A / H;
      }
      v = limit(Math.max(B, H) / Math.min(B, H)).vmax;
    }
    const width = Math.max(snapSide(B, ctx.step), minWidth, p.shape === 'oval' ? H : 0);
    const dims = widen({ width, height: H });
    return { required: B, round, dims };
  };

  let dims;
  if (!nonRound) {
    const dReq = Math.sqrt((4 * q) / (Math.PI * vRound)) * 1000;
    const snapped = snapDiameter(dReq, ctx.catalogs.diameters);
    if (p.mode === 'check') {
      if (!(p.diameter > 0)) return fail('error', 'dims-missing');
      dims = { diameter: p.diameter };
      r.needed = { diameter: snapped.diameter };
    } else {
      if (snapped.over) issue('warning', 'series-exceeded', { value: snapped.diameter });
      r.required = { diameter: dReq };
      dims = { diameter: snapped.diameter };
    }
  } else if (p.mode === 'size') {
    if (!(p.ratio > 0)) return fail('error', 'ratio-missing');
    const n = p.ratio >= 1 ? p.ratio : 1 / p.ratio;
    const A = (q / limit(n).vmax) * 1e6;
    const H = p.shape === 'oval' ? Math.sqrt(A / (Math.PI / 4 + n - 1)) : Math.sqrt(A / n);
    r.required = { width: n * H, height: H };
    // Height rounded down and up; for each the smallest width. The variant closer to 1/n wins, but it is
    // only more slender than 1/5 if 1/n is. Ties go to the larger height.
    let best = null;
    for (const height of heightCandidates(H, p.shape, ctx)) {
      const w = widthFor(height, height).dims;
      if (!w) continue;
      const ratio = w.width / height;
      const score = [ratio > Math.max(n, RECOMMENDED_MAX_RATIO) + EPS ? 1 : 0, Math.abs(Math.log(ratio / n))];
      if (!best || score[0] < best.score[0] || (score[0] === best.score[0] && score[1] < best.score[1] - EPS)) best = { dims: w, score };
    }
    dims = best?.dims;
  } else if (p.mode === 'height') {
    if (!(p.height > 0)) return fail('error', 'dims-missing');
    const w = widthFor(p.height);
    if (w.round) issue('warning', 'oval-round');
    r.required = { width: w.required, height: p.height };
    dims = w.dims;
  } else {
    if (!(p.width > 0 && p.height > 0)) return fail('error', 'dims-missing');
    if (p.shape === 'oval' && p.width < p.height) return fail('error', 'oval-width');
    dims = { width: p.width, height: p.height };
    const w = widthFor(p.height);
    if (w.dims) r.needed = { width: w.dims.width, height: p.height };
  }
  if (!dims) return fail('error', 'not-reached');

  const e = evaluate(dims);
  Object.assign(r, dims, {
    area: e.area,
    dh: e.dh,
    ratio: e.ratio,
    factor: e.factor,
    vmax: e.vmax,
    velocity: e.velocity,
    utilization: e.velocity / e.vmax,
  });
  const a = ctx.air;
  r.dynamicPressure = (a.density * e.velocity ** 2) / 2;
  r.reynolds = (e.velocity * e.dh) / a.kinematicViscosity;
  r.lambda = frictionFactor(r.reynolds, ctx.roughness / 1000 / e.dh);
  r.gradient = (r.lambda / e.dh) * r.dynamicPressure;

  if (nonRound) {
    // one note: beyond the end of Tab. 50 (1/10) a duct is always more slender than 1/5
    if (e.ratio > RECOMMENDED_MAX_RATIO + EPS) issue('warning', 'ratio-high', { value: e.ratio, limit: RECOMMENDED_MAX_RATIO, clamped: e.clamped });
    else if (e.clamped != null) issue('info', 'ratio-outside-table', { value: e.ratio, limit: e.clamped });
    if (!ctx.simple && e.factor == null) issue('error', 'factor-missing');
  }
  if (!ok(e)) issue('warning', 'velocity-high', { value: e.velocity, limit: e.vmax, needed: r.needed ?? null, shape: p.shape });
  return r;
}

/**
 * Size the position in the input panel and all pinned positions.
 * Returns the current result, the pinned results (Map by id), the hours used and the issues of the system;
 * every position result carries its own issues.
 */
export function compute(inputs) {
  const ctx = context(inputs);
  const positions = new Map();
  for (const p of inputs.positions) positions.set(p.id, sizePosition(p, ctx));
  return {
    current: sizePosition(inputs.current, ctx),
    positions,
    hours: ctx.hours,
    simple: ctx.simple,
    stages: ctx.stages,
    air: ctx.air,
    issues: ctx.issues,
  };
}

/** Key results stored in the envelope for regression checks (never used as input). */
export function snapshotOf(result) {
  const round = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
  const snap = (r) => ({
    id: r.id,
    size: r.status !== 'ok' ? null : r.shape === 'round' ? [r.diameter] : [r.width, r.height],
    velocity: round(r.velocity),
  });
  return { hours: result.hours, current: snap(result.current), positions: [...result.positions.values()].map(snap) };
}
