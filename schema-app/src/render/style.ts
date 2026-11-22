// SPDX-License-Identifier: AGPL-3.0-or-later
// Default style. All sizes in mm on paper. External style templates (phase 7) override parts of it.
import { MEDIA } from '../model/media.ts';

export interface Style {
  id: string;
  font: { family: string; label: number; small: number; normal: number; large: number };
  /** line: pipes, duct: air lines (air.*, total width incl. outline), ductOutline: black edge of a duct (0 = none), signal: Wirklinie. */
  stroke: {
    line: number;
    duct: number;
    ductOutline: number;
    signal: number;
    symbol: number;
    frame: number;
    thin: number;
    group: number;
  };
  /** group: secondary text (title block labels); unit: device frame (group); label: component IDs. */
  colors: {
    ink: string;
    paper: string;
    grid: string;
    frame: string;
    group: string;
    unit: string;
    label: string;
    media: Record<string, string>;
  };
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
  stroke: { line: 0.5, duct: 0.8, ductOutline: 0.1, signal: 0.25, symbol: 0.35, frame: 0.7, thin: 0.25, group: 0.3 },
  colors: {
    ink: '#1a1a1a',
    paper: '#ffffff',
    grid: '#d6dde5',
    frame: '#1a1a1a',
    group: '#6b7785',
    unit: '#d61f9b',
    label: '#1a7fd0',
    media: Object.fromEntries(MEDIA.map((m) => [m.id, m.color])),
  },
  layout: { gap: 10, minGap: 5, rowGap: 45, minRowGap: 30 },
  crossings: 'bridge',
  legend: true,
  titleBlock: null,
};

let active: Style = DEFAULT_STYLE;

/** Style used when a render call passes none (editor: the loaded style template, CLI: --style). */
export function getActiveStyle(): Style {
  return active;
}
export function setActiveStyle(s: Style | null): void {
  active = s ?? DEFAULT_STYLE;
}

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : d);
const str = (v: unknown, d: string) => (typeof v === 'string' && v ? v : d);
function nums<T extends Record<string, number>>(src: unknown, d: T): T {
  const o = (src && typeof src === 'object' ? src : {}) as Record<string, unknown>;
  return Object.fromEntries(Object.entries(d).map(([k, v]) => [k, num(o[k], v)])) as T;
}

/**
 * External style template (JSON): any part of Style; unknown or invalid values fall back to the default.
 * `titleBlock` is an SVG fragment in title-block mm (180 × 30) with {{meta.*}} / {{sheet.*}} placeholders.
 */
export function parseStyle(raw: unknown): Style {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Stilvorlage: JSON-Objekt erwartet.');
  const r = raw as Record<string, unknown>;
  const d = DEFAULT_STYLE;
  const font = (r.font && typeof r.font === 'object' ? r.font : {}) as Record<string, unknown>;
  const colors = (r.colors && typeof r.colors === 'object' ? r.colors : {}) as Record<string, unknown>;
  const media = (colors.media && typeof colors.media === 'object' ? colors.media : {}) as Record<string, unknown>;
  return {
    id: str(r.id, 'custom'),
    font: {
      ...nums(font, { label: d.font.label, small: d.font.small, normal: d.font.normal, large: d.font.large }),
      family: str(font.family, d.font.family),
    },
    stroke: nums(r.stroke, d.stroke),
    colors: {
      ink: str(colors.ink, d.colors.ink),
      paper: str(colors.paper, d.colors.paper),
      grid: str(colors.grid, d.colors.grid),
      frame: str(colors.frame, d.colors.frame),
      group: str(colors.group, d.colors.group),
      unit: str(colors.unit, d.colors.unit),
      label: str(colors.label, d.colors.label),
      media: Object.fromEntries(Object.entries(d.colors.media).map(([k, v]) => [k, str(media[k], v)])),
    },
    layout: nums(r.layout, d.layout),
    crossings: r.crossings === 'gap' ? 'gap' : d.crossings,
    legend: typeof r.legend === 'boolean' ? r.legend : d.legend,
    titleBlock: typeof r.titleBlock === 'string' && r.titleBlock.trim() ? r.titleBlock : d.titleBlock,
  };
}
