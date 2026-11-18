// SPDX-License-Identifier: AGPL-3.0-or-later
// Symbol library: all symbol JSON files, looked up by type id.
import type { SymbolDef } from '../model/types.ts';
import { SYMBOL_DEFS } from './index.generated.ts';

export const CATEGORIES: { id: string; name: string }[] = [
  { id: 'air', name: 'Lüftung' },
  { id: 'control', name: 'Mess- und Regeltechnik' },
  { id: 'common', name: 'Allgemein' },
];

const BY_ID = new Map(SYMBOL_DEFS.map((s) => [s.id, s]));

export function allSymbols(): SymbolDef[] {
  return SYMBOL_DEFS;
}

export function findSymbol(type: string): SymbolDef | undefined {
  return BY_ID.get(type);
}

/** Placeholder for unknown types, so a file with a typo still renders (validation reports it). */
export function unknownSymbol(type: string): SymbolDef {
  return {
    id: type,
    name: `Unbekannt: ${type}`,
    category: 'common',
    norm: '',
    checked: false,
    size: [10, 10],
    ports: [],
    labelAnchor: [5, -1.5],
    props: [],
    prefix: 'X',
    svg: "<rect x='0' y='0' width='10' height='10' stroke-dasharray='1 1'/><path d='M3 3L7 7M7 3L3 7'/>",
  };
}

export function symbolOf(type: string): SymbolDef {
  return BY_ID.get(type) ?? unknownSymbol(type);
}
