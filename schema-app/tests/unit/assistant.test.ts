// SPDX-License-Identifier: AGPL-3.0-or-later
// Assistant check loop against a mock OpenRouter (fetch stub). Real calls only with OPENROUTER_API_KEY.
import { describe, expect, it } from 'vitest';
import { diffSchemas, MAX_ROUNDS, runAssistant } from '../../src/assistant/run.ts';
import { systemPrompt } from '../../src/assistant/prompt.ts';
import { TOOLS } from '../../src/assistant/tools.ts';
import { comp, schema } from './helpers.ts';

const KEY = 'sk-or-test-SECRET-123';
const settings = { apiKey: KEY, model: 'test/model' };

type Reply = { content?: string; ops?: unknown; raw?: string };

/** Mock OpenRouter: answers with the given replies in order and records the requests. */
function mock(replies: Reply[]) {
  const requests: { headers: Record<string, string>; body: any }[] = [];
  let n = 0;
  const f = (async (_url: string, init: RequestInit) => {
    requests.push({ headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
    const r = replies[n++] ?? { content: 'Fertig.' };
    const tool_calls =
      r.ops !== undefined || r.raw !== undefined
        ? [
            {
              id: `call_${n}`,
              type: 'function',
              function: { name: 'apply_operations', arguments: r.raw ?? JSON.stringify({ ops: r.ops }) },
            },
          ]
        : undefined;
    return new Response(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: r.content ?? null, tool_calls } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.001 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as unknown as typeof fetch;
  return { f, requests };
}

const chain = [
  {
    op: 'add_chain',
    strand: 'supply',
    items: [{ type: 'air.intake' }, { type: 'air.filter', props: { Klasse: 'ePM1 55%' } }, { type: 'air.fan' }],
  },
];

describe('assistant', () => {
  it('success: operations are applied, the model finishes, usage is summed', async () => {
    const { f, requests } = mock([{ ops: chain }, { content: 'Zuluft mit Filter und Ventilator.' }]);
    const r = await runAssistant({ doc: schema(), task: 'Zuluft', settings, fetch: f });
    expect(r.status).toBe('ok');
    expect(r.rounds).toBe(2);
    expect(r.schema.components.map((c) => c.type)).toContain('air.fan');
    expect(r.summary).toBe('Zuluft mit Filter und Ventilator.');
    expect(r.usage).toEqual({ prompt: 200, completion: 40, cost: 0.002 });
    // The tool result tells the model what happened.
    expect(requests[1]!.body.messages.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 'call_1' });
    expect(requests[1]!.body.messages.at(-1).content).toContain('Angewendet');
    expect(diffSchemas(r.base, r.schema).added.length).toBeGreaterThan(2);
  });

  it('an invalid operation goes back to the model, which corrects it', async () => {
    const { f, requests } = mock([
      { ops: [{ op: 'add_component', type: 'air.nope' }] },
      { ops: [{ op: 'add_component', type: 'air.fan', id: 'VE01' }] },
      { content: 'Ventilator ergänzt.' },
    ]);
    const r = await runAssistant({ doc: schema(), task: 'Ventilator', settings, fetch: f });
    expect(r.status).toBe('ok');
    expect(r.rounds).toBe(3);
    expect(r.schema.components.map((c) => c.id)).toEqual(['VE01']);
    const feedback = requests[1]!.body.messages.at(-1).content as string;
    expect(feedback).toMatch(/^Fehler: .*air\.nope.*Nichts wurde geändert/s);
  });

  it('stops after 3 rounds of errors and leaves the document unchanged', async () => {
    const bad = { ops: [{ op: 'remove', id: 'NOPE' }] };
    const { f, requests } = mock([bad, bad, bad, { content: 'nie' }]);
    const doc = schema({ components: [comp('VE01', 'air.fan', [100, 100])] });
    const r = await runAssistant({ doc, task: 'x', settings, fetch: f });
    expect(MAX_ROUNDS).toBe(3);
    expect(requests).toHaveLength(3);
    expect(r.status).toBe('aborted');
    expect(r.schema).toBe(doc);
    expect(r.summary).toContain('Abbruch nach 3 Runden');
  });

  it('invalid JSON arguments are reported, not thrown', async () => {
    const { f } = mock([{ raw: '{"ops": [' }, { content: 'Nichts zu tun.' }]);
    const r = await runAssistant({ doc: schema(), task: 'x', settings, fetch: f });
    expect(r.status).toBe('nochange');
  });

  it('cancelling aborts the request', async () => {
    const ctrl = new AbortController();
    const f = ((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => {
        init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    const p = runAssistant({ doc: schema(), task: 'x', settings, fetch: f, signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('API errors are clear messages', async () => {
    const f = (async () =>
      new Response(JSON.stringify({ error: { message: 'No auth' } }), { status: 401 })) as unknown as typeof fetch;
    await expect(runAssistant({ doc: schema(), task: 'x', settings, fetch: f })).rejects.toThrow('API-Key ungültig');
  });

  it('the key is only in the Authorization header, never in the messages', async () => {
    const { f, requests } = mock([{ ops: chain }, { content: 'ok' }]);
    const r = await runAssistant({ doc: schema(), task: 'Zuluft', settings, fetch: f });
    for (const q of requests) {
      expect(q.headers.Authorization).toBe(`Bearer ${KEY}`);
      expect(JSON.stringify(q.body)).not.toContain(KEY);
    }
    expect(JSON.stringify(r.schema)).not.toContain(KEY);
  });

  it('prompt lists symbols and the schema, positions only for pinned components', () => {
    const doc = schema({
      components: [comp('VE01', 'air.fan', [100, 100], { pinned: true }), comp('FI01', 'air.filter', [60, 100])],
    });
    const p = systemPrompt(doc);
    expect(p).toContain('air.hrc.rotor');
    expect(p).toContain('air.supply ZUL');
    expect(p).toContain('VE01 air.fan pinned pos=[100,100]');
    expect(p).toMatch(/- FI01 air\.filter\n/);
    // The tool schema is plain JSON schema (no oneOf, no $schema).
    const params = JSON.stringify(TOOLS[0]!.function.parameters);
    expect(params).not.toContain('oneOf');
    expect(params).toContain('add_chain');
  });

  it.skipIf(!process.env.OPENROUTER_API_KEY)(
    'real OpenRouter call builds a supply strand',
    async () => {
      const r = await runAssistant({
        doc: schema(),
        task: 'Zuluft: Aussenluftfassung, Filter ePM1 55%, Ventilator.',
        settings: {
          apiKey: process.env.OPENROUTER_API_KEY!,
          model: process.env.OPENROUTER_MODEL ?? 'anthropic/claude-sonnet-5.5',
        },
      });
      expect(r.status).toBe('ok');
      expect(r.schema.components.some((c) => c.type === 'air.fan')).toBe(true);
    },
    120_000,
  );
});
