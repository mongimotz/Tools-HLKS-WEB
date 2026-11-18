// SPDX-License-Identifier: AGPL-3.0-or-later
// Assistant settings: OpenRouter API key and model. Stored only in this browser's localStorage, under their own
// key, never in the document, the draft, a saved file or an export.
export interface AssistantSettings {
  apiKey: string;
  model: string;
}

export const SETTINGS_KEY = 'hlks-schema-assistant';
export const DEFAULT_MODEL = 'anthropic/claude-sonnet-5.5';

export function loadSettings(): AssistantSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<AssistantSettings>;
    return {
      apiKey: typeof raw.apiKey === 'string' ? raw.apiKey : '',
      model: typeof raw.model === 'string' && raw.model ? raw.model : DEFAULT_MODEL,
    };
  } catch {
    return { apiKey: '', model: DEFAULT_MODEL };
  }
}

export function saveSettings(s: AssistantSettings): void {
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({ apiKey: s.apiKey.trim(), model: s.model.trim() || DEFAULT_MODEL }),
    );
  } catch {
    // Storage blocked: the key lives only for this page.
  }
}

export function clearKey(): void {
  saveSettings({ ...loadSettings(), apiKey: '' });
}
