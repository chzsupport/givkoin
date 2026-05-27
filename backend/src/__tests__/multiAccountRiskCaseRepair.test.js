const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createRiskCaseRepair,
} = require('../services/multiAccount/riskCaseRepair');

function createSupabase(rows, calls) {
  return {
    from(table) {
      calls.push(['from', table]);
      const query = {
        select(value) {
          calls.push(['select', value]);
          return query;
        },
        eq(field, value) {
          calls.push(['eq', field, value]);
          return query;
        },
        range(from, to) {
          calls.push(['range', from, to]);
          return Promise.resolve({ data: rows, error: null });
        },
      };
      return query;
    },
  };
}

function frozenUser(id, groupId, data = {}) {
  return {
    id,
    email: `${id}@example.com`,
    nickname: id,
    status: 'frozen',
    data: {
      lastIp: `10.0.0.${id.slice(-1)}`,
      securityFreeze: {
        groupId,
        status: 'frozen',
        decision: 'pending',
        reason: 'multi_account_group_frozen',
      },
      ...data,
    },
  };
}

test('multi-account risk case repair returns empty counters without pending groups', async () => {
  const calls = [];
  const repair = createRiskCaseRepair({
    getSupabaseClient: () => createSupabase([], calls),
    listModelRiskCases: async () => {
      calls.push(['listCases']);
      return [];
    },
    createRiskCase: async () => null,
    updateRiskCaseById: async () => null,
  }).repairPendingMultiAccountRiskCases;

  assert.deepEqual(await repair(), {
    groupsFound: 0,
    createdCases: 0,
    updatedCases: 0,
    restoredCases: 0,
  });
  assert.equal(calls.some((row) => row[0] === 'listCases'), false);
});

test('multi-account risk case repair updates stale multi-account case and creates missing one', async () => {
  const calls = [];
  const written = [];
  const repair = createRiskCaseRepair({
    now: () => new Date('2026-05-25T12:00:00.000Z'),
    getSupabaseClient: () => createSupabase([
      frozenUser('user-1', 'group-1', { lastDeviceId: 'device-1' }),
      frozenUser('user-2', 'group-1', { lastDeviceId: 'device-2' }),
    ], calls),
    listModelRiskCases: async () => [
      {
        _id: 'case-1',
        user: 'user-1',
        relatedUsers: ['old-user'],
        groupId: 'old-group',
        riskScore: 80,
        status: 'watch',
        freezeStatus: 'watch',
        notes: 'old note',
        signals: ['email_normalized_collision'],
        evidence: [{ type: 'email', signal: 'email_normalized_collision' }],
        meta: { source: 'multi_account', eventType: 'login', ipIntel: { isVpn: true } },
      },
      {
        _id: 'manual-2',
        user: 'user-2',
        riskScore: 65,
        notes: 'manual note',
        signals: ['manual_signal'],
        evidence: [{ type: 'manual', signal: 'manual_signal' }],
        meta: { source: 'manual_review' },
      },
    ],
    updateRiskCaseById: async (id, data) => {
      written.push(['update', id, data]);
      return { _id: id, ...data };
    },
    createRiskCase: async (data) => {
      written.push(['create', data]);
      return { _id: 'created-case', ...data };
    },
  }).repairPendingMultiAccountRiskCases;

  assert.deepEqual(await repair(), {
    groupsFound: 1,
    createdCases: 1,
    updatedCases: 1,
    restoredCases: 2,
  });

  const update = written.find((row) => row[0] === 'update');
  assert.equal(update[1], 'case-1');
  assert.equal(update[2].user, 'user-1');
  assert.deepEqual(update[2].relatedUsers, ['user-2']);
  assert.equal(update[2].riskScore, 100);
  assert.equal(update[2].riskLevel, 'critical');
  assert.equal(update[2].status, 'frozen');
  assert.equal(update[2].freezeStatus, 'frozen');
  assert.equal(update[2].groupId, 'group-1');
  assert.equal(update[2].notes, 'old note\n[2026-05-25T12:00:00.000Z] system_restored_pending_multi_account_case');
  assert.equal(update[2].meta.source, 'multi_account');
  assert.equal(update[2].meta.repairedFromFrozenGroup, true);
  assert.equal(update[2].meta.eventType, 'login');
  assert.deepEqual(update[2].meta.ipIntel, { isVpn: true });
  assert.equal(update[2].signals.includes('email_normalized_collision'), true);
  assert.equal(update[2].signals.includes('multi_account_cluster:2'), true);

  const create = written.find((row) => row[0] === 'create');
  assert.equal(create[1].user, 'user-2');
  assert.deepEqual(create[1].relatedUsers, ['user-1']);
  assert.equal(create[1].meta.source, 'multi_account');
  assert.equal(create[1].meta.action, 'freeze');
});

test('multi-account risk case repair skips already synchronized cases', async () => {
  const written = [];
  const repair = createRiskCaseRepair({
    now: () => new Date('2026-05-25T12:00:00.000Z'),
    getSupabaseClient: () => createSupabase([
      frozenUser('user-1', 'group-1'),
      frozenUser('user-2', 'group-1'),
    ], []),
    listModelRiskCases: async () => [
      {
        _id: 'case-1',
        user: 'user-1',
        relatedUsers: ['user-2'],
        groupId: 'group-1',
        status: 'frozen',
        freezeStatus: 'frozen',
        signals: ['multi_account_cluster:2'],
        evidence: [],
        meta: { source: 'multi_account' },
      },
      {
        _id: 'case-2',
        user: 'user-2',
        relatedUsers: ['user-1'],
        groupId: 'group-1',
        status: 'frozen',
        freezeStatus: 'frozen',
        signals: ['multi_account_cluster:2'],
        evidence: [],
        meta: { source: 'multi_account' },
      },
    ],
    updateRiskCaseById: async (id, data) => {
      written.push(['update', id, data]);
      return { _id: id, ...data };
    },
    createRiskCase: async (data) => {
      written.push(['create', data]);
      return { _id: 'created-case', ...data };
    },
  }).repairPendingMultiAccountRiskCases;

  assert.deepEqual(await repair(), {
    groupsFound: 1,
    createdCases: 0,
    updatedCases: 0,
    restoredCases: 0,
  });
  assert.deepEqual(written, []);
});
