// SPDX-License-Identifier: AGPL-3.0-or-later
// Own symbols (symbol editor): kept in this browser's library (localStorage) and copied into every file that
// uses them (serialize), so a file opens with its symbols on any device.
import type { Discipline, SymbolDef } from '../model/types.ts';
import { findSymbol, registerSymbols, unregisterSymbol } from '../symbols/library.ts';
import type { SymbolDraft } from '../editor/store.ts';

const KEY = 'hlks-schema:symbols';

function read(): SymbolDef[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(raw) ? (raw as SymbolDef[]).filter((d) => d && typeof d.id === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: SymbolDef[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage full or blocked */
  }
}

export function initOwnSymbols() {
  registerSymbols(read(), true);
}

function slug(name: string): string {
  const s = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return s || 'bauteil';
}

/** Saves the draft into the library; returns the symbol ID. */
export function saveOwnSymbol(d: SymbolDraft): string {
  const list = read();
  let id = d.id;
  if (!id) {
    const base = `user.${slug(d.name)}`;
    id = base;
    for (let k = 2; findSymbol(id) || list.some((x) => x.id === id); k++) id = `${base}-${k}`;
  }
  const def = defFromDraft({ ...d, id });
  write([...list.filter((x) => x.id !== id), def]);
  registerSymbols([def], true);
  return id;
}

export function deleteOwnSymbol(id: string) {
  write(read().filter((x) => x.id !== id));
  unregisterSymbol(id);
}

export function defFromDraft(d: SymbolDraft): SymbolDef {
  const disciplines: Discipline[] | undefined =
    d.area === 'air' || d.area === 'heat' || d.area === 'sanitary' ? [d.area] : undefined;
  return {
    id: d.id,
    name: d.name.trim() || 'Eigenes Bauteil',
    category: 'user',
    norm: '',
    checked: false,
    size: d.size,
    ports: d.ports,
    labelAnchor: [d.size[0] / 2, -1.5],
    props: d.props,
    prefix: d.prefix.trim() || 'X',
    ...(d.text ? { text: d.text } : {}),
    ...(disciplines ? { disciplines } : {}),
    svg: d.svg,
    custom: true,
  };
}

export function draftFromDef(def: SymbolDef, asTemplate: boolean): SymbolDraft {
  const area: SymbolDraft['area'] = def.disciplines?.length
    ? def.disciplines.length === 1
      ? def.disciplines[0]!
      : def.category === 'water'
        ? 'heat'
        : 'air'
    : def.category === 'air'
      ? 'air'
      : def.category === 'water'
        ? 'heat'
        : def.category === 'control'
          ? 'control'
          : 'common';
  return {
    id: asTemplate ? '' : def.id,
    name: asTemplate ? `${def.name} (eigen)` : def.name,
    area,
    prefix: def.prefix,
    size: [...def.size],
    ports: def.ports.map((p) => ({ ...p, at: [...p.at], media: [...p.media] })),
    // Medium placeholders become plain ink in an own drawing.
    svg: def.svg.replace(/\{\{[a-z.-]+\}\}/g, 'currentColor'),
    text: def.text ? { ...def.text, at: [...def.text.at] } : null,
    props: [...def.props],
    saved: !asTemplate,
  };
}

export function emptyDraft(): SymbolDraft {
  return {
    id: '',
    name: 'Neues Bauteil',
    area: 'air',
    prefix: 'X',
    size: [10, 10],
    ports: [
      { id: 'in', at: [0, 5], dir: 'W', media: ['air.*'] },
      { id: 'out', at: [10, 5], dir: 'E', media: ['air.*'] },
    ],
    svg: "<rect x='0' y='0' width='10' height='10'/>",
    text: null,
    props: [],
    saved: false,
  };
}
