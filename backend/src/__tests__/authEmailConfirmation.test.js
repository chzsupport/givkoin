const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
process.env.APP_URL = process.env.APP_URL || 'http://localhost:3000';

const { createAuthEmailConfirmation } = require('../services/auth/authEmailConfirmation');

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

test('auth email confirmation prefers user id row over email row', async () => {
  const confirmation = createAuthEmailConfirmation({
    getSupabaseClient: () => createSupabase(() => ({
      data: { id: 'by-id', email: 'id@example.com' },
      error: null,
    }), []),
    getUserRowByEmail: async () => ({ id: 'by-email', email: 'email@example.com' }),
  });

  assert.deepEqual(await confirmation.findConfirmationUserRow({
    email: 'email@example.com',
    userId: 'by-id',
  }), {
    id: 'by-id',
    email: 'id@example.com',
  });
});

test('auth email confirmation activates user and confirms pending referral', async () => {
  const calls = [];
  const confirmed = [];
  const previousEnv = {
    INITIAL_COMPLAINT_CHIPS: process.env.INITIAL_COMPLAINT_CHIPS,
    INITIAL_STARS: process.env.INITIAL_STARS,
    INITIAL_K: process.env.INITIAL_K,
    INITIAL_LUMENS: process.env.INITIAL_LUMENS,
  };
  process.env.INITIAL_COMPLAINT_CHIPS = '15';
  process.env.INITIAL_STARS = '1';
  process.env.INITIAL_K = '0';
  process.env.INITIAL_LUMENS = '0';

  const confirmation = createAuthEmailConfirmation({
    confirmReferral: async (payload) => confirmed.push(payload),
    findReferralByInviteeId: async () => ({ id: 7, confirmed_at: null }),
    getNumericSettingValue: async () => 5,
    getSupabaseClient: () => createSupabase(() => ({ data: null, error: null }), calls),
    now: () => new Date('2026-05-26T12:00:00.000Z'),
  });

  try {
    assert.deepEqual(await confirmation.activateConfirmedEmail({
      id: 'user-1',
      data: { referralCode: 'EXISTING', other: 'keep' },
    }), { referralCode: 'EXISTING' });
  } finally {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }

  const updateCall = calls.find((row) => row[0] === 'update');
  assert.equal(updateCall[1], 'users');
  assert.equal(updateCall[2].email_confirmed, true);
  assert.equal(updateCall[2].email_confirmed_at, '2026-05-26T12:00:00.000Z');
  assert.equal(updateCall[2].data.other, 'keep');
  assert.equal(updateCall[2].data.lives, 5);
  assert.equal(updateCall[2].data.complaintChips, 15);
  assert.deepEqual(confirmed, [{ referralId: 7 }]);
});

test('auth email confirmation generates unique referral code when missing', async () => {
  const calls = [];
  const codes = ['TAKEN123', 'FREE1234'];
  const confirmation = createAuthEmailConfirmation({
    findReferralByInviteeId: async () => null,
    generateReferralCode: () => codes.shift(),
    getNumericSettingValue: async () => 5,
    getSupabaseClient: () => createSupabase((state) => {
      const codeFilter = state.ops.find((op) => op[0] === 'eq' && op[1] === 'data->>referralCode');

      if (codeFilter?.[2] === 'TAKEN123') {
        return { data: { id: 'other-user' }, error: null };
      }

      return { data: null, error: null };
    }, calls),
    now: () => new Date('2026-05-26T12:00:00.000Z'),
  });

  assert.deepEqual(await confirmation.activateConfirmedEmail({
    id: 'user-1',
    data: {},
  }), { referralCode: 'FREE1234' });

  const updateCall = calls.find((row) => row[0] === 'update');
  assert.equal(updateCall[2].data.referralCode, 'FREE1234');
});

test('auth email confirmation does not reconfirm already confirmed referral', async () => {
  let confirmed = false;
  const confirmation = createAuthEmailConfirmation({
    confirmReferral: async () => {
      confirmed = true;
    },
    findReferralByInviteeId: async () => ({ id: 7, confirmed_at: '2026-05-26T00:00:00.000Z' }),
    getNumericSettingValue: async () => 5,
    getSupabaseClient: () => createSupabase(() => ({ data: null, error: null }), []),
    now: () => new Date('2026-05-26T12:00:00.000Z'),
  });

  await confirmation.activateConfirmedEmail({
    id: 'user-1',
    data: { referralCode: 'EXISTING' },
  });

  assert.equal(confirmed, false);
});
