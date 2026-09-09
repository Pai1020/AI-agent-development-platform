import test from 'node:test';
import assert from 'node:assert/strict';
import { searchApi } from '../src/api.mjs';

test('searchApi filters by the query field', () => {
  assert.deepEqual(searchApi({ query: 'beta' }), ['Alpha Beta']);
});
