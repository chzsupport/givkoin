const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createRewardRollbackActions,
} = require('../services/multiAccount/rewardRollbackActions');

function createSupabase(calls) {
  return {
    from(table) {
      return {
        update(payload) {
          calls.push(['update', table, payload]);
          return {
            eq(field, value) {
              calls.push(['updateEq', field, value]);
              return {
                select(valueSelect) {
                  calls.push(['updateSelect', valueSelect]);
                  return {
                    maybeSingle: async () => ({
                      data: {
                        id: value,
                        email: 'one@example.com',
                        nickname: 'One',
                        role: 'user',
                        status: 'active',
                        email_confirmed: true,
                        data: payload.data,
                      },
                      error: null,
                    }),
                  };
                },
              };
            },
          };
        },
        insert(payload) {
          calls.push(['insert', table, payload]);
          return {
            select(valueSelect) {
              calls.push(['insertSelect', valueSelect]);
              return {
                maybeSingle: async () => ({ data: { id: 'rollback-tx-1' }, error: null }),
              };
            },
          };
        },
      };
    },
  };
}

test('multi-account reward rollback actions roll back available K and create transaction', async () => {
  const calls = [];
  const actions = createRewardRollbackActions({
    getSupabaseClient: () => createSupabase(calls),
    getUsersByIdsDetailed: async () => [{
      _id: 'user-1',
      email: 'one@example.com',
      nickname: 'One',
      data: { k: 20, rewardRollbackDebtK: 1 },
    }],
    now: () => new Date('2026-05-25T10:00:00.000Z'),
  });

  const result = await actions.applyPendingBattleRewardRollback({
    actorId: 'admin-1',
    users: [{ _id: 'user-1', data: { k: 20, rewardRollbackDebtK: 1 } }],
    riskCase: {
      _id: 'case-1',
      evidence: [{ signal: 'parallel_battle', details: { battles: [{ battleId: 'battle-1' }] } }],
      rewardRollback: [{
        transactionId: 'tx-1',
        userId: 'user-1',
        battleId: 'battle-1',
        amount: 12.3456,
        currency: 'K',
        status: 'pending',
        occurredAt: '2026-05-24T10:00:00.000Z',
      }],
    },
  });

  assert.equal(result.changed, true);
  assert.equal(result.rewardRollback[0].status, 'rolled_back');
  assert.equal(result.rewardRollback[0].rolledBackAmount, 12.346);
  assert.equal(result.rewardRollback[0].shortfall, 0);
  assert.equal(result.rewardRollback[0].rolledBackBy, 'admin-1');
  assert.equal(result.rewardRollback[0].rollbackTransactionId, 'rollback-tx-1');

  const updateCall = calls.find((row) => row[0] === 'update' && row[1] === 'users');
  assert.equal(updateCall[2].data.k, 7.654);
  assert.equal(updateCall[2].data.rewardRollbackDebtK, 1);

  const insertCall = calls.find((row) => row[0] === 'insert' && row[1] === 'transactions');
  assert.equal(insertCall[2].amount, 12.346);
  assert.equal(insertCall[2].direction, 'debit');
  assert.equal(insertCall[2].related_entity, 'case-1');
});

test('multi-account reward rollback actions track shortfall when K is not enough', async () => {
  const calls = [];
  const actions = createRewardRollbackActions({
    getSupabaseClient: () => createSupabase(calls),
    getUsersByIdsDetailed: async () => [{
      _id: 'user-1',
      data: { k: 5, rewardRollbackDebtK: 2 },
    }],
    now: () => new Date('2026-05-25T10:00:00.000Z'),
  });

  const result = await actions.applyPendingBattleRewardRollback({
    users: [{ _id: 'user-1', data: { k: 5, rewardRollbackDebtK: 2 } }],
    riskCase: {
      _id: 'case-1',
      evidence: [{ signal: 'parallel_battle', details: { battles: [{ battleId: 'battle-1' }] } }],
      rewardRollback: [{
        userId: 'user-1',
        battleId: 'battle-1',
        amount: 8,
        currency: 'K',
        status: 'pending',
        occurredAt: '2026-05-24T10:00:00.000Z',
      }],
    },
  });

  assert.equal(result.rewardRollback[0].status, 'partial_rollback');
  assert.equal(result.rewardRollback[0].rolledBackAmount, 5);
  assert.equal(result.rewardRollback[0].shortfall, 3);

  const updateCall = calls.find((row) => row[0] === 'update' && row[1] === 'users');
  assert.equal(updateCall[2].data.k, 0);
  assert.equal(updateCall[2].data.rewardRollbackDebtK, 5);
});

test('multi-account reward rollback actions mark missing users without writing', async () => {
  const calls = [];
  const actions = createRewardRollbackActions({
    getSupabaseClient: () => createSupabase(calls),
    getUsersByIdsDetailed: async () => [],
  });

  const result = await actions.applyPendingBattleRewardRollback({
    users: [],
    riskCase: {
      evidence: [{ signal: 'parallel_battle', details: { battles: [{ battleId: 'battle-1' }] } }],
      rewardRollback: [{
        userId: 'user-1',
        battleId: 'battle-1',
        amount: 8,
        currency: 'K',
        status: 'pending',
        occurredAt: '2026-05-24T10:00:00.000Z',
      }],
    },
  });

  assert.equal(result.rewardRollback[0].status, 'missing_user');
  assert.deepEqual(calls, []);
});
