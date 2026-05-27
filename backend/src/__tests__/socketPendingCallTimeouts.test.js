const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clearPendingCallTimeout,
  clearPendingCallTimeoutsForUser,
  getPendingCallTimeoutRecord,
  resetPendingCallTimeouts,
  setPendingCallTimeout,
} = require('../services/socket/socketPendingCallTimeouts');

function createLongTimeout() {
  return setTimeout(() => {}, 60 * 1000);
}

test('socket pending call timeouts set and clear one target timeout', () => {
  resetPendingCallTimeouts();
  const timeoutId = createLongTimeout();

  const entry = { timeoutId, initiatorId: 'u1', token: 't1' };
  assert.equal(setPendingCallTimeout('u2', entry), entry);
  assert.equal(getPendingCallTimeoutRecord('u2'), entry);
  assert.equal(clearPendingCallTimeout('u2'), true);
  assert.equal(getPendingCallTimeoutRecord('u2'), null);
  assert.equal(clearPendingCallTimeout('u2'), false);
});

test('socket pending call timeouts clear all records for target or initiator', () => {
  resetPendingCallTimeouts();
  const first = { timeoutId: createLongTimeout(), initiatorId: 'u1', token: 'a' };
  const second = { timeoutId: createLongTimeout(), initiatorId: 'u3', token: 'b' };
  const third = { timeoutId: createLongTimeout(), initiatorId: 'u4', token: 'c' };

  setPendingCallTimeout('u2', first);
  setPendingCallTimeout('u1', second);
  setPendingCallTimeout('u5', third);

  assert.equal(clearPendingCallTimeoutsForUser('u1'), 2);
  assert.equal(getPendingCallTimeoutRecord('u2'), null);
  assert.equal(getPendingCallTimeoutRecord('u1'), null);
  assert.equal(getPendingCallTimeoutRecord('u5'), third);

  resetPendingCallTimeouts();
});

test('socket pending call timeouts reset clears every stored timeout', () => {
  resetPendingCallTimeouts();

  setPendingCallTimeout('u1', { timeoutId: createLongTimeout(), initiatorId: 'u2' });
  setPendingCallTimeout('u3', { timeoutId: createLongTimeout(), initiatorId: 'u4' });

  assert.equal(resetPendingCallTimeouts(), 2);
  assert.equal(getPendingCallTimeoutRecord('u1'), null);
  assert.equal(getPendingCallTimeoutRecord('u3'), null);
});
