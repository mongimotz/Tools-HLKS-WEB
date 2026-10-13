// SPDX-License-Identifier: AGPL-3.0-or-later
// Reorder rows by dragging a grip (pointer events: mouse, pen and touch).

const EDGE = 48; // px from the viewport edge where the page scrolls while dragging

/**
 * Make the rows inside `root` sortable. `root` stays bound across re-renders.
 * rows: selector of the movable rows; handle: selector of the grip inside a row.
 * onDrop(id, beforeId): the row with `id` goes before the row `beforeId` (null = after the last row).
 * Esc cancels. Nothing happens when the row ends up where it was.
 */
export function bindRowDrag(root, { rows, handle, onDrop, idOf = (row) => row.dataset.id }) {
  root.addEventListener('pointerdown', (e) => {
    const grip = e.target.closest(handle);
    if (!grip || !root.contains(grip) || e.button !== 0) return;
    const row = grip.closest(rows);
    if (!row) return;
    e.preventDefault();
    const list = [...root.querySelectorAll(rows)];
    const from = list.indexOf(row);
    let to = from; // index in `list` before which the row lands (list.length = end)
    let marked = null;
    row.classList.add('is-moving');
    grip.setPointerCapture(e.pointerId);

    const mark = () => {
      marked?.classList.remove('drop-before', 'drop-after');
      marked = null;
      if (to === from || to === from + 1) return;
      marked = to < list.length ? list[to] : list[list.length - 1];
      marked.classList.add(to < list.length ? 'drop-before' : 'drop-after');
    };
    const move = (ev) => {
      if (ev.clientY < EDGE) window.scrollBy(0, -12);
      else if (ev.clientY > window.innerHeight - EDGE) window.scrollBy(0, 12);
      to = list.length;
      for (let i = 0; i < list.length; i++) {
        const r = list[i].getBoundingClientRect();
        if (ev.clientY < r.top + r.height / 2) {
          to = i;
          break;
        }
      }
      mark();
    };
    const end = (drop) => {
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', key, true);
      row.classList.remove('is-moving');
      marked?.classList.remove('drop-before', 'drop-after');
      if (drop && to !== from && to !== from + 1) onDrop(idOf(row), to < list.length ? idOf(list[to]) : null);
    };
    const up = () => end(true);
    const cancel = () => end(false);
    const key = (ev) => {
      if (ev.key !== 'Escape') return;
      ev.stopPropagation();
      end(false);
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
  });
}

/** Move the item with `id` before the item `beforeId` (null = to the end). Returns false when nothing moved. */
export function moveBefore(items, id, beforeId, idOf = (x) => x.id) {
  const from = items.findIndex((x) => idOf(x) === id);
  if (from < 0 || id === beforeId) return false;
  const [item] = items.splice(from, 1);
  const to = beforeId == null ? items.length : items.findIndex((x) => idOf(x) === beforeId);
  items.splice(to < 0 ? items.length : to, 0, item);
  return true;
}
