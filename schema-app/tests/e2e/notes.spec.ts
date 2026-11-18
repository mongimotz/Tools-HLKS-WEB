// SPDX-License-Identifier: AGPL-3.0-or-later
// Notes: place one with the mouse → it is in the live file; resolve it with the CLI logic → the editor shows it.
import { test, expect, type Page } from '@playwright/test';
import { parseText } from '../../src/model/migrate.ts';
import { serialize } from '../../src/model/serialize.ts';
import { applyOps } from '../../src/ops/ops.ts';
import { doc, fresh, screen } from './helpers.ts';

const FILE = 'notes.schema';
const start = JSON.stringify({
  format: 'hlks-schema',
  version: 1,
  meta: { title: 'Anmerkungen' },
  components: [{ id: 'VE01', type: 'air.fan', pos: [150, 120] }],
});

const writeExternal = (page: Page, text: string) =>
  page.evaluate(
    async ([name, t]) => {
      const root = await navigator.storage.getDirectory();
      const w = await (await root.getFileHandle(name!, { create: true })).createWritable();
      await w.write(t!);
      await w.close();
    },
    [FILE, text],
  );
const readExternal = (page: Page) =>
  page.evaluate(async (name) => {
    try {
      const root = await navigator.storage.getDirectory();
      return await (await (await root.getFileHandle(name)).getFile()).text();
    } catch {
      return null;
    }
  }, FILE);

async function openLive(page: Page) {
  await writeExternal(page, start);
  const ok = await page.evaluate(async (name) => {
    const root = await navigator.storage.getDirectory();
    return (window as any).__openHandle(await root.getFileHandle(name));
  }, FILE);
  expect(ok).toBe(true);
}

async function placeNote(page: Page, x: number, y: number, text: string) {
  await page.getByTestId('btn-note').click();
  const p = await screen(page, x, y);
  await page.mouse.click(p.x, p.y);
  await page.getByTestId('note-input').fill(text);
  await page.getByTestId('note-input').press('Enter');
}

test('a note placed by mouse is saved to the file; resolving it outside shows after live sync', async ({ page }) => {
  await fresh(page);
  await openLive(page);
  await placeNote(page, 150, 120, 'Ventilator mit FU?');
  const notes = (await doc(page)).notes;
  expect(notes).toEqual([expect.objectContaining({ id: 'N01', anchor: { component: 'VE01' }, status: 'open' })]);
  // Back to the select tool, note open in the panel.
  expect(await page.evaluate(() => (window as any).__editor.getState().tool)).toBe('select');
  await expect(page.getByTestId('note-N01')).toBeVisible();

  await page.getByTestId('btn-save').click();
  await expect.poll(async () => (await readExternal(page)) ?? '', { timeout: 3000 }).toContain('Ventilator mit FU?');
  const saved = parseText((await readExternal(page))!);
  expect(saved.notes[0]).toMatchObject({ id: 'N01', status: 'open', anchor: { component: 'VE01' } });

  // What `schema-cli resolve notes.schema N01 "…"` does.
  const resolved = applyOps(saved, [{ op: 'resolve_note', id: 'N01', reply: 'FU ergänzt' }]).schema;
  await page.waitForTimeout(20);
  await writeExternal(page, serialize(resolved));
  await expect.poll(async () => (await doc(page)).notes[0]?.status, { timeout: 2500, intervals: [100] }).toBe('done');
  expect((await doc(page)).notes[0].reply).toBe('FU ergänzt');
  // Filter "Offen" (default) keeps the open note visible; "Erledigt" lists it.
  await page.getByTestId('notes-filter-done').click();
  await expect(page.getByTestId('note-N01')).toBeVisible();
  await expect(page.getByTestId('note-reply')).toHaveValue('FU ergänzt');
});

test('pins open notes; status, delete and undo', async ({ page }) => {
  await fresh(page);
  await page.evaluate(() => {
    const st = (window as any).__editor.getState();
    st.ops('x', [{ op: 'add_component', type: 'air.fan', id: 'VE01', pos: [150, 120] }]);
  });
  await placeNote(page, 60, 60, 'Freie Anmerkung');
  await page.keyboard.press('n');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as any).__editor.getState().tool)).toBe('select');
  const d = await doc(page);
  expect(d.notes[0].anchor).toEqual({ pos: [60, 60] });

  // Switch away, then a click on the pin opens the note again.
  await page.getByTestId('tab-props').click();
  await page.locator('[data-note="N01"]').click();
  await expect(page.getByTestId('note-N01')).toHaveClass(/active/);

  await page.getByTestId('note-status').click();
  expect((await doc(page)).notes[0].status).toBe('done');
  await page.getByTestId('btn-undo').click();
  expect((await doc(page)).notes[0].status).toBe('open');

  await page.getByTestId('note-delete').click();
  expect((await doc(page)).notes).toHaveLength(0);
  await page.getByTestId('btn-undo').click();
  expect((await doc(page)).notes).toHaveLength(1);
});
