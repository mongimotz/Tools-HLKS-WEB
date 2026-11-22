// SPDX-License-Identifier: AGPL-3.0-or-later
// Symbol palette: discipline tabs (Lüftung, Heizung, Sanitär), search over all symbols and their variants,
// own symbols. Drag onto the sheet (on a line: inserted into it) or click (selected line: inserted, else in
// the middle of the view).
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { Discipline, SymbolDef } from '../model/types.ts';
import {
  allSymbols,
  DISCIPLINES,
  disciplinesOf,
  onSymbolsChange,
  symbolsRev,
  symbolVariant,
} from '../symbols/library.ts';
import { SymbolPreview } from './SymbolPreview.tsx';
import { Icon } from './icons.tsx';

export const DND_TYPE = 'application/x-hlks-symbol';
/** Symbol being dragged from the palette (dragover cannot read the data, only its type). */
export const paletteDrag = { value: '' };
const TAB_KEY = 'hlks-schema:palette-tab';

/** Drag data: "type" or "type#variant". */
export function dndValue(type: string, variant = ''): string {
  return variant ? `${type}#${variant}` : type;
}
export function parseDnd(v: string): { type: string; variant: string } {
  const k = v.indexOf('#');
  return k < 0 ? { type: v, variant: '' } : { type: v.slice(0, k), variant: v.slice(k + 1) };
}

/** Palette order of the ventilation and MSR symbols (owner's sample sheet); others follow by name. */
const ORDER = [
  'air.silencer',
  'air.damper',
  'air.damper.motor',
  'air.firedamper',
  'air.damper.single',
  'air.intake',
  'air.outlet',
  'air.mixbox',
  'air.filter',
  'air.heater',
  'air.cooler',
  'air.hrc.plate',
  'air.hrc.rotor',
  'air.hrc.coil',
  'air.humidifier',
  'air.dehumidifier',
  'air.fan',
  'air.vav',
  'air.droplet',
  'air.part',
  'air.arrow.out',
  'air.arrow.in',
  'air.terminal.supply',
  'air.terminal.extract',
  'control.sensor',
  'control.sensor.room',
  'control.sensor.outdoor',
  'control.sensor.dp',
  'control.switch',
  'control.frost',
  'control.actuator',
  'control.vfd',
  'control.device',
];
const rank = (d: SymbolDef) => {
  const k = ORDER.indexOf(d.id);
  return k < 0 ? ORDER.length : k;
};

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

interface Item {
  key: string;
  type: string;
  variant: string;
  name: string;
  def: SymbolDef;
  count: number;
}

export function Palette({
  onPick,
  onNewSymbol,
  onEditSymbol,
}: {
  onPick: (type: string, variant: string) => void;
  onNewSymbol: () => void;
  onEditSymbol: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Discipline>(() => {
    try {
      const t = localStorage.getItem(TAB_KEY);
      if (t === 'air' || t === 'heat' || t === 'sanitary') return t;
    } catch {
      /* no storage */
    }
    return 'air';
  });
  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {
      /* no storage */
    }
  }, [tab]);
  const rev = useSyncExternalStore(onSymbolsChange, symbolsRev);

  const groups = useMemo(() => {
    const n = norm(q.trim());
    const offered = allSymbols()
      .filter((d) => !d.hidden)
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'de'));
    const sections: { id: string; name: string; items: Item[]; own?: boolean }[] = [];
    if (n) {
      // Search: every matching variant on its own, across all tabs.
      const items: Item[] = [];
      for (const d of offered) {
        const vs = d.variants ?? [];
        const baseHit = [d.name, d.id, ...(d.keywords ?? [])].some((k) => norm(k).includes(n));
        if (!vs.length) {
          if (baseHit) items.push({ key: d.id, type: d.id, variant: '', name: d.name, def: d, count: 0 });
          continue;
        }
        for (const v of vs) {
          const hit = baseHit || [v.name, v.id, ...(v.keywords ?? [])].some((k) => norm(k).includes(n));
          if (hit)
            items.push({
              key: `${d.id}#${v.id}`,
              type: d.id,
              variant: v.id,
              name: v.name === d.name ? d.name : `${v.name}`,
              def: symbolVariant(d.id, v.id),
              count: 0,
            });
        }
      }
      sections.push({ id: 'hits', name: `${items.length} Treffer`, items });
      return sections;
    }
    const item = (d: SymbolDef): Item => ({
      key: d.id,
      type: d.id,
      variant: '',
      name: d.name,
      def: d,
      count: d.variants?.length ?? 0,
    });
    const main = offered.filter(
      (d) => (d.category === 'air' || d.category === 'water') && disciplinesOf(d).includes(tab),
    );
    sections.push({ id: tab, name: DISCIPLINES.find((x) => x.id === tab)!.name, items: main.map(item) });
    sections.push({
      id: 'control',
      name: 'Mess- und Regeltechnik',
      items: offered.filter((d) => d.category === 'control').map(item),
    });
    sections.push({ id: 'common', name: 'Allgemein', items: offered.filter((d) => d.category === 'common').map(item) });
    sections.push({
      id: 'user',
      name: 'Eigene Bauteile',
      own: true,
      items: offered.filter((d) => d.category === 'user').map(item),
    });
    return sections;
    // rev: own symbols changed
  }, [q, tab, rev]);

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
          data-testid="symbol-search"
        />
      </label>
      {!q.trim() && (
        <div className="pal-tabs" role="tablist" aria-label="Fachbereich">
          {DISCIPLINES.map((d) => (
            <button
              key={d.id}
              role="tab"
              aria-selected={tab === d.id}
              data-testid={`pal-tab-${d.id}`}
              onClick={() => setTab(d.id)}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}
      <div className="palette-list">
        {groups.map((g) =>
          g.items.length || g.own ? (
            <section key={g.id}>
              <h3>
                {g.name}
                {g.own && (
                  <button
                    className="tb small"
                    title="Neues Bauteil zeichnen"
                    aria-label="Neues Bauteil zeichnen"
                    data-testid="new-symbol"
                    onClick={onNewSymbol}
                  >
                    <Icon name="plus" size={14} />
                  </button>
                )}
              </h3>
              <ul>
                {g.items.map((it) => (
                  <li key={it.key} className="sym-row">
                    <button
                      className="sym"
                      draggable
                      data-type={dndValue(it.type, it.variant)}
                      title={it.count > 1 ? `${it.name} (${it.count} Ausführungen)` : it.name}
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DND_TYPE, dndValue(it.type, it.variant));
                        e.dataTransfer.setData('text/plain', dndValue(it.type, it.variant));
                        e.dataTransfer.effectAllowed = 'copy';
                        paletteDrag.value = dndValue(it.type, it.variant);
                      }}
                      onDragEnd={() => (paletteDrag.value = '')}
                      onClick={() => onPick(it.type, it.variant)}
                    >
                      <SymbolPreview def={it.def} />
                      <span>{it.name}</span>
                      {it.count > 1 && <span className="count">{it.count}</span>}
                    </button>
                    {it.def.custom && (
                      <button
                        className="tb small edit"
                        title="Bauteil bearbeiten"
                        aria-label={`${it.name} bearbeiten`}
                        onClick={() => onEditSymbol(it.type)}
                      >
                        <Icon name="pen" size={14} />
                      </button>
                    )}
                  </li>
                ))}
                {g.own && !g.items.length && <li className="empty">Noch keine eigenen Bauteile.</li>}
              </ul>
            </section>
          ) : null,
        )}
        {q.trim() && !groups[0]?.items.length && <p className="empty">Kein Symbol gefunden.</p>}
      </div>
    </aside>
  );
}
