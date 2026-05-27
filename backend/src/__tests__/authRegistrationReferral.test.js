const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';

const { createAuthRegistrationReferral } = require('../services/auth/authRegistrationReferral');

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

test('auth registration referral skips empty or missing code', async () => {
  const referral = createAuthRegistrationReferral({
    getUserRowByNicknameCaseInsensitive: async () => {
      throw new Error('lookup should not run');
    },
  });

  assert.deepEqual(await referral.resolveRegistrationReferral({ referralCode: '' }), {
    referredBy: undefined,
    referralOverflowFrom: undefined,
  });
});

test('auth registration referral keeps inviter under daily limit', async () => {
  const seen = [];
  const referral = createAuthRegistrationReferral({
    countReferralsByInviterSince: async ({ inviterId, since }) => {
      seen.push(['count', inviterId, since.toISOString()]);
      return 9;
    },
    getUserRowByEmail: async () => {
      throw new Error('spectator should not be loaded');
    },
    getUserRowByNicknameCaseInsensitive: async (nickname) => {
      seen.push(['nickname', nickname]);
      return { id: 'inviter-1' };
    },
    now: () => new Date('2026-05-26T12:00:00.000Z'),
  });

  assert.deepEqual(await referral.resolveRegistrationReferral({
    referralCode: ' inviter ',
    dailyLimit: 10,
  }), {
    referredBy: 'inviter-1',
    referralOverflowFrom: undefined,
  });
  assert.deepEqual(seen, [
    ['nickname', 'inviter'],
    ['count', 'inviter-1', '2026-05-25T12:00:00.000Z'],
  ]);
});

test('auth registration referral moves overflow to spectator when available', async () => {
  const referral = createAuthRegistrationReferral({
    countReferralsByInviterSince: async () => 10,
    getUserRowByEmail: async (email) => (email === 'spectator@gmail.com' ? { id: 'spectator-1' } : null),
    getUserRowByNicknameCaseInsensitive: async () => ({ id: 'inviter-1' }),
    now: () => new Date('2026-05-26T12:00:00.000Z'),
  });

  assert.deepEqual(await referral.resolveRegistrationReferral({
    referralCode: 'inviter',
    dailyLimit: 10,
  }), {
    referredBy: 'spectator-1',
    referralOverflowFrom: 'inviter-1',
  });
});

test('auth registration referral creates pending row with generated inviter code', async () => {
  const calls = [];
  const createdRows = [];
  const referral = createAuthRegistrationReferral({
    createReferralRow: async (payload) => {
      createdRows.push(payload);
      return { id: 'ref-1', ...payload };
    },
    generateReferralCode: () => 'CODE1234',
    getSupabaseClient: () => createSupabase((state) => {
      const eq = state.ops.find((op) => op[0] === 'eq');

      if (state.table === 'users' && eq?.[1] === 'id') {
        return { data: { id: 'inviter-1', data: {} }, error: null };
      }

      return { data: null, error: null };
    }, calls),
    now: () => new Date('2026-05-26T12:00:00.000Z'),
  });

  assert.deepEqual(await referral.createPendingReferralForNewUser({
    referredBy: 'inviter-1',
    createdUserId: 'invitee-1',
    inviteeIp: '127.0.0.1',
    inviteeFingerprint: 'fp-1',
    referralOverflowFrom: 'original-inviter',
  }), {
    id: 'ref-1',
    inviter_id: 'inviter-1',
    invitee_id: 'invitee-1',
    code: 'CODE1234',
    invitee_ip: '127.0.0.1',
    invitee_fingerprint: 'fp-1',
    bonus_granted: false,
    status: 'pending',
    check_reason: 'overflow_from:original-inviter',
  });

  const updateCall = calls.find((row) => row[0] === 'update');
  assert.equal(updateCall[1], 'users');
  assert.equal(updateCall[2].data.referralCode, 'CODE1234');
  assert.equal(updateCall[2].updated_at, '2026-05-26T12:00:00.000Z');
  assert.equal(createdRows[0].code, 'CODE1234');
});

test('auth registration referral does not create row when inviter is missing', async () => {
  let created = false;
  const referral = createAuthRegistrationReferral({
    createReferralRow: async () => {
      created = true;
    },
    getSupabaseClient: () => createSupabase(() => ({ data: null, error: null }), []),
  });

  assert.equal(await referral.createPendingReferralForNewUser({
    referredBy: 'missing',
    createdUserId: 'invitee-1',
  }), null);
  assert.equal(created, false);
});
