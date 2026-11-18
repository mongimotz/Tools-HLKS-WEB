// SPDX-License-Identifier: AGPL-3.0-or-later
// Notes panel: list with filter, open note with text, reply, status; jump to the spot. Every edit is one undo step.
import { useRef, useState } from 'react';
import type { Note, Schema } from '../model/types.ts';
import { renderSchema } from '../render/render.ts';
import { useEditor } from './store.ts';
import { Icon } from './icons.tsx';

type Filter = 'open' | 'done' | 'all';

export function anchorLabel(doc: Schema, n: Note): string {
  const a = n.anchor;
  if ('component' in a) {
    const c = doc.components.find((x) => x.id === a.component);
    return c && c.label && c.label !== c.id ? `${c.id} ${c.label}` : a.component;
  }
  if ('connection' in a) return `Leitung ${a.connection}`;
  return `Blatt ${a.pos[0]} / ${a.pos[1]}`;
}

/** Centres the view on a note's pin, keeping the zoom. */
export function jumpToNote(id: string) {
  const st = useEditor.getState();
  st.openNote(id);
  const pin = renderSchema(st.doc).notePins.find((p) => p.id === id);
  const el = document.querySelector('[data-testid="canvas"]') as HTMLElement | null;
  const v = st.view;
  if (!pin || !el || !v) return;
  st.setView({ zoom: v.zoom, x: pin.at[0] - el.clientWidth / v.zoom / 2, y: pin.at[1] - el.clientHeight / v.zoom / 2 });
}

export function NotesPanel() {
  const st = useEditor();
  const [filter, setFilter] = useState<Filter>('open');
  const notes = st.doc.notes;
  const open = notes.filter((n) => n.status === 'open').length;
  const shown = notes
    .map((n, i) => ({ n, no: i + 1 }))
    .filter(({ n }) => filter === 'all' || n.status === filter || n.id === st.activeNote);
  const edit = (id: string, label: string, fn: (n: Note) => void) =>
    st.change(label, (d) => {
      const n = d.notes.find((x) => x.id === id);
      if (n) fn(n);
    });

  return (
    <section className="notes-panel">
      <div className="seg" role="radiogroup" aria-label="Filter">
        {(
          [
            ['open', `Offen ${open}`],
            ['done', `Erledigt ${notes.length - open}`],
            ['all', 'Alle'],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button
            key={f}
            role="radio"
            aria-checked={filter === f}
            data-testid={`notes-filter-${f}`}
            onClick={() => setFilter(f)}
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="note-list">
        {shown.map(({ n, no }) => {
          const active = n.id === st.activeNote;
          return (
            <li key={n.id} className={`${n.status}${active ? ' active' : ''}`} data-testid={`note-${n.id}`}>
              <div className="note-row">
                <button className="note-head" aria-expanded={active} onClick={() => st.openNote(active ? null : n.id)}>
                  <span className="note-no">{no}</span>
                  <span className="note-text">{n.text}</span>
                </button>
                <button
                  className="tb"
                  title="Zur Stelle springen"
                  aria-label="Zur Stelle springen"
                  data-testid="note-jump"
                  onClick={() => jumpToNote(n.id)}
                >
                  <Icon name="fit" />
                </button>
                <button
                  className="tb"
                  title={n.status === 'open' ? 'Erledigt' : 'Wieder öffnen'}
                  aria-label={n.status === 'open' ? 'Erledigt' : 'Wieder öffnen'}
                  aria-pressed={n.status === 'done'}
                  data-testid="note-status"
                  onClick={() =>
                    edit(n.id, n.status === 'open' ? 'Anmerkung erledigt' : 'Anmerkung öffnen', (x) => {
                      x.status = x.status === 'open' ? 'done' : 'open';
                    })
                  }
                >
                  <Icon name="check" />
                </button>
              </div>
              {active && (
                <div className="note-body">
                  <TextArea
                    label="Text"
                    value={n.text}
                    testid="note-text"
                    onCommit={(v) => v.trim() && edit(n.id, 'Anmerkung', (x) => void (x.text = v.trim()))}
                  />
                  <TextArea
                    label="Antwort"
                    value={n.reply ?? ''}
                    testid="note-reply"
                    onCommit={(v) => edit(n.id, 'Antwort', (x) => void (x.reply = v.trim() || null))}
                  />
                  <p className="sub">
                    {anchorLabel(st.doc, n)} | {n.created.replace('T', ' ')} | {n.id}
                  </p>
                  <button
                    className="danger"
                    data-testid="note-delete"
                    onClick={() => {
                      st.change('Anmerkung löschen', (d) => void (d.notes = d.notes.filter((x) => x.id !== n.id)));
                      st.openNote(null);
                    }}
                  >
                    <Icon name="trash" /> Löschen
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!shown.length && <p className="sub empty">0 Anmerkungen</p>}
    </section>
  );
}

function TextArea({
  label,
  value,
  onCommit,
  testid,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  testid?: string;
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
      <textarea
        rows={2}
        value={v}
        data-testid={testid}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          if (!cancelled.current && v !== value) onCommit(v);
          cancelled.current = false;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
          if (e.key === 'Escape') {
            cancelled.current = true;
            setV(value);
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
      />
    </label>
  );
}
