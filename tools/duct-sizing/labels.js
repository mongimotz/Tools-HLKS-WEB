// User-facing (German) texts shared by the page, the PDF report and the CSV export.
// Short labels only; explanations belong in docs/ (see docs/DESIGN.md, "Principles").

import { fmt } from '../../lib/core/format.js';

export const TOOL_NAME = 'Kanalrechner';

export const SHAPE_LABELS = { round: 'rund', rect: 'eckig', oval: 'oval' };

/** Segmented control in the input panel. */
export const SHAPE_BUTTONS = { round: 'Rund', rect: 'Eckig', oval: 'Oval' };

/** Mode names (input panel, PDF, CSV). For round ducts "size" means the diameter, otherwise the aspect ratio. */
export function modeLabel(shape, mode) {
  if (mode === 'check') return 'Prüfen';
  if (mode === 'height') return 'Höhe';
  return shape === 'round' ? 'Auslegen' : 'Verhältnis';
}

export const SEVERITY_LABELS = { error: 'Fehler', warning: 'Warnung', info: 'Hinweis' };

/** Aspect ratio as in SIA 382/1 table 50: 1/2, 1/3.7. */
export function ratioText(n) {
  if (!(n > 0)) return '–';
  const r = Math.round(n * 10) / 10;
  return `1/${fmt(r, Number.isInteger(r) ? 0 : 1)}`;
}

/** Size of a duct: "Ø 450" or "800 × 400" (B × H). */
export function sizeText(shape, dims) {
  if (!dims) return '–';
  if (shape === 'round') return dims.diameter > 0 ? `Ø ${fmt(dims.diameter, 0)}` : '–';
  return dims.width > 0 && dims.height > 0 ? `${fmt(dims.width, 0)} × ${fmt(dims.height, 0)}` : '–';
}

/** Short German message for a calculation issue. `nr` is the position number shown to the user. */
export function issueText(issue, nr) {
  const at = nr ? `Pos. ${nr}: ` : '';
  switch (issue.code) {
    case 'flow-missing': return `${at}V̇ fehlt`;
    case 'dims-missing': return `${at}Abmessungen fehlen`;
    case 'ratio-missing': return `${at}Seitenverhältnis fehlt`;
    case 'limit-missing': return `${at}Grenzgeschwindigkeit fehlt (Tab. 49)`;
    case 'factor-missing': return `${at}Reduktionsfaktor fehlt (Tab. 50)`;
    case 'oval-width': return `${at}oval: B < H`;
    case 'oval-round': return `${at}H zu gross, Querschnitt rund`;
    case 'not-reached': return `${at}keine Abmessung gefunden`;
    case 'series-exceeded': return `${at}Ø ${fmt(issue.value, 0)} über der Normreihe`;
    case 'velocity-high': {
      const need = issue.needed ? `, nötig ${issue.shape === 'round' ? sizeText('round', issue.needed) : `B ≥ ${fmt(issue.needed.width, 0)}`}` : '';
      return `${at}v = ${fmt(issue.value, 2)} m/s > ${fmt(issue.limit, 2)} m/s${need}`;
    }
    case 'ratio-high': return `${at}Seitenverhältnis ${ratioText(issue.value)} schlanker als ${ratioText(issue.limit)}${issue.clamped != null ? ` | f aus Tab. 50 für ${ratioText(issue.clamped)}` : ''}`;
    case 'ratio-outside-table': return `${at}Seitenverhältnis ${ratioText(issue.value)} ausserhalb Tab. 50, f für ${ratioText(issue.limit)}`;
    case 'hours-missing': return `Volllaststunden fehlen, Spalte ${fmt(issue.limit, 0)} h/a`;
    case 'hours-high': return `Volllaststunden ${fmt(issue.value, 0)} h/a > ${fmt(issue.limit, 0)} h/a, Spalte ${fmt(issue.limit, 0)} h/a`;
    case 'stages-long': return `Betriebsstufen: Σ t = ${fmt(issue.value, 0)} h/a > ${fmt(issue.limit, 0)} h/a`;
    default: return `${at}${issue.code}`;
  }
}
