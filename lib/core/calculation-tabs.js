// SPDX-License-Identifier: AGPL-3.0-or-later
// One tab strip for independent calculations in a project.

import { html, icon } from './ui.js';

export function mountCalculationTabs(host, { label = 'Berechnungen', panelId, onSelect, onAdd, onDuplicate, onDelete }) {
  host.classList.add('calculation-tabs');
  host.innerHTML = String(html`
    <nav class="tabs calculation-tab-list" role="tablist" aria-label="${label}"></nav>
    <div class="calculation-actions">
      <button type="button" class="btn ghost small icon-only" data-calculation-action="add" title="Berechnung hinzufügen" aria-label="Berechnung hinzufügen">${icon('plus', { size: 15 })}</button>
      <button type="button" class="btn ghost small icon-only" data-calculation-action="duplicate" title="Berechnung duplizieren" aria-label="Berechnung duplizieren">${icon('copy', { size: 15 })}</button>
      <button type="button" class="btn ghost small icon-only" data-calculation-action="delete" title="Berechnung löschen" aria-label="Berechnung löschen" disabled>${icon('trash', { size: 15 })}</button>
    </div>`);
  const list = host.querySelector('[role="tablist"]');
  const remove = host.querySelector('[data-calculation-action="delete"]');
  let items = [];
  let signature = '';
  let selectedId = null;
  const tabId = (id) => `${host.id || 'calculations'}-tab-${encodeURIComponent(id)}`;

  const select = (id, focus = false) => {
    if (id !== selectedId) onSelect?.(id);
    if (focus) [...list.querySelectorAll('[data-calculation-id]')].find((tab) => tab.dataset.calculationId === id)?.focus({ preventScroll: true });
  };
  host.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-calculation-id]');
    if (tab) return select(tab.dataset.calculationId);
    const button = event.target.closest('[data-calculation-action]');
    if (!button || button.disabled) return;
    const callbacks = { add: onAdd, duplicate: onDuplicate, delete: onDelete };
    callbacks[button.dataset.calculationAction]?.();
  });
  list.addEventListener('keydown', (event) => {
    const tab = event.target.closest('[data-calculation-id]');
    if (!tab) return;
    const index = items.findIndex((item) => item.id === tab.dataset.calculationId);
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % items.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    select(items[next].id, true);
  });

  function render(nextItems, activeId) {
    const focused = host.ownerDocument.activeElement;
    items = nextItems;
    selectedId = activeId;
    if (panelId) host.ownerDocument.getElementById(panelId)?.setAttribute('aria-labelledby', tabId(activeId));
    remove.disabled = items.length < 2;
    const nextSignature = JSON.stringify([items, activeId]);
    if (signature === nextSignature) return;
    const focusedId = list.contains(focused) ? focused.dataset.calculationId : null;
    list.innerHTML = String(html`${items.map((item, index) => html`
      <button type="button" class="tab" role="tab" id="${tabId(item.id)}" data-calculation-id="${item.id}" title="${item.label}" aria-selected="${item.id === activeId}" tabindex="${item.id === activeId ? 0 : -1}" ${panelId ? html`aria-controls="${panelId}"` : ''}>
        <span class="tab-name">${item.label || `Berechnung ${index + 1}`}</span>
        ${item.value != null ? html`<span class="calculation-tab-value num ${item.severity ? `is-${item.severity}` : ''}">${item.severity === 'error' || item.severity === 'warning' ? icon(item.severity, { size: 12 }) : ''}${item.value}</span>` : ''}
      </button>`)}`);
    signature = nextSignature;
    if (focusedId != null) {
      const target = [...list.children].find((tab) => tab.dataset.calculationId === focusedId) ?? list.querySelector('[aria-selected="true"]');
      target?.focus({ preventScroll: true });
    } else if (focused === remove && remove.disabled) {
      list.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
    }
    const selected = list.querySelector('[aria-selected="true"]');
    if (selected) {
      const tabBox = selected.getBoundingClientRect();
      const listBox = list.getBoundingClientRect();
      if (tabBox.left < listBox.left) list.scrollLeft -= listBox.left - tabBox.left;
      else if (tabBox.right > listBox.right) list.scrollLeft += tabBox.right - listBox.right;
    }
  }

  return { render };
}
