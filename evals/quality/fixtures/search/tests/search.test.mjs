import test from 'node:test';
import assert from 'node:assert/strict';
import { searchNames } from '../src/search.mjs';

test('substring acceptance', () => {
  assert.deepEqual(searchNames(['Alpha Beta'], 'beta'), ['Alpha Beta']);
});
