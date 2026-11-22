// SPDX-License-Identifier: AGPL-3.0-or-later
// Symbol library: built-in symbol JSON files plus own symbols (symbol editor, or embedded in a file),
// looked up by type id. A component's drawing is its symbol merged with its variant (symbolFor).
import type { Component, Discipline, SymbolDef, SymbolVariant } from '../model/types.ts';
import { SYMBOL_DEFS } from './index.generated.ts';
import { sanitizeSvg } from './sanitize.ts';

export const CATEGORIES: { id: string; name: string }[] = [
  { id: 'air', name: 'Lüftung' },
  { id: 'water', name: 'Heizung, Kälte, Sanitär' },
  { id: 'control', name: 'Mess- und Regeltechnik' },
  { id: 'common', name: 'Allgemein' },
  { id: 'user', name: 'Eigene Bauteile' },
];

/** Palette tabs. MSR, general and own symbols show in every tab. */
export const DISCIPLINES: { id: Discipline; name: string }[] = [
  { id: 'air', name: 'Lüftung' },
  { id: 'heat', name: 'Heizung' },
  { id: 'sanitary', name: 'Sanitär' },
];

const BUILTIN = new Map(SYMBOL_DEFS.map((s) => [s.id, s]));
/** Own symbols: from this browser's library (wins) and from opened files. */
const OWN = new Map<string, { def: SymbolDef; local: boolean }>();
let rev = 0;
const listeners = new Set<() => void>();

export function allSymbols(): SymbolDef[] {
  return [...SYMBOL_DEFS, ...[...OWN.values()].map((o) => o.def)];
}

/** Changes whenever own symbols change (for memoised renders). */
export function symbolsRev(): number {
  return rev;
}
export function onSymbolsChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/**
 * Makes own symbols known. `local`: from this browser's library (replaces any copy); otherwise from a file
 * (does not replace a local one). The drawing is sanitised: only plain SVG shapes and text.
 */
export function registerSymbols(defs: SymbolDef[], local: boolean): void {
  let changed = false;
  for (const d of defs) {
    if (!d.id.startsWith('user.')) continue;
    const cur = OWN.get(d.id);
    if (cur?.local && !local) continue;
    const clean: SymbolDef = { ...d, category: 'user', custom: true, svg: sanitizeSvg(d.svg), variants: undefined };
    if (cur && JSON.stringify(cur.def) === JSON.stringify(clean) && cur.local === local) continue;
    OWN.set(d.id, { def: clean, local });
    changed = true;
  }
  if (changed) bump();
}

export function unregisterSymbol(id: string): void {
  if (OWN.delete(id)) bump();
}

function bump() {
  rev++;
  merged.clear();
  for (const f of listeners) f();
}

export function findSymbol(type: string): SymbolDef | undefined {
  return BUILTIN.get(type) ?? OWN.get(type)?.def;
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
  return findSymbol(type) ?? unknownSymbol(type);
}

const merged = new Map<string, SymbolDef>();

/** The variant a component uses (unknown or empty → the first). */
export function variantOf(def: SymbolDef, variant: string | undefined): SymbolVariant | undefined {
  if (!def.variants?.length) return undefined;
  return def.variants.find((v) => v.id === variant) ?? def.variants[0];
}

/** Symbol of a type in one variant: the variant's drawing, size, ports, text … over the base symbol. */
export function symbolVariant(type: string, variant?: string): SymbolDef {
  const def = symbolOf(type);
  const v = variantOf(def, variant);
  if (!v) return def;
  const key = `${type}|${v.id}`;
  const hit = merged.get(key);
  if (hit) return hit;
  const out: SymbolDef = {
    ...def,
    svg: v.svg,
    size: v.size ?? def.size,
    ports: v.ports ?? def.ports,
    labelAnchor: v.labelAnchor ?? def.labelAnchor,
    labelAlign: v.labelAlign ?? def.labelAlign,
    obstacle: v.obstacle ?? def.obstacle,
    bounds: v.bounds ?? (v.size ? undefined : def.bounds),
    prefix: v.prefix ?? def.prefix,
    text: v.text === null ? undefined : (v.text ?? def.text),
  };
  merged.set(key, out);
  return out;
}

/** Drawing of a component: its symbol in its variant. */
export function symbolFor(c: Pick<Component, 'type' | 'variant'>): SymbolDef {
  return symbolVariant(c.type, c.variant);
}

/** Palette tabs a symbol belongs to. */
export function disciplinesOf(def: SymbolDef): Discipline[] {
  if (def.disciplines?.length) return def.disciplines;
  if (def.category === 'air') return ['air'];
  if (def.category === 'water') return ['heat', 'sanitary'];
  return ['air', 'heat', 'sanitary'];
}

/** Text shown inside a component's symbol. */
export function innerText(c: Pick<Component, 'type' | 'variant' | 'text'>): string {
  const def = symbolFor(c);
  if (!def.text) return '';
  return c.text ?? def.text.value;
}
