// User-facing (German) texts shared by the page and the PDF report.
// Short labels only; explanations belong in docs/ (see docs/DESIGN.md, "Principles").

import { fmt } from '../../lib/core/format.js';

export const TOOL_NAME = 'Druckverlust Lüftung';

export const DIRECTION_LABELS = {
  supply: 'Ventilator → Auslass',
  extract: 'Einlass → Ventilator',
};

export const GROUP_LABELS = { round: 'Rund', rect: 'Eckig', any: 'Allgemein' };

export const SEVERITY_LABELS = { error: 'Fehler', warning: 'Warnung', info: 'Hinweis' };

/** Short German message for a calculation issue. `nr` is the section number shown to the user. */
export function issueText(issue, nr) {
  const at = nr ? `TS ${nr}: ` : '';
  switch (issue.code) {
    case 'flow-missing': return `${at}V̇ fehlt`;
    case 'geometry-missing': return `${at}Abmessungen fehlen`;
    case 'material-missing': return `${at}Material fehlt`;
    case 'fitting-missing': return `${at}Formstück nicht im Katalog`;
    case 'parent-missing': return `${at}Vorgänger fehlt, am Ventilator angehängt`;
    case 'cycle': return `${at}Vorgänger bilden einen Kreis`;
    case 'transition-no-parent': return `${at}Querschnittsänderung ohne berechneten Vorgänger`;
    case 'velocity-high': return `${at}v = ${fmt(issue.value, 2)} m/s > ${fmt(issue.limit, 1)} m/s`;
    case 'aspect-high': return `${at}Seitenverhältnis ${fmt(issue.value, 1)} : 1 > ${fmt(issue.limit, 1)} : 1`;
    case 'laminar': return `${at}laminar, Re = ${fmt(issue.value, 0)}`;
    case 'transition-regime': return `${at}Übergangsbereich, Re = ${fmt(issue.value, 0)}`;
    case 'flow-continuity': return `${at}Σ V̇ Abzweige ${fmt(issue.value, 0)} m³/h > ${fmt(issue.limit, 0)} m³/h`;
    case 'fan-insufficient': return `Erforderlich ${fmt(issue.value, 0)} Pa > verfügbar ${fmt(issue.limit, 0)} Pa`;
    default: return `${at}${issue.code}`;
  }
}
