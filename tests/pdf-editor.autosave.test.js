// SPDX-License-Identifier: AGPL-3.0-or-later
// PDF-Editor autosave rules: one slot per file name + size, at most 3 slots, none older than 14 days, the slot
// just written always stays. (The IndexedDB store itself is checked in the browser.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slotKey, expiredSlots, MAX_SLOTS, MAX_AGE_DAYS, DEBOUNCE_MS } from '../tools/pdf-editor/autosave.js';

const DAY = 24 * 3600 * 1000;
const now = Date.UTC(2026, 9, 19, 12);
const slot = (name, size, daysAgo) => ({ key: slotKey(name, size), savedAt: now - daysAgo * DAY });

test('plan values: 3 slots, 14 days, 2 s', () => {
  assert.equal(MAX_SLOTS, 3);
  assert.equal(MAX_AGE_DAYS, 14);
  assert.equal(DEBOUNCE_MS, 2000);
});

test('a slot is the file name and the size it was opened with', () => {
  assert.equal(slotKey('Plan.pdf', 1234), slotKey('Plan.pdf', 1234));
  assert.notEqual(slotKey('Plan.pdf', 1234), slotKey('Plan.pdf', 1235), 'another version of the file');
  assert.notEqual(slotKey('Plan.pdf', 1234), slotKey('plan.pdf', 1234));
  assert.notEqual(slotKey('a 1', 23), slotKey('a', 123), 'name and size cannot run together');
});

test('slots older than 14 days go', () => {
  const slots = [slot('a.pdf', 1, 1), slot('b.pdf', 2, 14.5), slot('c.pdf', 3, 30)];
  assert.deepEqual(expiredSlots(slots, now).sort(), [slotKey('b.pdf', 2), slotKey('c.pdf', 3)].sort());
  assert.deepEqual(expiredSlots([slot('a.pdf', 1, 13.9)], now), []);
});

test('at most 3 slots: the oldest go, the one just written stays', () => {
  const slots = [slot('a.pdf', 1, 1), slot('b.pdf', 2, 2), slot('c.pdf', 3, 3), slot('d.pdf', 4, 4)];
  assert.deepEqual(expiredSlots(slots, now), [slotKey('d.pdf', 4)]);
  // the slot written now counts as newest even when its time is older (clock moved)
  assert.deepEqual(expiredSlots(slots, now, { keep: slotKey('d.pdf', 4) }), [slotKey('c.pdf', 3)]);
  assert.deepEqual(expiredSlots(slots.slice(0, 3), now), []);
});
