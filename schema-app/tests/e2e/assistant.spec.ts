// SPDX-License-Identifier: AGPL-3.0-or-later
// Assistant UI against a mock OpenRouter (Playwright intercepts https://openrouter.ai/api/v1/*).
import { test, expect, type Page, type Route } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { doc, fresh } from './helpers.ts';

const KEY = 'sk-or-test-E2E-SECRET-987';

type Handler = (body: any, n: number) => { content?: string; ops?: unknown[] };

/** Mock OpenRouter. Returns the request bodies and headers seen. */
async function mockOpenRouter(page: Page, handler: Handler) {
  const seen: { auth: string | null; body: any }[] = [];
  await page.route('https://openrouter.ai/api/v1/models', (r) =>
    r.fulfill({ json: { data: [{ id: 'test/model', supported_parameters: ['tools'] }] } }),
  );
  await page.route('https://openrouter.ai/api/v1/chat/completions', async (r: Route) => {
    const body = r.request().postDataJSON();
    seen.push({ auth: r.request().headers()['authorization'] ?? null, body });
    const a = handler(body, seen.length);
    await r.fulfill({
      headers: { 'Access-Control-Allow-Origin': '*' },
      json: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: a.content ?? null,
              tool_calls: a.ops
                ? [
                    {
                      id: `c${seen.length}`,
                      type: 'function',
                      function: { name: 'apply_operations', arguments: JSON.stringify({ ops: a.ops }) },
                    },
                  ]
                : undefined,
            },
          },
        ],
        usage: { prompt_tokens: 1200, completion_tokens: 80, cost: 0.0042 },
      },
    });
  });
  return seen;
}

async function setKey(page: Page) {
  await page.getByTestId('btn-assistant').click();
  await page.getByTestId('assistant-key').fill(KEY);
  await page.getByTestId('assistant-model').fill('test/model');
  await page.getByTestId('assistant-save').click();
}

const chain = [
  {
    op: 'add_chain',
    strand: 'supply',
    items: [{ type: 'air.intake' }, { type: 'air.filter', props: { Klasse: 'ePM1 55%' } }, { type: 'air.fan' }],
  },
];
const finishAfterTool: Handler = (body) =>
  body.messages.at(-1).role === 'tool' ? { content: 'Zuluft erstellt.' } : { ops: chain };

test('free-text task: preview with highlights, apply as one undo step; the key never leaks', async ({ page }) => {
  const logs: string[] = [];
  page.on('console', (m) => logs.push(m.text()));
  // Save as download (no File System Access API), so the saved text can be read.
  await page.addInitScript(() => {
    delete (window as any).showOpenFilePicker;
    delete (window as any).showSaveFilePicker;
  });
  await fresh(page);
  const seen = await mockOpenRouter(page, finishAfterTool);
  await setKey(page);
  await page.getByTestId('assistant-task').fill('Zuluft mit Filter und Ventilator');
  await page.getByTestId('assistant-run').click();

  await expect(page.getByTestId('proposal')).toBeVisible();
  await expect(page.getByTestId('assistant-result')).toContainText('Zuluft erstellt.');
  await expect(page.getByTestId('assistant-result')).toContainText('Tokens');
  await expect(page.getByTestId('assistant-result')).toContainText('0.0084 USD');
  // Not applied yet: the document is unchanged, the canvas shows the proposal in green.
  expect((await doc(page)).components).toHaveLength(0);
  await expect(page.locator('.sheet rect[stroke="#1f9e5a"], .sheet [stroke="#1f9e5a"]').first()).toBeAttached();

  await page.getByTestId('proposal-apply').click();
  await expect(page.getByTestId('proposal')).toBeHidden();
  expect((await doc(page)).components.map((c: any) => c.type)).toEqual(['air.intake', 'air.filter', 'air.fan']);
  expect(await page.evaluate(() => (window as any).__editor.getState().past.at(-1).label)).toBe('Assistent');
  await page.getByTestId('btn-undo').click();
  expect((await doc(page)).components).toHaveLength(0);
  await page.getByTestId('btn-redo').click();

  // The key went only into the Authorization header.
  expect(seen.length).toBe(2);
  for (const s of seen) {
    expect(s.auth).toBe(`Bearer ${KEY}`);
    expect(JSON.stringify(s.body)).not.toContain(KEY);
  }
  // Not in the saved file, the SVG export, the draft or the console.
  const save = page.waitForEvent('download');
  await page.getByTestId('btn-save').click();
  const saved = await readFile((await (await save).path())!, 'utf8');
  expect(saved).toContain('air.fan');
  expect(saved).not.toContain(KEY);
  const svgDl = page.waitForEvent('download');
  await page.locator('[data-testid=export-menu] summary').click();
  await page.getByTestId('export-svg').click();
  expect(await readFile((await (await svgDl).path())!, 'utf8')).not.toContain(KEY);
  await page.waitForTimeout(500); // draft is debounced
  const storage = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k !== 'hlks-schema-assistant')
      .map((k) => localStorage.getItem(k))
      .join('\n'),
  );
  expect(storage).toContain('air.fan');
  expect(storage).not.toContain(KEY);
  expect(logs.join('\n')).not.toContain(KEY);
});

test('discard keeps the document; three failed rounds abort without a preview', async ({ page }) => {
  await fresh(page);
  let mode: 'ok' | 'bad' = 'ok';
  await mockOpenRouter(page, (body) =>
    mode === 'bad'
      ? { ops: [{ op: 'remove', id: 'NOPE' }] }
      : body.messages.at(-1).role === 'tool'
        ? { content: 'ok' }
        : { ops: chain },
  );
  await setKey(page);
  await page.getByTestId('assistant-task').fill('Zuluft');
  await page.getByTestId('assistant-run').click();
  await expect(page.getByTestId('proposal')).toBeVisible();
  await page.getByTestId('proposal-discard').click();
  await expect(page.getByTestId('proposal')).toBeHidden();
  expect((await doc(page)).components).toHaveLength(0);

  mode = 'bad';
  await page.getByTestId('assistant-run').click();
  await expect(page.getByTestId('assistant-result')).toContainText('Abbruch nach 3 Runden');
  await expect(page.getByTestId('proposal')).toBeHidden();
  expect((await doc(page)).components).toHaveLength(0);
});

test('«Anmerkungen abarbeiten» resolves open notes with a reply', async ({ page }) => {
  await fresh(page);
  await page.evaluate(() =>
    (window as any).__editor.getState().ops('x', [
      { op: 'add_component', type: 'air.fan', id: 'VE01', pos: [150, 120] },
      { op: 'add_note', id: 'N01', anchor: { component: 'VE01' }, text: 'Volumenstrom 4000 m³/h eintragen' },
    ]),
  );
  const seen = await mockOpenRouter(page, (body) =>
    body.messages.at(-1).role === 'tool'
      ? { content: 'N01 erledigt.' }
      : {
          ops: [
            { op: 'set_props', id: 'VE01', props: { V: '4000 m³/h' } },
            { op: 'resolve_note', id: 'N01', reply: 'Volumenstrom eingetragen.' },
          ],
        },
  );
  await setKey(page);
  await page.getByTestId('assistant-notes').click();
  await expect(page.getByTestId('proposal')).toBeVisible();
  // The task and the prompt carry the open note.
  expect(seen[0]!.body.messages[1].content).toContain('N01');
  expect(seen[0]!.body.messages[0].content).toContain('Volumenstrom 4000 m³/h eintragen');
  await page.getByTestId('proposal-apply').click();
  const d = await doc(page);
  expect(d.notes[0]).toMatchObject({ status: 'done', reply: 'Volumenstrom eingetragen.' });
  expect(d.components[0].props.V).toBe('4000 m³/h');
});
