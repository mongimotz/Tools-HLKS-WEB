// SPDX-License-Identifier: AGPL-3.0-or-later
// User-facing (German) texts shared by the page, the PDF report and the CSV export. No DOM.

import { fmt } from '../../lib/core/format.js';

export const TOOL_NAME = 'h,x-Diagramm';

export const BLOCK_LABELS = {
  point: 'Punkt',
  heater: 'Lufterhitzer',
  cooler: 'Luftkühler',
  steam: 'Dampfbefeuchter',
  adiabatic: 'Adiabatbefeuchter',
  hrv: 'WRG',
  mix: 'Mischung',
  fan: 'Ventilator',
  line: 'Verbindung',
};

/** Order of the + menu. */
export const MENU_ORDER = ['point', 'hrv', 'mix', 'heater', 'cooler', 'steam', 'adiabatic', 'fan', 'line'];

/** Properties of a state: symbol (HTML), plain symbol (PDF, CSV), unit, decimals. */
export const KEY_INFO = {
  t: { html: '<i>t</i>', plain: 't', unit: '°C', digits: 1, step: 0.1 },
  phi: { html: 'φ', plain: 'φ', unit: '%', digits: 1, step: 1 },
  x: { html: '<i>x</i>', plain: 'x', unit: 'g/kg', digits: 2, step: 0.1 },
  h: { html: '<i>h</i>', plain: 'h', unit: 'kJ/kg', digits: 1, step: 0.1 },
  td: { html: '<i>t</i><sub>τ</sub>', plain: 'tτ', unit: '°C', digits: 1, step: 0.1 },
  tw: { html: '<i>t</i><sub>f</sub>', plain: 'tf', unit: '°C', digits: 1, step: 0.1 },
};

/** Mode buttons of the process blocks. */
export const MODE_LABELS = {
  heater: { t: 't', q: 'Q' },
  cooler: { t: 't', q: 'Q' },
  steam: { x: 'x', phi: 'φ', m: 'ṁ' },
  adiabatic: { eta: 'η', x: 'x', phi: 'φ' },
  hrv: { sensible: 'sensibel', enthalpy: 'Enthalpie' },
  mix: { share: 'Anteil', flows: 'V̇' },
};

/** Second input of two-input blocks. */
export const SECOND_INPUT = { hrv: 'Abluft', mix: 'mit', line: 'nach' };
export const FIRST_INPUT = { hrv: 'Aussenluft', mix: 'von', line: 'von' };

export const SEVERITY_LABELS = { error: 'Fehler', warning: 'Warnung', info: 'Hinweis' };

/** Short German message for a calculation issue. */
export function issueText(issue) {
  const v = (d, unit) => (issue.value == null ? '' : `${fmt(issue.value, d)} ${unit}`);
  const unit = issue.unit ?? '°C';
  switch (issue.code) {
    case 'missing': return 'Zwei Werte nötig';
    case 'pair-invalid': return 'Wertepaar legt keinen Zustand fest';
    case 'no-solution': return 'Kein Zustand zu diesen Werten';
    case 'value-missing': return 'Wert fehlt';
    case 'flow-missing': return issue.severity === 'info' ? 'V̇ fehlt, keine Leistung' : 'V̇ fehlt';
    case 'below-inlet': return `Ziel ${fmt(issue.value, 1)} ${unit} unter Eintritt ${fmt(issue.limit, 1)} ${unit}`;
    case 'above-inlet': return `Ziel ${fmt(issue.value, 1)} °C über Eintritt ${fmt(issue.limit, 1)} °C`;
    case 'below-surface': return `Ziel ${fmt(issue.value, 1)} °C unter Kühleroberfläche ${fmt(issue.limit, 1)} °C`;
    case 'not-reached': return 'Ziel nicht erreichbar';
    case 'share-range': return 'Anteil 0 bis 100 %';
    case 'input-missing': return 'Eintritt fehlt';
    case 'fog': return `Nebelgebiet, Wasser ${v(2, 'g/kg')}`;
    case 'outside': return 'Ausserhalb des Diagramms';
    case 'frost': return `Fortluft ${v(1, '°C')}, Vereisung`;
    case 'frost-limit': return `Frostgrenze, Φt wirksam ${v(0, '%')}`;
    default: return issue.code;
  }
}

/** Short summary for the notice bar. */
export const ISSUE_SUMMARIES = {
  fog: 'Nebelgebiet',
  frost: 'WRG: Vereisung',
  'frost-limit': 'WRG: Frostgrenze',
  outside: 'Punkt ausserhalb des Diagramms',
  'flow-missing': 'V̇ fehlt',
};
