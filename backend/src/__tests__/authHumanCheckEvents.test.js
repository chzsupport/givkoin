const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';

const { createAuthHumanCheckEvents } = require('../services/auth/authHumanCheckEvents');

function createReq() {
  return {
    auth: { sid: 'session-1' },
    user: {
      _id: 'user-1',
      email: 'user@example.com',
    },
  };
}

test('auth human check events records passed check', async () => {
  const calls = [];
  const events = createAuthHumanCheckEvents({
    writeAuthEvent: async (payload) => calls.push(['event', payload]),
  });
  const req = createReq();

  await events.recordHumanCheckPass({ req, variant: 'image' });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].user, 'user-1');
  assert.equal(calls[0][1].email, 'user@example.com');
  assert.equal(calls[0][1].eventType, 'human_check_passed');
  assert.equal(calls[0][1].result, 'success');
  assert.equal(calls[0][1].sessionId, 'session-1');
  assert.deepEqual(calls[0][1].meta, { variant: 'image' });
});

test('auth human check events revokes sessions on blocked or failed challenge', async () => {
  const calls = [];
  const events = createAuthHumanCheckEvents({
    notifyForcedLogout: (payload) => calls.push(['notify', payload]),
    revokeAllUserSessions: async (payload) => calls.push(['revoke', payload]),
    writeAuthEvent: async (payload) => calls.push(['event', payload]),
  });
  const req = createReq();

  const result = await events.recordHumanCheckFail({
    req,
    result: {
      blocked: true,
      blockedUntil: '2026-05-26T13:00:00.000Z',
      challengeFailed: true,
    },
    variant: 'dots',
  });

  assert.deepEqual(result, { revoked: true });
  assert.deepEqual(calls[0], ['revoke', {
    userId: 'user-1',
    revokedBy: 'user-1',
    reason: 'human_check_failed',
  }]);
  assert.deepEqual(calls[1], ['notify', {
    userId: 'user-1',
    reason: 'human_check_failed',
  }]);
  assert.equal(calls[2][1].eventType, 'session_revoked');
  assert.equal(calls[2][1].reason, 'human_check_failed');
  assert.deepEqual(calls[2][1].meta, {
    blockedUntil: '2026-05-26T13:00:00.000Z',
    challengeFailed: true,
    variant: 'dots',
  });
});

test('auth human check events records ordinary failed attempt without revoking', async () => {
  const calls = [];
  const events = createAuthHumanCheckEvents({
    notifyForcedLogout: (payload) => calls.push(['notify', payload]),
    revokeAllUserSessions: async (payload) => calls.push(['revoke', payload]),
    writeAuthEvent: async (payload) => calls.push(['event', payload]),
  });
  const req = createReq();

  const result = await events.recordHumanCheckFail({
    req,
    result: { attemptsLeft: 2 },
    variant: 'dots',
  });

  assert.deepEqual(result, { revoked: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].eventType, 'human_check_failed');
  assert.equal(calls[0][1].reason, 'attempt_failed');
  assert.deepEqual(calls[0][1].meta, {
    attemptsLeft: 2,
    variant: 'dots',
  });
});
