// SPDX-License-Identifier: AGPL-3.0-or-later
// Symbol palette: search, categories, drag onto the sheet (or click: place in the middle of the view).
import { useMemo, useState } from 'react';
import { allSymbols, CATEGORIES } from '../symbols/library.ts';
import { SymbolPreview } from './SymbolPreview.tsx';
import { Icon } from './icons.tsx';

export const DND_TYPE = 'application/x-hlks-symbol';

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function Palette({ onPick }: { onPick: (type: string) => void }) {
  const [q, setQ] = useState('');
  const groups = useMemo(() => {
    const n = norm(q.trim());
    const match = (d: ReturnType<typeof allSymbols>[number]) =>
      !n || [d.name, d.id, ...(d.keywords ?? [])].some((k) => norm(k).includes(n));
    return CATEGORIES.map((c) => ({ ...c, items: allSymbols().filter((d) => d.category === c.id && match(d)) })).filter(
      (g) => g.items.length,
    );
  }, [q]);
  return (
    <aside className="palette" aria-label="Symbole">
      <label className="search">
        <Icon name="search" />
        <input
          type="search"
          placeholder="Symbol suchen"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Symbol suchen"
        />
      </label>
      <div className="palette-list">
        {groups.map((g) => (
          <section key={g.id}>
            <h3>{g.name}</h3>
            <ul>
              {g.items.map((d) => (
                <li key={d.id}>
                  <button
                    className="sym"
                    draggable
                    data-type={d.id}
                    title={`${d.name}${d.norm ? ` (${d.norm})` : ''}`}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DND_TYPE, d.id);
                      e.dataTransfer.setData('text/plain', d.id);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => onPick(d.id)}
                  >
                    <SymbolPreview def={d} />
                    <span>{d.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!groups.length && <p className="empty">Kein Symbol gefunden.</p>}
      </div>
    </aside>
  );
}
