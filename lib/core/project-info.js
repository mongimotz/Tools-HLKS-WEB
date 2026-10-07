// Shared project header (Projekt, Projekt-Nr., Bearbeiter, Datum) used by every tool.

import { html } from './ui.js';
import { todayIso } from './format.js';

const AUTHOR_KEY = 'hlks-tools:author';

const FIELDS = [
  { key: 'name', label: 'Projekt', wide: true },
  { key: 'number', label: 'Projekt-Nr.' },
  { key: 'author', label: 'Bearbeiter' },
  { key: 'date', label: 'Datum', type: 'date' },
];

/** Defaults for a new document: today's date and the last used author name. */
export function newProject() {
  let author = '';
  try {
    author = localStorage.getItem(AUTHOR_KEY) || '';
  } catch {
    /* ignore */
  }
  return { name: '', number: '', author, date: todayIso() };
}

/**
 * Render the project fields into `container`.
 * getProject() returns the live project object, which is mutated in place.
 * onInput() is called while typing, onCommit() on change.
 */
export function mountProjectInfo(container, { getProject, onInput, onCommit }) {
  container.classList.add('project-info');
  container.innerHTML = String(html`${FIELDS.map(
    (f) => html`
      <label class="field ${f.wide ? 'field-wide' : ''}">
        <span class="field-label">${f.label}</span>
        <input class="input" data-project="${f.key}" type="${f.type ?? 'text'}" placeholder="${f.placeholder ?? ''}" autocomplete="off" />
      </label>`,
  )}`);

  container.addEventListener('input', (e) => {
    const key = e.target.dataset.project;
    if (!key) return;
    getProject()[key] = e.target.value;
    onInput?.();
  });
  container.addEventListener('change', (e) => {
    const key = e.target.dataset.project;
    if (!key) return;
    if (key === 'author') {
      try {
        localStorage.setItem(AUTHOR_KEY, e.target.value);
      } catch {
        /* ignore */
      }
    }
    onCommit?.();
  });

  const refresh = () => {
    const p = getProject();
    for (const input of container.querySelectorAll('[data-project]')) {
      const v = p[input.dataset.project] ?? '';
      if (input.value !== v) input.value = v;
    }
  };
  refresh();
  return { refresh };
}
