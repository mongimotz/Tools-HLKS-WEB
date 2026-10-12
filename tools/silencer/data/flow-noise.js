// Flow-generated noise (Strömungsgeräusch) of silencers: source tables and own fits.
// See docs/silencer-data.md, section "Flow noise". Generated 2026-10-12.

export const DATA_VERSION = '2026-10-12';

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

/** Schako: L_W = L_W1 + K_F, correction K_F [dB] over duct cross-section A [m²] (≈ 10·lg A). L_W1 diagrams not included. */
export const SCHAKO_KF = { area: [0.053, 0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.8, 1, 1.5, 2, 2.5, 4.1, 8, 10], kf: [-13, -10, -7, -6, -5, -5, -3, -1, 0, 2, 3, 4, 6, 9, 10], source: 'Q06' };

/** Relative octave spectrum of flow noise: L_W,oct = L_WA + dl (Wildeboer SB/SKB, mean values). Sums back to L_WA within 0.1 dB. */
export const FLOW_NOISE_SPECTRUM = { dl: [4, -2, -1, -2, -5, -8, -14, -18], source: 'Q08' };
