// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared project name with a dropdown for the other project fields.

import { html, icon } from './ui.js';
import { todayIso } from './format.js';

const AUTHOR_KEY = 'hlks-tools:author';

const FIELDS = [
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
  const detailsId = `${container.id || 'project'}-details`;
  container.innerHTML = String(html`
    <div class="project-head">
      <label class="project-name">
        <span class="field-label">Projekt</span>
        <input class="input" data-project="name" type="text" autocomplete="off" />
      </label>
      <button type="button" class="project-toggle" aria-expanded="false" aria-controls="${detailsId}" title="Projektdetails" aria-label="Projektdetails">${icon('chevron', { size: 14 })}</button>
    </div>
    <div class="project-details" id="${detailsId}" role="group" aria-label="Projektdetails" hidden>
      ${FIELDS.map((f) => html`
        <label class="field">
          <span class="field-label">${f.label}</span>
          <input class="input" data-project="${f.key}" type="${f.type ?? 'text'}" autocomplete="off" />
        </label>`)}
    </div>`);

  const toggle = container.querySelector('.project-toggle');
  const details = container.querySelector('.project-details');
  const close = (restoreFocus = false) => {
    details.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus({ preventScroll: true });
  };
  toggle.addEventListener('click', () => {
    const open = details.hidden;
    details.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) details.querySelector('input')?.focus({ preventScroll: true });
  });
  container.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !details.hidden) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'ArrowDown' && event.target === toggle) {
      event.preventDefault();
      details.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      details.querySelector('input')?.focus({ preventScroll: true });
    }
  });
  container.ownerDocument.addEventListener('pointerdown', (event) => {
    if (!details.hidden && !container.contains(event.target)) close();
  });
  container.ownerDocument.addEventListener('focusin', (event) => {
    if (!details.hidden && !container.contains(event.target)) close();
  });

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
