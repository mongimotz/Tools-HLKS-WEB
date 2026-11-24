// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared project name with a dropdown for the other project fields.

import { html, icon } from './ui.js';
import { todayIso } from './format.js';

const AUTHOR_KEY = 'hlks-tools:author';
const PROJECT_KEY = 'hlks-tools:project';
const SITE_KEY = 'hlks-tools:site';
const CALC_DRAFT_IDS = ['duct-sizing', 'duct-pressure-loss', 'silencer', 'hx-diagram'];

const FIELDS = [
  { key: 'number', label: 'Projekt-Nr.' },
  { key: 'author', label: 'Bearbeiter' },
  { key: 'date', label: 'Datum', type: 'date' },
];

/** Read the global project metadata (name, number, author, date) shared across all tools on this device. */
export function readProjectContext() {
  try {
    const raw = JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null');
    const author = localStorage.getItem(AUTHOR_KEY) || '';
    if (raw && typeof raw === 'object') {
      return {
        name: typeof raw.name === 'string' ? raw.name : '',
        number: typeof raw.number === 'string' ? raw.number : '',
        author: typeof raw.author === 'string' && raw.author ? raw.author : author,
        date: typeof raw.date === 'string' ? raw.date : '',
      };
    }
    return { name: '', number: '', author, date: '' };
  } catch {
    return { name: '', number: '', author: '', date: '' };
  }
}

/** True when any global project metadata has been stored in localStorage. */
export function hasProjectContext() {
  try {
    return localStorage.getItem(PROJECT_KEY) !== null;
  } catch {
    return false;
  }
}

/** Save global project metadata and immediately propagate it to all browser drafts across the suite. */
export function saveProjectContext(project) {
  if (!project || typeof project !== 'object') return;
  try {
    const prev = readProjectContext();
    const next = {
      name: typeof project.name === 'string' ? project.name : prev.name,
      number: typeof project.number === 'string' ? project.number : prev.number,
      author: typeof project.author === 'string' ? project.author : prev.author,
      date: typeof project.date === 'string' ? project.date : prev.date,
    };
    localStorage.setItem(PROJECT_KEY, JSON.stringify(next));
    localStorage.setItem(AUTHOR_KEY, next.author);

    for (const id of CALC_DRAFT_IDS) {
      const key = `hlks-tools:${id}:draft`;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const d = JSON.parse(raw);
        if (!d || typeof d !== 'object') continue;
        d.project = {
          name: next.name,
          number: next.number,
          author: next.author,
          date: next.date || d.project?.date || todayIso(),
        };
        localStorage.setItem(key, JSON.stringify(d));
      } catch {
        /* ignore malformed draft */
      }
    }

    const schemaRaw = localStorage.getItem('hlks-schema:drafts');
    if (schemaRaw) {
      try {
        const sd = JSON.parse(schemaRaw);
        if (Array.isArray(sd?.tabs)) {
          let changed = false;
          for (const tab of sd.tabs) {
            if (!tab?.text) continue;
            try {
              const doc = JSON.parse(tab.text);
              if (doc?.format === 'hlks-schema' && doc.meta) {
                doc.meta.project = next.name;
                doc.meta.author = next.author;
                if (next.date) doc.meta.date = next.date;
                tab.text = JSON.stringify(doc, null, 2);
                changed = true;
              }
            } catch {
              /* skip */
            }
          }
          if (changed) localStorage.setItem('hlks-schema:drafts', JSON.stringify(sd));
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

/** Merge the global project context onto a draft's project when a global project has been defined. */
export function applyGlobalProject(project = {}) {
  if (!hasProjectContext()) return project;
  const ctx = readProjectContext();
  return {
    name: ctx.name,
    number: ctx.number,
    author: ctx.author,
    date: ctx.date || project.date || todayIso(),
  };
}

/** Read / remember the last chosen site (altitude, label) from Klimastation. */
export function readSiteContext() {
  try {
    const raw = JSON.parse(localStorage.getItem(SITE_KEY) || 'null');
    if (raw && typeof raw === 'object' && Number.isFinite(raw.altitude)) return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveSiteContext(site) {
  if (!site || !Number.isFinite(site.altitude)) return;
  try {
    localStorage.setItem(SITE_KEY, JSON.stringify({ altitude: Math.round(site.altitude), label: String(site.label ?? '') }));
  } catch {
    /* ignore */
  }
}

/** Defaults for a new document: the shared active project metadata (with today's date as fallback). */
export function newProject() {
  const ctx = readProjectContext();
  return { name: ctx.name, number: ctx.number, author: ctx.author, date: ctx.date || todayIso() };
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
    saveProjectContext(getProject());
    onInput?.();
  });
  container.addEventListener('change', (e) => {
    const key = e.target.dataset.project;
    if (!key) return;
    saveProjectContext(getProject());
    onCommit?.();
  });

  const refresh = () => {
    const p = getProject();
    for (const input of container.querySelectorAll('[data-project]')) {
      const v = p[input.dataset.project] ?? '';
      if (input.value !== v) input.value = v;
    }
  };
  const syncFromGlobal = () => {
    if (!hasProjectContext()) return;
    const p = getProject();
    const next = applyGlobalProject(p);
    let changed = false;
    for (const k of ['name', 'number', 'author', 'date']) {
      if (p[k] !== next[k]) {
        p[k] = next[k];
        changed = true;
      }
    }
    if (changed) refresh();
  };
  window.addEventListener('storage', (e) => {
    if (e.key === PROJECT_KEY || e.key === AUTHOR_KEY) syncFromGlobal();
  });
  window.addEventListener('pageshow', syncFromGlobal);
  refresh();
  return { refresh };
}
