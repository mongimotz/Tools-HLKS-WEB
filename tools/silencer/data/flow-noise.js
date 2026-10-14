// SPDX-License-Identifier: AGPL-3.0-or-later
// Flow-generated noise (Strömungsgeräusch) of silencers: source tables and own fits.
// See docs/silencer-data.md, section "Flow noise". Schako source audited 2026-10-14.

export const DATA_VERSION = '2026-10-14';

/**
 * Trox table: A-weighted sound power L_WA [dB(A)] over gap velocity v_s [m/s] for a face area B·H = 1 m².
 * Valid for Trox MSA, MKA, XSA, XKA, RKA, independent of splitter thickness.
 * Other face areas: + 10·lg(B·H / 1 m²). Interpolate linearly over lg(v_s).
 */
export const TROX_FLOW_NOISE = { v: [4, 6, 8, 10, 12, 14, 16, 18, 20], lwa: [21, 31, 38, 43, 48, 51, 55, 58, 60], refArea: 1, source: 'Q03' };

/** Own regression of TROX_FLOW_NOISE: L_WA = a + b·lg(v_s) + 10·lg(B·H). Max. deviation 0.5 dB. */
export const TROX_FLOW_NOISE_FIT = { a: -12.7, b: 56, source: 'Q03', kind: 'own fit' };

/** Back-calculated from VDI 2081 values (Kluth): L_WA = a + b·lg(v) + 10·lg(A_free). Plausibility only. */
export const VDI_FLOW_NOISE_FIT = { a: -24.6, b: 70, source: 'Q12', kind: 'own fit' };

/** Schako: L_W = L_W1 + K_F, correction K_F [dB] over duct cross-section A [m²] (≈ 10·lg A). */
export const SCHAKO_KF = { area: [0.053, 0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.8, 1, 1.5, 2, 2.5, 4.1, 8, 10], kf: [-13, -10, -7, -6, -5, -5, -3, -1, 0, 2, 3, 4, 6, 9, 10], source: 'Q06' };

/**
 * Schako MWS/MWK German technical documentation, 05.02.2026, pp. 14–15.
 * Octave sound-power curves L_W1 [dB], for duct face area 1 m², digitized to 1 dB.
 * The printed L_WA totals are retained separately: the diagram's rounded octave
 * shape is normalized to those totals in calc.js (notably 200/50 at 20 m/s).
 * No source interpolation law is stated. Interpolation in gap and log velocity,
 * and extension outside 10–20 m/s, are model assumptions documented in the method.
 * OB/LL and MB/LB share these source diagrams. There is no length distinction.
 */
export const SCHAKO_FLOW_NOISE = {
  source: 'Q06', refArea: 1, v: [10, 20], digitized: true,
  rows: [
    { d: 100, s: 50, lw: [[46, 46, 42, 42, 38, 33, 28, 23], [55, 55, 55, 55, 56, 53, 48, 43]], lwa: [43, 60], page: 14 },
    { d: 100, s: 100, lw: [[44, 44, 43, 43, 40, 35, 30, 25], [63, 63, 59, 56, 55, 53, 48, 43]], lwa: [45, 60], page: 14 },
    { d: 200, s: 50, lw: [[41, 42, 43, 44, 41, 36, 32, 28], [53, 54, 55, 55, 56, 52, 50, 48]], lwa: [46, 61], page: 15 },
    { d: 200, s: 100, lw: [[40, 40, 40, 39, 35, 28, 26, 24], [55, 55, 55, 55, 53, 50, 45, 40]], lwa: [40, 58], page: 15 },
    { d: 200, s: 200, lw: [[44, 44, 42, 39, 35, 30, 27, 24], [63, 63, 59, 56, 53, 50, 45, 41]], lwa: [41, 59], page: 15 },
  ],
};

/** Relative octave spectrum of flow noise: L_W,oct = L_WA + dl (Wildeboer SB/SKB, mean values). Sums back to L_WA within 0.1 dB. */
export const FLOW_NOISE_SPECTRUM = { dl: [4, -2, -1, -2, -5, -8, -14, -18], source: 'Q08' };
