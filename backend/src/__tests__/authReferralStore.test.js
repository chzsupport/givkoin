const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createAuthReferralStore,
  isReferralRewardDescription,
} = require('../services/auth/authReferralStore');

function createSupabase(resolveResult, calls) {
  return {
    from(table) {
      const state = { table, ops: [] };
      calls.push(['from', table]);

      const query = {
        select(value, options) {
          state.ops.push(['select', value, options]);
          calls.push(['select', table, value, options]);
          return query;
        },
        eq(field, value) {
          state.ops.push(['eq', field, value]);
          calls.push(['eq', table, field, value]);
          return query;
        },
        gte(field, value) {
          state.ops.push(['gte', field, value]);
          calls.push(['gte', table, field, value]);
          return query;
        },
        ilike(field, value) {
          state.ops.push(['ilike', field, value]);
          calls.push(['ilike', table, field, value]);
          return query;
        },
        insert(payload) {
          state.ops.push(['insert', payload]);
          calls.push(['insert', table, payload]);
          return query;
        },
        update(payload) {
          state.ops.push(['update', payload]);
          calls.push(['update', table, payload]);
          return query;
        },
        limit(value) {
          state.ops.push(['limit', value]);
          calls.push(['limit', table, value]);
          return query;
        },
        maybeSingle() {
          return Promise.resolve(resolveResult(state));
        },
        then(resolve, reject) {
          return Promise.resolve(resolveResult(state)).then(resolve, reject);
        },
      };

      return query;
    },
  };
}

function createStore(resultFactory, calls = []) {
  return createAuthReferralStore({
    getSupabaseClient: () => createSupabase(resultFactory, calls),
  });
}

test('auth referral store normalizes user lookups', async () => {
  const calls = [];
  const store = createStore(() => ({ data: { id: 'user-1' }, error: null }), calls);

  assert.deepEqual(await store.getUserRowByEmail(' Test@Example.COM '), { id: 'user-1' });
  assert.deepEqual(calls.find((row) => row[0] === 'eq'), [
    'eq',
    'users',
    'email',
    'test@example.com',
  ]);

  calls.length = 0;
  assert.deepEqual(await store.getUserRowByNicknameCaseInsensitive(' Vityaz '), { id: 'user-1' });
  assert.deepEqual(calls.find((row) => row[0] === 'ilike'), [
    'ilike',
    'users',
    'nickname',
    'Vityaz',
  ]);
});

test('auth referral store counts referrals with old date filters', async () => {
  const calls = [];
  const since = new Date('2026-05-01T00:00:00.000Z');
  const store = createStore(() => ({ count: 3, error: null }), calls);

  assert.equal(await store.countReferralsByInviterSince({ inviterId: 'user-1', since }), 3);
  assert.deepEqual(calls.find((row) => row[0] === 'gte'), [
    'gte',
    'referrals',
    'created_at',
    since.toISOString(),
  ]);

  calls.length = 0;
  assert.equal(await store.countConfirmedReferralsByInviterSince({ inviterId: 'user-1', since }), 3);
  assert.deepEqual(calls.find((row) => row[0] === 'gte'), [
    'gte',
    'referrals',
    'confirmed_at',
    since.toISOString(),
  ]);
});

test('auth referral store recognizes referral reward transactions', async () => {
  const store = createStore((state) => {
    const selected = state.ops.find((op) => op[0] === 'select')?.[1] || '';

    if (selected === 'description') {
      return {
        data: [
          { description: 'Бонус за реферала: one' },
          { description: 'Referral bonus: two' },
          { description: 'other' },
        ],
        error: null,
      };
    }

    return {
      data: [
        { description: ' 10th referral bonus for the day ' },
        { description: 'Referral bonus: invitee' },
      ],
      error: null,
    };
  });

  assert.equal(await store.hasTransactionDailyReferralBonus({
    userId: 'user-1',
    since: '2026-05-01T00:00:00.000Z',
  }), true);
  assert.equal(await store.hasReferralRewardKTransaction({
    userId: 'user-1',
    referralId: 'ref-1',
  }), true);
  assert.equal(await store.countReferralRewardTransactionsSince({
    userId: 'user-1',
    since: '2026-05-01T00:00:00.000Z',
  }), 2);
  assert.equal(isReferralRewardDescription('Referral bonus: invitee'), true);
  assert.equal(isReferralRewardDescription('other'), false);
});

test('auth referral store writes referral rows without changing payload shape', async () => {
  const calls = [];
  const store = createStore(() => ({ data: { id: 'ref-1' }, error: null }), calls);

  assert.deepEqual(await store.createReferralRow({ inviter_id: 'user-1' }), { id: 'ref-1' });
  const insertCall = calls.find((row) => row[0] === 'insert');
  assert.equal(insertCall[1], 'referrals');
  assert.equal(insertCall[2].inviter_id, 'user-1');
  assert.match(insertCall[2].created_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(insertCall[2].updated_at, /^\d{4}-\d{2}-\d{2}T/);

  calls.length = 0;
  assert.deepEqual(await store.confirmReferral({ referralId: '42' }), { id: 'ref-1' });
  const updateCall = calls.find((row) => row[0] === 'update');
  assert.equal(updateCall[2].bonus_granted, false);
  assert.equal(updateCall[2].status, 'pending');
  assert.deepEqual(calls.find((row) => row[0] === 'eq'), ['eq', 'referrals', 'id', 42]);
});
