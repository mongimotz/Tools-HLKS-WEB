// SPDX-License-Identifier: AGPL-3.0-or-later
// Default style. All sizes in mm on paper. External style templates (phase 7) override parts of it.
import { MEDIA } from '../model/media.ts';

export interface Style {
  id: string;
  font: { family: string; label: number; small: number; normal: number; large: number };
  stroke: { line: number; signal: number; symbol: number; frame: number; thin: number; group: number };
  colors: { ink: string; paper: string; grid: string; frame: string; group: string; media: Record<string, string> };
  layout: { gap: number; minGap: number; rowGap: number; minRowGap: number };
  crossings: 'bridge' | 'gap';
  legend: boolean;
  /** SVG title block template with {{meta.*}} / {{sheet.*}} placeholders; null = built-in. */
  titleBlock: string | null;
}

export const DEFAULT_STYLE: Style = {
  id: 'default',
  font: {
    family: "'IBM Plex Sans Var', 'IBM Plex Sans', Arial, sans-serif",
    label: 2.5,
    small: 2.5,
    normal: 3.5,
    large: 5,
  },
  stroke: { line: 0.5, signal: 0.25, symbol: 0.35, frame: 0.7, thin: 0.25, group: 0.25 },
  colors: {
    ink: '#1a1a1a',
    paper: '#ffffff',
    grid: '#d6dde5',
    frame: '#1a1a1a',
    group: '#6b7785',
    media: Object.fromEntries(MEDIA.map((m) => [m.id, m.color])),
  },
  layout: { gap: 10, minGap: 5, rowGap: 45, minRowGap: 30 },
  crossings: 'bridge',
  legend: true,
  titleBlock: null,
};
