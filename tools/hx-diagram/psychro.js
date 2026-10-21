// SPDX-License-Identifier: AGPL-3.0-or-later
// Moist air at total pressure p (ASHRAE Fundamentals, ch. 1). Pure functions, no DOM.
// Units: t in °C, x in g/kg dry air, h in kJ/kg dry air, p and pd in Pa, phi as a fraction (0 … 1).
// Saturation over water (t ≥ 0 °C) and over ice (t < 0 °C), Hyland & Wexler 1983, with the
// enhancement factor f_E (WMO / Buck 1981). Same equations as the owner's Typst h,x sheet.

export const EPS = 0.621945; // M_W / M_L
export const R_AIR = 287.042; // J/(kg K), dry air
export const CP_AIR = 1.006; // kJ/(kg K), dry air
export const CP_VAPOUR = 1.86; // kJ/(kg K), water vapour
export const R0 = 2501; // kJ/kg, evaporation enthalpy at 0 °C
export const CP_WATER = 4.19; // kJ/(kg K), liquid water
export const CP_ICE = 2.05; // kJ/(kg K), ice
export const L_FUSION = 333.4; // kJ/kg, melting enthalpy

export const T_LOW = -80;
export const T_HIGH = 85; // below the boiling point up to about 3000 m

/** Barometric pressure of the ICAO standard atmosphere [Pa] at altitude [m]. */
export function pressureAt(altitude) {
  return 101325 * Math.pow(1 - (0.0065 * (altitude || 0)) / 288.15, 5.255877);
}

/** Saturation vapour pressure [Pa], Hyland & Wexler 1983; over ice below 0 °C. */
export function ps(t) {
  const T = t + 273.15;
  if (t < 0) {
    return Math.exp(
      -5.6745359e3 / T + 6.3925247 - 9.677843e-3 * T + 6.2215701e-7 * T * T + 2.0747825e-9 * T ** 3 - 9.484024e-13 * T ** 4 + 4.1635019 * Math.log(T),
    );
  }
  return Math.exp(-5.8002206e3 / T + 1.3914993 - 4.8640239e-2 * T + 4.1764768e-5 * T * T - 1.4452093e-8 * T ** 3 + 6.5459673 * Math.log(T));
}

/** Enhancement factor f_E (real gas effect on saturation), p in Pa. */
export function enhancement(p) {
  const mbar = p / 100;
  return 1.0016 + 3.15e-6 * mbar - 0.074 / mbar;
}

/** Saturation pressure of water vapour in moist air at total pressure p [Pa]. */
export const pws = (t, p) => enhancement(p) * ps(t);

export const xFromPd = (pd, p) => (1000 * EPS * pd) / (p - pd);
export const pdFromX = (x, p) => (p * (x / 1000)) / (EPS + x / 1000);

/** Water content at saturation [g/kg]; Infinity where saturation pressure reaches p. */
export function xSat(t, p) {
  const s = pws(t, p);
  return s < p ? xFromPd(s, p) : Infinity;
}

/** Water content at relative humidity phi (fraction). */
export function xPhi(t, phi, p) {
  const pd = phi * pws(t, p);
  return pd < p ? xFromPd(pd, p) : Infinity;
}

/** Specific enthalpy of unsaturated air (vapour only) [kJ/kg dry air]. */
export const hUnsat = (t, x) => CP_AIR * t + (x / 1000) * (R0 + CP_VAPOUR * t);

/** Enthalpy of condensed water at t: liquid at or above 0 °C, ice below [kJ/kg]. */
export const hCondensed = (t) => (t >= 0 ? CP_WATER * t : -L_FUSION + CP_ICE * t);

/** Specific enthalpy, also in the fog region (vapour up to saturation, the rest as water or ice). */
export function enthalpy(t, x, p) {
  const xs = xSat(t, p);
  if (x <= xs) return hUnsat(t, x);
  return hUnsat(t, xs) + ((x - xs) / 1000) * hCondensed(t);
}

/** Density of moist air [kg/m³] (condensed water carries mass but no volume). */
export function density(t, x, p) {
  const xv = Math.min(x, xSat(t, p)) / 1000;
  return (p * (1 + x / 1000)) / (R_AIR * (t + 273.15) * (1 + xv / EPS));
}

/** Volume per kg of dry air [m³/kg]. */
export const specificVolume = (t, x, p) => (1 + x / 1000) / density(t, x, p);

/**
 * Root of f on [a, b] by bisection; null without a sign change.
 * Monotonic functions only, which all state functions here are.
 */
export function bisect(f, a, b, n = 80) {
  let lo = a;
  let hi = b;
  let flo = f(lo);
  const fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi)) return null;
  if (flo === 0) return lo;
  if (fhi === 0) return hi;
  if (flo < 0 === fhi < 0) return null;
  for (let i = 0; i < n; i++) {
    const m = (lo + hi) / 2;
    const fm = f(m);
    if (fm < 0 === flo < 0) {
      lo = m;
      flo = fm;
    } else hi = m;
  }
  return (lo + hi) / 2;
}

/** Dew point (frost point below 0 °C) of water content x [°C]. */
export function dewPoint(x, p) {
  if (!(x > 0)) return null;
  const pd = pdFromX(x, p);
  return bisect((t) => pws(t, p) - pd, T_LOW, T_HIGH);
}

/** Temperature on the saturation line at water content x. */
export const tSatOfX = dewPoint;

/**
 * Thermodynamic wet bulb temperature (ice bulb below 0 °C): the saturated state at t* reached by adding
 * water at t* adiabatically, h(t, x) + (x_s(t*) − x) · h_w(t*) = h_s(t*).
 */
export function wetBulb(t, x, p) {
  const h = enthalpy(t, x, p);
  const f = (ts) => {
    const xs = xSat(ts, p);
    return hUnsat(ts, xs) - h - ((xs - x) / 1000) * hCondensed(ts);
  };
  if (x >= xSat(t, p)) return t;
  return bisect(f, T_LOW - 20, t);
}

/** Saturated state with enthalpy h: temperature on the saturation line [°C]. */
export function tSatOfH(h, p) {
  return bisect((t) => hUnsat(t, xSat(t, p)) - h, T_LOW, T_HIGH);
}

/** Temperature from h and x, also in the fog region. */
export function tFromHX(h, x, p) {
  return bisect((t) => enthalpy(t, x, p) - h, T_LOW, T_HIGH);
}

/** Relative humidity (fraction); 1 in the fog region. */
export function relHumidity(t, x, p) {
  return Math.min(1, pdFromX(x, p) / pws(t, p));
}

/** Full state of moist air from temperature and water content. */
export function stateTX(t, x, p) {
  const xs = xSat(t, p);
  const xv = Math.min(x, xs);
  return {
    t,
    x,
    phi: relHumidity(t, x, p),
    h: enthalpy(t, x, p),
    rho: density(t, x, p),
    v: specificVolume(t, x, p),
    pd: pdFromX(xv, p),
    td: dewPoint(xv, p),
    tw: wetBulb(t, x, p),
    xs,
    fog: Math.max(0, x - xs),
  };
}

/** Properties a state can be given by. */
export const KEYS = ['t', 'phi', 'x', 'h', 'td', 'tw'];

/** One property of the state (t, x); phi as a fraction. */
export function property(key, t, x, p) {
  switch (key) {
    case 't': return t;
    case 'x': return x;
    case 'phi': return pdFromX(Math.min(x, xSat(t, p)), p) / pws(t, p);
    case 'h': return enthalpy(t, x, p);
    case 'td': return dewPoint(x, p);
    case 'tw': return wetBulb(t, x, p);
    default: return NaN;
  }
}

const X_MAX = 500;

/**
 * State from any two properties { key: value } (phi as a fraction).
 * Returns { state } or { error: 'pair-invalid' | 'no-solution' | 'missing' }.
 */
export function stateFrom(given, p) {
  const keys = KEYS.filter((k) => Number.isFinite(given?.[k]));
  if (keys.length < 2) return { error: 'missing' };
  const [a, b] = keys.slice(0, 2);
  const has = (k) => k === a || k === b;
  const val = (k) => given[k];
  const done = (t, x) => (t == null || x == null || !Number.isFinite(t) || !Number.isFinite(x) || x < 0 ? { error: 'no-solution' } : { state: stateTX(t, x, p) });
  if ((has('x') && has('td')) || (has('h') && has('tw'))) return { error: 'pair-invalid' };
  if (has('phi') && !(val('phi') > 0)) {
    if (has('t')) return done(val('t'), 0);
    if (has('x') || has('td')) return { error: 'no-solution' };
  }

  // water content known: solve the temperature from the other property
  if (has('x') || has('td')) {
    const x = has('x') ? val('x') : xSat(val('td'), p);
    if (!Number.isFinite(x)) return { error: 'no-solution' };
    const other = keys.find((k) => k !== 'x' && k !== 'td');
    if (other === 't') return done(val('t'), x);
    if (other === 'phi') {
      if (val('phi') > 1) return { error: 'no-solution' };
      const target = pdFromX(x, p) / val('phi');
      return done(bisect((t) => pws(t, p) - target, T_LOW, T_HIGH), x);
    }
    const t = bisect((tt) => property(other, tt, x, p) - val(other), T_LOW, T_HIGH);
    return done(t, x);
  }

  // temperature known: solve the water content
  if (has('t')) {
    const t = val('t');
    const other = keys.find((k) => k !== 't');
    if (other === 'phi') {
      if (val('phi') > 1) return { error: 'no-solution' };
      return done(t, xPhi(t, val('phi'), p));
    }
    // unsaturated first, then the fog region (h falls with x there below 0 °C)
    const f = (xx) => property(other, t, xx, p) - val(other);
    const xs = Math.min(xSat(t, p), X_MAX);
    return done(t, bisect(f, 0, xs) ?? bisect(f, xs, X_MAX));
  }

  // phi with h or tw: x follows from t on the phi curve
  if (has('phi')) {
    const phi = val('phi');
    if (phi > 1) return { error: 'no-solution' };
    const other = keys.find((k) => k !== 'phi');
    const t = bisect((tt) => {
      const x = xPhi(tt, phi, p);
      const v = Number.isFinite(x) ? property(other, tt, x, p) : null;
      return v == null ? 1e9 : v - val(other);
    }, T_LOW, T_HIGH);
    return done(t, t == null ? null : xPhi(t, phi, p));
  }
  return { error: 'pair-invalid' };
}

/** Value of `key` in user units (phi in %). */
export function userValue(state, key) {
  const v = state?.[key];
  if (v == null) return null;
  return key === 'phi' ? v * 100 : v;
}
