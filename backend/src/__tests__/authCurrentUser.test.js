const test = require('node:test');
const assert = require('node:assert/strict');

const { createAuthCurrentUser } = require('../services/auth/authCurrentUser');

test('current auth user repairs row and returns safe user with entity', async () => {
  const calls = [];
  const currentUser = createAuthCurrentUser({
    getUserRowById: async (userId) => {
      calls.push(['getUserRowById', userId]);
      return { id: userId, data: { k: 10 } };
    },
    repairDamagedUserData: async (row) => {
      calls.push(['repairDamagedUserData', row.id]);
      return { ...row, repaired: true };
    },
    buildSafeUserWithEntity: async (row) => {
      calls.push(['buildSafeUserWithEntity', row.id, row.repaired]);
      return { id: row.id, k: row.data.k, entity: { id: 'entity-1' } };
    },
  });

  assert.deepEqual(await currentUser.getCurrentAuthUser({ userId: 'user-1' }), {
    ok: true,
    row: { id: 'user-1', data: { k: 10 }, repaired: true },
    user: { id: 'user-1', k: 10, entity: { id: 'entity-1' } },
  });
  assert.deepEqual(calls, [
    ['getUserRowById', 'user-1'],
    ['repairDamagedUserData', 'user-1'],
    ['buildSafeUserWithEntity', 'user-1', true],
  ]);
});

test('current auth user returns not found when repaired row is missing', async () => {
  let buildCalls = 0;
  const currentUser = createAuthCurrentUser({
    getUserRowById: async () => null,
    repairDamagedUserData: async () => null,
    buildSafeUserWithEntity: async () => {
      buildCalls += 1;
      return null;
    },
  });

  assert.deepEqual(await currentUser.getCurrentAuthUser({ userId: 'missing' }), {
    ok: false,
    reason: 'not_found',
  });
  assert.equal(buildCalls, 0);
});
