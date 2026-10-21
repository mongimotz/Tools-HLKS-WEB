// SPDX-License-Identifier: AGPL-3.0-or-later
// States and processes of the h,x diagram. Pure functions, no DOM. Models: docs/hx-diagram-method.md.
// Signs: q > 0 adds heat to the air, water > 0 adds water (kg/h). Mass flows ṁ are kg/h of dry air.

import * as P from './psychro.js';
import { pointIds } from './defaults.js';

export const CALC_VERSION = '1.0.0';

const FOG_TOLERANCE = 0.05; // g/kg of liquid water before a state counts as fog

/** Pressure [Pa] of the site. */
export const pressureOf = (site) => P.pressureAt(site?.altitude ?? 0);

/** Dry air mass flow [kg/h] of a volume flow [m³/h] at state s. */
const massOf = (flow, s) => (flow > 0 ? (flow * s.rho) / (1 + s.x / 1000) : null);
/** Volume flow [m³/h] of a dry air mass flow at state s. */
const flowOf = (m, s) => (m > 0 ? (m * (1 + s.x / 1000)) / s.rho : null);
const power = (m, dh) => (m > 0 ? (m * dh) / 3600 : null);

function given(block) {
  const out = {};
  for (const g of block.given) {
    if (g.value == null) continue;
    out[g.key] = g.key === 'phi' ? g.value / 100 : g.value;
  }
  return out;
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
  return { out: [s], values: { q: power(m, s.h - a.h), dt: s.t - a.t } };
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
  if (b.ts == null) return fail('value-missing');
  const wet = a.td != null && b.ts < a.td;
  // end of the line: the coil point when wet, else the surface temperature at constant x
  const c = P.stateTX(b.ts, wet ? P.xSat(b.ts, p) : a.x, p);
  const at = (f) => stateHX(a.h + f * (c.h - a.h), a.x + f * (c.x - a.x), p);
  let f;
  if (b.mode === 'q') {
    if (b.q == null) return fail('value-missing');
    if (!(m > 0)) return fail('flow-missing');
    f = (b.q * 3600) / m / (a.h - c.h);
  } else {
    if (b.t == null) return fail('value-missing');
    if (b.t > a.t) return fail('above-inlet', { value: b.t, limit: a.t });
    if (b.t < b.ts) return fail('below-surface', { value: b.t, limit: b.ts });
    f = P.bisect((ff) => at(ff).t - b.t, 0, 1);
  }
  if (f == null || !(f >= 0) || f > 1 + 1e-9) return fail('not-reached', { limit: b.ts });
  const s = at(Math.min(1, f));
  if (!s) return fail('no-solution');
  const sensible = power(m, (P.CP_AIR + (P.CP_VAPOUR * s.x) / 1000) * (s.t - a.t));
  const q = power(m, s.h - a.h);
  return {
    out: [s],
    values: { q, sensible, latent: q == null ? null : q - sensible, water: m > 0 ? (m * (s.x - a.x)) / 1000 : null, wet, coil: { x: c.x, h: c.h } },
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
  return { out: [s], values: { q: power(m, s.h - a.h), water: m > 0 ? (m * dx) / 1000 : null } };
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
  return { out: [s], values: { q: power(m, s.h - a.h), water: m > 0 ? (m * dx) / 1000 : null, eta: (dx / dxSat) * 100 } };
}

/**
 * Heat recovery: temperature efficiency Φ_t on the supply side, with moisture recovery (rotor) also Φ_x.
 * The extract side follows from the energy and water balance; condensate leaves it at saturation.
 */
function hrv(b, a, e, m, me, p) {
  if (b.eta == null || (b.mode === 'enthalpy' && b.etaX == null)) return fail('value-missing');
  const t2 = a.t + (b.eta / 100) * (e.t - a.t);
  const x2 = b.mode === 'enthalpy' ? a.x + (b.etaX / 100) * (e.x - a.x) : a.x;
  const s = P.stateTX(t2, x2, p);
  const ratio = m > 0 && me > 0 ? m / me : 1;
  const hOut = e.h - ratio * (s.h - a.h);
  const xOut = e.x - ratio * (s.x - a.x);
  let f = stateHX(hOut, xOut, p);
  let condensate = 0;
  if (f && f.fog > 0) {
    const t = P.tSatOfH(hOut, p);
    if (t != null) {
      const xs = P.xSat(t, p);
      condensate = me > 0 ? (me * (xOut - xs)) / 1000 : null;
      f = P.stateTX(t, xs, p);
    }
  }
  if (!f) return fail('no-solution');
  const issues = f.t < 0 && (condensate == null || condensate > 0 || f.phi > 0.95) ? [{ code: 'frost', severity: 'warning', value: f.t }] : [];
  return { out: [s, f], values: { q: power(m, s.h - a.h), condensate, ratio }, issues };
}

/** Adiabatic mixing of two air flows (mass and enthalpy balance). */
function mix(b, a, c, ma, mc, flow, p) {
  let share;
  let m = null;
  if (b.mode === 'flows') {
    if (!(ma > 0) || !(mc > 0)) return fail('flow-missing');
    share = ma / (ma + mc);
    m = ma + mc;
  } else {
    if (b.share == null) return fail('value-missing');
    if (b.share < 0 || b.share > 100) return fail('share-range');
    share = b.share / 100;
  }
  const s = stateHX(share * a.h + (1 - share) * c.h, share * a.x + (1 - share) * c.x, p);
  if (!s) return fail('no-solution');
  if (m == null) m = massOf(flow, s);
  return { out: [s], m, values: { share: share * 100 } };
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
      const res = P.stateFrom(given(b), p);
      if (res.error) r.issues.push({ code: res.error, severity: 'error' });
      const state = res.state ?? null;
      addPoint(b.id, b.id, state, state ? massOf(b.flow ?? calc.flow, state) : null, true);
      r.out = [b.id];
    } else {
      const inA = points.get(b.from);
      const inB = b.to !== undefined ? points.get(b.to) : null;
      r.inputs = [b.from, ...(b.to !== undefined ? [b.to] : [])];
      const needB = b.type === 'mix' || b.type === 'line' || b.type === 'hrv';
      if (!inA?.state || (needB && !inB?.state) || (needB && b.from === b.to)) {
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
          case 'mix': res = mix(b, a, inB.state, m, inB.m, calc.flow, p); break;
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
      if (!r.out.length && b.type !== 'line') {
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

/** Heating and cooling totals of a calculation [kW] (null without mass flows). */
export function totals(result) {
  let heat = 0;
  let cool = 0;
  let known = false;
  for (const [, r] of result.blocks) {
    if (r.type === 'line' || r.type === 'hrv' || r.type === 'mix') continue;
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
