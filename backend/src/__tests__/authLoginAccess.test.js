const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';

const { createAuthLoginAccess } = require('../services/auth/authLoginAccess');

function createUserRow(overrides = {}) {
  return {
    id: 'user-1',
    email: 'user@example.com',
    email_confirmed: true,
    password_hash: 'hash',
    role: 'user',
    status: 'active',
    data: {},
    ...overrides,
  };
}

function buildSafeUserFromRow(row) {
  return {
    _id: row.id,
    accessRestrictedUntil: row.access_restricted_until || '',
    accessRestrictionReason: row.access_restriction_reason || '',
    email: row.email,
    emailConfirmed: Boolean(row.email_confirmed),
    role: row.role,
    status: row.status,
  };
}

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

function createAccess(overrides = {}) {
  const calls = [];
  const access = createAuthLoginAccess({
    buildSafeUserFromRow,
    compareSeedPhrase: async () => true,
    evaluateAccessRestriction: async () => ({ blocked: false }),
    getSupabaseClient: () => createSupabase(calls),
    getUserRowByEmail: async () => createUserRow(),
    isActiveRestriction: () => false,
    isAdminEmail: () => true,
    isHumanCheckBlocked: () => ({ blocked: false }),
    isUserFrozen: () => false,
    now: () => new Date('2026-05-26T12:00:00.000Z'),
    writeAuthEvent: async (payload) => calls.push(['event', payload]),
    ...overrides,
  });

  return { access, calls };
}

test('auth login access rejects missing user and writes old failure reason', async () => {
  const { access, calls } = createAccess({
    getUserRowByEmail: async () => null,
  });

  const result = await access.prepareLoginAccess({
    email: 'missing@example.com',
    req: { id: 'req-1' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'user_not_found');
  assert.equal(result.status, 401);
  assert.equal(calls[0][1].user, null);
  assert.equal(calls[0][1].email, 'missing@example.com');
  assert.equal(calls[0][1].reason, 'user_not_found');
});

test('auth login access rejects admin account with non-admin email', async () => {
  const { access, calls } = createAccess({
    getUserRowByEmail: async () => createUserRow({ role: 'admin' }),
    isAdminEmail: () => false,
  });

  const result = await access.prepareLoginAccess({
    email: 'user@example.com',
    req: { id: 'req-1' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'admin_email_policy_violation');
  assert.equal(result.status, 403);
  assert.equal(calls[0][1].reason, 'admin_email_policy_violation');
});

test('auth login access rejects active external access block', async () => {
  const { access, calls } = createAccess({
    evaluateAccessRestriction: async () => ({ blocked: true, reason: 'ip' }),
  });

  const result = await access.prepareLoginAccess({
    client: { ip: '1.2.3.4' },
    email: 'user@example.com',
    req: { id: 'req-1' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'access_blocked');
  assert.equal(calls[0][1].reason, 'blocked:ip');
});

test('auth login access returns multi-account restriction with old event type', async () => {
  const { access, calls } = createAccess({
    getUserRowByEmail: async () => createUserRow({
      access_restricted_until: '2026-05-26T13:00:00.000Z',
      access_restriction_reason: 'review',
    }),
    isActiveRestriction: () => true,
  });

  const result = await access.prepareLoginAccess({
    email: 'user@example.com',
    req: { id: 'req-1' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'temporary_restriction_active');
  assert.equal(result.blockedUntil, '2026-05-26T13:00:00.000Z');
  assert.equal(calls[0][1].eventType, 'multi_account_detected');
  assert.deepEqual(calls[0][1].meta, {
    restrictedUntil: '2026-05-26T13:00:00.000Z',
    restrictionReason: 'review',
  });
});

test('auth login access clears expired restriction before successful login', async () => {
  const { access, calls } = createAccess({
    getUserRowByEmail: async () => createUserRow({
      access_restricted_until: '2026-05-25T12:00:00.000Z',
      access_restriction_reason: 'old',
    }),
    isActiveRestriction: () => false,
  });

  const result = await access.prepareLoginAccess({
    email: 'user@example.com',
    seedPhrase: 'seed',
    req: { id: 'req-1' },
  });

  assert.equal(result.ok, true);

  const updateCall = calls.find((row) => row[0] === 'update');
  assert.equal(updateCall[1], 'users');
  assert.deepEqual(updateCall[2], {
    access_restricted_until: null,
    access_restriction_reason: '',
    updated_at: '2026-05-26T12:00:00.000Z',
  });
});

test('auth login access rejects bad credentials', async () => {
  const { access, calls } = createAccess({
    compareSeedPhrase: async () => false,
  });

  const result = await access.prepareLoginAccess({
    email: 'user@example.com',
    seedPhrase: 'wrong',
    req: { id: 'req-1' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bad_credentials');
  assert.equal(result.status, 401);
  assert.equal(calls[0][1].reason, 'bad_credentials');
});

test('auth login access rejects blocked human check with timestamp meta', async () => {
  const { access, calls } = createAccess({
    isHumanCheckBlocked: () => ({
      blocked: true,
      blockedUntil: '2026-05-26T13:00:00.000Z',
    }),
  });

  const result = await access.prepareLoginAccess({
    email: 'user@example.com',
    seedPhrase: 'seed',
    req: { id: 'req-1' },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'human_check_blocked');
  assert.equal(result.humanCheckBlocked, true);
  assert.equal(result.blockedUntil, '2026-05-26T13:00:00.000Z');
  assert.deepEqual(calls[0][1].meta, {
    blockedUntil: '2026-05-26T13:00:00.000Z',
  });
});
