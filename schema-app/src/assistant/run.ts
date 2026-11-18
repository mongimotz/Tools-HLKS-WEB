// SPDX-License-Identifier: AGPL-3.0-or-later
// Check loop: model → operations → apply → validate; errors go back to the model, at most MAX_ROUNDS model calls.
// The result is a proposal; the editor shows it as a preview with «Übernehmen» / «Verwerfen».
import type { Schema } from '../model/types.ts';
import { validate } from '../model/validate.ts';
import { applyOps, parseOps, type Op } from '../ops/ops.ts';
import { chat, type ChatMessage, type Usage } from './client.ts';
import { systemPrompt } from './prompt.ts';
import { TOOL_NAME, TOOLS } from './tools.ts';
import type { AssistantSettings } from './settings.ts';

export const MAX_ROUNDS = 3;

export interface RunResult {
  status: 'ok' | 'nochange' | 'aborted';
  base: Schema;
  schema: Schema;
  ops: Op[];
  /** The model's closing text, or why the run stopped. */
  summary: string;
  rounds: number;
  usage: Usage;
  /** Last operation error (aborted runs). */
  error: string | null;
}

export interface Diff {
  added: string[];
  removed: string[];
  changed: string[];
}

const LISTS = ['components', 'connections', 'groups', 'texts', 'notes'] as const;

/** Element IDs added, removed or changed in content (positions and routes do not count). */
export function diffSchemas(a: Schema, b: Schema): Diff {
  const d: Diff = { added: [], removed: [], changed: [] };
  const key = (x: object) => {
    const { pos: _p, waypoints: _w, ...rest } = x as Record<string, unknown>;
    return JSON.stringify(rest);
  };
  for (const list of LISTS) {
    const before = new Map<string, object>(a[list].map((x) => [x.id, x]));
    const after = new Map<string, object>(b[list].map((x) => [x.id, x]));
    for (const [id, x] of after) {
      const y = before.get(id);
      if (!y) d.added.push(id);
      else if (key(x) !== key(y)) d.changed.push(id);
    }
    for (const id of before.keys()) if (!after.has(id)) d.removed.push(id);
  }
  return d;
}

function errorsOf(s: Schema): string[] {
  return validate(s)
    .filter((i) => i.severity === 'error')
    .map((i) => i.message);
}

export async function runAssistant(opts: {
  doc: Schema;
  task: string;
  settings: AssistantSettings;
  signal?: AbortSignal;
  fetch?: typeof fetch;
  onRound?: (round: number) => void;
}): Promise<RunResult> {
  const base = opts.doc;
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(base) },
    { role: 'user', content: opts.task },
  ];
  const usage: Usage = { prompt: 0, completion: 0, cost: null };
  const before = new Set(errorsOf(base));
  let work = base;
  const done: Op[] = [];
  let summary = '';
  let lastError: string | null = null;
  let round = 0;

  while (round < MAX_ROUNDS) {
    round++;
    opts.onRound?.(round);
    const reply = await chat({
      apiKey: opts.settings.apiKey,
      model: opts.settings.model,
      messages,
      tools: TOOLS,
      signal: opts.signal,
      fetch: opts.fetch,
    });
    if (reply.usage) {
      usage.prompt += reply.usage.prompt;
      usage.completion += reply.usage.completion;
      if (reply.usage.cost !== null) usage.cost = (usage.cost ?? 0) + reply.usage.cost;
    }
    messages.push(reply.message);
    summary = reply.message.content?.trim() ?? '';
    const calls = reply.message.tool_calls ?? [];
    if (!calls.length) {
      lastError = null;
      break;
    }
    lastError = null;
    for (const call of calls) {
      let content: string;
      try {
        if (call.function.name !== TOOL_NAME) throw new Error(`Unbekanntes Werkzeug "${call.function.name}".`);
        let args: unknown;
        try {
          args = JSON.parse(call.function.arguments || '{}');
        } catch {
          throw new Error('Argumente sind kein gültiges JSON.');
        }
        const ops = parseOps(args);
        const r = applyOps(work, ops);
        work = r.schema;
        done.push(...ops);
        const fresh = errorsOf(work).filter((m) => !before.has(m));
        content =
          `Angewendet.${r.added.length ? ` Neu: ${r.added.join(', ')}.` : ''}` +
          (fresh.length ? ` Prüfung meldet Fehler:\n- ${fresh.join('\n- ')}` : ' Prüfung ohne Fehler.') +
          (r.suggestion ? ` Hinweis: ${r.suggestion}` : '');
        if (fresh.length) lastError = fresh.join('; ');
      } catch (e) {
        lastError = (e as Error).message;
        content = `Fehler: ${lastError} Nichts wurde geändert.`;
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content });
    }
  }

  const changed = work !== base;
  if (lastError && round >= MAX_ROUNDS)
    return {
      status: changed ? 'ok' : 'aborted',
      base,
      schema: work,
      ops: done,
      summary: `Abbruch nach ${MAX_ROUNDS} Runden: ${lastError}`,
      rounds: round,
      usage,
      error: lastError,
    };
  return {
    status: changed ? 'ok' : 'nochange',
    base,
    schema: work,
    ops: done,
    summary: summary || (changed ? '' : 'Keine Änderung.'),
    rounds: round,
    usage,
    error: null,
  };
}
