const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';

const { createAuthLogout } = require('../services/auth/authLogout');

function createSupabase(calls) {
  return {
    from(table) {
      calls.push(['from', table]);

      const query = {
        update(payload) {
          calls.push(['update', table, payload]);
          return query;
        },
        eq(field, value) {
          calls.push(['eq', table, field, value]);
          return query;
        },
      };

      return query;
    },
  };
}

test('auth logout revokes current session and writes logout state', async () => {
  const calls = [];
  const logout = createAuthLogout({
    getSupabaseClient: () => createSupabase(calls),
    getUserRowById: async () => ({
      id: 'user-1',
      email: 'user@example.com',
      data: { other: 'keep' },
    }),
    now: () => new Date('2026-05-26T12:00:00.000Z'),
    revokeSession: async (payload) => calls.push(['revoke', payload]),
    writeAuthEvent: async (payload) => calls.push(['event', payload]),
  });

  assert.deepEqual(await logout.performLogout({
    req: {
      auth: { sid: 'session-1' },
      user: { _id: 'user-1' },
    },
  }), {
    ok: true,
    row: {
      id: 'user-1',
      email: 'user@example.com',
      data: { other: 'keep' },
    },
    sessionId: 'session-1',
  });

  assert.deepEqual(calls.find((row) => row[0] === 'revoke'), [
    'revoke',
    { sessionId: 'session-1', revokedBy: 'user-1', reason: 'logout' },
  ]);
  const updateCall = calls.find((row) => row[0] === 'update');
  assert.equal(updateCall[2].data.other, 'keep');
  assert.equal(updateCall[2].data.lastLogoutAt, '2026-05-26T12:00:00.000Z');
  const eventCall = calls.find((row) => row[0] === 'event');
  assert.equal(eventCall[1].eventType, 'logout');
  assert.equal(eventCall[1].sessionId, 'session-1');
});

test('auth logout can read session id from token fallback', async () => {
  const calls = [];
  const logout = createAuthLogout({
    decodeTokenUnsafe: () => ({ sid: 'decoded-session' }),
    getSupabaseClient: () => createSupabase(calls),
    getTokenFromRequest: () => 'token',
    getUserRowById: async () => ({ id: 'user-1', email: 'user@example.com', data: {} }),
    revokeSession: async (payload) => calls.push(['revoke', payload]),
    writeAuthEvent: async (payload) => calls.push(['event', payload]),
  });

  await logout.performLogout({
    req: { user: { _id: 'user-1' } },
  });

  assert.equal(calls.find((row) => row[0] === 'revoke')[1].sessionId, 'decoded-session');
  assert.equal(calls.find((row) => row[0] === 'event')[1].sessionId, 'decoded-session');
});

test('auth logout skips revoke when session id is missing', async () => {
  const calls = [];
  const logout = createAuthLogout({
    decodeTokenUnsafe: () => null,
    getSupabaseClient: () => createSupabase(calls),
    getTokenFromRequest: () => '',
    getUserRowById: async () => ({ id: 'user-1', email: 'user@example.com', data: {} }),
    revokeSession: async (payload) => calls.push(['revoke', payload]),
    writeAuthEvent: async (payload) => calls.push(['event', payload]),
  });

  await logout.performLogout({
    req: { user: { _id: 'user-1' } },
  });

  assert.equal(calls.some((row) => row[0] === 'revoke'), false);
  assert.equal(calls.find((row) => row[0] === 'event')[1].sessionId, '');
});

test('auth logout returns not found without writes', async () => {
  const calls = [];
  const logout = createAuthLogout({
    getSupabaseClient: () => createSupabase(calls),
    getUserRowById: async () => null,
    revokeSession: async (payload) => calls.push(['revoke', payload]),
    writeAuthEvent: async (payload) => calls.push(['event', payload]),
  });

  assert.deepEqual(await logout.performLogout({
    req: { user: { _id: 'missing' } },
  }), {
    ok: false,
    reason: 'not_found',
  });
  assert.deepEqual(calls, []);
});
