// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { connect, doc, dropSymbol, fresh, screen } from './helpers.ts';

const CHAIN = ['air.intake', 'air.damper.motor', 'air.filter', 'air.heater', 'air.fan', 'air.silencer'];

test('build a schema with 6 components by mouse, save, reopen: same file', async ({ page }) => {
  await fresh(page);
  for (const [i, type] of CHAIN.entries()) await dropSymbol(page, type, 80 + i * 30, 140);
  let d = await doc(page);
  expect(d.components.map((c: any) => c.type)).toEqual(CHAIN);
  const ids = d.components.map((c: any) => c.id);
  for (let i = 0; i + 1 < ids.length; i++) await connect(page, [ids[i], 'out'], [ids[i + 1], 'in']);
  d = await doc(page);
  expect(d.connections).toHaveLength(5);
  expect(d.connections.map((c: any) => [c.from[0], c.to[0]])).toEqual(
    ids.slice(0, -1).map((id: string, i: number) => [id, ids[i + 1]]),
  );

  // Move one component by mouse: it snaps to the grid and gets pinned.
  const fan = d.components.find((c: any) => c.type === 'air.fan');
  const p = await screen(page, fan.pos[0], fan.pos[1]);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(p.x + 10, p.y + 60, { steps: 6 });
  await page.mouse.up();
  d = await doc(page);
  const moved = d.components.find((c: any) => c.id === fan.id);
  expect(moved.pos[1]).toBeGreaterThan(fan.pos[1]);
  expect((moved.pos[1] / 2.5) % 1).toBe(0);

  // Save (download), start a new schema, open the saved file, save again: identical text.
  const dl1 = page.waitForEvent('download');
  await page.keyboard.press('ControlOrMeta+s');
  const saved = await readFile((await (await dl1).path())!, 'utf8');
  page.once('dialog', (dlg) => dlg.accept());
  await page.getByTestId('btn-new').click();
  expect((await doc(page)).components).toHaveLength(0);
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('btn-open').click();
  await (await chooser).setFiles({ name: 'test.schema', mimeType: 'application/json', buffer: Buffer.from(saved) });

  await expect.poll(async () => (await doc(page)).components.length).toBe(6);
  const dl2 = page.waitForEvent('download');
  await page.getByTestId('btn-save').click();
  const again = await readFile((await (await dl2).path())!, 'utf8');
  expect(again).toBe(saved);
});

test('undo and redo', async ({ page }) => {
  await fresh(page);
  await dropSymbol(page, 'air.filter', 100, 140);
  await dropSymbol(page, 'air.fan', 140, 140);
  await connect(page, ['FI01', 'out'], ['VE01', 'in']);
  const full = await doc(page);
  expect(full.connections).toHaveLength(1);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await doc(page)).connections).toHaveLength(0);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await doc(page)).components).toHaveLength(1);
  await page.keyboard.press('ControlOrMeta+y');
  await page.keyboard.press('ControlOrMeta+y');
  expect(await doc(page)).toEqual(full);
  // Keyboard edits are steps too.
  await page.evaluate(() => (window as any).__editor.getState().select(['VE01']));
  await page.keyboard.press('r');
  expect((await doc(page)).components[1].rot).toBe(90);
  await page.getByTestId('btn-undo').click();
  expect((await doc(page)).components[1].rot).toBe(0);
  await page.getByTestId('btn-redo').click();
  expect((await doc(page)).components[1].rot).toBe(90);
});

test('dropping a symbol on a line inserts it into the line', async ({ page }) => {
  await fresh(page);
  await dropSymbol(page, 'air.filter', 80, 140);
  await dropSymbol(page, 'air.fan', 200, 140);
  await connect(page, ['FI01', 'out'], ['VE01', 'in']);
  await dropSymbol(page, 'air.heater', 140, 140);
  const d = await doc(page);
  expect(d.components.map((c: any) => c.id)).toEqual(['FI01', 'VE01', 'ER01']);
  expect(d.connections.map((c: any) => `${c.from.join('.')}>${c.to.join('.')}`)).toEqual([
    'FI01.out>ER01.in',
    'ER01.out>VE01.in',
  ]);
  expect(d.components[2].pos).toEqual([140, 140]);
  // One undo step removes the insertion completely.
  await page.keyboard.press('ControlOrMeta+z');
  const u = await doc(page);
  expect(u.components).toHaveLength(2);
  expect(u.connections).toHaveLength(1);
});

test('rectangle selection, duplicate, delete, group', async ({ page }) => {
  await fresh(page);
  await dropSymbol(page, 'air.filter', 100, 140);
  await dropSymbol(page, 'air.fan', 130, 140);
  const a = await screen(page, 85, 125),
    b = await screen(page, 145, 155);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 5 });
  await page.mouse.up();
  expect(await page.evaluate(() => (window as any).__editor.getState().selection)).toEqual(['FI01', 'VE01']);
  await page.keyboard.press('ControlOrMeta+g');
  expect((await doc(page)).groups[0].members).toEqual(['FI01', 'VE01']);
  await page.evaluate(() => (window as any).__editor.getState().select(['FI01']));
  await page.keyboard.press('ControlOrMeta+d');
  expect((await doc(page)).components).toHaveLength(3);
  await page.keyboard.press('Delete');
  expect((await doc(page)).components).toHaveLength(2);
});
