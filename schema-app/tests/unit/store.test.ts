// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { MAX_UNDO, useEditor } from '../../src/editor/store.ts';
import { emptySchema } from '../../src/model/create.ts';

describe('editor store', () => {
  it('keeps at least 200 undo steps and undoes them in order', () => {
    const st = useEditor.getState();
    st.load(emptySchema('T', '2026-11-18'));
    for (let i = 0; i < 250; i++) useEditor.getState().change('Titel', (d) => void (d.meta.title = `T${i}`));
    expect(MAX_UNDO).toBeGreaterThanOrEqual(200);
    expect(useEditor.getState().past).toHaveLength(MAX_UNDO);
    for (let i = 0; i < 200; i++) useEditor.getState().undo();
    expect(useEditor.getState().doc.meta.title).toBe('T49');
    useEditor.getState().redo();
    expect(useEditor.getState().doc.meta.title).toBe('T50');
  });

  it('an external reload is one undo step', () => {
    const st = useEditor.getState();
    st.load(emptySchema('A', '2026-11-18'));
    useEditor.getState().load(emptySchema('B', '2026-11-18'), undefined, { asStep: 'Datei extern geändert' });
    expect(useEditor.getState().doc.meta.title).toBe('B');
    useEditor.getState().undo();
    expect(useEditor.getState().doc.meta.title).toBe('A');
  });

  it('invalid operations do not change the document and show a message', () => {
    useEditor.getState().load(emptySchema('A', '2026-11-18'));
    expect(useEditor.getState().ops('x', [{ op: 'remove', id: 'NOPE' }])).toBeNull();
    expect(useEditor.getState().past).toHaveLength(0);
    expect(useEditor.getState().message?.kind).toBe('error');
  });
});
