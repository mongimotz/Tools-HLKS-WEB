// SPDX-License-Identifier: AGPL-3.0-or-later
// SVG chart for the silencer tool: octave spectra along the sound path (source, after each silencer,
// receiver) and the target as a dashed line (the receiver spectrum moved to meet the target).

import { fmt } from '../../lib/core/format.js';
import { esc } from '../../lib/core/ui.js';
import { OCTAVE_LABELS } from './labels.js';

/**
 * series: [{ label, values: [8], target? }]. Colours follow --chart-1 … in order; the target is dashed,
 * so it is not told apart by colour alone.
 */
export function renderSpectra(el, series) {
  const finite = series.flatMap((s) => s.values.filter(Number.isFinite));
  if (!finite.length) {
    el.innerHTML = '';
    return;
  }
  const W = Math.max(320, el.clientWidth || 640);
  const H = 260;
  const m = { top: 22, right: 18, bottom: 34, left: 44 };
  const iw = W - m.left - m.right;
  const ih = H - m.top - m.bottom;
  const yMin = Math.floor(Math.min(...finite) / 10) * 10;
  const yMax = Math.max(yMin + 10, Math.ceil(Math.max(...finite) / 10) * 10);
  const sx = (i) => m.left + ((i + 0.5) / OCTAVE_LABELS.length) * iw;
  const sy = (v) => m.top + ih - ((v - yMin) / (yMax - yMin)) * ih;

  let svg = `<svg class="spectra" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Spektren je Oktave">`;
  for (let v = yMin; v <= yMax + 1e-9; v += 10) {
    svg += `<line class="grid" x1="${m.left}" x2="${W - m.right}" y1="${sy(v)}" y2="${sy(v)}"/>`;
    svg += `<text class="tick" x="${m.left - 8}" y="${sy(v) + 4}" text-anchor="end">${fmt(v, 0)}</text>`;
  }
  svg += `<text class="axis-title" x="${m.left - 8}" y="${m.top - 10}" text-anchor="end">dB</text>`;
  OCTAVE_LABELS.forEach((l, i) => {
    svg += `<text class="tick" x="${sx(i)}" y="${sy(yMin) + 16}" text-anchor="middle">${l}</text>`;
  });
  svg += `<text class="axis-title" x="${W - m.right}" y="${sy(yMin) + 30}" text-anchor="end">Hz</text>`;
  svg += `<line class="axis" x1="${m.left}" x2="${W - m.right}" y1="${sy(yMin)}" y2="${sy(yMin)}"/>`;

  let slot = 0;
  const classes = series.map((s) => (s.target ? 'target' : `s${(slot++ % 8) + 1}`));
  series.forEach((s, k) => {
    let d = '';
    let pen = false;
    s.values.forEach((v, i) => {
      if (!Number.isFinite(v)) {
        pen = false;
        return;
      }
      d += `${pen ? 'L' : 'M'}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`;
      pen = true;
    });
    svg += `<path class="spec ${classes[k]}" d="${d}"/>`;
    if (!s.target) {
      s.values.forEach((v, i) => {
        if (Number.isFinite(v)) svg += `<circle class="dot ${classes[k]}" cx="${sx(i).toFixed(1)}" cy="${sy(v).toFixed(1)}" r="2.5"/>`;
      });
    }
  });
  svg += '</svg>';
  const legend = series
    .map((s, k) => `<li><svg width="18" height="10" aria-hidden="true"><line class="spec ${classes[k]}" x1="1" x2="17" y1="5" y2="5"/></svg>${esc(s.label)}</li>`)
    .join('');
  el.innerHTML = `${svg}<ul class="chart-legend">${legend}</ul>`;
}
