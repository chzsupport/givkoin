const test = require('node:test');
const assert = require('node:assert/strict');

const { createAuthReferralRewards } = require('../services/auth/authReferralRewards');

function createSupabase(resultFactory, calls) {
  return {
    from(table) {
      const state = { table, ops: [] };
      calls.push(['from', table]);

      const query = {
        update(payload) {
          state.ops.push(['update', payload]);
          calls.push(['update', table, payload]);
          return query;
        },
        eq(field, value) {
          state.ops.push(['eq', field, value]);
          calls.push(['eq', table, field, value]);
          return query;
        },
        select(value) {
          state.ops.push(['select', value]);
          calls.push(['select', table, value]);
          return query;
        },
        maybeSingle() {
          return Promise.resolve(resultFactory(state));
        },
      };

      return query;
    },
  };
}

function createRewards(deps = {}) {
  const calls = deps.calls || [];
  const awarded = deps.awarded || [];
  const fixedNow = new Date('2026-05-26T12:00:00.000Z');

  return createAuthReferralRewards({
    awardRadianceForActivity: async (payload) => awarded.push(['radiance', payload]),
    countReferralRewardTransactionsSince: async () => deps.rewardCount ?? 10,
    findReferralByInviteeId: async () => deps.referral ?? {
      id: 7,
      confirmed_at: '2026-05-26T00:00:00.000Z',
      bonus_granted: false,
    },
    getKService: () => ({
      awardReferralK: async (payload) => {
        if (deps.throwAward) throw new Error('award failed');
        awarded.push(['referralK', payload]);
      },
      creditK: async (payload) => awarded.push(['dailyK', payload]),
    }),
    getSupabaseClient: () => createSupabase(() => ({
      data: deps.rewardableReferral ?? {
        id: 7,
        inviter_id: 'inviter-1',
      },
      error: deps.claimError || null,
    }), calls),
    hasReferralRewardKTransaction: async () => deps.hasReferralK ?? false,
    hasTransactionDailyReferralBonus: async () => deps.hasDailyBonus ?? false,
    logError: (message) => calls.push(['error', message]),
    now: () => fixedNow,
  });
}

test('auth referral rewards settles first login reward', async () => {
  const calls = [];
  const awarded = [];
  const rewards = createRewards({ calls, awarded });

  const result = await rewards.settleLoginReferralReward({
    dailyLimit: 10,
    lang: 'ru',
    pickLang: (lang, ru, en) => (lang === 'en' ? en : ru),
    user: { _id: 'user-1', nickname: 'Invitee' },
  });

  assert.deepEqual(result, { settled: true, referralId: 7 });
  assert.deepEqual(calls.find((row) => row[0] === 'eq' && row[2] === 'bonus_granted'), [
    'eq',
    'referrals',
    'bonus_granted',
    false,
  ]);
  assert.equal(awarded[0][0], 'referralK');
  assert.equal(awarded[0][1].bonus, 20);
  assert.equal(awarded[1][0], 'radiance');
  assert.equal(awarded[2][0], 'dailyK');
  assert.equal(awarded[2][1].amount, 100);
});

test('auth referral rewards skips non rewardable referral', async () => {
  const rewards = createRewards({
    referral: { id: 7, confirmed_at: null, bonus_granted: false },
  });

  assert.deepEqual(await rewards.settleLoginReferralReward({
    user: { _id: 'user-1' },
  }), { settled: false, reason: 'not_rewardable' });
});

test('auth referral rewards rolls back claimed row on award failure', async () => {
  const calls = [];
  const rewards = createRewards({ calls, throwAward: true });

  const result = await rewards.settleLoginReferralReward({
    user: { _id: 'user-1', nickname: 'Invitee' },
  });

  assert.deepEqual(result, { settled: false, reason: 'award_failed' });
  assert.equal(calls.filter((row) => row[0] === 'update').length, 2);
  assert.deepEqual(calls.at(-1), ['eq', 'referrals', 'id', 7]);
});
