// SPDX-License-Identifier: AGPL-3.0-or-later
// Air properties and the Darcy friction factor, shared by the ventilation tools. Pure functions, no DOM.
// Units: temperature in °C, altitude in m, pressure in Pa, relative humidity in %.

export const LAMINAR_LIMIT = 2320;
export const TURBULENT_LIMIT = 4000;

const R_DRY_AIR = 287.058; // J/(kg·K)
const R_VAPOUR = 461.523; // J/(kg·K)

/** Barometric pressure of the ICAO standard atmosphere [Pa] at altitude [m]. */
export function atmosphericPressure(altitude) {
  return 101325 * Math.pow(1 - 2.25577e-5 * altitude, 5.25588);
}

/** Saturation vapour pressure over water [Pa], Magnus formula (Sonntag 1990). */
export function saturationVapourPressure(tC) {
  return 611.2 * Math.exp((17.62 * tC) / (243.12 + tC));
}

/** Density of moist air [kg/m³]. relHumidity in %. */
export function airDensity(tC, pressure, relHumidity = 0) {
  const T = tC + 273.15;
  const phi = Math.min(100, Math.max(0, relHumidity || 0)) / 100;
  const pv = Math.min(phi * saturationVapourPressure(tC), pressure);
  return (pressure - pv) / (R_DRY_AIR * T) + pv / (R_VAPOUR * T);
}

/** Dynamic viscosity of air [Pa·s], Sutherland. */
export function dynamicViscosity(tC) {
  const T = tC + 273.15;
  return (1.458e-6 * Math.pow(T, 1.5)) / (T + 110.4);
}

export function airState({ temperature, altitude, humidity }) {
  const pressure = atmosphericPressure(altitude || 0);
  const density = airDensity(temperature, pressure, humidity);
  const viscosity = dynamicViscosity(temperature);
  return { temperature, pressure, density, viscosity, kinematicViscosity: viscosity / density };
}

/**
 * Darcy friction factor λ for Reynolds number Re and relative roughness rr = k/d.
 * Laminar (Re < 2320): 64/Re. Otherwise Colebrook-White, solved iteratively
 * (1/√λ = −2 log10(k/(3.71 d) + 2.51/(Re √λ)), fixed point on x = 1/√λ, Haaland as start value).
 */
export function frictionFactor(Re, rr) {
  if (!(Re > 0)) return NaN;
  if (Re < LAMINAR_LIMIT) return 64 / Re;
  rr = Math.max(0, rr || 0);
  let x = -1.8 * Math.log10(Math.pow(rr / 3.7, 1.11) + 6.9 / Re);
  for (let i = 0; i < 100; i++) {
    const next = -2 * Math.log10(rr / 3.71 + (2.51 * x) / Re);
    if (Math.abs(next - x) < 1e-12) return 1 / (next * next);
    x = next;
  }
  return 1 / (x * x);
}
