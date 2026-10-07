// Combobox for number inputs: free entry plus a list of preset values (e.g. standard duct sizes).
// Inputs opt in with data-combo="<list name>"; one popup list serves the whole page.
// The list opens on click and on ↑ / ↓, which also step through the values. Typing never filters
// the list, it only marks the nearest value. Changes reach the page as normal input/change events.

import { parseNum } from './format.js';

/**
 * Enable comboboxes for all [data-combo] inputs inside `root` (event delegation, survives re-renders).
 * getValues(name) returns the sorted preset numbers for a list name.
 */
export function enableCombos(root, getValues) {
  const list = document.createElement('ul');
  list.className = 'combo-list';
  list.id = 'combo-list';
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  document.body.append(list);

  let input = null;
  let values = [];
  let dirty = false;

  const isCombo = (el) => el instanceof HTMLInputElement && el.dataset.combo != null;
  const valueOf = () => parseNum(input.value);

  function open(el) {
    values = getValues(el.dataset.combo) ?? [];
    if (!values.length) return;
    input = el;
    dirty = false;
    list.innerHTML = values.map((v, i) => `<li role="option" id="combo-opt-${i}" data-i="${i}">${v}</li>`).join('');
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    place();
    mark();
  }

  function close() {
    if (!input) return;
    const el = input;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    list.hidden = true;
    input = null;
    if (dirty && el.isConnected) el.dispatchEvent(new Event('change', { bubbles: true }));
    dirty = false;
  }

  function place() {
    if (!input?.isConnected) return close();
    const r = input.getBoundingClientRect();
    list.style.minWidth = `${r.width}px`;
    list.style.left = `${r.left}px`;
    const below = innerHeight - r.bottom;
    const height = Math.min(list.scrollHeight, 240);
    if (below < height + 8 && r.top > below) {
      list.style.top = '';
      list.style.bottom = `${innerHeight - r.top + 2}px`;
    } else {
      list.style.bottom = '';
      list.style.top = `${r.bottom + 2}px`;
    }
  }

  /** Index of the value equal to or just above the input (the keyboard position). */
  function activeIndex() {
    const v = valueOf();
    if (!(v > 0)) return -1;
    const i = values.findIndex((x) => x >= v - 1e-9);
    return i < 0 ? values.length - 1 : i;
  }

  function mark() {
    const v = valueOf();
    const ai = activeIndex();
    for (const li of list.children) {
      const i = Number(li.dataset.i);
      li.setAttribute('aria-selected', String(values[i] === v));
      li.classList.toggle('is-active', i === ai);
    }
    const a = list.children[ai];
    if (a) {
      list.scrollTop = a.offsetTop - list.clientHeight / 2 + a.offsetHeight / 2;
      input.setAttribute('aria-activedescendant', a.id);
    }
  }

  function pick(v) {
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    dirty = true;
    mark();
  }

  function step(el, dir) {
    if (input !== el) open(el);
    if (!input) return;
    const v = valueOf();
    let next;
    if (!(v > 0)) next = dir > 0 ? values[0] : values[values.length - 1];
    else if (dir > 0) next = values.find((x) => x > v + 1e-9) ?? values[values.length - 1];
    else next = [...values].reverse().find((x) => x < v - 1e-9) ?? values[0];
    pick(next);
  }

  root.addEventListener('click', (e) => {
    if (!isCombo(e.target)) return;
    if (input === e.target) close();
    else open(e.target);
  });
  root.addEventListener('keydown', (e) => {
    if (!isCombo(e.target)) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      step(e.target, e.key === 'ArrowDown' ? 1 : -1);
    } else if (e.key === 'Escape' || e.key === 'Enter') {
      close(); // Enter then moves on (spreadsheet navigation of the page)
    }
  });
  root.addEventListener('input', (e) => {
    if (input && e.target === input) mark();
  });
  root.addEventListener('focusout', (e) => {
    if (e.target === input) close();
  });
  list.addEventListener('mousedown', (e) => e.preventDefault()); // keep the focus in the input
  list.addEventListener('click', (e) => {
    const li = e.target.closest('li');
    if (!li || !input) return;
    pick(values[Number(li.dataset.i)]);
    close();
  });
  addEventListener('scroll', (e) => {
    if (input && e.target !== list) place();
  }, true);
  addEventListener('resize', () => input && place());
}
