// SPDX-License-Identifier: AGPL-3.0-or-later
// Duct pressure loss calculation. Pure functions, no DOM: runs in the browser and in Node tests.
//
// Units inside this module: lengths of ducts in mm (inputs) and m (calculation), flow in m³/h,
// pressure in Pa, temperature in °C, roughness in mm.

export const CALC_VERSION = '1.2.0';

// Air properties and λ live in lib/core/air.js (shared with the duct sizing tool); re-exported for this tool's users.
import { airState, frictionFactor, LAMINAR_LIMIT, TURBULENT_LIMIT } from '../../lib/core/air.js';
import { calculationInputs } from './defaults.js';
import { resolveNumberedTree } from './network.js';
export {
  atmosphericPressure,
  saturationVapourPressure,
  airDensity,
  dynamicViscosity,
  airState,
  frictionFactor,
  LAMINAR_LIMIT,
  TURBULENT_LIMIT,
} from '../../lib/core/air.js';

// ---- geometry -----------------------------------------------------------------

/** Cross-section of a section: area [m²], hydraulic diameter [m], aspect ratio [-]. Null if incomplete. */
export function sectionGeometry(section) {
  if (section.shape === 'round') {
    const d = section.diameter;
    if (!(d > 0)) return null;
    const dm = d / 1000;
    return { area: (Math.PI * dm * dm) / 4, dh: dm, aspect: 1 };
  }
  const a = section.width;
  const b = section.height;
  if (!(a > 0 && b > 0)) return null;
  const am = a / 1000;
  const bm = b / 1000;
  return { area: am * bm, dh: (2 * am * bm) / (am + bm), aspect: Math.max(a, b) / Math.min(a, b) };
}

/** Maximum velocity for a volume flow from a table [{ below, vmax }], last row: below = null. */
export function velocityLimit(flow, table) {
  if (!(flow > 0) || !table?.length) return null;
  const rows = [...table].sort((x, y) => (x.below ?? Infinity) - (y.below ?? Infinity));
  for (const row of rows) {
    if (row.below == null || flow < row.below) return row.vmax ?? null;
  }
  return rows[rows.length - 1].vmax ?? null;
}

/**
 * Pressure loss [Pa] of a sudden change of cross-section between two sections.
 * Expansion: Borda–Carnot Δp = ρ/2 (v_up − v_down)².
 * Contraction: Δp = ζ ρ/2 v_down² with ζ = 0.5 (1 − A_down/A_up)^0.75.
 * `factor` scales the result (e.g. < 1 for conical transitions).
 */
export function transitionLoss({ vUp, vDown, areaUp, areaDown, density, factor = 1 }) {
  if (!(vUp > 0 && vDown > 0 && areaUp > 0 && areaDown > 0)) return 0;
  let dp = 0;
  if (vUp > vDown) dp = (density / 2) * (vUp - vDown) ** 2;
  else if (areaDown < areaUp) dp = 0.5 * Math.pow(1 - areaDown / areaUp, 0.75) * (density / 2) * vDown * vDown;
  return factor * dp;
}

// ---- network ------------------------------------------------------------------

export const resolveTree = resolveNumberedTree;

/** Branch level from the section number: 1, 2 → 0; 2.1 → 1; 2.1.1 → 2. */
export function branchLevel(nr) {
  return (String(nr ?? '').trim().match(/\./g) ?? []).length;
}

/** Ids of all descendants in the numbered network. */
export function descendantsOf(sections, id) {
  const { children } = resolveTree(sections);
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

// ---- main calculation ---------------------------------------------------------------

/**
 * Calculate the whole network.
 * Returns per-section results (Map by id), the critical path, totals and issues.
 */
export function compute(inputs) {
  const { system, sections, catalogs, settings } = inputs;
  const materials = new Map(catalogs.materials.map((m) => [m.id, m]));
  const fittings = new Map(catalogs.fittings.map((f) => [f.id, f]));
  const tree = resolveTree(sections);
  const byId = new Map(sections.map((s) => [s.id, s]));
  const issues = [...tree.issues];
  const results = new Map();
  const airCache = new Map();

  const air = (t) => {
    let a = airCache.get(t);
    if (!a) {
      a = airState({ temperature: t, altitude: system.altitude, humidity: system.humidity });
      airCache.set(t, a);
    }
    return a;
  };

  for (const id of tree.order) {
    const s = byId.get(id);
    const parentId = tree.parent.get(id);
    const parentRes = parentId ? results.get(parentId) : null;
    const r = {
      id,
      parent: parentId,
      children: tree.children.get(id),
      depth: tree.depth.get(id),
      status: tree.invalid.has(id) ? 'incomplete' : 'ok',
      flow: s.flow,
      length: s.length ?? 0,
      issues: tree.issues.filter((item) => item.sectionId === id),
      fittingDetails: [],
      dpFriction: 0,
      dpFittings: 0,
      dpComponents: 0,
      dp: 0,
      cum: 0,
    };
    const issue = (severity, code, params = {}) => {
      const it = { sectionId: id, severity, code, ...params };
      r.issues.push(it);
      issues.push(it);
    };

    const temperature = s.temperature ?? system.temperature;
    const a = air(temperature);
    r.temperature = temperature;
    r.density = a.density;
    r.kinematicViscosity = a.kinematicViscosity;

    const geom = sectionGeometry(s);
    const material = materials.get(s.material);
    r.dpComponents = (s.components ?? []).reduce((sum, c) => sum + (Number.isFinite(c.dp) ? c.dp : 0), 0);

    if (!(s.flow > 0)) {
      r.status = 'incomplete';
      issue('info', 'flow-missing');
    } else if (!geom) {
      r.status = 'incomplete';
      issue('error', 'geometry-missing');
    } else if (!material) {
      r.status = 'incomplete';
      issue('error', 'material-missing');
    }

    if (r.status === 'ok') {
      Object.assign(r, geom);
      r.roughness = material.roughness;
      r.velocity = s.flow / 3600 / geom.area;
      r.dynamicPressure = (a.density * r.velocity ** 2) / 2;
      r.reynolds = (r.velocity * geom.dh) / a.kinematicViscosity;
      r.relRoughness = material.roughness / 1000 / geom.dh;
      r.lambda = frictionFactor(r.reynolds, r.relRoughness);
      r.gradient = (r.lambda / geom.dh) * r.dynamicPressure; // R [Pa/m]
      r.dpFriction = r.gradient * r.length;

      // Fittings: Σζ · p_d plus computed transitions.
      let zetaSum = 0;
      for (const f of s.fittings ?? []) {
        const cat = fittings.get(f.ref);
        const count = Number.isFinite(f.count) ? f.count : 1;
        if (!cat) {
          issue('error', 'fitting-missing');
          continue;
        }
        if (cat.kind === 'transition') {
          let dp = 0;
          if (!parentRes || parentRes.status !== 'ok') {
            issue('warning', 'transition-no-parent');
          } else {
            const supply = system.direction !== 'extract';
            dp = transitionLoss({
              vUp: supply ? parentRes.velocity : r.velocity,
              vDown: supply ? r.velocity : parentRes.velocity,
              areaUp: supply ? parentRes.area : r.area,
              areaDown: supply ? r.area : parentRes.area,
              density: a.density,
              factor: cat.factor ?? 1,
            });
          }
          const zeta = r.dynamicPressure > 0 ? dp / r.dynamicPressure : 0;
          zetaSum += count * zeta;
          r.fittingDetails.push({ ref: f.ref, count, zeta, computed: true, dp: count * dp });
        } else {
          const zeta = Number.isFinite(f.zeta) ? f.zeta : cat.zeta ?? 0;
          zetaSum += count * zeta;
          r.fittingDetails.push({ ref: f.ref, count, zeta, computed: false, dp: count * zeta * r.dynamicPressure });
        }
      }
      if (Number.isFinite(s.zetaExtra) && s.zetaExtra !== 0) zetaSum += s.zetaExtra;
      r.zetaSum = zetaSum;
      r.dpFittings = zetaSum * r.dynamicPressure;

      r.vmax = velocityLimit(s.flow, catalogs.velocityLimits);
      if (r.vmax != null && r.velocity > r.vmax + 1e-9) issue('warning', 'velocity-high', { value: r.velocity, limit: r.vmax });
      if (settings?.maxAspectRatio && geom.aspect > settings.maxAspectRatio + 1e-9) {
        issue('info', 'aspect-high', { value: geom.aspect, limit: settings.maxAspectRatio });
      }
      if (r.reynolds < LAMINAR_LIMIT) issue('info', 'laminar', { value: r.reynolds });
      else if (r.reynolds < TURBULENT_LIMIT) issue('info', 'transition-regime', { value: r.reynolds });
    }

    r.dp = tree.invalid.has(id) ? 0 : r.dpFriction + r.dpFittings + r.dpComponents;
    r.cum = tree.invalid.has(id) ? 0 : (parentRes?.cum ?? 0) + r.dp;
    results.set(id, r);
  }

  // Flow continuity: branches must not carry more air than the section feeding them.
  for (const r of results.values()) {
    if (tree.invalid.has(r.id) || !r.children.length || !(r.flow > 0)) continue;
    const sum = r.children.filter((id) => !tree.invalid.has(id)).reduce((acc, c) => acc + (byId.get(c).flow || 0), 0);
    if (sum > r.flow * 1.005) {
      const it = { sectionId: r.id, severity: 'warning', code: 'flow-continuity', value: sum, limit: r.flow };
      r.issues.push(it);
      issues.push(it);
    }
  }

  // Critical path = terminal section with the highest cumulative pressure loss.
  const terminals = [...results.values()].filter((r) => !tree.invalid.has(r.id) && !r.children.some((id) => !tree.invalid.has(id)));
  let critical = null;
  for (const t of terminals) if (!critical || t.cum > critical.cum) critical = t;

  const path = [];
  for (let cur = critical; cur; cur = cur.parent ? results.get(cur.parent) : null) path.unshift(cur.id);
  const onPath = new Set(path);

  const totals = { friction: 0, fittings: 0, components: 0, length: 0 };
  for (const id of path) {
    const r = results.get(id);
    totals.friction += r.dpFriction;
    totals.fittings += r.dpFittings;
    totals.components += r.dpComponents;
    totals.length += r.status === 'ok' ? r.length : 0;
  }

  const criticalDp = critical?.cum ?? 0;
  const margin = Math.max(0, system.safetyMargin || 0);
  const required = criticalDp * (1 + margin / 100);
  const available = system.availablePressure > 0 ? system.availablePressure : null;
  const reserve = available != null ? available - required : null;
  if (reserve != null && reserve < 0) issues.push({ sectionId: null, severity: 'error', code: 'fan-insufficient', value: required, limit: available });

  for (const r of results.values()) {
    r.critical = onPath.has(r.id);
    r.terminal = terminals.includes(r);
    if (r.terminal) r.throttle = criticalDp - r.cum;
  }

  return {
    sections: results,
    order: tree.order,
    path,
    criticalId: critical?.id ?? null,
    terminals: terminals.map((t) => t.id),
    totals: { ...totals, critical: criticalDp, margin, required, available, reserve },
    issues,
  };
}

/** Key results stored in the envelope for regression checks (never used as input). */
export function snapshotOf(result) {
  const round = (v) => (v == null ? null : Math.round(v * 1000) / 1000);
  return {
    critical: round(result.totals.critical),
    required: round(result.totals.required),
    path: result.path,
  };
}

/** Recalculate every independent network with the project's shared catalogues. */
export function computeProject(inputs) {
  const calculations = new Map();
  const issues = [];
  for (const calculation of inputs.calculations) {
    const result = compute(calculationInputs(inputs, calculation.id));
    calculations.set(calculation.id, result);
    issues.push(...result.issues.map((issue) => ({ ...issue, calcId: calculation.id })));
  }
  return { calculations, issues };
}

export function snapshotProjectOf(result) {
  return { calculations: [...result.calculations].map(([id, calculation]) => ({ id, ...snapshotOf(calculation) })) };
}

// ---- dimensioning help -----------------------------------------------------------

const ceilTo = (v, step) => Math.ceil(v / step - 1e-9) * step;

/**
 * Suggest duct sizes for a flow so that the velocity stays at or below vmax.
 * Returns the smallest standard round diameter, the most compact rectangle (aspect ≤ 2)
 * and, if a height is given, the rectangle that keeps this height.
 */
export function suggestDimensions({ flow, vmax, height = null, diameters, rectStep = 50 }) {
  if (!(flow > 0 && vmax > 0)) return null;
  const areaMm2 = (flow / 3600 / vmax) * 1e6;
  const dReq = Math.sqrt((4 * areaMm2) / Math.PI);
  const diameter = diameters.find((d) => d >= dReq - 1e-9) ?? null;

  let compact = null;
  for (let h = rectStep * 2; h <= 3000; h += rectStep) {
    const w = Math.max(h, ceilTo(areaMm2 / h, rectStep));
    if (w / h > 2) continue;
    if (!compact || w + h < compact.width + compact.height || (w + h === compact.width + compact.height && w * h < compact.width * compact.height)) {
      compact = { width: w, height: h };
    }
  }

  let keepHeight = null;
  if (height > 0) keepHeight = { width: Math.max(rectStep, ceilTo(areaMm2 / height, rectStep)), height };

  return { round: diameter ? { diameter } : null, rect: compact, rectKeepHeight: keepHeight };
}

/** Velocity and pressure gradient of a bare cross-section (no fittings), for comparing suggestions. */
export function evaluateCrossSection(inputs, section) {
  const probe = { ...section, id: '__probe', nr: '1', fittings: [], components: [], zetaExtra: null };
  const r = compute({ ...inputs, sections: [probe] }).sections.get('__probe');
  return r.status === 'ok' ? { velocity: r.velocity, gradient: r.gradient } : null;
}
