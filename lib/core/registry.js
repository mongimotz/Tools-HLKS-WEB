// Tool registry. The start page lists these; imports use it to find the right tool for a file.
// `path` is relative to the site root. Names and summaries are user-facing (German).

export const TOOLS = [
  {
    id: 'duct-sizing',
    name: 'Kanalrechner',
    summary: 'Kanal- und Rohrdimensionen aus Volumenstrom und Geschwindigkeit.',
    path: 'tools/duct-sizing/',
    status: 'planned',
  },
  {
    id: 'duct-pressure-loss',
    name: 'Druckverlust Lüftung',
    summary: 'Teilstrecken mit Formstücken und Einbauteilen, kritischer Strang und Drosselbedarf.',
    path: 'tools/duct-pressure-loss/',
    status: 'ready',
  },
  {
    id: 'silencer',
    name: 'Schalldämpfer',
    summary: 'Auslegung mit Schallpegelberechnung im Oktavband.',
    path: 'tools/silencer/',
    status: 'planned',
  },
  {
    id: 'air-handling-unit',
    name: 'Monoblock',
    summary: 'Ventilatorleistung, Heiz- und Kühlleistung, Befeuchtung, Filter.',
    path: 'tools/air-handling-unit/',
    status: 'planned',
  },
  {
    id: 'insulation',
    name: 'Dämmung',
    summary: 'Abschätzung der Dämmstärke für Leitungen und Kanäle.',
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
