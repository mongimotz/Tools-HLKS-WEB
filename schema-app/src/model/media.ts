// SPDX-License-Identifier: AGPL-3.0-or-later
// Fixed list of media. Colours follow EN 12792:2003 table 1 (air) where the norm names one; see DECISIONS.md.

export interface MediumDef {
  id: string;
  /** Short code shown on lines and in the legend. */
  code: string;
  name: string;
  /** Default colour (style can override). */
  color: string;
  /** Dash pattern in mm for black-and-white output, "" = solid. */
  dash: string;
  /** Line kind: flow lines carry media, signal lines are control links. */
  kind: 'flow' | 'signal';
}

export const MEDIA: MediumDef[] = [
  { id: 'air.outdoor', code: 'AUL', name: 'Aussenluft', color: '#2e9a4a', dash: '', kind: 'flow' },
  { id: 'air.supply', code: 'ZUL', name: 'Zuluft', color: '#2f6fc9', dash: '', kind: 'flow' },
  { id: 'air.extract', code: 'ABL', name: 'Abluft', color: '#d9a400', dash: '6 1.5', kind: 'flow' },
  { id: 'air.exhaust', code: 'FOL', name: 'Fortluft', color: '#8a5a2b', dash: '6 1.5 1 1.5', kind: 'flow' },
  { id: 'air.recirc', code: 'UML', name: 'Umluft', color: '#e07b1a', dash: '3 1.5', kind: 'flow' },
  { id: 'air.mixed', code: 'MIL', name: 'Mischluft', color: '#7a8a2e', dash: '6 1.5 1 1.5 1 1.5', kind: 'flow' },
  { id: 'air.transfer', code: 'ÜBL', name: 'Überströmluft', color: '#8c8c8c', dash: '1.5 1.5', kind: 'flow' },
  { id: 'water.hrc', code: 'KVS', name: 'KVS-Kreislauf', color: '#159a9c', dash: '4 1 1 1', kind: 'flow' },
  { id: 'signal', code: 'S', name: 'Wirklinie', color: '#555555', dash: '1 1', kind: 'signal' },
];

export const MEDIUM_IDS = MEDIA.map((m) => m.id);

export function medium(id: string): MediumDef | undefined {
  return MEDIA.find((m) => m.id === id);
}

/** Glob match for port media patterns: "air.*" matches "air.supply"; "*" matches anything. */
export function mediumMatches(pattern: string, id: string): boolean {
  if (pattern === '*' || pattern === id) return true;
  if (pattern.endsWith('.*')) return id.startsWith(pattern.slice(0, -1));
  return false;
}
