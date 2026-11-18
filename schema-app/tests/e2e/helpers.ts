// SPDX-License-Identifier: AGPL-3.0-or-later
import { expect, type Page } from '@playwright/test';

export type Pt = { x: number; y: number };

export async function fresh(page: Page) {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.goto('./');
  await expect(page.getByTestId('canvas')).toBeVisible();
  await page.waitForFunction(() => (window as any).__editor?.getState().view);
}

export const doc = (page: Page) => page.evaluate(() => (window as any).__editor.getState().doc);
export const screen = (page: Page, x: number, y: number): Promise<Pt> =>
  page.evaluate(([x, y]) => (window as any).__screen(x, y), [x, y]);
export const port = (page: Page, c: string, p: string): Promise<Pt> =>
  page.evaluate(([c, p]) => (window as any).__port(c, p), [c, p]);

/** Drags a symbol from the palette onto the sheet at (x, y) mm. */
export async function dropSymbol(page: Page, type: string, x: number, y: number) {
  const target = await screen(page, x, y);
  const canvas = page.getByTestId('canvas');
  const box = (await canvas.boundingBox())!;
  await page
    .locator(`button.sym[data-type="${type}"]`)
    .dragTo(canvas, { targetPosition: { x: target.x - box.x, y: target.y - box.y } });
}

/** Drags from one port to another with the mouse. */
export async function connect(page: Page, a: [string, string], b: [string, string]) {
  const p = await port(page, ...a);
  const q = await port(page, ...b);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 4 });
  await page.mouse.move(q.x, q.y, { steps: 4 });
  await page.mouse.up();
}
