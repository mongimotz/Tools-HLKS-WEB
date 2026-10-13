// SPDX-License-Identifier: AGPL-3.0-or-later
// Front view of a silencer as an SVG string (no DOM, so the report and the tests can use it too).
// Rectangular: the housing B × H to scale with the splitters in it. Round: casing, duct and core.
// Colours come from style.css (classes fv-*), which reads the tokens.

import { fmt } from '../../lib/core/format.js';

const W = 300;
const H_MAX = 210;
const PAD = { left: 26, top: 22, right: 8, bottom: 8 };

const svg = (w, h, body) =>
  `<svg class="front-view" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Frontansicht">${body}</svg>`;
const n1 = (v) => Math.round(v * 10) / 10;

/** Front view of a rectangular splitter silencer. `r` is its result from calc.js (n, gap). */
export function rectFrontView({ B, H, d }, r) {
  if (!(B > 0 && H > 0)) {
    const w = W - PAD.left - PAD.right;
    const h = 120;
    return svg(W, h + PAD.top + PAD.bottom, `<rect class="fv-empty" x="${PAD.left}" y="${PAD.top}" width="${w}" height="${h}" rx="2"/>
      <text class="fv-dim" x="${PAD.left + w / 2}" y="${PAD.top + h / 2}" text-anchor="middle" dominant-baseline="middle">B × H</text>`);
  }
  const k = Math.min((W - PAD.left - PAD.right) / B, (H_MAX - PAD.top - PAD.bottom) / H);
  const w = B * k;
  const h = H * k;
  const x0 = PAD.left + (W - PAD.left - PAD.right - w) / 2;
  const y0 = PAD.top;
  let body = `<rect class="fv-housing" x="${n1(x0)}" y="${n1(y0)}" width="${n1(w)}" height="${n1(h)}"/>`;
  const n = r?.n ?? 0;
  if (n > 0 && r.gap > 0) {
    for (let i = 0; i < n; i++) {
      const x = x0 + (r.gap / 2 + i * (d + r.gap)) * k;
      body += `<rect class="fv-splitter" x="${n1(x)}" y="${n1(y0)}" width="${n1(d * k)}" height="${n1(h)}"/>`;
    }
  }
  body += `<rect class="fv-outline" x="${n1(x0)}" y="${n1(y0)}" width="${n1(w)}" height="${n1(h)}"/>`;
  body += `<text class="fv-dim" x="${n1(x0 + w / 2)}" y="${PAD.top - 7}" text-anchor="middle">${fmt(B, 0)}</text>`;
  body += `<text class="fv-dim" transform="translate(${n1(x0 - 8)} ${n1(y0 + h / 2)}) rotate(-90)" text-anchor="middle">${fmt(H, 0)}</text>`;
  return svg(W, Math.ceil(h + PAD.top + PAD.bottom), body);
}

/** Front view of a round silencer: casing (outer Ø), duct (dn or dIn) and the core across the diameter. */
export function roundFrontView(row) {
  if (!row?.dn) return '';
  const outer = row.dOuter > row.dn ? row.dOuter : row.dn;
  const size = Math.min(W - PAD.left - PAD.right, H_MAX - PAD.top - PAD.bottom);
  const k = size / outer;
  const cx = PAD.left + (W - PAD.left - PAD.right) / 2;
  const cy = PAD.top + size / 2;
  const d0 = row.dIn ?? row.dn;
  let body = '';
  if (outer > row.dn) body += `<circle class="fv-splitter" cx="${n1(cx)}" cy="${n1(cy)}" r="${n1((outer / 2) * k)}"/>`;
  body += `<circle class="fv-housing" cx="${n1(cx)}" cy="${n1(cy)}" r="${n1((d0 / 2) * k)}"/>`;
  if (row.core > 0) {
    const t = row.core * k;
    const half = (d0 / 2) * k;
    body += `<rect class="fv-splitter" x="${n1(cx - t / 2)}" y="${n1(cy - half)}" width="${n1(t)}" height="${n1(2 * half)}"/>`;
  }
  body += `<circle class="fv-outline" cx="${n1(cx)}" cy="${n1(cy)}" r="${n1((d0 / 2) * k)}"/>`;
  if (outer > row.dn) body += `<circle class="fv-outline" cx="${n1(cx)}" cy="${n1(cy)}" r="${n1((outer / 2) * k)}"/>`;
  body += `<text class="fv-dim" x="${n1(cx)}" y="${PAD.top - 7}" text-anchor="middle">Ø ${fmt(row.dn, 0)}${outer > row.dn ? ` | aussen ${fmt(outer, 0)}` : ''}</text>`;
  return svg(W, Math.ceil(size + PAD.top + PAD.bottom), body);
}
