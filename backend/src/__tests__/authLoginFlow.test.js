const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';

const { createAuthLoginFlow } = require('../services/auth/authLoginFlow');

test('auth login flow returns access failure before runtime work', async () => {
  const calls = [];
  const flow = createAuthLoginFlow({
    extractClientMeta: () => ({ ip: '127.0.0.1' }),
    normalizeEmailInput: (email) => String(email || '').trim().toLowerCase(),
    buildLoginSignalContext: async ({ client, email }) => {
      calls.push(['signals', client.ip, email]);
      return { ipIntel: { risk: 'low' } };
    },
    prepareLoginAccess: async ({ email, seedPhrase }) => {
      calls.push(['access', email, seedPhrase]);
      return { ok: false, reason: 'bad_credentials', status: 401 };
    },
    recordLoginRuntimeState: async () => {
      calls.push(['runtime']);
      return {};
    },
    openLoginSession: async () => {
      calls.push(['session']);
      return {};
    },
  });

  assert.deepEqual(await flow.loginAuthUser({
    req: { body: { email: ' USER@EXAMPLE.COM ', seedPhrase: 'seed' } },
  }), {
    ok: false,
    reason: 'bad_credentials',
    stage: 'access',
    status: 401,
  });
  assert.deepEqual(calls, [
    ['signals', '127.0.0.1', 'user@example.com'],
    ['access', 'user@example.com', 'seed'],
  ]);
});

test('auth login flow returns frozen runtime result before opening session', async () => {
  const calls = [];
  const flow = createAuthLoginFlow({
    extractClientMeta: () => ({ ip: '127.0.0.1' }),
    buildLoginSignalContext: async () => ({ ipIntel: { risk: 'medium' } }),
    prepareLoginAccess: async () => ({
      ok: true,
      user: { _id: 'user-1' },
      userRow: { id: 'user-1' },
    }),
    recordLoginRuntimeState: async ({ loginIpIntel }) => {
      calls.push(['runtime', loginIpIntel.risk]);
      return { multiAccountResult: { frozen: true, groupId: 'group-1' } };
    },
    openLoginSession: async () => {
      calls.push(['session']);
      return {};
    },
  });

  assert.deepEqual(await flow.loginAuthUser({ req: { body: {} } }), {
    ok: false,
    reason: 'multi_account_frozen_after_login',
    groupId: 'group-1',
    multiAccountResult: { frozen: true, groupId: 'group-1' },
    stage: 'runtime',
  });
  assert.deepEqual(calls, [['runtime', 'medium']]);
});

test('auth login flow opens session and returns token with safe user', async () => {
  const calls = [];
  const flow = createAuthLoginFlow({
    extractClientMeta: () => ({ ip: '127.0.0.1' }),
    buildLoginSignalContext: async () => ({ ipIntel: null }),
    prepareLoginAccess: async () => ({
      ok: true,
      user: { _id: 'user-1' },
      userRow: { id: 'user-1' },
    }),
    recordLoginRuntimeState: async () => {
      calls.push(['runtime']);
      return { multiAccountResult: null };
    },
    openLoginSession: async ({ dailyLimit, lang }) => {
      calls.push(['session', dailyLimit, lang]);
      return {
        token: 'jwt-token',
        safeUser: { id: 'user-1' },
      };
    },
  });

  assert.deepEqual(await flow.loginAuthUser({
    dailyLimit: 10,
    lang: 'ru',
    req: { body: {} },
  }), {
    ok: true,
    safeUser: { id: 'user-1' },
    token: 'jwt-token',
  });
  assert.deepEqual(calls, [
    ['runtime'],
    ['session', 10, 'ru'],
  ]);
});

test('auth login flow keeps session conflict reason', async () => {
  const flow = createAuthLoginFlow({
    extractClientMeta: () => ({}),
    buildLoginSignalContext: async () => ({ ipIntel: null }),
    prepareLoginAccess: async () => ({
      ok: true,
      user: { _id: 'user-1' },
      userRow: { id: 'user-1' },
    }),
    recordLoginRuntimeState: async () => ({}),
    openLoginSession: async () => ({ reason: 'single_device_conflict' }),
  });

  assert.deepEqual(await flow.loginAuthUser({ req: { body: {} } }), {
    ok: false,
    reason: 'single_device_conflict',
    stage: 'session',
  });
});
