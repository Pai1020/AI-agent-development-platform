import test from 'node:test';
import assert from 'node:assert/strict';
import { search } from '../src/client.mjs';

test('end-to-end search from the client returns matching names', () => {
  assert.deepEqual(search('beta'), ['Alpha Beta']);
});
