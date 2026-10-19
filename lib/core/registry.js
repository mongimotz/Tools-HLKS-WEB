// SPDX-License-Identifier: AGPL-3.0-or-later
// Tool registry. The start page lists these per discipline; imports use it to find the right tool for a file.
// `path` is relative to the site root. Names are user-facing (German); descriptions live in README.md.

/** Disciplines in HLKS order. The start page draws one network per discipline. */
export const GROUPS = [
  { id: 'heating', name: 'Heizung' },
  { id: 'ventilation', name: 'Lüftung' },
  { id: 'cooling', name: 'Klima' },
  { id: 'plumbing', name: 'Sanitär' },
];

/** Tools without a discipline: a tile each, in a section without title at the end of the start page. */
export const GENERAL = 'general';

const PLACEHOLDER_COUNT = 3;

/** Numbered slots without promised tool names or destinations. */
function placeholders(group, count = PLACEHOLDER_COUNT) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${group}-placeholder-${index + 1}`,
    group,
    name: `Platzhalter ${index + 1}`,
    status: 'placeholder',
  }));
}

export const TOOLS = [
  { id: 'pdf-editor', group: GENERAL, name: 'PDF-Editor', path: 'tools/pdf-editor/', status: 'ready', icon: 'pdfEdit' },
  { id: 'pdf-to-dxf', group: GENERAL, name: 'PDF → DXF', path: 'tools/pdf-to-dxf/', status: 'ready', icon: 'pdfToDxf' },

  ...placeholders('heating'),

  { id: 'duct-sizing', group: 'ventilation', name: 'Kanalrechner', path: 'tools/duct-sizing/', status: 'ready' },
  { id: 'duct-pressure-loss', group: 'ventilation', name: 'Druckverlust Lüftung', path: 'tools/duct-pressure-loss/', status: 'ready' },
  { id: 'silencer', group: 'ventilation', name: 'Schalldämpfer', path: 'tools/silencer/', status: 'ready' },

  ...placeholders('cooling'),

  ...placeholders('plumbing'),
];

/** Site root, derived from this module's location (works on GitHub Pages sub-paths). */
export const ROOT_URL = new URL('../../', import.meta.url);

export function findTool(id) {
  return TOOLS.find((t) => t.id === id) ?? null;
}

export function toolUrl(id) {
  const tool = findTool(id);
  return tool?.path ? new URL(tool.path, ROOT_URL).href : null;
}
