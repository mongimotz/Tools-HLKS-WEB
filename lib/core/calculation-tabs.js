// SPDX-License-Identifier: AGPL-3.0-or-later
// One tab strip for independent calculations in a project. The active tab's name is edited in place.

import { html, icon } from './ui.js';

/**
 * Items: { id, name, placeholder, value, severity }. The tab shows `name`, or `placeholder` while it is empty.
 * With `onRename(id, name)` a click on the active tab, a double click or F2 edits its name in the tab.
 */
export function mountCalculationTabs(host, { label = 'Berechnungen', panelId, onSelect, onAdd, onDuplicate, onDelete, onRename }) {
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
  let editing = null; // { id, input, tab } while a name is edited
  let pending = null; // render() arguments that arrived during editing
  const tabId = (id) => `${host.id || 'calculations'}-tab-${encodeURIComponent(id)}`;
  const tabOf = (id) => [...list.querySelectorAll('[data-calculation-id]')].find((tab) => tab.dataset.calculationId === id);
  const placeholderOf = (item, index) => item.placeholder || `Berechnung ${index + 1}`;

  const select = (id, focus = false) => {
    if (id !== selectedId) onSelect?.(id);
    if (focus) tabOf(id)?.focus({ preventScroll: true });
  };

  function startRename(id) {
    const index = items.findIndex((item) => item.id === id);
    const tab = tabOf(id);
    if (!onRename || editing || index < 0 || !tab) return;
    const input = host.ownerDocument.createElement('input');
    input.type = 'text';
    input.className = 'tab calculation-tab-input';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.value = items[index].name ?? '';
    input.placeholder = placeholderOf(items[index], index);
    input.setAttribute('aria-label', 'Name der Berechnung');
    const fit = () => (input.style.width = `${Math.min(Math.max((input.value || input.placeholder).length + 2, 8), 40)}ch`);
    fit();
    input.addEventListener('input', fit);
    input.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === 'z' || key === 'y') event.stopPropagation(); // text undo inside the field, not the project history
        else finishRename(true); // e.g. Strg+S saves the new name too
        return;
      }
      if (event.key === 'Enter') finishRename(true);
      else if (event.key === 'Escape') finishRename(false);
      else return;
      event.preventDefault();
      event.stopPropagation();
    });
    input.addEventListener('blur', () => finishRename(true));
    editing = { id, input, tab };
    tab.replaceWith(input);
    input.focus({ preventScroll: true });
    input.select();
  }

  function finishRename(save) {
    if (!editing) return;
    const { id, input, tab } = editing;
    editing = null;
    const focused = host.ownerDocument.activeElement === input;
    const name = input.value.trim();
    const changed = save && name !== (items.find((item) => item.id === id)?.name ?? '').trim();
    input.replaceWith(tab);
    if (focused) tab.focus({ preventScroll: true });
    if (pending) {
      const [nextItems, activeId] = pending;
      pending = null;
      render(nextItems, activeId);
    }
    if (changed) onRename(id, name);
  }

  // A press on another tab while editing must not blur the field first: the click finishes the edit and selects.
  list.addEventListener('mousedown', (event) => {
    if (editing && event.target.closest('[data-calculation-id]')) event.preventDefault();
  });
  host.addEventListener('click', (event) => {
    if (event.target.closest('.calculation-tab-input')) return;
    const tab = event.target.closest('[data-calculation-id]');
    if (tab) {
      const id = tab.dataset.calculationId;
      if (editing) {
        finishRename(true);
        return select(id, true);
      }
      if (onRename && id === selectedId) return startRename(id);
      return select(id);
    }
    const button = event.target.closest('[data-calculation-action]');
    if (!button || button.disabled) return;
    const callbacks = { add: onAdd, duplicate: onDuplicate, delete: onDelete };
    callbacks[button.dataset.calculationAction]?.();
  });
  list.addEventListener('dblclick', (event) => {
    const tab = event.target.closest('[data-calculation-id]');
    if (tab && !editing) {
      select(tab.dataset.calculationId);
      startRename(tab.dataset.calculationId);
    }
  });
  list.addEventListener('keydown', (event) => {
    const tab = event.target.closest('[data-calculation-id]');
    if (!tab) return;
    if (event.key === 'F2' && onRename) {
      event.preventDefault();
      select(tab.dataset.calculationId);
      return startRename(tab.dataset.calculationId);
    }
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
    if (editing) {
      pending = [nextItems, activeId];
      return;
    }
    const focused = host.ownerDocument.activeElement;
    items = nextItems;
    selectedId = activeId;
    if (panelId) host.ownerDocument.getElementById(panelId)?.setAttribute('aria-labelledby', tabId(activeId));
    remove.disabled = items.length < 2;
    const nextSignature = JSON.stringify([items, activeId]);
    if (signature === nextSignature) return;
    const focusedId = list.contains(focused) ? focused.dataset.calculationId : null;
    list.innerHTML = String(html`${items.map((item, index) => {
      const name = String(item.name ?? '').trim() || placeholderOf(item, index);
      return html`
      <button type="button" class="tab ${onRename ? 'is-renamable' : ''}" role="tab" id="${tabId(item.id)}" data-calculation-id="${item.id}" title="${name}" aria-selected="${item.id === activeId}" tabindex="${item.id === activeId ? 0 : -1}" ${panelId ? html`aria-controls="${panelId}"` : ''}>
        <span class="tab-name">${name}</span>
        ${item.value != null ? html`<span class="calculation-tab-value num ${item.severity ? `is-${item.severity}` : ''}">${item.severity === 'error' || item.severity === 'warning' ? icon(item.severity, { size: 12 }) : ''}${item.value}</span>` : ''}
      </button>`;
    })}`);
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

  /** Start editing the name of a calculation, e.g. right after adding it. */
  const rename = (id = selectedId) => startRename(id);

  return { render, rename };
}
