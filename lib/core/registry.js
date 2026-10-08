// Tool registry. The start page lists these per discipline; imports use it to find the right tool for a file.
// `path` is relative to the site root. Names are user-facing (German); descriptions live in README.md.

/** Disciplines in HLKS order. The start page draws one network per discipline. */
export const GROUPS = [
  { id: 'heating', name: 'Heizung' },
  { id: 'ventilation', name: 'Lüftung' },
  { id: 'cooling', name: 'Klima' },
  { id: 'plumbing', name: 'Sanitär' },
];

export const TOOLS = [
  { id: 'heat-load', group: 'heating', name: 'Heizlast', path: 'tools/heat-load/', status: 'planned' },
  { id: 'heating-pipes', group: 'heating', name: 'Rohrnetz Heizung', path: 'tools/heating-pipes/', status: 'planned' },
  { id: 'expansion-vessel', group: 'heating', name: 'Ausdehnungsgefäss', path: 'tools/expansion-vessel/', status: 'planned' },
  { id: 'insulation', group: 'heating', name: 'Dämmung', path: 'tools/insulation/', status: 'planned' },

  { id: 'duct-sizing', group: 'ventilation', name: 'Kanalrechner', path: 'tools/duct-sizing/', status: 'planned' },
  { id: 'duct-pressure-loss', group: 'ventilation', name: 'Druckverlust Lüftung', path: 'tools/duct-pressure-loss/', status: 'ready' },
  { id: 'silencer', group: 'ventilation', name: 'Schalldämpfer', path: 'tools/silencer/', status: 'planned' },
  { id: 'air-handling-unit', group: 'ventilation', name: 'Monoblock', path: 'tools/air-handling-unit/', status: 'planned' },

  { id: 'cooling-load', group: 'cooling', name: 'Kühllast-Check', path: 'tools/cooling-load/', status: 'planned' },
  { id: 'psychrometrics', group: 'cooling', name: 'h,x-Diagramm', path: 'tools/psychrometrics/', status: 'planned' },
  { id: 'refrigerant', group: 'cooling', name: 'Kältemittel', path: 'tools/refrigerant/', status: 'planned' },

  { id: 'drinking-water', group: 'plumbing', name: 'Trinkwasser', path: 'tools/drinking-water/', status: 'planned' },
  { id: 'hot-water', group: 'plumbing', name: 'Warmwasser', path: 'tools/hot-water/', status: 'planned' },
  { id: 'drainage', group: 'plumbing', name: 'Entwässerung', path: 'tools/drainage/', status: 'planned' },
];

/** Site root, derived from this module's location (works on GitHub Pages sub-paths). */
export const ROOT_URL = new URL('../../', import.meta.url);

export function findTool(id) {
  return TOOLS.find((t) => t.id === id) ?? null;
}

export function toolUrl(id) {
  const tool = findTool(id);
  return tool ? new URL(tool.path, ROOT_URL).href : null;
}
