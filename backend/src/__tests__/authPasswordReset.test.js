const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';

const {
  createAuthPasswordReset,
  hashResetToken,
} = require('../services/auth/authPasswordReset');

function createSupabase(resultFactory, calls) {
  return {
    from(table) {
      const state = { table, ops: [] };
      calls.push(['from', table]);

      const query = {
        select(value) {
          state.ops.push(['select', value]);
          calls.push(['select', table, value]);
          return query;
        },
        eq(field, value) {
          state.ops.push(['eq', field, value]);
          calls.push(['eq', table, field, value]);
          return query;
        },
        update(payload) {
          state.ops.push(['update', payload]);
          calls.push(['update', table, payload]);
          return query;
        },
        maybeSingle() {
          return Promise.resolve(resultFactory(state));
        },
        then(resolve, reject) {
          return Promise.resolve(resultFactory(state)).then(resolve, reject);
        },
      };

      return query;
    },
  };
}

test('auth password reset stores hashed reset token and sends localized link', async () => {
  const calls = [];
  const emails = [];
  const reset = createAuthPasswordReset({
    buildLocalizedFrontendUrl: (language, path, search) => `${language}/${path}?${search}`,
    createToken: () => 'plain token',
    getSupabaseClient: () => createSupabase(() => ({ data: null, error: null }), calls),
    now: () => new Date('2026-05-26T12:00:00.000Z'),
    sendPasswordRecoveryEmail: async (...args) => emails.push(args),
  });

  assert.deepEqual(await reset.requestPasswordReset({
    userRow: {
      id: 'user-1',
      email: 'user@example.com',
      nickname: 'User',
      data: { other: 'keep' },
    },
    language: 'ru',
  }), {
    resetToken: 'plain token',
    resetUrl: 'ru/reset-password?token=plain%20token',
  });

  const updateCall = calls.find((row) => row[0] === 'update');
  assert.equal(updateCall[1], 'users');
  assert.equal(updateCall[2].updated_at, '2026-05-26T12:00:00.000Z');
  assert.equal(updateCall[2].data.other, 'keep');
  assert.equal(updateCall[2].data.resetPasswordTokenHash, hashResetToken('plain token'));
  assert.equal(updateCall[2].data.resetPasswordExpiresAt, '2026-05-26T13:00:00.000Z');
  assert.deepEqual(emails[0], [
    'user@example.com',
    'User',
    'ru/reset-password?token=plain%20token',
    'ru',
  ]);
});

test('auth password reset requests reset by normalized email', async () => {
  const calls = [];
  const emails = [];
  const lookedUpEmails = [];
  const reset = createAuthPasswordReset({
    buildLocalizedFrontendUrl: (language, path, search) => `${language}/${path}?${search}`,
    createToken: () => 'email token',
    getSupabaseClient: () => createSupabase(() => ({ data: null, error: null }), calls),
    getUserRowByEmail: async (email) => {
      lookedUpEmails.push(email);
      return {
        id: 'user-1',
        email: 'user@example.com',
        nickname: 'User',
        data: {},
      };
    },
    normalizeEmailInput: (email) => String(email || '').trim().toLowerCase(),
    now: () => new Date('2026-05-26T12:00:00.000Z'),
    sendPasswordRecoveryEmail: async (...args) => emails.push(args),
  });

  assert.deepEqual(await reset.requestPasswordResetByEmail({
    email: ' USER@EXAMPLE.COM ',
    language: 'en',
  }), {
    ok: true,
    resetToken: 'email token',
    resetUrl: 'en/reset-password?token=email%20token',
  });
  assert.deepEqual(lookedUpEmails, ['user@example.com']);
  assert.equal(calls.some((row) => row[0] === 'update'), true);
  assert.deepEqual(emails[0], [
    'user@example.com',
    'User',
    'en/reset-password?token=email%20token',
    'en',
  ]);
});

test('auth password reset reports missing email without writes', async () => {
  const calls = [];
  const reset = createAuthPasswordReset({
    getSupabaseClient: () => createSupabase(() => ({ data: null, error: null }), calls),
    getUserRowByEmail: async () => null,
  });

  assert.deepEqual(await reset.requestPasswordResetByEmail({
    email: 'missing@example.com',
    language: 'ru',
  }), {
    ok: false,
    reason: 'not_found',
  });
  assert.deepEqual(calls, []);
});

test('auth password reset applies new seed phrase and removes reset fields', async () => {
  const calls = [];
  const reset = createAuthPasswordReset({
    getSupabaseClient: () => createSupabase((state) => {
      const selected = state.ops.some((op) => op[0] === 'select');

      if (selected) {
        return {
          data: {
            id: 'user-1',
            data: {
              resetPasswordTokenHash: 'hash:token',
              resetPasswordExpiresAt: '2026-05-26T13:00:00.000Z',
              other: 'keep',
            },
          },
          error: null,
        };
      }

      return { data: null, error: null };
    }, calls),
    hashPassword: async (seedPhrase) => `hashed:${seedPhrase}`,
    hashToken: (token) => `hash:${token}`,
    now: () => new Date('2026-05-26T12:00:00.000Z'),
  });

  assert.deepEqual(await reset.resetPasswordWithToken({
    token: 'token',
    seedPhrase: 'new seed phrase',
  }), {
    ok: true,
    userId: 'user-1',
  });

  const updateCall = calls.find((row) => row[0] === 'update');
  assert.equal(updateCall[2].password_hash, 'hashed:new seed phrase');
  assert.equal(updateCall[2].data.other, 'keep');
  assert.equal(Object.hasOwn(updateCall[2].data, 'resetPasswordTokenHash'), false);
  assert.equal(Object.hasOwn(updateCall[2].data, 'resetPasswordExpiresAt'), false);
});

test('auth password reset rejects missing or expired reset row', async () => {
  const missingReset = createAuthPasswordReset({
    getSupabaseClient: () => createSupabase(() => ({ data: null, error: null }), []),
    hashToken: (token) => `hash:${token}`,
  });

  assert.deepEqual(await missingReset.resetPasswordWithToken({
    token: 'token',
    seedPhrase: 'seed',
  }), {
    ok: false,
    reason: 'invalid_token',
  });

  const expiredReset = createAuthPasswordReset({
    getSupabaseClient: () => createSupabase(() => ({
      data: {
        id: 'user-1',
        data: { resetPasswordExpiresAt: '2026-05-26T11:00:00.000Z' },
      },
      error: null,
    }), []),
    hashToken: (token) => `hash:${token}`,
    now: () => new Date('2026-05-26T12:00:00.000Z'),
  });

  assert.deepEqual(await expiredReset.resetPasswordWithToken({
    token: 'token',
    seedPhrase: 'seed',
  }), {
    ok: false,
    reason: 'invalid_token',
  });
});
