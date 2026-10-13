// SPDX-License-Identifier: AGPL-3.0-or-later
// Row order after dragging (lib/core/drag.js, the DOM-free part).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { moveBefore } from '../lib/core/drag.js';

const ids = (items) => items.map((x) => x.id).join(' ');

test('moveBefore puts the item before the target or at the end', () => {
  const items = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  assert.equal(moveBefore(items, 'd', 'b'), true);
  assert.equal(ids(items), 'a d b c');
  assert.equal(moveBefore(items, 'a', null), true);
  assert.equal(ids(items), 'd b c a');
  assert.equal(moveBefore(items, 'b', 'a'), true);
  assert.equal(ids(items), 'd c b a');
});

test('moveBefore leaves the list alone for unknown or identical ids', () => {
  const items = ['a', 'b'].map((id) => ({ id }));
  assert.equal(moveBefore(items, 'x', 'a'), false);
  assert.equal(moveBefore(items, 'a', 'a'), false);
  assert.equal(ids(items), 'a b');
});
