// SPDX-License-Identifier: AGPL-3.0-or-later
// OpenRouter chat completions with tool calling, called straight from the browser (CORS allowed by OpenRouter).
// No logging here: requests carry the API key.
export const ENDPOINT = 'https://openrouter.ai/api/v1';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface Usage {
  prompt: number;
  completion: number;
  /** USD, when OpenRouter reports it. */
  cost: number | null;
}

export interface ChatReply {
  message: Extract<ChatMessage, { role: 'assistant' }>;
  usage: Usage | null;
}

export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: object };
}

export class AssistantError extends Error {}

export async function chat(opts: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  signal?: AbortSignal;
  fetch?: typeof fetch;
}): Promise<ChatReply> {
  const f = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await f(`${ENDPOINT}/chat/completions`, {
      method: 'POST',
      signal: opts.signal,
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'HLKS-Tools Prinzipschema',
      },
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        tools: opts.tools,
        tool_choice: 'auto',
        usage: { include: true },
      }),
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new AssistantError('OpenRouter nicht erreichbar.');
  }
  const body = (await res.json().catch(() => null)) as {
    error?: { message?: string };
    choices?: { message?: ChatReply['message'] }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  } | null;
  if (!res.ok || body?.error) {
    if (res.status === 401) throw new AssistantError('API-Key ungültig (401).');
    if (res.status === 402) throw new AssistantError('Kein Guthaben bei OpenRouter (402).');
    throw new AssistantError(`OpenRouter: ${body?.error?.message ?? res.statusText ?? 'Fehler'} (${res.status}).`);
  }
  const message = body?.choices?.[0]?.message;
  if (!message) throw new AssistantError('Leere Antwort von OpenRouter.');
  const u = body?.usage;
  return {
    message: { role: 'assistant', content: message.content ?? null, tool_calls: message.tool_calls },
    usage: u ? { prompt: u.prompt_tokens ?? 0, completion: u.completion_tokens ?? 0, cost: u.cost ?? null } : null,
  };
}

/** Model IDs that support tool calling (public list, no key needed). */
export async function listModels(f: typeof fetch = fetch): Promise<string[]> {
  const res = await f(`${ENDPOINT}/models`);
  if (!res.ok) return [];
  const body = (await res.json()) as { data?: { id: string; supported_parameters?: string[] }[] };
  return (body.data ?? [])
    .filter((m) => m.supported_parameters?.includes('tools') && !m.id.endsWith(':batch'))
    .map((m) => m.id)
    .sort();
}
