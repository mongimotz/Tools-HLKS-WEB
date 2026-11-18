// SPDX-License-Identifier: AGPL-3.0-or-later
// States and processes of the h,x diagram. Pure functions, no DOM. Models: docs/hx-diagram-method.md.
// Signs: q > 0 adds heat to the air, water > 0 adds water (kg/h). Mass flows ṁ are kg/h of dry air.

import * as P from './psychro.js';
import { pointIds, NO_POINT } from './defaults.js';

export const CALC_VERSION = '1.2.0';

/** Feed water temperature of the steam generator [°C]. */
export const T_FEED = 10;

const FOG_TOLERANCE = 0.05; // g/kg of liquid water before a state counts as fog

/** Pressure [Pa] of the site. */
export const pressureOf = (site) => P.pressureAt(site?.altitude ?? 0);

/** Dry air mass flow [kg/h] of a volume flow [m³/h] at state s. */
const massOf = (flow, s) => (flow > 0 ? (flow * s.rho) / (1 + s.x / 1000) : null);
/** Volume flow [m³/h] of a dry air mass flow at state s. */
const flowOf = (m, s) => (m > 0 ? (m * (1 + s.x / 1000)) / s.rho : null);
const power = (m, dh) => (m > 0 ? (m * dh) / 3600 : null);

/** Given values of a point; a reference takes the value of an earlier point plus the offset. */
function given(block, points) {
  const out = {};
  for (const g of block.given) {
    let v = g.value;
    if (g.ref) {
      const s = points.get(g.ref)?.state;
      if (!s) return null;
      v = P.userValue(s, g.key) + (g.value ?? 0);
    }
    if (v == null) continue;
    out[g.key] = g.key === 'phi' ? v / 100 : v;
  }
  return out;
}

/** Water side of a coil: mass flow [kg/h] from the power and the supply and return temperatures. */
function waterSide(b, q) {
  if (q == null || b.vl == null || b.rl == null || b.vl === b.rl) return null;
  return (Math.abs(q) * 3600) / (P.CP_WATER * Math.abs(b.vl - b.rl));
}

const outside = (s, r) => s.t < r.tMin - 1e-9 || s.t > r.tMax + 1e-9 || s.x < r.xMin - 1e-9 || s.x > r.xMax + 1e-9;

/** State at (h, x), also in the fog region. */
function stateHX(h, x, p) {
  const t = P.tFromHX(h, x, p);
  return t == null ? null : P.stateTX(t, x, p);
}

// ---- processes -------------------------------------------------------------------------------
// Each returns { out: [state…], values: {…}, issues: [{ code, severity }] } or { issues } on failure.

const fail = (code, extra = {}) => ({ issues: [{ code, severity: 'error', ...extra }] });

function heater(b, a, m, p) {
  let s;
  if (b.mode === 'q') {
    if (b.q == null) return fail('value-missing');
    if (!(m > 0)) return fail('flow-missing');
    s = stateHX(a.h + (b.q * 3600) / m, a.x, p);
  } else {
    if (b.t == null) return fail('value-missing');
    if (b.t < a.t) return fail('below-inlet', { value: b.t, limit: a.t });
    s = P.stateTX(b.t, a.x, p);
  }
  if (!s) return fail('no-solution');
  const q = power(m, s.h - a.h);
  return { out: [s], values: { q, dt: s.t - a.t, waterFlow: waterSide(b, q) } };
}

function fan(b, a, m, p) {
  if (b.dt == null) return fail('value-missing');
  const s = P.stateTX(a.t + b.dt, a.x, p);
  return { out: [s], values: { q: power(m, s.h - a.h), dt: b.dt } };
}

/**
 * Cooler: straight line from the inlet towards the coil point (mean surface temperature t_O on the
 * saturation line). Dry cooling (x constant) when t_O is not below the inlet dew point.
 */
function cooler(b, a, m, p) {
  // surface temperature: given, else from the water temperatures (mean + 1 K)
  const ts = b.ts ?? (b.vl != null && b.rl != null ? (b.vl + b.rl) / 2 + 1 : null);
  if (ts == null) return fail('value-missing');
  if (ts >= a.t) return fail('below-surface', { value: a.t, limit: ts });
  const wet = a.td != null && ts < a.td;
  // end of the line: the coil point when wet, else the surface temperature at constant x
  const c = P.stateTX(ts, wet ? P.xSat(ts, p) : a.x, p);
  const at = (f) => stateHX(a.h + f * (c.h - a.h), a.x + f * (c.x - a.x), p);
  let f;
  if (b.mode === 'q') {
    if (b.q == null) return fail('value-missing');
    if (!(m > 0)) return fail('flow-missing');
    f = (b.q * 3600) / m / (a.h - c.h);
  } else if (b.mode === 'bf') {
    if (b.bf == null) return fail('value-missing');
    if (b.bf < 0 || b.bf > 1) return fail('bf-range');
    f = 1 - b.bf;
  } else {
    if (b.t == null) return fail('value-missing');
    if (b.t > a.t) return fail('above-inlet', { value: b.t, limit: a.t });
    if (b.t < ts) return fail('below-surface', { value: b.t, limit: ts });
    f = P.bisect((ff) => at(ff).t - b.t, 0, 1);
  }
  if (f == null || !(f >= 0) || f > 1 + 1e-9) return fail('not-reached', { limit: ts });
  const s = at(Math.min(1, f));
  if (!s) return fail('no-solution');
  const sensible = power(m, (P.CP_AIR + (P.CP_VAPOUR * s.x) / 1000) * (s.t - a.t));
  const q = power(m, s.h - a.h);
  return {
    out: [s],
    values: {
      q,
      sensible,
      latent: q == null ? null : q - sensible,
      water: m > 0 ? (m * (s.x - a.x)) / 1000 : null,
      wet,
      ts,
      bf: 1 - Math.min(1, f),
      coil: { t: c.t, x: c.x, h: c.h },
      waterFlow: waterSide(b, q),
    },
  };
}

/** Steam humidifier: vapour at t_D, Δh = Δx · (r0 + c_D t_D). */
function steam(b, a, m, p) {
  if (b.ts == null) return fail('value-missing');
  const hd = P.R0 + P.CP_VAPOUR * b.ts;
  const at = (dx) => stateHX(a.h + (dx / 1000) * hd, a.x + dx, p);
  let dx;
  if (b.mode === 'm') {
    if (b.m == null) return fail('value-missing');
    if (!(m > 0)) return fail('flow-missing');
    dx = (b.m * 1000) / m;
  } else if (b.mode === 'phi') {
    if (b.phi == null) return fail('value-missing');
    if (b.phi / 100 <= a.phi) return fail('below-inlet', { value: b.phi, limit: a.phi * 100, unit: '%' });
    dx = b.phi >= 100 ? P.bisect((d) => at(d).fog - 1e-6, 0, 100) : P.bisect((d) => at(d).phi - b.phi / 100, 0, 100);
  } else {
    if (b.x == null) return fail('value-missing');
    dx = b.x - a.x;
  }
  if (dx == null) return fail('not-reached');
  if (dx < 0) return fail('below-inlet', { value: a.x + dx, limit: a.x, unit: 'g/kg' });
  const s = at(dx);
  if (!s) return fail('no-solution');
  const water = m > 0 ? (m * dx) / 1000 : null;
  // steam generator: feed water at T_FEED heated and evaporated to the steam enthalpy
  const generator = water == null ? null : (water * (hd - P.CP_WATER * T_FEED)) / 3600;
  return { out: [s], values: { q: power(m, s.h - a.h), water, hd, generator } };
}

/**
 * Adiabatic (evaporative) humidifier: water at the inlet wet bulb temperature, Δh = Δx · h_W(t_f).
 * Efficiency η = Δx / Δx up to saturation.
 */
function adiabatic(b, a, m, p) {
  const hw = P.hCondensed(a.tw ?? a.t);
  const at = (dx) => stateHX(a.h + (dx / 1000) * hw, a.x + dx, p);
  const dxSat = P.bisect((d) => {
    const s = at(d);
    return s ? s.x - s.xs : 1;
  }, 0, 100);
  if (dxSat == null) return fail('no-solution');
  let dx;
  if (b.mode === 'x') {
    if (b.x == null) return fail('value-missing');
    dx = b.x - a.x;
  } else if (b.mode === 'phi') {
    if (b.phi == null) return fail('value-missing');
    if (b.phi > 100) return fail('not-reached');
    dx = b.phi >= 100 ? dxSat : P.bisect((d) => at(d).phi - b.phi / 100, 0, dxSat);
  } else {
    if (b.eta == null) return fail('value-missing');
    dx = (dxSat * b.eta) / 100;
  }
  if (dx == null) return fail('not-reached');
  if (dx < 0) return fail('below-inlet', { value: a.x + dx, limit: a.x, unit: 'g/kg' });
  const s = at(dx);
  if (!s) return fail('no-solution');
  return { out: [s], values: { q: power(m, s.h - a.h), water: m > 0 ? (m * dx) / 1000 : null, eta: (dx / dxSat) * 100, hw, xSat: a.x + dxSat } };
}

/**
 * Heat recovery: temperature efficiency Φ_t on the supply side, with moisture recovery (rotor) also Φ_x.
 * The extract side follows from the energy and water balance. It cools at the transferred water content until
 * it reaches saturation, then follows the saturation line; the condensate leaves there. With a frost limit
 * t_FO,min the exhaust stays at or above it: Φ_t and Φ_x are reduced by the same factor.
 */
function hrv(b, a, e, m, me, p) {
  if (b.eta == null || (b.mode === 'enthalpy' && b.etaX == null)) return fail('value-missing');
  const ratio = m > 0 && me > 0 ? m / me : 1;
  const run = (k) => {
    const t2 = a.t + k * (b.eta / 100) * (e.t - a.t);
    const x2 = b.mode === 'enthalpy' ? a.x + k * (b.etaX / 100) * (e.x - a.x) : a.x;
    const s = P.stateTX(t2, x2, p);
    const hOut = e.h - ratio * (s.h - a.h);
    const xOut = e.x - ratio * (s.x - a.x);
    let f = stateHX(hOut, xOut, p);
    let condensate = 0;
    const wet = Boolean(f && f.fog > 0);
    if (wet) {
      const t = P.tSatOfH(hOut, p);
      if (t == null) return null;
      const xs = P.xSat(t, p);
      condensate = me > 0 ? (me * (xOut - xs)) / 1000 : null;
      f = P.stateTX(t, xs, p);
    }
    return f ? { s, f, condensate, wet, hOut, xOut } : null;
  };
  let k = 1;
  let r = run(1);
  if (!r) return fail('no-solution');
  const limited = b.tFrost != null && r.f.t < b.tFrost - 1e-9;
  if (limited) {
    const below = (kk) => (run(kk)?.f.t ?? -Infinity) - b.tFrost;
    k = below(0) < 0 ? 0 : P.bisect(below, 0, 1) ?? 0;
    r = run(k);
    if (!r) return fail('no-solution');
  }
  const { s, f, condensate } = r;
  const issues = [];
  if (limited) issues.push({ code: 'frost-limit', severity: 'info', value: k * b.eta });
  else if (f.t < 0 && (condensate == null || condensate > 0 || f.phi > 0.95)) issues.push({ code: 'frost', severity: 'warning', value: f.t });
  return {
    out: [s, f],
    values: {
      q: power(m, s.h - a.h),
      condensate,
      ratio,
      eta: k * b.eta,
      etaX: b.mode === 'enthalpy' ? k * b.etaX : null,
      limited,
      path: extractPath(e, r, p),
    },
    issues,
  };
}

/** Extract side as states (x, h): straight towards the exhaust, along the saturation line once condensing. */
function extractPath(e, r, p) {
  const end = { x: r.f.x, h: r.f.h };
  if (!r.wet || r.f.t >= e.t) return [{ x: e.x, h: e.h }, end];
  // where the straight line from the extract air towards the uncondensed exhaust meets saturation
  const along = (g) => stateHX(e.h + g * (r.hOut - e.h), e.x + g * (r.xOut - e.x), p);
  const g = P.bisect((gg) => {
    const s = along(gg);
    return s ? s.x - s.xs : 1;
  }, 0, 1);
  const c = g == null ? null : along(g);
  if (!c || c.t <= r.f.t) return [{ x: e.x, h: e.h }, end];
  const path = [{ x: e.x, h: e.h }, { x: c.x, h: c.h }];
  const n = Math.max(2, Math.ceil((c.t - r.f.t) / 0.5));
  for (let i = 1; i < n; i++) {
    const t = c.t + (i / n) * (r.f.t - c.t);
    const x = P.xSat(t, p);
    path.push({ x, h: P.stateTX(t, x, p).h });
  }
  path.push(end);
  return path;
}

/**
 * Adiabatic mixing of two or more air flows (mass and enthalpy balance). Shares: the first input and every
 * extra input have a share in %, the second input takes the rest. Flows: the mass flows of the inputs.
 */
function mix(b, ins, flow, p) {
  let shares;
  let m = null;
  if (b.mode === 'flows') {
    if (ins.some((i) => !(i.m > 0))) return fail('flow-missing');
    m = ins.reduce((sum, i) => sum + i.m, 0);
    shares = ins.map((i) => i.m / m);
  } else {
    const given = [b.share, ...b.parts.map((q) => q.share)];
    if (given.some((v) => v == null)) return fail('value-missing');
    if (given.some((v) => v < 0 || v > 100)) return fail('share-range');
    const rest = 100 - given.reduce((sum, v) => sum + v, 0);
    if (rest < -1e-9) return fail('share-range');
    shares = [given[0], Math.max(0, rest), ...given.slice(1)].map((v) => v / 100);
  }
  const h = ins.reduce((sum, i, k) => sum + shares[k] * i.state.h, 0);
  const x = ins.reduce((sum, i, k) => sum + shares[k] * i.state.x, 0);
  const s = stateHX(h, x, p);
  if (!s) return fail('no-solution');
  if (m == null) m = massOf(flow, s);
  return { out: [s], m, values: { share: shares[0] * 100, shares: shares.map((v) => v * 100), masses: ins.map((i) => i.m) } };
}

/** Room: sensible load Q_s [kW] warms the air, the moisture load [kg/h] adds vapour at room temperature. */
function room(b, a, m, p) {
  if (b.qs == null && b.mw == null) return fail('value-missing');
  if (!(m > 0)) return fail('flow-missing');
  const qs = b.qs ?? 0;
  const mw = b.mw ?? 0;
  const x = a.x + (mw * 1000) / m;
  if (x < 0) return fail('no-solution');
  const cp = P.CP_AIR + (P.CP_VAPOUR * x) / 1000;
  const s = P.stateTX(a.t + (qs * 3600) / (m * cp), x, p);
  const q = power(m, s.h - a.h);
  const dx = s.x - a.x;
  return {
    out: [s],
    values: { q, sensible: qs, latent: q - qs, water: mw, dt: s.t - a.t, dx, cp, ratio: Math.abs(dx) > 1e-9 ? (s.h - a.h) / (dx / 1000) : null },
  };
}

/** Keep the part of a closed path (x, h) where inside(q) holds; crossings found by bisection on each chord. */
function clipBy(ring, inside) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const c = ring[(i + 1) % ring.length];
    const inA = inside(a);
    if (inA) out.push(a);
    if (inA !== inside(c)) {
      let lo = 0;
      let hi = 1;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (inside({ x: a.x + mid * (c.x - a.x), h: a.h + mid * (c.h - a.h) }) === inA) lo = mid;
        else hi = mid;
      }
      const f = (lo + hi) / 2;
      out.push({ x: a.x + f * (c.x - a.x), h: a.h + f * (c.h - a.h) });
    }
  }
  return out;
}

/**
 * Comfort zone as a closed path of states (x, h): t from tMin to tMax, φ from phiMin to phiMax, x up to xMax.
 * Null when the limits do not span a zone.
 */
export function comfortZone(b, p) {
  const { tMin, tMax, phiMin, phiMax, xMax } = b;
  if ([tMin, tMax, phiMin, phiMax].some((v) => v == null) || !(tMax > tMin) || !(phiMax > phiMin) || phiMin < 0 || phiMax > 100) return null;
  const at = (t, phi) => {
    const s = P.stateFrom({ t, phi: phi / 100 }, p).state;
    return s ? { x: s.x, h: s.h } : null;
  };
  const ring = [];
  const n = 24;
  for (let i = 0; i <= n; i++) ring.push(at(tMin + ((tMax - tMin) * i) / n, phiMin));
  for (let i = 1; i <= n; i++) ring.push(at(tMax, phiMin + ((phiMax - phiMin) * i) / n));
  for (let i = 1; i <= n; i++) ring.push(at(tMax - ((tMax - tMin) * i) / n, phiMax));
  for (let i = 1; i < n; i++) ring.push(at(tMin, phiMax - ((phiMax - phiMin) * i) / n));
  if (ring.some((q) => !q)) return null;
  const out = xMax == null ? ring : clipBy(ring, (q) => q.x <= xMax);
  return out.length >= 3 ? out : null;
}

// ---- calculation -----------------------------------------------------------------------------

/**
 * Compute one calculation: { pressure, points: Map, blocks: Map, issues }.
 * points: id → { id, blockId, label, state, m, flow, given }; blocks: id → { issues, values, out, inputs }.
 */
export function computeCalculation(calc, site) {
  const p = pressureOf(site);
  const points = new Map();
  const blocks = new Map();
  const issues = [];
  const labels = autoLabels(calc.blocks);

  const addPoint = (id, blockId, state, m, isGiven) => {
    const point = { id, blockId, label: labels.get(id), state, m, flow: state ? flowOf(m, state) : null, given: isGiven };
    points.set(id, point);
    if (state) {
      if (state.fog > FOG_TOLERANCE) issues.push({ code: 'fog', severity: 'warning', blockId, pointId: id, value: state.fog });
      if (outside(state, calc.range)) issues.push({ code: 'outside', severity: 'info', blockId, pointId: id });
    }
  };

  for (const b of calc.blocks) {
    const r = { type: b.type, issues: [], values: {}, out: [], inputs: [] };
    blocks.set(b.id, r);
    if (b.type === 'point') {
      const values = given(b, points);
      const res = values ? P.stateFrom(values, p) : { error: 'ref-missing' };
      if (res.error) r.issues.push({ code: res.error, severity: 'error' });
      const state = res.state ?? null;
      addPoint(b.id, b.id, state, state ? massOf(b.flow ?? calc.flow, state) : null, true);
      r.out = [b.id];
    } else if (b.type === 'comfort') {
      const zone = comfortZone(b, p);
      if (zone) r.values = { zone };
      else r.issues.push({ code: 'comfort-range', severity: 'error' });
    } else {
      const inA = points.get(b.from);
      const inB = b.to !== undefined ? points.get(b.to) : null;
      r.inputs = [b.from, ...(b.to !== undefined ? [b.to] : []), ...(b.parts ?? []).map((q) => q.from)];
      const ins = r.inputs.map((id) => points.get(id));
      const needB = b.type === 'mix' || b.type === 'line' || b.type === 'hrv';
      if (!inA?.state || (needB && !inB?.state) || (needB && new Set(r.inputs).size !== r.inputs.length) || ins.some((i) => !i?.state)) {
        r.issues.push({ code: 'input-missing', severity: 'error' });
      } else if (b.type === 'line') {
        const a = inA.state;
        const c = inB.state;
        const dx = c.x - a.x;
        r.values = { dh: c.h - a.h, dx, dt: c.t - a.t, ratio: Math.abs(dx) > 1e-9 ? (c.h - a.h) / (dx / 1000) : null, q: power(inA.m, c.h - a.h) };
      } else {
        const a = inA.state;
        const m = inA.m;
        let res;
        switch (b.type) {
          case 'heater': res = heater(b, a, m, p); break;
          case 'fan': res = fan(b, a, m, p); break;
          case 'cooler': res = cooler(b, a, m, p); break;
          case 'steam': res = steam(b, a, m, p); break;
          case 'adiabatic': res = adiabatic(b, a, m, p); break;
          case 'hrv': res = hrv(b, a, inB.state, m, inB.m, p); break;
          case 'mix': res = mix(b, ins, calc.flow, p); break;
          case 'room': res = room(b, a, m, p); break;
        }
        r.issues.push(...(res.issues ?? []));
        if (res.out) {
          r.values = res.values ?? {};
          const mOut = b.type === 'mix' ? res.m : m;
          addPoint(b.id, b.id, res.out[0], mOut, false);
          r.out.push(b.id);
          if (b.type === 'hrv') {
            addPoint(`${b.id}.b`, b.id, res.out[1], inB.m, false);
            r.out.push(`${b.id}.b`);
          }
          if (r.values.q === null && b.type !== 'mix') r.issues.push({ code: 'flow-missing', severity: 'info' });
        }
      }
      if (!r.out.length && !NO_POINT.has(b.type)) {
        for (const id of b.type === 'hrv' ? [b.id, `${b.id}.b`] : [b.id]) addPoint(id, b.id, null, null, false);
        r.out = b.type === 'hrv' ? [b.id, `${b.id}.b`] : [b.id];
      }
    }
    for (const i of r.issues) issues.push({ ...i, blockId: b.id });
  }
  return { pressure: p, points, blocks, issues: issues.sort((x, y) => ORDER[x.severity] - ORDER[y.severity]) };
}

const ORDER = { error: 0, warning: 1, info: 2 };

/** Labels of all points: the block's own label, else a running number. */
export function autoLabels(blocks) {
  const labels = new Map();
  let n = 0;
  const byId = new Map(blocks.map((b) => [b.id, b]));
  for (const id of pointIds(blocks)) {
    n++;
    const b = byId.get(id.replace(/\.b$/, ''));
    const own = id.endsWith('.b') ? b.label2 : b.label;
    labels.set(id, own || String(n));
  }
  return labels;
}

/** Blocks whose power is supplied by the plant (heating and cooling totals). */
const EQUIPMENT = new Set(['heater', 'fan', 'cooler', 'steam', 'adiabatic']);

/**
 * Sums of a calculation for the report: heating and cooling coils [kW], steam [kg/h] and generator [kW],
 * evaporated water and condensate [kg/h], heat recovered [kW]. Zero sums are null.
 */
export function summaryOf(result) {
  const sum = { heat: 0, cool: 0, steam: 0, generator: 0, evaporated: 0, condensate: 0, recovered: 0 };
  for (const [, r] of result.blocks) {
    const v = r.values;
    if (r.type === 'heater' && v.q != null) sum.heat += v.q;
    if (r.type === 'cooler' && v.q != null) sum.cool -= v.q;
    if (r.type === 'cooler' && v.water != null) sum.condensate -= v.water;
    if (r.type === 'steam' && v.water != null) sum.steam += v.water;
    if (r.type === 'steam' && v.generator != null) sum.generator += v.generator;
    if (r.type === 'adiabatic' && v.water != null) sum.evaporated += v.water;
    if (r.type === 'hrv' && v.condensate) sum.condensate += v.condensate;
    if (r.type === 'hrv' && v.q != null) sum.recovered += Math.abs(v.q);
  }
  for (const k of Object.keys(sum)) if (Math.abs(sum[k]) < 1e-9) sum[k] = null;
  return sum;
}

/** Heating and cooling totals of a calculation [kW] (null without mass flows). */
export function totals(result) {
  let heat = 0;
  let cool = 0;
  let known = false;
  for (const [, r] of result.blocks) {
    if (!EQUIPMENT.has(r.type)) continue;
    const q = r.values.q;
    if (q == null) continue;
    known = true;
    if (q > 0) heat += q;
    else cool -= q;
  }
  return known ? { heat, cool } : null;
}

export function computeProject(inputs) {
  return { calculations: new Map(inputs.calculations.map((c) => [c.id, computeCalculation(c, inputs.site)])) };
}

const r2 = (v) => (v == null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100);

/** Key results for the saved snapshot (informative, never used as input). */
export function snapshotProjectOf(result) {
  return {
    calculations: [...result.calculations].map(([id, r]) => ({
      id,
      points: [...r.points.values()].map((pt) => ({ id: pt.id, t: r2(pt.state?.t), x: r2(pt.state?.x) })),
      blocks: [...r.blocks].map(([bid, b]) => ({ id: bid, q: r2(b.values.q) })),
    })),
  };
}
