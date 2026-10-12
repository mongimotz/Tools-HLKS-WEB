// SPDX-License-Identifier: AGPL-3.0-or-later
// Coefficients, limits and rules for the silencer calculation, each with its source.
// See docs/silencer-data.md. Generated 2026-10-12.

export const DATA_VERSION = '2026-10-12';

/** A-weighting per octave 63 ... 8000 Hz [dB] (IEC 61672-1). */
export const A_WEIGHTING = [-26.2, -16.1, -8.6, -3.2, 0, 1.2, 1.0, -1.1];

/**
 * Pressure loss coefficient ζ of splitter silencers, Δp = ζ·ρ/2·v_s², Λ = d/s:
 *   ζ = a·lg(Λ) + b·L/s + c
 * Ackermann (via Walter): rounded or square leading edge, about 33 % above Trox tables.
 * Own fit on Trox tables: ±13 % rms. Use only for geometries without table values.
 */
export const ZETA_SPLITTER = { ackermannRound: { a: 0.75, b: 0.025, c: 0.3, source: 'Q10' }, ackermannSquare: { a: 0.65, b: 0.025, c: 0.53, source: 'Q10' }, troxFit: { a: 1.062, b: 0.0123, c: 0.215, source: 'Q01', kind: 'own fit' } };

/** Δp factor for the installation situation (splitter silencers). */
export const INSTALL_FACTORS = { duct: 1.0, freeInlet: 1.1, freeOutlet: 1.3, source: 'Q04' };

/** Planning limits. Warnings in the tool, not hard stops. */
export const LIMITS = { vGapMax: { value: 20, unit: 'm/s', source: 'Q01', note: 'Abrieb Glasseide' }, vGapPlan: { value: 12, unit: 'm/s', source: 'Q11' }, dpPerSilencer: { value: 100, unit: 'Pa', source: 'Q11', note: '80 bis 100 Pa' }, flowNoiseMargin: { value: 10, unit: 'dB', source: 'Q08', note: 'Strömungsgeräusch mind. 10 dB unter dem Pegel nach dem Schalldämpfer' }, insertionLossCap: { value: 50, unit: 'dB', source: 'Q04', note: 'über 50 dB je Oktave mit einem Schalldämpfer nicht erreichbar' }, troxGapMin: { value: 40, unit: 'mm', source: 'Q01', note: 'und mind. 0.25·d' }, troxGapMaxFactor: { value: 2, unit: '·d', source: 'Q01' }, beamingEta: { value: 1.5, unit: '-', source: 'Q10', note: 'Durchstrahlung ab η = s·f/c > 1.5' } };
