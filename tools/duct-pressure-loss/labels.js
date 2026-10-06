// User-facing (German) texts shared by the page and the PDF report.

import { fmt } from '../../lib/core/format.js';

export const TOOL_NAME = 'Druckverlust Lüftung';

export const METHOD_LABELS = {
  colebrook: 'Colebrook-White (iterativ)',
  churchill: 'Churchill (alle Strömungsbereiche)',
  haaland: 'Haaland (explizit)',
  swameeJain: 'Swamee-Jain (explizit)',
  zanke: 'Zanke (wie Excel-Vorlage)',
};

export const DIRECTION_LABELS = {
  supply: 'Ventilator → Auslass (Zuluft, Fortluft: Überdruck)',
  extract: 'Einlass → Ventilator (Abluft, Aussenluft: Unterdruck)',
};

export const DIRECTION_SHORT = { supply: 'Ventilator → Auslass', extract: 'Einlass → Ventilator' };

export const GROUP_LABELS = { round: 'Rund', rect: 'Eckig', any: 'Allgemein' };

export const SEVERITY_LABELS = { error: 'Fehler', warning: 'Warnung', info: 'Hinweis' };

/** German sentence for a calculation issue. `nr` is the section number shown to the user. */
export function issueText(issue, nr) {
  const at = nr ? `Teilstrecke ${nr}: ` : '';
  switch (issue.code) {
    case 'flow-missing': return `${at}Volumenstrom fehlt.`;
    case 'geometry-missing': return `${at}Abmessungen fehlen.`;
    case 'material-missing': return `${at}Material fehlt oder ist nicht im Katalog.`;
    case 'fitting-missing': return `${at}Ein Formstück ist nicht mehr im Katalog.`;
    case 'parent-missing': return `${at}Die gewählte Vorgänger-Teilstrecke existiert nicht mehr. Sie wird am Ventilator angehängt.`;
    case 'cycle': return `${at}Der Strang bildet einen Kreis. Vorgänger prüfen.`;
    case 'transition-no-parent': return `${at}Querschnittsänderung braucht eine berechnete Vorgänger-Teilstrecke.`;
    case 'velocity-high': return `${at}Geschwindigkeit ${fmt(issue.value, 2)} m/s liegt über dem Grenzwert ${fmt(issue.limit, 1)} m/s.`;
    case 'aspect-high': return `${at}Seitenverhältnis ${fmt(issue.value, 1)} : 1 liegt über ${fmt(issue.limit, 1)} : 1.`;
    case 'laminar': return `${at}Laminare Strömung (Re = ${fmt(issue.value, 0)}).`;
    case 'transition-regime': return `${at}Übergangsbereich laminar/turbulent (Re = ${fmt(issue.value, 0)}). λ ist hier unsicher.`;
    case 'flow-continuity': return `${at}Die abgehenden Teilstrecken führen zusammen ${fmt(issue.value, 0)} m³/h, mehr als die ${fmt(issue.limit, 0)} m³/h dieser Teilstrecke.`;
    case 'fan-insufficient': return `Der erforderliche Druck von ${fmt(issue.value, 0)} Pa ist grösser als die verfügbaren ${fmt(issue.limit, 0)} Pa.`;
    default: return `${at}${issue.code}`;
  }
}
