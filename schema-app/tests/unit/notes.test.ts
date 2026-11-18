// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import type { Note } from '../../src/model/types.ts';
import { applyOps } from '../../src/ops/ops.ts';
import { validate } from '../../src/model/validate.ts';
import { renderSchema, PIN_HEAD } from '../../src/render/render.ts';
import { exportSvgText } from '../../src/io/export.ts';
import { deleteSelection } from '../../src/editor/actions.ts';
import { useEditor } from '../../src/editor/store.ts';
import { comp, con, schema } from './helpers.ts';

const note = (id: string, anchor: Note['anchor']): Note => ({
  id,
  anchor,
  text: 'Prüfen',
  status: 'open',
  created: '2026-11-18T10:00',
  reply: null,
});

function doc() {
  return schema({
    components: [comp('VE01', 'air.fan', [100, 100]), comp('FI01', 'air.filter', [60, 100])],
    connections: [con('L01', ['FI01', 'out'], ['VE01', 'in'])],
    notes: [note('N01', { component: 'VE01' }), note('N02', { connection: 'L01' }), note('N03', { pos: [20, 20] })],
  });
}

describe('notes', () => {
  it('deleting a component keeps its notes and those of its lines as free notes', () => {
    const out = deleteSelection(doc(), ['VE01']);
    expect(out.notes.map((n) => n.id)).toEqual(['N01', 'N02', 'N03']);
    expect(out.notes.every((n) => 'pos' in n.anchor)).toBe(true);
    expect(validate(out).filter((i) => i.severity === 'error')).toEqual([]);
    // The pin stays where it was (component box top right).
    const before = renderSchema(doc()).notePins.find((p) => p.id === 'N01')!.at;
    expect((out.notes[0]!.anchor as { pos: number[] }).pos).toEqual(before);
  });

  it('deleting a selected note removes only the note', () => {
    const out = deleteSelection(doc(), ['N02']);
    expect(out.notes.map((n) => n.id)).toEqual(['N01', 'N03']);
    expect(out.connections).toHaveLength(1);
  });

  it('the remove operation keeps notes of removed elements as free notes', () => {
    const r = applyOps(doc(), [{ op: 'remove', id: 'L01' }]);
    expect(r.schema.notes.find((n) => n.id === 'N02')!.anchor).toEqual({ pos: expect.any(Array) });
    expect(r.schema.notes.find((n) => n.id === 'N01')!.anchor).toEqual({ component: 'VE01' });
    expect(validate(r.schema).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('pins are drawn only with the notes option, never in exports', () => {
    expect(renderSchema(doc(), { notes: true }).svg).toContain('note-pin');
    expect(renderSchema(doc()).svg).not.toContain('note-pin');
    expect(exportSvgText(doc())).not.toContain('note-pin');
    expect(exportSvgText(doc(), { mono: true })).not.toContain('note-pin');
    // Positions are known without drawing them (editor hit areas).
    expect(renderSchema(doc()).notePins.map((p) => p.id)).toEqual(['N01', 'N02', 'N03']);
  });

  it('the pin number sits in the centre of the pin head', () => {
    const svg = renderSchema(doc(), { notes: true }).svg;
    const y = Number(/<g class="note-pin"[^>]*>.*?<text x="0" y="([-\d.]+)"/.exec(svg)![1]);
    // Baseline about 0.35 em below the head centre, so the digit's middle is on it.
    expect(y - 0.35 * 2.2).toBeCloseTo(PIN_HEAD[1], 1);
  });

  it('opening a note selects its anchor and shows the notes panel', () => {
    useEditor.getState().load(doc());
    useEditor.getState().openNote('N02');
    const st = useEditor.getState();
    expect(st.activeNote).toBe('N02');
    expect(st.panel).toBe('notes');
    expect(st.selection).toEqual(['L01']);
    useEditor.getState().openNote('N03');
    expect(useEditor.getState().selection).toEqual([]);
  });
});
