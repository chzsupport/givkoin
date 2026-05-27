const test = require('node:test');
const assert = require('node:assert/strict');

const {
  acquireChatStartLock,
  acquireSearchPairLock,
  clearSearchSession,
  getSearchPairLockKey,
  getSearchSession,
  isUserStartingChat,
  releaseChatStartLock,
  releaseSearchPairLock,
  resetSearchState,
  setSearchSession,
  updateSearchSession,
} = require('../services/socket/socketSearchState');

test('socket search state stores and updates sessions by normalized user id', () => {
  resetSearchState();

  assert.equal(setSearchSession({ userId: 42, round: 1 })?.round, 1);
  assert.deepEqual(getSearchSession('42'), { userId: 42, round: 1 });
  assert.deepEqual(updateSearchSession(42, { round: 2, currentTargetId: '7' }), {
    userId: 42,
    round: 2,
    currentTargetId: '7',
  });

  clearSearchSession('42');
  assert.equal(getSearchSession(42), null);
});

test('socket search state locks search pairs in stable user order', () => {
  resetSearchState();

  assert.equal(getSearchPairLockKey('b', 'a'), 'a:b');
  const lockKey = acquireSearchPairLock('b', 'a');
  assert.equal(lockKey, 'a:b');
  assert.equal(acquireSearchPairLock('a', 'b'), null);

  releaseSearchPairLock(lockKey);
  assert.equal(acquireSearchPairLock('a', 'b'), 'a:b');
});

test('socket search state locks chat start until released', () => {
  resetSearchState();

  const lockIds = acquireChatStartLock(['u1', 'u2']);
  assert.deepEqual(lockIds, ['u1', 'u2']);
  assert.equal(isUserStartingChat('u1'), true);
  assert.equal(acquireChatStartLock(['u2', 'u3']), null);

  releaseChatStartLock(lockIds);
  assert.equal(isUserStartingChat('u1'), false);
  assert.deepEqual(acquireChatStartLock(['u2', 'u3']), ['u2', 'u3']);
});

test('socket search state refuses chat start for active users and resets state', () => {
  resetSearchState();

  assert.equal(
    acquireChatStartLock(['u1', 'u2'], { isActiveUser: (id) => id === 'u2' }),
    null
  );

  setSearchSession({ userId: 'u1' });
  const lockKey = acquireSearchPairLock('u1', 'u2');
  const lockIds = acquireChatStartLock(['u1', 'u2']);
  assert.equal(getSearchSession('u1') !== null, true);
  assert.equal(lockKey, 'u1:u2');
  assert.equal(isUserStartingChat('u1'), true);

  resetSearchState();
  assert.equal(getSearchSession('u1'), null);
  assert.equal(acquireSearchPairLock('u2', 'u1'), 'u1:u2');
  assert.equal(isUserStartingChat('u1'), false);
  assert.deepEqual(lockIds, ['u1', 'u2']);
});
