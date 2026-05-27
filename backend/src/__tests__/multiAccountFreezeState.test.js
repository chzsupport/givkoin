const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildFreezeGroupId,
  buildUserDataWithFreeze,
  getRiskCaseSource,
  getSecurityFreeze,
  isPendingFrozenMultiAccountUser,
} = require('../services/multiAccount/freezeState');

test('multi-account freeze state reads only meta source for risk cases', () => {
  assert.equal(getRiskCaseSource({ source: 'legacy', meta: { source: 'multi_account' } }), 'multi_account');
  assert.equal(getRiskCaseSource({ source: 'legacy' }), '');
});

test('multi-account freeze state builds group id from unique sorted users', () => {
  const groupId = buildFreezeGroupId([
    { _id: 'user-2' },
    { id: 'user-1' },
    { _id: 'user-2' },
  ]);

  assert.match(groupId, /^mag_user-1_user-2_\d+_[a-f0-9]{6}$/);
});

test('multi-account freeze state reads and merges freeze data', () => {
  const user = {
    data: {
      k: 10,
      securityFreeze: {
        groupId: 'group-1',
        previousStatus: 'active',
      },
    },
  };

  assert.deepEqual(getSecurityFreeze(user.data), {
    groupId: 'group-1',
    previousStatus: 'active',
  });

  assert.deepEqual(buildUserDataWithFreeze(user, {
    status: 'frozen',
    reason: 'multi_account_group_frozen',
  }), {
    k: 10,
    securityFreeze: {
      groupId: 'group-1',
      previousStatus: 'active',
      status: 'frozen',
      reason: 'multi_account_group_frozen',
    },
  });
});

test('multi-account freeze state detects pending frozen users only', () => {
  assert.equal(isPendingFrozenMultiAccountUser({
    data: {
      securityFreeze: {
        groupId: 'group-1',
        status: 'frozen',
        decision: 'pending',
      },
    },
  }), true);

  assert.equal(isPendingFrozenMultiAccountUser({
    status: 'frozen',
    data: {
      securityFreeze: {
        groupId: 'group-1',
        decision: 'pending',
      },
    },
  }), true);

  assert.equal(isPendingFrozenMultiAccountUser({
    data: {
      securityFreeze: {
        groupId: 'group-1',
        status: 'frozen',
        decision: 'watch',
      },
    },
  }), false);

  assert.equal(isPendingFrozenMultiAccountUser({
    accessRestrictionReason: 'multi_account_group_frozen',
    data: {
      securityFreeze: {
        groupId: 'group-1',
        decision: 'pending',
      },
    },
  }), true);
});
