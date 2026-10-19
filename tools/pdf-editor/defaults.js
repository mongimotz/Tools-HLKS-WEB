// SPDX-License-Identifier: AGPL-3.0-or-later
// Settings of the PDF-Editor: a browser draft only (the edited PDF is the saved result). No DOM.
// normalizeSettings never throws and is idempotent (normalize(normalize(x)) equals normalize(x)).

export const TOOL_ID = 'pdf-editor';
export const SETTINGS_VERSION = 1;

export const DATE_FORMATS = ['dd.mm.yyyy', 'yyyy-mm-dd'];
/** Plan scales 1:n offered by the measurement panel. */
export const SCALES = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
/** Annotation colour slots: --annot-1 … --annot-8 in tokens.css (9 is white). */
export const COLOR_SLOTS = 9;
export const COLOR_ROLES = ['markup', 'measure', 'highlight', 'text'];
export const STAMP_FRAMES = ['rect', 'round', 'none'];
export const MAX_STAMPS = 40;

export function defaultSettings() {
  return {
    version: SETTINGS_VERSION,
    name: '',
    dateFormat: DATE_FORMATS[0],
    scales: [...SCALES],
    colors: { markup: 1, measure: 2, highlight: 4, text: 5 },
    stamps: [],
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) : '');
const slot = (v, fallback) => (Number.isInteger(v) && v >= 1 && v <= COLOR_SLOTS ? v : fallback);

/** A valid settings object from anything (stored draft, older version, foreign data). */
export function normalizeSettings(raw) {
  const d = defaultSettings();
  if (!isObj(raw)) return d;
  const scales = Array.isArray(raw.scales)
    ? [...new Set(raw.scales.map(Number).filter((n) => Number.isFinite(n) && n > 0 && n <= 100000).map((n) => Math.round(n * 1000) / 1000))].sort((a, b) => a - b)
    : d.scales;
  const colors = isObj(raw.colors) ? raw.colors : {};
  const stamps = Array.isArray(raw.stamps) ? raw.stamps : [];
  const seen = new Set();
  return {
    version: SETTINGS_VERSION,
    name: text(raw.name, 80),
    dateFormat: DATE_FORMATS.includes(raw.dateFormat) ? raw.dateFormat : d.dateFormat,
    scales: scales.length ? scales : d.scales,
    colors: Object.fromEntries(COLOR_ROLES.map((role) => [role, slot(colors[role], d.colors[role])])),
    stamps: stamps
      .filter(isObj)
      .map((s) => ({
        id: text(s.id, 40).replace(/[^\w-]/g, '') || null,
        text: text(s.text, 60),
        color: slot(s.color, 1),
        frame: STAMP_FRAMES.includes(s.frame) ? s.frame : STAMP_FRAMES[0],
      }))
      .filter((s) => s.id && s.text && !seen.has(s.id) && seen.add(s.id))
      .slice(0, MAX_STAMPS),
  };
}

/** Date as the settings format it: `dd.mm.yyyy` (Swiss) or `yyyy-mm-dd` (ISO). */
export function formatDate(date, format = DATE_FORMATS[0]) {
  const pad = (n) => String(n).padStart(2, '0');
  const [y, m, d] = [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())];
  return format === 'yyyy-mm-dd' ? `${y}-${m}-${d}` : `${d}.${m}.${y}`;
}
