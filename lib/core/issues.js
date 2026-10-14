// SPDX-License-Identifier: AGPL-3.0-or-later
// Shared notice bar. Details open above the workspace without changing its size.

import { html, icon } from './ui.js';

const ORDER = { error: 0, warning: 1, info: 2 };
const LABELS = { error: 'Fehler', warning: 'Warnung', info: 'Hinweis' };

/**
 * Mount once, then update with { id, severity, text, summary?, run?, action?, dismiss? } items.
 * Callbacks are kept current even when the displayed messages do not change.
 */
export function createIssuePanel(host, defaults = {}) {
  host.classList.add('issue-panel');
  host.setAttribute('aria-label', 'Hinweise');
  host.tabIndex = -1;
  const listId = `${host.id || 'issue-panel'}-list`;
  host.innerHTML = String(html`
    <div class="issue-bar">
      <button type="button" class="issue-overview" disabled></button>
      <button type="button" class="issue-toggle" aria-expanded="false" aria-controls="${listId}" disabled>
        <span class="issue-count num">0</span><span class="issue-toggle-label">Hinweise</span>${icon('chevron', { size: 14 })}
      </button>
    </div>
    <div class="issue-details" hidden>
      <ul class="issues" id="${listId}" aria-label="Alle Hinweise"></ul>
    </div>
    <span class="visually-hidden issue-announcement" role="status" aria-live="polite" aria-atomic="true"></span>`);

  const overview = host.querySelector('.issue-overview');
  const toggle = host.querySelector('.issue-toggle');
  const count = host.querySelector('.issue-count');
  const toggleLabel = host.querySelector('.issue-toggle-label');
  const details = host.querySelector('.issue-details');
  const list = host.querySelector('.issues');
  const announcement = host.querySelector('.issue-announcement');
  let items = [];
  let signature = '';
  let announced = '';

  const close = (restoreFocus = false) => {
    details.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) toggle.focus({ preventScroll: true });
  };
  toggle.addEventListener('click', () => {
    const open = details.hidden;
    details.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
  });
  overview.addEventListener('click', () => {
    close();
    items[0]?.run?.();
  });
  list.addEventListener('click', (event) => {
    const button = event.target.closest('[data-issue-command]');
    if (!button) return;
    const item = items[Number(button.closest('[data-issue-index]').dataset.issueIndex)];
    if (!item) return;
    switch (button.dataset.issueCommand) {
      case 'run': close(true); item.run?.(); break;
      case 'action': close(true); item.action?.run(); break;
      case 'dismiss': item.dismiss?.(); break;
    }
  });
  const owner = host.ownerDocument;
  owner.addEventListener('pointerdown', (event) => {
    if (!details.hidden && !host.contains(event.target)) close();
  });
  owner.addEventListener('focusin', (event) => {
    if (!details.hidden && !host.contains(event.target)) close();
  });
  host.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !details.hidden) {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === 'ArrowDown' && event.target === toggle && items.length) {
      event.preventDefault();
      details.hidden = false;
      toggle.setAttribute('aria-expanded', 'true');
      list.querySelector('button')?.focus({ preventScroll: true });
    }
  });

  function update(nextItems = [], options = {}) {
    const hadFocus = host.contains(owner.activeElement);
    const seen = new Set();
    items = nextItems.filter((item) => {
      const key = item.id ?? `${item.severity}:${item.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map((item) => ({ ...item, severity: Object.hasOwn(ORDER, item.severity) ? item.severity : 'info' }))
      .sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
    const { emptyText = 'Keine Hinweise', emptyIcon = 'check' } = { ...defaults, ...options };
    const first = items[0];
    const summary = first?.summary ?? first?.text ?? emptyText;
    const severity = first?.severity ?? (emptyIcon === 'check' ? 'clear' : 'idle');
    host.dataset.severity = severity;
    overview.disabled = !first?.run;
    overview.title = summary;
    overview.innerHTML = String(html`${icon(first?.severity ?? emptyIcon, { label: LABELS[first?.severity] })}<span class="${!first && emptyIcon === 'check' ? 'visually-hidden' : ''}">${summary}</span>${first?.run ? icon('jump', { size: 14 }) : ''}`);
    count.textContent = String(items.length);
    toggleLabel.textContent = items.length === 1 ? 'Hinweis' : 'Hinweise';
    toggle.disabled = !items.length;
    toggle.setAttribute('aria-label', `${items.length} ${items.length === 1 ? 'Hinweis' : 'Hinweise'}`);
    const status = first
      ? ['error', 'warning', 'info'].map((level) => {
        const n = items.filter((item) => item.severity === level).length;
        return n ? `${LABELS[level]}: ${n}` : '';
      }).filter(Boolean).join(', ')
      : emptyText;
    // Announce changes in severity/count, not every value while a user types or drags.
    if (status !== announced) {
      announcement.textContent = status;
      announced = status;
    }

    const nextSignature = JSON.stringify(items.map((item) => [item.id, item.severity, item.text, !!item.run, item.action?.icon, item.action?.label, !!item.dismiss]));
    if (nextSignature !== signature) {
      const focused = owner.activeElement?.closest('[data-issue-index]');
      const focusedId = focused && list.contains(focused) ? focused.dataset.issueKey : null;
      const command = focusedId != null ? owner.activeElement.dataset.issueCommand : null;
      list.innerHTML = String(html`${items.map((item, index) => html`
        <li class="issue issue-${item.severity}" data-issue-index="${index}" data-issue-key="${item.id ?? index}">
          ${item.run
            ? html`<button type="button" class="issue-jump" data-issue-command="run">${icon(item.severity, { label: LABELS[item.severity] })}<span>${item.text}</span>${icon('jump', { size: 14 })}</button>`
            : html`<span class="issue-message">${icon(item.severity, { label: LABELS[item.severity] })}<span>${item.text}</span></span>`}
          ${item.action ? html`<button type="button" class="issue-action" data-issue-command="action" title="${item.action.label}" aria-label="${item.action.label}">${icon(item.action.icon, { size: 14 })}</button>` : ''}
          ${item.dismiss ? html`<button type="button" class="issue-action" data-issue-command="dismiss" title="Schliessen" aria-label="Hinweis schliessen">${icon('close', { size: 14 })}</button>` : ''}
        </li>`)}`);
      signature = nextSignature;
      if (focusedId != null) {
        const row = [...list.children].find((child) => child.dataset.issueKey === focusedId);
        const button = row && [...row.querySelectorAll('button')].find((child) => child.dataset.issueCommand === command);
        (button ?? toggle).focus({ preventScroll: true });
      }
    }
    if (!items.length) {
      close();
      if (hadFocus) host.focus({ preventScroll: true });
    }
  }

  update([], defaults);
  return { update };
}
