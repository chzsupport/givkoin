const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractNicknameOrNull,
  getUserData,
  toId,
} = require('../services/fortune/fortuneUsers');

test('fortune users normalize nested ids with old fallback behavior', () => {
  assert.equal(toId('u1'), 'u1');
  assert.equal(toId(42), '42');
  assert.equal(toId({ _id: { id: 'nested' } }), 'nested');
  assert.equal(toId({ value: 99 }), '99');
  assert.equal(toId(null), '');
  assert.equal(toId({}), '');
});

test('fortune users read user data safely', () => {
  const data = { k: 10 };
  assert.equal(getUserData({ data }), data);
  assert.deepEqual(getUserData({ data: null }), {});
  assert.deepEqual(getUserData(null), {});
});

test('fortune users extract nickname or null', () => {
  assert.equal(extractNicknameOrNull('  Hero  '), 'Hero');
  assert.equal(extractNicknameOrNull('   '), null);
  assert.equal(extractNicknameOrNull(null), null);
});
