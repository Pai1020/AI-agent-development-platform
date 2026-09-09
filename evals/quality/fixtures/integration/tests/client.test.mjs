import test from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../src/client.mjs';

test('client.search returns a list without throwing', () => {
  const result = search('beta');
  assert.ok(Array.isArray(result));
});
