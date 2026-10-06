import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createEnvelope, parseEnvelope, checkCompatibility, EnvelopeError } from '../lib/core/envelope.js';

const base = { tool: 'demo', version: 1, calcVersion: '1.0.0', project: { name: 'X' }, inputs: { a: 1 } };

test('create and parse an envelope', () => {
  const env = createEnvelope(base);
  const back = parseEnvelope(JSON.stringify(env));
  assert.equal(back.tool, 'demo');
  assert.deepEqual(back.inputs, { a: 1 });
  assert.deepEqual(back.project, { name: 'X', number: '', author: '', date: '' });
});

test('reject foreign JSON and broken files', () => {
  assert.throws(() => parseEnvelope('{"hello":1}'), EnvelopeError);
  assert.throws(() => parseEnvelope('not json'), EnvelopeError);
  assert.throws(() => parseEnvelope({ ...createEnvelope(base), envelopeVersion: 99 }), (e) => e.code === 'envelope-too-new');
});

test('compatibility: newer input version is refused, other calc version gives a note', () => {
  const env = createEnvelope(base);
  assert.throws(() => checkCompatibility({ ...env, version: 2 }, { tool: 'demo', version: 1, calcVersion: '1.0.0' }), (e) => e.code === 'version-too-new');
  assert.throws(() => checkCompatibility(env, { tool: 'other', version: 1, calcVersion: '1.0.0' }), (e) => e.code === 'wrong-tool');
  assert.deepEqual(checkCompatibility(env, { tool: 'demo', version: 1, calcVersion: '1.0.0' }), []);
  assert.equal(checkCompatibility({ ...env, calcVersion: '0.9.0' }, { tool: 'demo', version: 1, calcVersion: '1.0.0' }).length, 1);
});
