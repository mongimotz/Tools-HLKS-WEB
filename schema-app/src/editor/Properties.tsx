// SPDX-License-Identifier: AGPL-3.0-or-later
// Right panel: properties of the selection, or sheet and title block when nothing is selected; issues below.
import { useRef, useState } from 'react';
import type { Issue, Schema } from '../model/types.ts';
import { MEDIA, mediumMatches } from '../model/media.ts';
import { findSymbol, symbolOf } from '../symbols/library.ts';
import { useEditor } from './store.ts';
import { Icon } from './icons.tsx';
import { flipSelection, rotateSelection } from './actions.ts';
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
              </div>
            </section>
          )}
          {comp && (
            <section>
              <h2>{symbolOf(comp.type).name}</h2>
              <p className="sub">
                {comp.type}
                {symbolOf(comp.type).norm ? ` | ${symbolOf(comp.type).norm}` : ''}
              </p>
              <Field
                label="Bezeichnung"
                value={comp.label}
                testid="prop-label"
                onCommit={(v) =>
                  st.change('Bezeichnung', (d) => void (d.components.find((c) => c.id === comp.id)!.label = v))
                }
              />
              {[...new Set([...symbolOf(comp.type).props, ...Object.keys(comp.props)])].map((k) => (
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
              <p className="sub">ID {comp.id}</p>
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
    return c ? findSymbol(c.type)?.ports.find((p) => p.id === pid) : undefined;
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

function SheetProps({ doc }: { doc: Schema }) {
  const st = useEditor();
  const m = doc.meta;
  const set = (k: keyof Schema['meta']) => (v: string) => st.change('Schriftfeld', (d) => void (d.meta[k] = v));
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
            {['A4', 'A3', 'A2', 'A1'].map((s) => (
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
