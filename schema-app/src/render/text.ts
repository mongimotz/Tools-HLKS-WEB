// SPDX-License-Identifier: AGPL-3.0-or-later
// Text measurement without a DOM, from the IBM Plex Sans advance widths.
import { FONT_METRICS } from './font-metrics.generated.ts';

export function textWidth(text: string, size: number, weight: 400 | 600 = 400): number {
  const w = FONT_METRICS.weights[weight] ?? FONT_METRICS.weights[400]!;
  let units = 0;
  for (const ch of text) units += w[ch] ?? 600;
  return (units / 1000) * size;
}

/** Baseline offset from the top of a line box (cap height ≈ 0.7 em). */
export function baseline(size: number): number {
  return size * 0.72;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
