import test from 'node:test';
import assert from 'node:assert/strict';
import { displayPresenceCount } from '../src/utils/presenceClient.js';

test('displayed presence stays above ten and grows with actual sessions', () => {
  assert.equal(displayPresenceCount(0), 11);
  assert.equal(displayPresenceCount(1), 12);
  assert.ok(displayPresenceCount(20) > displayPresenceCount(10));
  assert.ok(displayPresenceCount(10) > 10);
});
