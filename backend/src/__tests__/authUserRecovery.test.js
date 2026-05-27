const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createAuthUserRecovery,
  needsCoreUserDataRecovery,
  round3,
} = require('../services/auth/authUserRecovery');

function createSupabase(resolveResult, calls) {
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
        in(field, values) {
          state.ops.push(['in', field, values]);
          calls.push(['in', table, field, values]);
          return query;
        },
        range(from, to) {
          state.ops.push(['range', from, to]);
          calls.push(['range', table, from, to]);
          return query;
        },
        update(payload) {
          state.ops.push(['update', payload]);
          calls.push(['update', table, payload]);
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

function createRecovery(resultFactory, calls = [], settings = {}) {
  return createAuthUserRecovery({
    getSupabaseClient: () => createSupabase(resultFactory, calls),
    getNumericSettingValue: async (key, fallback) => (
      Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : fallback
    ),
  });
}

test('auth user recovery calculates balances from completed transactions', async () => {
  const recovery = createRecovery(() => ({
    data: [
      { direction: 'credit', amount: 10, currency: 'K', status: 'completed' },
      { direction: 'debit', amount: 3, currency: 'LM', status: 'completed' },
      { direction: 'credit', amount: 0.25, currency: 'STAR', status: 'completed' },
      { direction: 'credit', amount: 99, currency: 'K', status: 'pending' },
      { direction: 'credit', amount: 5, currency: 'OTHER', status: 'completed' },
    ],
    error: null,
  }));

  assert.deepEqual(await recovery.calculateUserBalancesFromTransactions('user-1'), {
    K: 10,
    LM: -3,
    STAR: 0.25,
  });
});

test('auth user recovery repairs missing core data with old defaults', async () => {
  const calls = [];
  const recovery = createRecovery((state) => {
    if (state.table === 'transactions') {
      return {
        data: [
          { direction: 'credit', amount: 10, currency: 'K', status: 'completed' },
          { direction: 'credit', amount: 2, currency: 'LM', status: 'completed' },
          { direction: 'credit', amount: 0.25, currency: 'STAR', status: 'completed' },
        ],
        error: null,
      };
    }

    const updatePayload = state.ops.find((op) => op[0] === 'update')?.[1];
    return {
      data: {
        id: 'user-1',
        data: updatePayload.data,
      },
      error: null,
    };
  }, calls, { INITIAL_LIVES: 7 });

  const repaired = await recovery.repairDamagedUserData({
    id: 'user-1',
    email_confirmed: true,
    data: { nicknameColor: 'blue' },
  });

  assert.deepEqual(repaired.data, {
    nicknameColor: 'blue',
    lives: 7,
    complaintChips: 15,
    k: 10,
    lumens: 2,
    stars: 1.25,
    achievementStats: {},
  });
  assert.deepEqual(calls.find((row) => row[0] === 'eq' && row[1] === 'users'), [
    'eq',
    'users',
    'id',
    'user-1',
  ]);
});

test('auth user recovery skips complete healthy data', async () => {
  let calls = 0;
  const recovery = createAuthUserRecovery({
    getSupabaseClient: () => {
      calls += 1;
      throw new Error('Supabase should not be used');
    },
    getNumericSettingValue: async () => 5,
  });
  const row = {
    id: 'user-1',
    email_confirmed: true,
    data: {
      lives: 5,
      complaintChips: 15,
      k: 0,
      lumens: 0,
      stars: 1,
      achievementStats: {},
    },
  };

  assert.equal(await recovery.repairDamagedUserData(row), row);
  assert.equal(calls, 0);
});

test('auth user recovery exposes core checks', () => {
  assert.equal(needsCoreUserDataRecovery({ k: 0, lumens: 0, stars: 1 }), true);
  assert.equal(needsCoreUserDataRecovery({
    k: 0,
    lumens: 0,
    stars: 1,
    lives: 5,
    complaintChips: 15,
    achievementStats: {},
  }), false);
  assert.equal(round3(1.23456), 1.235);
});
