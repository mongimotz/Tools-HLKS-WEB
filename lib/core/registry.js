// Tool registry. The start page lists these; imports use it to find the right tool for a file.
// `path` is relative to the site root. Names are user-facing (German); descriptions live in README.md.

export const TOOLS = [
  {
    id: 'duct-sizing',
    name: 'Kanalrechner',
    path: 'tools/duct-sizing/',
    status: 'planned',
  },
  {
    id: 'duct-pressure-loss',
    name: 'Druckverlust Lüftung',
    path: 'tools/duct-pressure-loss/',
    status: 'ready',
  },
  {
    id: 'silencer',
    name: 'Schalldämpfer',
    path: 'tools/silencer/',
    status: 'planned',
  },
  {
    id: 'air-handling-unit',
    name: 'Monoblock',
    path: 'tools/air-handling-unit/',
    status: 'planned',
  },
  {
    id: 'insulation',
    name: 'Dämmung',
    path: 'tools/insulation/',
    status: 'planned',
  },
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
