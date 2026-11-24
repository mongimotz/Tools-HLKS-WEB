// SPDX-License-Identifier: AGPL-3.0-or-later
// Right panel: properties of the selection, or sheet and title block when nothing is selected; issues below.
import { useRef, useState } from 'react';
import type { Issue, Schema } from '../model/types.ts';
import { MEDIA, mediumMatches } from '../model/media.ts';
import { findSymbol, innerText, symbolFor, symbolVariant } from '../symbols/library.ts';
import { SymbolPreview } from './SymbolPreview.tsx';
import { renderSchema } from '../render/render.ts';
import { openSymbolTab } from './tabs.ts';
import { draftFromDef } from '../io/symbols.ts';
import { useEditor } from './store.ts';
import { Icon } from './icons.tsx';
import { flipSelection, newGroup, roomOf, rotateSelection, setVariant } from './actions.ts';
import { NotesPanel } from './Notes.tsx';
import { AssistantPanel } from './Assistant.tsx';

function Field({
  label,
  value,
  onCommit,
  testid,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  testid?: string;
  placeholder?: string;
}) {
  const [v, setV] = useState(value);
  const [last, setLast] = useState(value);
  const cancelled = useRef(false);
  if (value !== last) {
    setLast(value);
    setV(value);
  }
  return (
    <label className="field">
      <span>{label}</span>
      <input
        value={v}
        placeholder={placeholder}
        data-testid={testid}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (!cancelled.current && v !== value) onCommit(v);
          cancelled.current = false;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            cancelled.current = true;
            setV(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </label>
  );
}

const PROP_NAMES: Record<string, string> = {
  V: 'Volumenstrom',
  dp: 'Druckdifferenz',
  P: 'Leistung',
  Klasse: 'Filterklasse',
  Q: 'Leistung',
  t: 'Temperatur',
  eta: 'Wirkungsgrad',
  L: 'Länge',
  De: 'Einfügedämpfung',
  EI: 'Feuerwiderstand',
  Auslösung: 'Auslösung',
  Funktion: 'Funktion',
  Art: 'Art',
  x: 'Feuchte',
  Nutzung: 'Nutzung',
  H: 'Förderhöhe',
  DN: 'Nennweite',
  kvs: 'kvs-Wert',
};

export function Properties({ issues }: { issues: Issue[] }) {
  const st = useEditor();
  const doc = st.doc;
  const sel = st.selection;
  const one = sel.length === 1 ? sel[0]! : null;
  const comp = one ? doc.components.find((c) => c.id === one) : undefined;
  const con = one ? doc.connections.find((c) => c.id === one) : undefined;
  const group = one ? doc.groups.find((c) => c.id === one) : undefined;
  const text = one ? doc.texts.find((c) => c.id === one) : undefined;
  const openNotes = doc.notes.filter((n) => n.status === 'open').length;

  return (
    <aside className="props" aria-label="Eigenschaften und Anmerkungen">
      <div className="tabs" role="tablist">
        <button
          role="tab"
          aria-selected={st.panel === 'props'}
          data-testid="tab-props"
          onClick={() => st.setPanel('props')}
        >
          Eigenschaften
        </button>
        <button
          role="tab"
          aria-selected={st.panel === 'notes'}
          data-testid="tab-notes"
          onClick={() => st.setPanel('notes')}
        >
          Anmerkungen{openNotes ? <span className="badge">{openNotes}</span> : null}
        </button>
        <button
          role="tab"
          aria-selected={st.panel === 'assistant'}
          data-testid="tab-assistant"
          onClick={() => st.setPanel('assistant')}
        >
          Assistent
        </button>
      </div>
      {st.panel === 'notes' ? (
        <div className="props-body">
          <NotesPanel />
        </div>
      ) : st.panel === 'assistant' ? (
        <div className="props-body">
          <AssistantPanel />
        </div>
      ) : (
        <div className="props-body">
          {sel.length === 0 && <SheetProps doc={doc} />}
          {sel.length > 1 && (
            <section>
              <h2>{sel.length} Elemente</h2>
              <div className="row-buttons">
                <button onClick={() => st.commit('Drehen', rotateSelection(st.doc, sel))}>
                  <Icon name="rotate" /> Drehen
                </button>
                <button onClick={() => st.commit('Spiegeln', flipSelection(st.doc, sel))}>
                  <Icon name="flip" /> Spiegeln
                </button>
                <button
                  title="Gruppe mit Rahmen, z. B. Monoblock (Strg+G)"
                  data-testid="btn-group"
                  onClick={() => {
                    const r = newGroup(st.doc, sel);
                    if (r) {
                      st.commit('Gruppieren', r.schema);
                      st.select([r.id]);
                    }
                  }}
                >
                  <Icon name="group" /> Gruppieren
                </button>
              </div>
            </section>
          )}
          {comp && (
            <section>
              <h2>{findSymbol(comp.type)?.name ?? comp.type}</h2>
              <p className="sub">
                {comp.type}
                {symbolFor(comp).norm ? ` | ${symbolFor(comp).norm}` : ''}
              </p>
              <VariantPicker id={comp.id} type={comp.type} variant={comp.variant ?? ''} text={comp.text} />
              {symbolFor(comp).text && (
                <Field
                  label="Text im Symbol"
                  value={innerText(comp)}
                  testid="prop-inner-text"
                  onCommit={(v) =>
                    st.change('Text im Symbol', (d) => {
                      const c = d.components.find((x) => x.id === comp.id)!;
                      if (v === symbolFor(c).text?.value) delete c.text;
                      else c.text = v;
                    })
                  }
                />
              )}
              <Field
                label="Bezeichnung"
                value={comp.label}
                testid="prop-label"
                onCommit={(v) =>
                  st.change('Bezeichnung', (d) => void (d.components.find((c) => c.id === comp.id)!.label = v))
                }
              />
              {[...new Set([...symbolFor(comp).props, ...Object.keys(comp.props)])].map((k) => (
                <Field
                  key={k}
                  label={PROP_NAMES[k] ? `${PROP_NAMES[k]} (${k})` : k}
                  value={comp.props[k] ?? ''}
                  testid={`prop-${k}`}
                  onCommit={(v) =>
                    st.change('Eigenschaft', (d) => {
                      const c = d.components.find((x) => x.id === comp.id)!;
                      if (v) c.props[k] = v;
                      else delete c.props[k];
                    })
                  }
                />
              ))}
              <NewProp
                onAdd={(k, v) =>
                  st.change('Eigenschaft', (d) => void (d.components.find((x) => x.id === comp.id)!.props[k] = v))
                }
              />
              <div className="row-buttons">
                <button title="Drehen (R)" onClick={() => st.commit('Drehen', rotateSelection(st.doc, [comp.id]))}>
                  <Icon name="rotate" /> {comp.rot}°
                </button>
                <button
                  title="Spiegeln (F)"
                  aria-pressed={comp.flip}
                  onClick={() => st.commit('Spiegeln', flipSelection(st.doc, [comp.id]))}
                >
                  <Icon name="flip" /> Spiegeln
                </button>
                <button
                  title="Fixiert: Automatik und Assistent verschieben nicht"
                  aria-pressed={comp.pinned}
                  onClick={() =>
                    st.change(
                      'Fixieren',
                      (d) => void (d.components.find((x) => x.id === comp.id)!.pinned = !comp.pinned),
                    )
                  }
                >
                  <Icon name="pin" /> {comp.pinned ? 'Fixiert' : 'Frei'}
                </button>
              </div>
              <Membership id={comp.id} />
              <button
                className="link-button"
                onClick={() => openSymbolTab(draftFromDef(symbolFor(comp), !comp.type.startsWith('user.')))}
              >
                <Icon name="pen" size={14} />{' '}
                {comp.type.startsWith('user.') ? 'Bauteil bearbeiten' : 'Als Vorlage für eigenes Bauteil'}
              </button>
            </section>
          )}
          {con && <ConnectionProps doc={doc} id={con.id} />}
          {group && (
            <section>
              <h2>Gruppe</h2>
              <Field
                label="Bezeichnung"
                value={group.label}
                onCommit={(v) => st.change('Gruppe', (d) => void (d.groups.find((x) => x.id === group.id)!.label = v))}
              />
              <label className="check">
                <input
                  type="checkbox"
                  checked={group.frame}
                  onChange={(e) =>
                    st.change('Gruppe', (d) => void (d.groups.find((x) => x.id === group.id)!.frame = e.target.checked))
                  }
                />{' '}
                Rahmen zeichnen
              </label>
              <p className="sub">{group.members.join(', ')}</p>
              <button
                onClick={() =>
                  st.change('Gruppe auflösen', (d) => void (d.groups = d.groups.filter((x) => x.id !== group.id)))
                }
              >
                Gruppe auflösen
              </button>
            </section>
          )}
          {text && (
            <section>
              <h2>Text</h2>
              <Field
                label="Text"
                testid="prop-text"
                value={text.text}
                onCommit={(v) => st.change('Text', (d) => void (d.texts.find((x) => x.id === text.id)!.text = v))}
              />
              <label className="field">
                <span>Schriftgrösse</span>
                <select
                  value={text.size}
                  onChange={(e) =>
                    st.change(
                      'Text',
                      (d) => void (d.texts.find((x) => x.id === text.id)!.size = Number(e.target.value)),
                    )
                  }
                >
                  {[2.5, 3.5, 5, 7].map((s) => (
                    <option key={s} value={s}>
                      {s} mm
                    </option>
                  ))}
                </select>
              </label>
            </section>
          )}
        </div>
      )}
      <IssueList issues={issues} />
    </aside>
  );
}

/** Group («Monoblock») and room the component belongs to; join or leave a group. */
function Membership({ id }: { id: string }) {
  const st = useEditor();
  const doc = st.doc;
  const group = doc.groups.find((g) => g.members.includes(id));
  const room = roomOf(renderSchema(doc).placed, id);
  return (
    <div className="membership">
      <label className="field">
        <span>Gruppe</span>
        <select
          value={group?.id ?? ''}
          data-testid="prop-group"
          onChange={(e) => {
            const to = e.target.value;
            st.change('Gruppe', (d) => {
              for (const g of d.groups) g.members = g.members.filter((m) => m !== id);
              if (to) d.groups.find((g) => g.id === to)!.members.push(id);
              d.groups = d.groups.filter((g) => g.members.length);
            });
          }}
        >
          <option value="">keine</option>
          {doc.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label || g.id}
            </option>
          ))}
        </select>
      </label>
      {room && (
        <p className="sub">
          Im Raum {room.label || room.id}
          {room.props.Nutzung ? ` (${room.props.Nutzung})` : ''}
        </p>
      )}
    </div>
  );
}

/** Variants of the selected component as small drawings; a click switches (one undo step). */
function VariantPicker({ id, type, variant, text }: { id: string; type: string; variant: string; text?: string }) {
  const st = useEditor();
  const vs = findSymbol(type)?.variants ?? [];
  if (vs.length < 2) return null;
  const cur = vs.find((v) => v.id === variant) ?? vs[0]!;
  return (
    <div className="variants" role="radiogroup" aria-label="Ausführung">
      <span className="variants-label">Ausführung: {cur.name}</span>
      <div className="variant-grid">
        {vs.map((v) => (
          <button
            key={v.id}
            role="radio"
            aria-checked={v.id === cur.id}
            title={`${v.name} (V)`}
            data-testid={`variant-${v.id}`}
            onClick={() =>
              v.id !== cur.id && st.commit('Ausführung', setVariant(renderSchema(st.doc).placed, id, v.id))
            }
          >
            <SymbolPreview def={symbolVariant(type, v.id)} size={40} text={text} />
          </button>
        ))}
      </div>
    </div>
  );
}

function NewProp({ onAdd }: { onAdd: (k: string, v: string) => void }) {
  const [k, setK] = useState('');
  const [v, setV] = useState('');
  return (
    <form
      className="new-prop"
      onSubmit={(e) => {
        e.preventDefault();
        if (k.trim() && v.trim()) onAdd(k.trim(), v.trim());
        setK('');
        setV('');
      }}
    >
      <input placeholder="Name" value={k} onChange={(e) => setK(e.target.value)} aria-label="Neue Eigenschaft: Name" />
      <input placeholder="Wert" value={v} onChange={(e) => setV(e.target.value)} aria-label="Neue Eigenschaft: Wert" />
      <button type="submit" title="Eigenschaft hinzufügen" aria-label="Eigenschaft hinzufügen">
        <Icon name="plus" />
      </button>
    </form>
  );
}

function ConnectionProps({ doc, id }: { doc: Schema; id: string }) {
  const st = useEditor();
  const con = doc.connections.find((c) => c.id === id)!;
  const ports = [con.from, con.to].map(([cid, pid]) => {
    const c = doc.components.find((x) => x.id === cid);
    return c && findSymbol(c.type) ? symbolFor(c).ports.find((p) => p.id === pid) : undefined;
  });
  return (
    <section>
      <h2>Leitung</h2>
      <p className="sub">
        {con.from.join('.')} → {con.to.join('.')}
      </p>
      <label className="field">
        <span>Medium</span>
        <select
          data-testid="prop-medium"
          value={con.medium}
          onChange={(e) =>
            st.change('Medium', (d) => void (d.connections.find((x) => x.id === id)!.medium = e.target.value))
          }
        >
          {MEDIA.map((m) => (
            <option
              key={m.id}
              value={m.id}
              disabled={ports.some((p) => p && !p.media.some((pat) => mediumMatches(pat, m.id)))}
            >
              {m.code} {m.name}
            </option>
          ))}
        </select>
      </label>
      {con.waypoints.length > 0 && (
        <button
          onClick={() =>
            st.change('Leitung automatisch', (d) => void (d.connections.find((x) => x.id === id)!.waypoints = []))
          }
        >
          Automatisch führen
        </button>
      )}
      <button
        title="Fliessrichtung umkehren"
        onClick={() =>
          st.change('Richtung', (d) => {
            const c = d.connections.find((x) => x.id === id)!;
            [c.from, c.to] = [c.to, c.from];
            c.waypoints = [...c.waypoints].reverse();
          })
        }
      >
        Richtung umkehren
      </button>
    </section>
  );
}

function syncGlobalProject(key: 'project' | 'author' | 'date', value: string) {
  try {
    const prev = JSON.parse(localStorage.getItem('hlks-tools:project') || '{}') as {
      name?: string;
      number?: string;
      author?: string;
      date?: string;
    };
    const next = {
      name: key === 'project' ? value : prev.name ?? '',
      number: prev.number ?? '',
      author: key === 'author' ? value : prev.author ?? '',
      date: key === 'date' ? value : prev.date ?? '',
    };
    localStorage.setItem('hlks-tools:project', JSON.stringify(next));
    if (key === 'author') localStorage.setItem('hlks-tools:author', value);
    for (const id of ['duct-sizing', 'duct-pressure-loss', 'silencer', 'hx-diagram']) {
      const dKey = `hlks-tools:${id}:draft`;
      const raw = localStorage.getItem(dKey);
      if (!raw) continue;
      try {
        const d = JSON.parse(raw) as { project?: Record<string, string> };
        if (!d || typeof d !== 'object') continue;
        d.project = {
          name: next.name,
          number: next.number,
          author: next.author,
          date: next.date || d.project?.date || new Date().toISOString().slice(0, 10),
        };
        localStorage.setItem(dKey, JSON.stringify(d));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

function SheetProps({ doc }: { doc: Schema }) {
  const st = useEditor();
  const m = doc.meta;
  const set = (k: keyof Schema['meta']) => (v: string) => {
    st.change('Schriftfeld', (d) => void (d.meta[k] = v));
    if (k === 'project' || k === 'author' || k === 'date') syncGlobalProject(k, v);
  };
  return (
    <section>
      <h2>Blatt</h2>
      <Field label="Titel" value={m.title} onCommit={set('title')} testid="meta-title" />
      <Field label="Projekt" value={m.project} onCommit={set('project')} />
      <Field label="Bearbeiter" value={m.author} onCommit={set('author')} />
      <div className="two">
        <Field label="Datum" value={m.date} onCommit={set('date')} />
        <Field label="Revision" value={m.revision} onCommit={set('revision')} />
      </div>
      <div className="two">
        <label className="field">
          <span>Format</span>
          <select
            value={doc.sheet.size}
            onChange={(e) =>
              st.change('Format', (d) => void (d.sheet.size = e.target.value as Schema['sheet']['size']))
            }
          >
            {['A4', 'A3', 'A2', 'A1', 'A0'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Lage</span>
          <select
            value={doc.sheet.orientation}
            onChange={(e) =>
              st.change('Format', (d) => void (d.sheet.orientation = e.target.value as Schema['sheet']['orientation']))
            }
          >
            <option value="landscape">quer</option>
            <option value="portrait">hoch</option>
          </select>
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={doc.sheet.legend}
          onChange={(e) => st.change('Legende', (d) => void (d.sheet.legend = e.target.checked))}
        />{' '}
        Legende
      </label>
    </section>
  );
}

function IssueList({ issues }: { issues: Issue[] }) {
  const st = useEditor();
  const [open, setOpen] = useState(false);
  const errors = issues.filter((i) => i.severity === 'error').length;
  return (
    <section className={`issues${open ? ' open' : ''}`}>
      <button className="issues-head" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="issues">
        <Icon name="warn" />
        <span>{issues.length ? `${issues.length} Hinweise${errors ? `, ${errors} Fehler` : ''}` : '0 Hinweise'}</span>
        <Icon name="chevron" />
      </button>
      {open && (
        <ul>
          {issues.map((i, k) => (
            <li key={k} className={i.severity}>
              <button
                onClick={() =>
                  st.select(
                    i.ids.filter(
                      (id) => st.doc.components.some((c) => c.id === id) || st.doc.connections.some((c) => c.id === id),
                    ),
                  )
                }
              >
                {i.message}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
