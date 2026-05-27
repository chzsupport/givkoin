const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createFreezeActions,
} = require('../services/multiAccount/freezeActions');

function createSupabase(updates) {
  return {
    from(table) {
      assert.equal(table, 'users');
      return {
        update(payload) {
          return {
            eq(field, value) {
              updates.push({ field, payload, value });
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
  };
}

test('multi-account freeze actions freeze users and revoke sessions', async () => {
  const updates = [];
  const revoked = [];
  const actions = createFreezeActions({
    getSupabaseClient: () => createSupabase(updates),
    revokeAllUserSessions: async (payload) => revoked.push(payload),
    now: () => new Date('2026-05-25T10:00:00.000Z'),
  });

  const groupId = await actions.updateUsersForFreeze([{
    _id: 'user-1',
    status: 'active',
    emailConfirmed: true,
    data: {},
  }], {
    groupId: 'group-1',
    reason: 'manual',
    actorId: 'admin-1',
    note: 'note',
    action: 'freeze',
  });

  assert.equal(groupId, 'group-1');
  assert.equal(updates[0].value, 'user-1');
  assert.equal(updates[0].payload.status, 'frozen');
  assert.equal(updates[0].payload.access_restriction_reason, 'multi_account_group_frozen');
  assert.equal(updates[0].payload.data.securityFreeze.status, 'frozen');
  assert.equal(updates[0].payload.data.securityFreeze.previousStatus, 'active');
  assert.equal(updates[0].payload.data.securityFreeze.frozenBy, 'admin-1');
  assert.deepEqual(revoked, [{
    userId: 'user-1',
    revokedBy: 'admin-1',
    reason: 'multi_account_group_frozen',
  }]);
});

test('multi-account freeze actions unfreeze without revoking sessions', async () => {
  const updates = [];
  const revoked = [];
  const actions = createFreezeActions({
    getSupabaseClient: () => createSupabase(updates),
    revokeAllUserSessions: async (payload) => revoked.push(payload),
    now: () => new Date('2026-05-25T10:00:00.000Z'),
  });

  await actions.updateUsersForFreeze([{
    _id: 'user-1',
    status: 'frozen',
    emailConfirmed: true,
    data: {
      securityFreeze: {
        groupId: 'group-1',
        previousStatus: 'active',
        reason: 'old',
      },
    },
  }], {
    action: 'unfreeze',
    actorId: 'admin-1',
  });

  assert.equal(updates[0].payload.status, 'active');
  assert.equal(updates[0].payload.access_restriction_reason, '');
  assert.equal(updates[0].payload.data.securityFreeze.status, 'unfrozen');
  assert.equal(updates[0].payload.data.securityFreeze.decision, 'unfreeze');
  assert.deepEqual(revoked, []);
});

test('multi-account freeze actions ban users with ban revoke reason', async () => {
  const updates = [];
  const revoked = [];
  const actions = createFreezeActions({
    getSupabaseClient: () => createSupabase(updates),
    revokeAllUserSessions: async (payload) => revoked.push(payload),
    now: () => new Date('2026-05-25T10:00:00.000Z'),
  });

  await actions.updateUsersForFreeze([{
    _id: 'user-1',
    status: 'frozen',
    emailConfirmed: true,
    data: { securityFreeze: { groupId: 'group-1', reason: 'old' } },
  }], {
    action: 'ban',
    actorId: 'admin-1',
  });

  assert.equal(updates[0].payload.status, 'banned');
  assert.equal(updates[0].payload.data.securityFreeze.status, 'banned');
  assert.equal(updates[0].payload.data.securityFreeze.decision, 'ban');
  assert.deepEqual(revoked, [{
    userId: 'user-1',
    revokedBy: 'admin-1',
    reason: 'multi_account_group_banned',
  }]);
});
