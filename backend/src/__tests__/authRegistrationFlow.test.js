const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';

const { createAuthRegistrationFlow } = require('../services/auth/authRegistrationFlow');

function createSupabase(calls, insertResult) {
  return {
    from(table) {
      calls.push(['from', table]);
      const query = {
        insert(payload) {
          calls.push(['insert', table, payload]);
          return query;
        },
        select(value) {
          calls.push(['select', table, value]);
          return query;
        },
        maybeSingle() {
          calls.push(['maybeSingle', table]);
          return insertResult;
        },
      };
      return query;
    },
  };
}

function createFlow(overrides = {}) {
  const calls = [];
  const createdRow = {
    id: 'user-1',
    email: 'user@example.com',
    nickname: 'Hero',
  };
  const flow = createAuthRegistrationFlow({
    assignBranchForNewUser: async () => ({ treeCluster: 'adult', treeBranch: 'branch-1' }),
    buildLocalizedFrontendUrl: (lang, path, query) => `${lang}:${path}?${query}`,
    buildRegistrationSignalContext: async () => ({
      clientProfile: { screen: 'wide' },
      deviceId: 'device-1',
      fingerprint: 'fingerprint-1',
      ip: '1.2.3.4',
      ipIntel: { risk: 'low' },
      profileKey: 'profile-1',
      signals: { email: 'user@example.com' },
      weakFingerprint: 'weak-1',
    }),
    buildSafeUserFromRow: (row) => ({ _id: row.id, email: row.email }),
    checkRegistrationAllowance: async () => ({ allowed: true }),
    createPendingReferralForNewUser: async (payload) => calls.push(['referral', payload]),
    emailService: {
      sendConfirmationEmail: async (...args) => calls.push(['email', args]),
    },
    evaluateAccessRestriction: async () => ({ blocked: false }),
    generateSeedPhrase24: () => 'seed phrase',
    generateToken: (payload) => {
      calls.push(['token', payload]);
      return 'confirm-token';
    },
    generateUserId: () => 'user-1',
    getSupabaseClient: () => createSupabase(calls, { data: createdRow, error: null }),
    getUserRowByEmail: async () => null,
    getUserRowByNicknameCaseInsensitive: async () => null,
    handlePostRegistrationMultiAccount: async (payload) => {
      calls.push(['multi', payload]);
      return { frozen: false };
    },
    hashSeedPhrase: async (seedPhrase) => `hash:${seedPhrase}`,
    isAllowedUserEmail: () => true,
    logger: {
      error: (...args) => calls.push(['log-error', args]),
      info: (...args) => calls.push(['log-info', args]),
    },
    normalizeEmailInput: (value) => String(value || '').trim().toLowerCase(),
    now: () => new Date('2026-05-26T12:00:00.000Z'),
    recordSignalHistory: async (payload) => calls.push(['history', payload]),
    resolveRegistrationReferral: async () => ({
      referredBy: 'inviter-1',
      referralOverflowFrom: 'overflow-1',
    }),
    writeAuthEvent: async (payload) => calls.push(['event', payload]),
    ...overrides,
  });

  return { calls, flow };
}

test('auth registration flow creates pending user and sends confirmation email', async () => {
  const { calls, flow } = createFlow();

  const result = await flow.registerNewAuthUser({
    client: { ip: '1.2.3.4' },
    dailyLimit: 10,
    input: {
      birthDate: '1990-01-01',
      email: 'USER@example.com',
      gender: 'male',
      language: 'ru',
      nickname: 'Hero',
      preferredAgeFrom: 20,
      preferredAgeTo: 40,
      preferredGender: 'female',
      referralCode: 'Inviter',
    },
    lang: 'ru',
    req: { id: 'req-1' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.seedPhrase, 'seed phrase');
  assert.equal(result.confirmLink, 'ru:confirm?token=confirm-token');

  const insertCall = calls.find((row) => row[0] === 'insert');
  assert.equal(insertCall[1], 'users');
  assert.equal(insertCall[2].email, 'user@example.com');
  assert.equal(insertCall[2].password_hash, 'hash:seed phrase');
  assert.equal(insertCall[2].data.referredBy, 'inviter-1');
  assert.equal(insertCall[2].data.lastWeakFingerprint, 'weak-1');
  assert.deepEqual(insertCall[2].data.lastClientProfile, { screen: 'wide' });

  const referralCall = calls.find((row) => row[0] === 'referral');
  assert.deepEqual(referralCall[1], {
    referredBy: 'inviter-1',
    createdUserId: 'user-1',
    inviteeIp: '1.2.3.4',
    inviteeFingerprint: 'fingerprint-1',
    referralOverflowFrom: 'overflow-1',
  });

  const historyCall = calls.find((row) => row[0] === 'history');
  assert.equal(historyCall[1].eventType, 'register');
  assert.deepEqual(historyCall[1].meta.clientProfile, { screen: 'wide' });

  const emailCall = calls.find((row) => row[0] === 'email');
  assert.deepEqual(emailCall[1], ['user@example.com', 'Hero', 'ru:confirm?token=confirm-token', 'ru']);
});

test('auth registration flow rejects blocked access and writes old event reason', async () => {
  const { calls, flow } = createFlow({
    evaluateAccessRestriction: async () => ({ blocked: true, reason: 'ip' }),
  });

  const result = await flow.registerNewAuthUser({
    input: { email: 'user@example.com' },
    req: { id: 'req-1' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'access_blocked');
  assert.equal(result.status, 403);
  assert.equal(calls[0][1].eventType, 'login_failed');
  assert.equal(calls[0][1].reason, 'blocked:ip');
});

test('auth registration flow rejects invalid and disallowed email before signals', async () => {
  const invalid = createFlow({
    normalizeEmailInput: () => '',
  });

  const invalidResult = await invalid.flow.registerNewAuthUser({
    input: { email: 'bad' },
  });

  assert.deepEqual(invalidResult, {
    ok: false,
    reason: 'invalid_email',
    status: 400,
  });

  const disallowed = createFlow({
    isAllowedUserEmail: () => false,
  });
  const disallowedResult = await disallowed.flow.registerNewAuthUser({
    input: { email: 'user@example.net' },
  });

  assert.deepEqual(disallowedResult, {
    ok: false,
    reason: 'email_not_allowed',
    status: 400,
  });
});

test('auth registration flow rejects daily registration allowance', async () => {
  const { flow } = createFlow({
    checkRegistrationAllowance: async () => ({
      allowed: false,
      maxAllowed: 2,
      restrictedUntil: '2026-05-26T13:00:00.000Z',
    }),
  });

  const result = await flow.registerNewAuthUser({
    input: { email: 'user@example.com' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'registration_limit');
  assert.equal(result.maxAllowed, 2);
  assert.equal(result.blockedUntil, '2026-05-26T13:00:00.000Z');
});

test('auth registration flow rejects duplicate email and nickname', async () => {
  const emailDuplicate = createFlow({
    getUserRowByEmail: async () => ({ id: 'existing' }),
  });
  const emailResult = await emailDuplicate.flow.registerNewAuthUser({
    input: { email: 'user@example.com' },
  });

  assert.equal(emailResult.reason, 'email_exists');

  const nickDuplicate = createFlow({
    getUserRowByNicknameCaseInsensitive: async () => ({ id: 'existing' }),
  });
  const nickResult = await nickDuplicate.flow.registerNewAuthUser({
    input: {
      email: 'user@example.com',
      nickname: 'Hero',
    },
  });

  assert.equal(nickResult.reason, 'nickname_exists');
});

test('auth registration flow returns frozen multi-account result', async () => {
  const { flow } = createFlow({
    handlePostRegistrationMultiAccount: async () => ({
      clusterSize: 4,
      frozen: true,
      groupId: 'group-1',
    }),
  });

  const result = await flow.registerNewAuthUser({
    input: {
      email: 'user@example.com',
      nickname: 'Hero',
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'multi_account_frozen');
  assert.equal(result.groupId, 'group-1');
  assert.equal(result.clusterSize, 4);
});
