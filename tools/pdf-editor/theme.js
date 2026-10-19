// SPDX-License-Identifier: AGPL-3.0-or-later
// The site's look inside the viewer. The chrome colours map in style.css (--epdf-* on the element, from the
// tokens, so they follow Hell / Dunkel by themselves); this module adds what CSS cannot reach: the viewer's
// light/dark preference, the annotation colours (--annot-* in tokens.css) as swatches and tool defaults,
// IBM Plex Sans for text annotations, Swiss number formats for measurements, own tools and their icons.
// toolDefinitions(), swissMeasure() and the constants are pure (Node tests).

import { COLOR_ROLES } from './defaults.js';
import { TOOL_LABELS } from './labels.js';

/** Fonts the engine registers for text annotations: the site's PDF fonts (subset, see build-fonts.py). */
export function viewerFonts(base = import.meta.url) {
  return [
    { key: 'plex-sans', familyName: 'IBM Plex Sans', weight: 400, url: new URL('../../assets/fonts/pdf/sans-400.ttf', base).href },
    { key: 'plex-sans-semibold', familyName: 'IBM Plex Sans SemiBold', weight: 600, url: new URL('../../assets/fonts/pdf/sans-600.ttf', base).href },
  ];
}

export const TEXT_FONT = 'plex-sans';
/** Stroke width of shapes and lines in pt (0.35 mm, a common plan pen). */
export const LINE_WIDTH = 1;

/** Own icons for the viewer (24 × 24 stroke paths, like its own). */
export const VIEWER_ICONS = {
  cloud: ['M4 6a2 2 0 0 1 4 0a2 2 0 0 1 4 0a2 2 0 0 1 4 0a2 2 0 0 1 4 0a2 2 0 0 1 0 4a2 2 0 0 1 0 4a2 2 0 0 1 0 4a2 2 0 0 1-4 0a2 2 0 0 1-4 0a2 2 0 0 1-4 0a2 2 0 0 1-4 0a2 2 0 0 1 0-4a2 2 0 0 1 0-4a2 2 0 0 1 0-4z'],
  whiteout: ['M4 7h16v10H4z', 'M7 4v3M12 4v3M17 4v3M7 17v3M12 17v3M17 17v3'],
  symbols: ['M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16z', 'M7 8.5l10 3.5l-10 3.5'],
  pageUp: ['M12 19V5', 'M6 11l6-6 6 6'],
  pageDown: ['M12 5v14', 'M6 13l6 6 6-6'],
  pageBlank: ['M6 3h8l4 4v14H6z', 'M14 3v4h4', 'M12 11v6M9 14h6'],
};

/** Annotation colours from tokens.css: [annot-1, …, annot-9]. */
export function readAnnotColors(root = document.documentElement) {
  const style = getComputedStyle(root);
  const out = [];
  for (let i = 1; ; i++) {
    const v = style.getPropertyValue(`--annot-${i}`).trim().toLowerCase();
    if (!v) break;
    out.push(v);
  }
  return out;
}

/** The scheme the site shows now: the theme button's choice, else the system setting. */
export function currentScheme() {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Call `onChange(scheme)` whenever the theme button or the system setting changes the scheme. */
export function followScheme(onChange) {
  let last = currentScheme();
  const check = () => {
    const now = currentScheme();
    if (now !== last) onChange((last = now));
  };
  new MutationObserver(check).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', check);
}

/**
 * Tool defaults and own tools for the annotation plugin (`plugins.annotation.tools`).
 * colors: [annot-1 …]; roles: settings.colors ({ markup, measure, highlight, text } → slot 1…9).
 */
export function toolDefinitions(colors, roles) {
  const pick = (slot) => colors[slot - 1] ?? colors[0];
  const c = Object.fromEntries(COLOR_ROLES.map((role) => [role, pick(roles[role])]));
  const white = colors[8] ?? '#ffffff';
  const stroke = { color: c.markup, strokeWidth: LINE_WIDTH };
  const text = { fontFamily: TEXT_FONT, fontColor: c.text, fontSize: 10 };
  return [
    ...['square', 'circle', 'line', 'arrow', 'polygon', 'polyline'].map((id) => ({ id, defaults: { ...stroke } })),
    { id: 'ink', defaults: { color: c.markup, strokeWidth: 1.5 } },
    { id: 'ink-highlight', defaults: { color: c.highlight } },
    { id: 'highlight', defaults: { color: c.highlight } },
    { id: 'underline', defaults: { color: pick(2) } },
    { id: 'strikeout', defaults: { color: c.markup } },
    { id: 'squiggly', defaults: { color: pick(3) } },
    { id: 'free-text', defaults: { ...text, color: c.text, strokeWidth: 0 } }, // plain text on the plan, no frame
    { id: 'free-text-callout', defaults: { ...stroke, ...text } },
    { id: 'note', defaults: { color: c.highlight } },
    ...['distance', 'perimeter', 'area'].map((id) => ({ id, defaults: { color: c.measure, strokeWidth: LINE_WIDTH } })),
    { id: 'cloud', extends: 'polygon', defaults: { ...stroke, cloudyIntensity: 1 }, meta: { label: TOOL_LABELS.cloud, icon: 'cloud' } },
    { id: 'whiteout', extends: 'square', defaults: { color: white, interiorColor: white, strokeWidth: 0 }, meta: { label: TOOL_LABELS.whiteout, icon: 'whiteout' } },
  ];
}

/** Swiss number format for a page scale: 1’234.50 (thousands ’, decimals .). Returns null when nothing changes. */
export function swissMeasure(measure) {
  if (!measure) return null;
  let changed = false;
  const fix = (list) =>
    Array.isArray(list)
      ? list.map((f) => {
          if (f.thousands === '’' && (f.decimal ?? '.') === '.') return f;
          changed = true;
          return { ...f, thousands: '’', decimal: '.' };
        })
      : list;
  const out = { ...measure, x: fix(measure.x), y: fix(measure.y), distance: fix(measure.distance), area: fix(measure.area) };
  for (const k of ['y']) if (out[k] === undefined) delete out[k];
  return changed ? out : null;
}

/** The default page scale (1:1 in metres) in Swiss format. */
export function defaultMeasure() {
  const fmt = (unit, conversion) => [{ unit, conversion, precision: 100, thousands: '’', decimal: '.' }];
  return { subtype: 'rectilinear', ratio: '1:1', x: fmt('m', 0.0254 / 72), distance: fmt('m', 1), area: fmt('m²', 1) };
}

/** Plan scales as measurement presets: 1:n, 1 m on the plan is n m. */
export function scalePresets(scales) {
  return scales.map((n) => ({ id: `ch-${n}`, label: `1:${n}`, paper: 1, real: n, unit: 'm' }));
}
