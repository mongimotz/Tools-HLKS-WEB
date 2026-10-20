// SPDX-License-Identifier: AGPL-3.0-or-later
// State of the Klimastation tool: defaults, normalizeInputs, URL parameters. No DOM.
// The state is the tool's only saved data (browser draft and the page URL); there is no file export.

import { DEFAULT_WEIGHTS, inBounds } from './calc.js';

export const TOOL_ID = 'climate-station';
export const INPUT_VERSION = 1;

export const SITE_SOURCES = ['place', 'address', 'map', 'coords', 'link'];
export const HEIGHT_SOURCES = ['swisstopo', 'manual'];
export const WEIGHT_LIMITS = { height: [0, 100], region: [0, 500] };

export function defaultInputs() {
  return {
    site: null, // { e, n, label, detail, source, height, heightSource }
    station: null, // id chosen by hand; null = best of the ranking
    weights: { ...DEFAULT_WEIGHTS },
  };
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const text = (v, max = 160) => (typeof v === 'string' ? v.slice(0, max) : '');
const clamp = (v, [lo, hi], fallback) => (num(v) == null ? fallback : Math.min(hi, Math.max(lo, v)));

function normalizeSite(site) {
  if (!site || typeof site !== 'object') return null;
  const e = num(site.e);
  const n = num(site.n);
  if (e == null || n == null || !inBounds(e, n)) return null;
  const height = num(site.height);
  return {
    e: Math.round(e),
    n: Math.round(n),
    label: text(site.label),
    detail: text(site.detail),
    source: SITE_SOURCES.includes(site.source) ? site.source : 'map',
    height: height == null ? null : Math.round(Math.min(5000, Math.max(-500, height))),
    heightSource: height != null && HEIGHT_SOURCES.includes(site.heightSource) ? site.heightSource : null,
  };
}

/** Never throws; idempotent. */
export function normalizeInputs(raw) {
  const d = defaultInputs();
  if (!raw || typeof raw !== 'object') return d;
  const w = raw.weights && typeof raw.weights === 'object' ? raw.weights : {};
  return {
    site: normalizeSite(raw.site),
    station: typeof raw.station === 'string' && /^[A-Z]{3}$/.test(raw.station) ? raw.station : null,
    weights: {
      height: clamp(w.height, WEIGHT_LIMITS.height, d.weights.height),
      region: clamp(w.region, WEIGHT_LIMITS.region, d.weights.region),
    },
  };
}

/** Page URL parameters: ?e=2635345&n=1244330&h=396&st=BUS&q=Olten (h only when typed by hand). */
export function toUrlParams(inputs) {
  const p = new URLSearchParams();
  const s = inputs.site;
  if (!s) return p;
  p.set('e', String(s.e));
  p.set('n', String(s.n));
  if (s.heightSource === 'manual' && s.height != null) p.set('h', String(s.height));
  if (inputs.station) p.set('st', inputs.station);
  if (s.label) p.set('q', s.label);
  return p;
}

/** Inputs from URL parameters, or null when they hold no valid site. Weights come from `base`. */
export function fromUrlParams(params, base = defaultInputs()) {
  const p = new URLSearchParams(params);
  const e = Number(p.get('e'));
  const n = Number(p.get('n'));
  if (!p.has('e') || !p.has('n') || !inBounds(e, n)) return null;
  const h = p.has('h') ? Number(p.get('h')) : null;
  return normalizeInputs({
    ...base,
    site: { e, n, label: p.get('q') ?? '', detail: '', source: 'link', height: h, heightSource: h == null ? null : 'manual' },
    station: p.get('st'),
  });
}
