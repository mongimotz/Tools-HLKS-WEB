// SPDX-License-Identifier: AGPL-3.0-or-later
// Geometry of the h,x diagram (Mollier) as drawing primitives. No DOM: the page renders the items as SVG
// (svg.js), the PDF report with pdf-lib, so both look the same. Line set and labels follow the owner's Typst
// sheet; size, range and line spacing are dynamic: the diagram fills the given box, and the steps of the
// lines follow the scale, so zooming in shows finer lines.
//
// Skewed axes: abscissa x, ordinate h − r0·x, so the 0 °C isotherm is horizontal. y grows downwards.
// Units: one unit of the box (px on screen, pt in the PDF); `font` is the label size in the same unit.
//
// items: { k: 'line', a, b, s, q?, v? } | { k: 'poly', pts, s, q?, v? } | { k: 'text', at, text, size, anchor, base, angle, knock }
//   s: line style fine | norm | bold | dash; q/v: the property the line keeps constant (t, x, h, phi, rho) and its value;
//   anchor start | middle | end; base top | middle | bottom; angle in degrees, clockwise; knock = clear the lines behind.

import { CP_AIR, CP_VAPOUR, R0, R_AIR, EPS, xSat, xPhi, xFromPd, pdFromX, pws, bisect, hUnsat } from './psychro.js';

/** Default range, as on the owner's sheet (x up to 20 instead of 19 g/kg). */
export const DEFAULT_RANGE = { tMin: -20, tMax: 50, xMin: 0, xMax: 20 };
/** Limits of a range the user can set. */
export const RANGE_LIMITS = { tMin: -50, tMax: 80, xMax: 100, tSpan: 2, xSpan: 0.5 };

const round3 = (v) => Math.round(v * 1000) / 1000;
const P = (a) => [round3(a[0]), round3(a[1])];
const add = (a, d, f = 1) => [a[0] + f * d[0], a[1] + f * d[1]];
const unit = (v) => {
  const n = Math.hypot(v[0], v[1]);
  return [v[0] / n, v[1] / n];
};
const angleOf = (v) => (Math.atan2(v[1], v[0]) * 180) / Math.PI;

/** Ordinate value h − r0·x of unsaturated air (= 1.006 t + 0.00186 t x). */
const yh = (t, x) => CP_AIR * t + (CP_VAPOUR / 1000) * t * x;

/** Smallest of 1, 2, 5 × 10^n not below `min`. */
export function niceStep(min) {
  const e = Math.floor(Math.log10(min));
  for (const m of [1, 2, 5, 10]) if (m * 10 ** e >= min - 1e-12) return Number((m * 10 ** e).toPrecision(6));
  return 10 ** (e + 1);
}
/** A nice step not below `min` that is a multiple of `base`. */
function niceMultiple(min, base) {
  let s = niceStep(Math.max(min, base));
  for (let i = 0; i < 12 && Math.abs(s / base - Math.round(s / base)) > 1e-6; i++) s = niceStep(s * 1.0001);
  return s;
}
const multiples = (from, to, step) => {
  const out = [];
  for (let i = Math.ceil(from / step - 1e-9); i * step <= to + 1e-9; i++) out.push(Number((i * step).toPrecision(10)));
  return out;
};
const isMultiple = (v, step) => Math.abs(v / step - Math.round(v / step)) < 1e-6;
const decimals = (step) => Math.max(0, -Math.floor(Math.log10(step) + 1e-9));

/** A valid range: numbers within the limits, minimum spans; otherwise the default. */
export function cleanRange(r = {}) {
  const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  let tMin = Math.max(RANGE_LIMITS.tMin, num(r.tMin, DEFAULT_RANGE.tMin));
  let tMax = Math.min(RANGE_LIMITS.tMax, num(r.tMax, DEFAULT_RANGE.tMax));
  let xMin = Math.max(0, num(r.xMin, DEFAULT_RANGE.xMin));
  let xMax = Math.min(RANGE_LIMITS.xMax, num(r.xMax, DEFAULT_RANGE.xMax));
  if (tMax - tMin < RANGE_LIMITS.tSpan) [tMin, tMax] = [DEFAULT_RANGE.tMin, DEFAULT_RANGE.tMax];
  if (xMax - xMin < RANGE_LIMITS.xSpan) [xMin, xMax] = [DEFAULT_RANGE.xMin, DEFAULT_RANGE.xMax];
  return { tMin, tMax, xMin, xMax };
}

/**
 * Mapping between air states and the box for pressure p, range and box { width, height, font }.
 * The plot fills the box minus the label margins.
 */
export function sheetMap(p, range = DEFAULT_RANGE, box = { width: 600, height: 800, font: 11 }) {
  const { tMin, tMax, xMin, xMax } = cleanRange(range);
  const f = box.font;
  const xsat = (t) => xSat(t, p);
  const tSat = (x) => bisect((t) => pws(t, p) - pdFromX(x, p), -100, 90);
  const LM = 6.4 * f;
  const RM = 2.6 * f;
  const BM = 4.5 * f;
  const kx = (box.width - LM - RM) / (xMax - xMin);
  const vTopL = yh(tMax, xMin);
  const vTop = Math.max(vTopL, yh(tMax, xMax));
  // bottom: lowest point of the unsaturated area (tMin isotherm or saturation line)
  let vBot = Infinity;
  for (let i = 0; i <= 60; i++) {
    const x = xMin + ((xMax - xMin) * i) / 60;
    const ts = x > 0 ? tSat(x) : -Infinity;
    vBot = Math.min(vBot, yh(Math.min(tMax, Math.max(tMin, ts ?? tMin)), x));
  }
  // top margin: vapour pressure scale above the highest point, the phi title above the top left corner
  let TM = 7 * f;
  let ky = 1;
  for (let i = 0; i < 3; i++) {
    ky = (box.height - TM - BM) / (vTop - vBot);
    const drop = ky * (vTop - vTopL);
    TM = Math.max(4.9 * f, 7.1 * f - drop);
  }
  const X = (x) => LM + kx * (x - xMin);
  const Yv = (v) => TM + ky * (vTop - v);
  return {
    p,
    range: { tMin, tMax, xMin, xMax },
    width: box.width,
    height: box.height,
    font: f,
    kx,
    ky,
    vTop,
    vBot,
    X,
    Yv,
    xsat,
    tSat,
    /** Unsaturated state (t, x) on the sheet. */
    pt: (x, t) => [X(x), Yv(yh(t, x))],
    /** Any state by water content and enthalpy (also in the fog region). */
    ph: (x, h) => [X(x), Yv(h - (R0 / 1000) * x)],
    /** Sheet position → { x, h }. */
    fromSheet: ([sx, sy]) => {
      const x = xMin + (sx - LM) / kx;
      const v = vTop - (sy - TM) / ky;
      return { x, h: v + (R0 / 1000) * x };
    },
    /** Plot frame (left edge, top isotherm, right edge, bottom) as a polygon. */
    frame: () => [[X(xMin), Yv(vBot)], [X(xMin), Yv(yh(tMax, xMin))], [X(xMax), Yv(yh(tMax, xMax))], [X(xMax), Yv(vBot)]],
  };
}

const cache = new Map();

/** Diagram for pressure p [Pa], range and box: { width, height, items, map }. Cached. */
export function buildChart(p, range = DEFAULT_RANGE, box = { width: 600, height: 800, font: 11 }) {
  const r = cleanRange(range);
  const key = `${Math.round(p)}|${r.tMin}|${r.tMax}|${r.xMin}|${r.xMax}|${Math.round(box.width)}|${Math.round(box.height)}|${box.font}`;
  if (cache.has(key)) return cache.get(key);
  const chart = build(sheetMap(p, r, { ...box, width: Math.round(box.width), height: Math.round(box.height) }));
  if (cache.size > 24) cache.delete(cache.keys().next().value);
  cache.set(key, chart);
  return chart;
}

function build(map) {
  const { p, kx, ky, X, Yv, pt, ph, xsat, tSat, font: f } = map;
  const { tMin, tMax, xMin, xMax } = map.range;
  const items = [];
  const labels = []; // drawn last, above all lines
  const line = (a, b, s, q, v) => items.push({ k: 'line', a: P(a), b: P(b), s, ...(q ? { q, v } : {}) });
  const poly = (pts, s, q, v) => pts.length > 1 && items.push({ k: 'poly', pts: pts.map(P), s, ...(q ? { q, v } : {}) });
  const text = (at, str, o = {}) => labels.push({ k: 'text', at: P(at), text: String(str), size: f, anchor: 'middle', base: 'middle', angle: 0, knock: true, ...o });
  const num = (v, d = 0) => {
    const s = v.toFixed(d);
    return v < 0 && Number(s) !== 0 ? `−${s.slice(1)}` : s.replace('-', '');
  };
  const X0 = X(xMin);
  const XR = X(xMax);
  const Ybot = Yv(map.vBot);
  const visibleSat = (x) => x >= xMin - 1e-9 && x <= xMax + 1e-9;

  // ---- steps from the scale --------------------------------------------------------------------
  const tFine = niceStep((0.75 * f) / (ky * CP_AIR));
  const tMajor = niceMultiple((3.4 * f) / (ky * CP_AIR), tFine);
  const xLabel = niceStep((2.6 * f) / kx);
  const xTick = niceStep((0.3 * f) / kx);
  const hStep = niceStep((3.5 * f) / ky);
  const hTick = niceStep((0.8 * f) / ky);

  // ---- lines of constant water content, frame ------------------------------------------------
  for (const x of multiples(xMin, xMax, xLabel)) {
    if (x > xMin + 1e-9 && x < xMax - 1e-9) line([X(x), Ybot], pt(x, tMax), 'norm', 'x', x);
  }
  line([X0, Ybot], pt(xMin, tMax), 'norm', 'x', xMin);
  line([XR, Ybot], pt(xMax, tMax), 'norm', 'x', xMax);
  line([X0, Ybot], [XR, Ybot], 'norm');

  // ---- isotherms (to the saturation line) ------------------------------------------------------
  for (const t of multiples(tMin, tMax, tFine)) {
    const xe = Math.min(xMax, xsat(t));
    const bold = isMultiple(t, tMajor);
    if (xe > xMin) line(pt(xMin, t), pt(xe, t), bold || t === tMax ? 'bold' : 'fine', 't', t);
    if (xe <= xMin) continue;
    if (bold) text([X0 - 0.73 * f, pt(xMin, t)[1]], num(t, decimals(tMajor)), { anchor: 'end', size: 1.06 * f });
    else line([X0 - 0.4 * f, pt(xMin, t)[1]], pt(xMin, t), 'fine');
  }

  // ---- isenthalps ---------------------------------------------------------------------------------
  const dH = unit([kx, (ky * R0) / 1000]); // direction of an isenthalp on the sheet
  const aH = angleOf(dH);
  const tOn = (h, x) => (h - (R0 / 1000) * x) / (CP_AIR + (CP_VAPOUR / 1000) * x);
  const hEnds = (h) => {
    const xa = Math.max(xMin, (h - CP_AIR * tMax) / (R0 / 1000 + (CP_VAPOUR / 1000) * tMax));
    let xb = Math.min(xMax, (h - CP_AIR * tMin) / (R0 / 1000 + (CP_VAPOUR / 1000) * tMin));
    const g = (x) => x - xsat(tOn(h, x));
    if (!(xb > xa) || g(xa) >= 0) return null;
    if (g(xb) > 0) xb = bisect(g, xa, xb);
    return [xa, xb];
  };
  const hRange = [hUnsat(tMin, xMin) - hStep, hUnsat(tMax, xMax) + hStep];
  for (const h of multiples(hRange[0], hRange[1], hStep)) {
    const e = hEnds(h);
    if (!e || X(e[1]) - X(e[0]) < 0.3 * f) continue;
    line(ph(e[0], h), ph(e[1], h), 'norm', 'h', h);
    if (e[0] > xMin + (0.3 * f) / kx && e[0] < xMax - (0.3 * f) / kx) text(add(ph(e[0], h), dH, 2.2 * f), num(h, decimals(hStep)), { angle: aH });
  }

  // enthalpy scale along the saturation line
  for (const h of multiples(hRange[0], hRange[1], hTick)) {
    const e = hEnds(h);
    if (!e) continue;
    const xs = e[1];
    const ts = tOn(h, xs);
    if (!visibleSat(xs) || xsat(ts) > xMax + 1e-9 || ts < tMin - 1e-9 || Math.abs(xs - xsat(ts)) > 1e-6) continue;
    const at = ph(xs, h);
    const big = isMultiple(h, hStep);
    line(at, add(at, dH, big ? 1.07 * f : 0.57 * f), 'norm');
    if (big) text(add(at, dH, 1.4 * f), num(h, decimals(hStep)), { anchor: 'start', angle: aH });
  }

  // ---- lines of constant density -----------------------------------------------------------------
  const rhoAt = (t, x) => (p * (1 + x / 1000)) / (R_AIR * (t + 273.15) * (1 + x / 1000 / EPS));
  const rhoStep = niceStep((8 * f) / ((ky * CP_AIR * (273.15 + (tMin + tMax) / 2)) / rhoAt((tMin + tMax) / 2, 0)));
  const rhoDigits = Math.max(2, decimals(rhoStep));
  const rhos = [rhoAt(tMax, xMax), rhoAt(tMin, xMin)];
  for (const rho of multiples(Math.min(...rhos), Math.max(...rhos), rhoStep)) {
    const tR = (x) => (p * (1 + x / 1000)) / (rho * R_AIR * (1 + x / 1000 / EPS)) - 273.15;
    const n = 80;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const x = xMin + ((xMax - xMin) * i) / n;
      const t = tR(x);
      if (t >= tMin && t <= tMax && x <= xsat(t)) pts.push(pt(x, t));
    }
    poly(pts, 'dash', 'rho', rho);
    const t0 = tR(xMin);
    if (t0 >= tMin && t0 <= tMax && xMin <= xsat(t0)) {
      const y0 = pt(xMin, t0)[1];
      line([X0 - 2.2 * f, y0], [X0, y0], 'dash');
      text([X0 - 2.45 * f, y0], rho.toFixed(rhoDigits), { anchor: 'end', knock: false });
    }
  }

  // ---- lines of constant relative humidity --------------------------------------------------------
  const percents = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100];
  if (tMax - tMin <= 30) percents.push(55, 65, 75, 85, 95);
  for (const pct of percents.sort((a, b) => a - b)) {
    const phi = pct / 100;
    const dashed = pct % 10 === 5;
    const tAtX = (x) => bisect((t) => phi * pws(t, p) - pdFromX(x, p), -100, 120);
    let t0 = Math.max(tMin, dashed && pct < 50 ? 0 : tMin);
    if (xMin > 0 && xPhi(t0, phi, p) < xMin) t0 = tAtX(xMin);
    const tEnd = xPhi(tMax, phi, p) <= xMax ? tMax : tAtX(xMax);
    if (t0 == null || tEnd == null || tEnd - t0 < 1e-6 || t0 > tMax) continue;
    const n = Math.max(8, Math.ceil(((tEnd - t0) * ky) / (0.4 * f)));
    const pts = Array.from({ length: n + 1 }, (_, i) => {
      const t = t0 + ((tEnd - t0) * i) / n;
      return pt(Math.min(xMax, Math.max(xMin, xPhi(t, phi, p))), t);
    });
    poly(pts, pct === 50 || pct === 100 ? 'bold' : dashed ? 'dash' : 'norm', 'phi', phi);
    const tan = unit([pts[n][0] - pts[n - 1][0], pts[n][1] - pts[n - 1][1]]);
    if (tEnd === tMax) {
      if (pts[n][0] > X0 + 0.35 * (XR - X0)) text(add(pts[n], tan, 0.4 * f), pct, { anchor: 'start', angle: angleOf(tan) });
    } else text([XR + 0.4 * f, pts[n][1]], pct, { anchor: 'start' });
  }

  // ---- vapour pressure scale (top) ---------------------------------------------------------------
  const topL = pt(xMin, tMax)[1];
  const Yp = Math.min(Yv(map.vTop) - 2.0 * f, topL - 4.2 * f);
  const pdA = pdFromX(xMin, p) / 100;
  const pdB = pdFromX(xMax, p) / 100;
  const perMbar = (XR - X0) / (pdB - pdA);
  const pTick = niceStep((0.4 * f) / perMbar);
  const pLabel = niceMultiple((3.5 * f) / perMbar, pTick);
  line([X0, Yp], [XR + 0.3 * f, Yp], 'norm');
  for (const m of multiples(pdA, pdB, pTick)) {
    const xx = X(xFromPd(m * 100, p));
    const big = isMultiple(m, pLabel);
    line([xx, Yp], [xx, Yp - (big ? 1.4 : 0.83) * f], 'norm');
    if (big) text([xx, Yp - 1.73 * f], num(m, decimals(pLabel)), { base: 'bottom', knock: false });
  }
  text([X0, Yp + 0.93 * f], 'Wasserdampf-Teildruck p in mbar', { anchor: 'start', knock: false });

  // ---- axis titles ----------------------------------------------------------------------------------
  if (xMin === 0) text([X0, topL - 0.73 * f], '0', { base: 'bottom', knock: false });
  text([X0 + 1.17 * f, topL - 0.73 * f], 'Relative Feuchte φ in %', { anchor: 'start', base: 'bottom', knock: false });
  const leftTitle = 0.7 * f;
  text([leftTitle, topL + 0.22 * (Ybot - topL)], 'Dichte ρ in kg/m³', { angle: -90, knock: false });
  text([leftTitle, topL + 0.68 * (Ybot - topL)], 'Temperatur t in °C', { angle: -90, knock: false });

  // enthalpy title in the fog region, parallel to the saturation line
  const xm = xMin + 0.38 * (xMax - xMin);
  const tm = tSat(xm);
  if (tm != null && tm > tMin && tm < tMax) {
    const d = 0.3 * ((xMax - xMin) / 20);
    const s1 = pt(xm - d, tSat(xm - d));
    const s2 = pt(xm + d, tSat(xm + d));
    const tanS = unit([s2[0] - s1[0], s2[1] - s1[1]]);
    const c = add([(s1[0] + s2[0]) / 2, (s1[1] + s2[1]) / 2], [-tanS[1], tanS[0]], 6.5 * f);
    if (c[0] > X0 && c[0] < XR && c[1] < Ybot - f) text(c, 'Spezifische Enthalpie h in kJ/kg', { angle: angleOf(tanS), size: 1.06 * f });
  }

  // ---- x scale (bottom) -------------------------------------------------------------------------------
  const xHalf = isMultiple(xLabel / 2, xTick) ? xLabel / 2 : null;
  for (const x of multiples(xMin, xMax, xTick)) {
    const len = isMultiple(x, xLabel) ? 1.17 : xHalf && isMultiple(x, xHalf) ? 0.83 : 0.5;
    line([X(x), Ybot], [X(x), Ybot + len * f], 'norm');
  }
  for (const x of multiples(xMin, xMax, xLabel)) text([X(x), Ybot + 2.1 * f], num(x, decimals(xLabel)), { size: 1.06 * f, knock: false });
  text([X0, Ybot + 4.3 * f], 'Wasserdampfgehalt x in g/kg', { anchor: 'start', base: 'bottom', knock: false });

  return { width: map.width, height: map.height, items: [...items, ...labels], map };
}
