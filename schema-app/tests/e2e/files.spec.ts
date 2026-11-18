// SPDX-License-Identifier: AGPL-3.0-or-later
// Live sync and export. The "external program" is the test itself writing into a file of the origin private
// file system (a real FileSystemFileHandle, same API as a file picked with showOpenFilePicker).
import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { doc, fresh } from './helpers.ts';

const base = (title: string, comps = 1) =>
  JSON.stringify({
    format: 'hlks-schema',
    version: 1,
    meta: { title },
    components: Array.from({ length: comps }, (_, i) => ({
      id: `VE0${i + 1}`,
      type: 'air.fan',
      pos: [100 + i * 30, 120],
    })),
  });

/** Writes the file like an external program would. */
const writeExternal = (page: Page, text: string) =>
  page.evaluate(async (t) => {
    const root = await navigator.storage.getDirectory();
    const h = await root.getFileHandle('live.schema', { create: true });
    const w = await h.createWritable();
    await w.write(t);
    await w.close();
  }, text);

/** Reads the file; null while the editor's write is still open (Chromium locks the file meanwhile). */
const readExternal = (page: Page) =>
  page.evaluate(async () => {
    try {
      const root = await navigator.storage.getDirectory();
      return await (await (await root.getFileHandle('live.schema')).getFile()).text();
    } catch {
      return null;
    }
  });
const titleOnDisk = async (page: Page) => {
  const t = await readExternal(page);
  return t ? JSON.parse(t).meta.title : null;
};

async function openLive(page: Page, text: string) {
  await writeExternal(page, text);
  const ok = await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    return (window as any).__openHandle(await root.getFileHandle('live.schema'));
  });
  expect(ok).toBe(true);
}

test('external change reloads within 2 s; undo goes back', async ({ page }) => {
  await fresh(page);
  await openLive(page, base('Version 1'));
  expect((await doc(page)).meta.title).toBe('Version 1');
  await page.waitForTimeout(20);
  await writeExternal(page, base('Version 2', 2));
  const t0 = Date.now();
  await expect.poll(async () => (await doc(page)).meta.title, { timeout: 2000, intervals: [100] }).toBe('Version 2');
  expect(Date.now() - t0).toBeLessThan(2000);
  await expect(page.getByTestId('toast')).toContainText('extern geändert und neu geladen');
  expect((await doc(page)).components).toHaveLength(2);
  await page.getByTestId('btn-undo').click();
  expect((await doc(page)).meta.title).toBe('Version 1');
});

test('a half-written file is not loaded; the next valid version is', async ({ page }) => {
  await fresh(page);
  await openLive(page, base('Gut'));
  await page.waitForTimeout(20);
  await writeExternal(page, base('Kaputt').slice(0, 40));
  await expect(page.getByTestId('sync-error')).toBeVisible({ timeout: 2000 });
  await expect(page.getByTestId('sync-error')).toContainText('Zeile');
  expect((await doc(page)).meta.title).toBe('Gut');
  await writeExternal(page, base('Repariert'));
  await expect.poll(async () => (await doc(page)).meta.title, { timeout: 2000 }).toBe('Repariert');
  await expect(page.getByTestId('sync-error')).toBeHidden();
});

test('conflict: external change with unsaved local edits asks; both choices work', async ({ page }) => {
  await fresh(page);
  await openLive(page, base('Original'));
  // Local unsaved edit.
  await page.evaluate(() => (window as any).__editor.getState().change('x', (d: any) => void (d.meta.title = 'Lokal')));
  await page.waitForTimeout(20);
  await writeExternal(page, base('Extern'));
  await expect(page.getByTestId('conflict')).toBeVisible({ timeout: 2000 });
  expect((await doc(page)).meta.title).toBe('Lokal');
  await page.getByTestId('conflict-external').click();
  expect((await doc(page)).meta.title).toBe('Extern');

  await page.evaluate(() => (window as any).__editor.getState().change('x', (d: any) => void (d.meta.title = 'Meins')));
  await page.waitForTimeout(20);
  await writeExternal(page, base('Extern 2'));
  await expect(page.getByTestId('conflict')).toBeVisible({ timeout: 2000 });
  await page.getByTestId('conflict-mine').click();
  await expect.poll(() => titleOnDisk(page)).toBe('Meins');
  expect((await doc(page)).meta.title).toBe('Meins');
  // Our own write is not taken as an external change.
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('conflict')).toBeHidden();
});

test('Ctrl+S writes into the open file', async ({ page }) => {
  await fresh(page);
  await openLive(page, base('Datei'));
  await page.evaluate(() =>
    (window as any).__editor.getState().change('x', (d: any) => void (d.meta.title = 'Gespeichert')),
  );
  await page.keyboard.press('ControlOrMeta+s');
  await expect.poll(() => titleOnDisk(page)).toBe('Gespeichert');
  expect(await page.evaluate(() => (window as any).__editor.getState().dirty)).toBe(false);
});

test('PDF export: A3 (420 × 297 mm), text as vector text', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('examples').selectOption('monoblock-platten-wrg');
  await expect.poll(async () => (await doc(page)).components.length).toBeGreaterThan(5);
  const dl = page.waitForEvent('download');
  await page.locator('[data-testid=export-menu] summary').click();
  await page.getByTestId('export-pdf').click();
  const file = (await (await dl).path())!;
  await (await dl).saveAs('test-results/export-a3.pdf'); // kept for a visual check
  const data = new Uint8Array(await readFile(file));
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: false }).promise;
  expect(pdf.numPages).toBe(1);
  const p = await pdf.getPage(1);
  const vp = p.getViewport({ scale: 1 });
  const mm = (pt: number) => (pt * 25.4) / 72;
  expect(mm(vp.width)).toBeCloseTo(420, 1);
  expect(mm(vp.height)).toBeCloseTo(297, 1);
  const text = (await p.getTextContent()).items.map((i: any) => i.str).join(' ');
  expect(text).toContain('Monoblock mit Platten-WRG');
  expect(text).toContain('WRG01');
  expect(text).toContain('m³/h');
  // No raster images: the drawing is vector.
  const ops = await p.getOperatorList();
  const imageOps = [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject];
  expect(ops.fnArray.filter((f: number) => imageOps.includes(f))).toEqual([]);
});

test('SVG and PNG export download', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('examples').selectOption('zu-abluft-einfach');
  await expect.poll(async () => (await doc(page)).components.length).toBeGreaterThan(5);
  for (const [id, ext] of [
    ['export-svg', '.svg'],
    ['export-png', '.png'],
  ]) {
    const dl = page.waitForEvent('download');
    await page.locator('[data-testid=export-menu] summary').click();
    await page.getByTestId(id!).click();
    const d = await dl;
    expect(d.suggestedFilename()).toBe(`zu-abluft-einfach${ext}`);
    const buf = await readFile((await d.path())!);
    if (ext === '.png') {
      // 420 mm at 300 dpi = 4961 px wide.
      expect(buf.readUInt32BE(16)).toBe(4961);
      expect(buf.readUInt32BE(20)).toBe(3508);
    } else expect(buf.toString()).not.toContain('grid');
  }
});
