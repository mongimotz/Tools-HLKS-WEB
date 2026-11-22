// SPDX-License-Identifier: AGPL-3.0-or-later
// Style template and black/white export: per browser (localStorage), not part of the file.
import { parseStyle, setActiveStyle } from '../render/style.ts';
import { useEditor } from '../editor/store.ts';

const STYLE_KEY = 'hlks-schema-style';
const MONO_KEY = 'hlks-schema-mono';

function apply(text: string | null, name: string | null) {
  setActiveStyle(text ? parseStyle(JSON.parse(text)) : null);
  useEditor.setState((s) => ({ styleName: name, styleRev: s.styleRev + 1 }));
}

export function initStyle() {
  try {
    const saved = JSON.parse(localStorage.getItem(STYLE_KEY) ?? 'null') as { name: string; text: string } | null;
    if (saved) apply(saved.text, saved.name);
    useEditor.setState({ mono: localStorage.getItem(MONO_KEY) === '1' });
  } catch {
    apply(null, null);
  }
}

export async function loadStyleFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const text = await f.text();
    try {
      apply(text, f.name);
      try {
        localStorage.setItem(STYLE_KEY, JSON.stringify({ name: f.name, text }));
      } catch {
        // only for this page
      }
      useEditor.getState().notify(`Stilvorlage ${f.name} geladen.`);
    } catch (e) {
      useEditor.getState().notify(`Stilvorlage nicht geladen: ${(e as Error).message}`, 'error');
    }
  };
  input.click();
}

export function resetStyle() {
  apply(null, null);
  try {
    localStorage.removeItem(STYLE_KEY);
  } catch {
    // ignore
  }
}

export function setMono(on: boolean) {
  useEditor.setState({ mono: on });
  try {
    localStorage.setItem(MONO_KEY, on ? '1' : '0');
  } catch {
    // ignore
  }
}

const PAPER_KEY = 'hlks-schema:paper-dark';

/** Dark paper in the editor (per browser; exports stay white). Default light. */
export function initPaper() {
  try {
    useEditor.setState({ paperDark: localStorage.getItem(PAPER_KEY) === '1' });
  } catch {
    // ignore
  }
}

export function setPaperDark(on: boolean) {
  useEditor.setState({ paperDark: on });
  try {
    localStorage.setItem(PAPER_KEY, on ? '1' : '0');
  } catch {
    // ignore
  }
}

const THEME_KEY = 'hlks-tools:theme';

/** Page theme, shared with the other HLKS tools: stored choice, else the system setting. */
export function currentTheme(): 'light' | 'dark' {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function toggleTheme(): 'light' | 'dark' {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // ignore
  }
  return next;
}
