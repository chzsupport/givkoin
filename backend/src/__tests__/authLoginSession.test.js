const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';

const { createAuthLoginSession } = require('../services/auth/authLoginSession');

test('auth login session creates session token and settles first-login referral reward', async () => {
  const calls = [];
  const opener = createAuthLoginSession({
    buildSafeUserWithEntity: async (row) => {
      calls.push(['safe', row]);
      return { id: row.id, nickname: row.nickname };
    },
    createUserSession: async (payload) => {
      calls.push(['session', payload]);
      return { session_id: 'session-1' };
    },
    generateToken: (payload) => {
      calls.push(['token', payload]);
      return 'jwt-token';
    },
    getUserRowById: async (userId) => {
      calls.push(['get-row', userId]);
      return { id: userId, email: 'fresh@example.com', nickname: 'Fresh' };
    },
    repairDamagedUserData: async (row) => {
      calls.push(['repair', row]);
      return { ...row, repaired: true };
    },
    settleLoginReferralReward: async (payload) => calls.push(['referral', payload]),
    writeAuthEvent: async (payload) => calls.push(['event', payload]),
  });

  const user = { _id: 'user-1', email: 'user@example.com', nickname: 'Hero' };
  const req = { id: 'req-1' };

  const result = await opener.openLoginSession({
    user,
    userRow: { id: 'user-1', email: 'old@example.com', nickname: 'Old' },
    req,
    dailyLimit: 12,
    lang: 'ru',
    pickLang: (lang, ru, en) => (lang === 'en' ? en : ru),
  });

  assert.equal(result.ok, true);
  assert.equal(result.token, 'jwt-token');
  assert.equal(result.sessionId, 'session-1');
  assert.deepEqual(result.safeUser, { id: 'user-1', nickname: 'Fresh' });

  assert.deepEqual(calls[0], ['session', { userId: 'user-1', req }]);

  const tokenCall = calls.find((row) => row[0] === 'token');
  assert.deepEqual(tokenCall[1], {
    userId: 'user-1',
    email: 'user@example.com',
    sid: 'session-1',
  });

  const successEvent = calls.find((row) => row[0] === 'event');
  assert.equal(successEvent[1].eventType, 'login_success');
  assert.equal(successEvent[1].sessionId, 'session-1');

  const referralCall = calls.find((row) => row[0] === 'referral');
  assert.equal(referralCall[1].dailyLimit, 12);
  assert.equal(referralCall[1].lang, 'ru');
  assert.equal(referralCall[1].user, user);
});

test('auth login session returns conflict and writes failed login event', async () => {
  const calls = [];
  const opener = createAuthLoginSession({
    createUserSession: async () => ({ conflict: true }),
    writeAuthEvent: async (payload) => calls.push(['event', payload]),
  });

  const result = await opener.openLoginSession({
    user: { _id: 'user-1', email: 'user@example.com' },
    req: { id: 'req-1' },
  });

  assert.deepEqual(result, {
    ok: false,
    reason: 'single_device_conflict',
    session: { conflict: true },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].eventType, 'login_failed');
  assert.equal(calls[0][1].reason, 'single_device_conflict');
});

test('auth login session returns missing session id without awarding referral', async () => {
  const calls = [];
  const opener = createAuthLoginSession({
    buildSafeUserWithEntity: async () => calls.push(['safe']),
    createUserSession: async () => ({}),
    generateToken: () => calls.push(['token']),
    getUserRowById: async () => calls.push(['get-row']),
    repairDamagedUserData: async () => calls.push(['repair']),
    settleLoginReferralReward: async () => calls.push(['referral']),
    writeAuthEvent: async () => calls.push(['event']),
  });

  const result = await opener.openLoginSession({
    user: { _id: 'user-1', email: 'user@example.com' },
    req: { id: 'req-1' },
  });

  assert.deepEqual(result, {
    ok: false,
    reason: 'missing_session_id',
    session: {},
  });
  assert.deepEqual(calls, []);
});

test('auth login session accepts legacy sessionId field', async () => {
  const opener = createAuthLoginSession({
    buildSafeUserWithEntity: async (row) => ({ id: row.id }),
    createUserSession: async () => ({ sessionId: 'legacy-session' }),
    generateToken: ({ sid }) => `token:${sid}`,
    getUserRowById: async () => null,
    repairDamagedUserData: async (row) => row,
    settleLoginReferralReward: async () => {},
    writeAuthEvent: async () => {},
  });

  const result = await opener.openLoginSession({
    user: { _id: 'user-1', email: 'user@example.com' },
    userRow: { id: 'user-1' },
    req: { id: 'req-1' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.sessionId, 'legacy-session');
  assert.equal(result.token, 'token:legacy-session');
  assert.deepEqual(result.safeUser, { id: 'user-1' });
});
