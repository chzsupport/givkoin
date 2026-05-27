const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRiskSignals,
  createRiskCaseUpsert,
} = require('../services/multiAccount/riskCaseUpsert');

test('multi-account risk case upsert updates existing case without changing payload shape', async () => {
  const calls = [];
  const upsert = createRiskCaseUpsert({
    now: () => new Date('2026-05-25T10:00:00.000Z'),
    getRiskCaseByUserId: async (userId, options) => {
      calls.push(['get', userId, options]);
      if (userId !== 'user-1') return null;
      return {
        _id: 'case-1',
        notes: 'old note',
        groupId: 'old-group',
        meta: { kept: true },
      };
    },
    updateRiskCaseById: async (id, data) => {
      calls.push(['update', id, data]);
      return { _id: id, ...data };
    },
    createRiskCase: async (data) => {
      calls.push(['create', data]);
      return { _id: 'created-case', ...data };
    },
  }).upsertRiskCasesForAssessment;

  const result = await upsert({
    clusterUsers: [{ _id: 'user-1' }, { _id: 'user-2' }],
    clusterAssessment: {
      riskScore: 72,
      status: 'high_risk',
      evidence: [{ signal: 'shared_device_id', category: 'technical', score: 40 }],
      riskScoreDetailed: [{ signal: 'shared_device_id' }],
      categoryScores: { technical: 40 },
      rewardRollback: [{ transactionId: 'tx-1' }],
    },
    currentSignals: {
      ip: '10.0.0.1',
      deviceId: 'device-1',
      fingerprint: 'finger-1',
      weakFingerprint: 'weak-1',
      profileKey: 'profile-1',
      ipIntel: { isVpn: true },
    },
    groupId: 'group-new',
    note: 'review needed',
    eventType: 'login',
    action: 'review',
  });

  assert.equal(result.length, 2);
  const updateCall = calls.find((row) => row[0] === 'update');
  assert.equal(updateCall[1], 'case-1');
  assert.deepEqual(updateCall[2].relatedUsers, ['user-2']);
  assert.equal(updateCall[2].riskScore, 72);
  assert.equal(updateCall[2].riskLevel, 'high');
  assert.equal(updateCall[2].status, 'high_risk');
  assert.equal(updateCall[2].freezeStatus, 'high_risk');
  assert.equal(updateCall[2].notes, 'old note\n[2026-05-25T10:00:00.000Z] review needed');
  assert.deepEqual(updateCall[2].categoryScores, { technical: 40 });
  assert.deepEqual(updateCall[2].rewardRollback, [{ transactionId: 'tx-1' }]);
  assert.equal(updateCall[2].meta.kept, true);
  assert.equal(updateCall[2].meta.source, 'multi_account');
  assert.equal(updateCall[2].meta.eventType, 'login');
  assert.equal(updateCall[2].meta.action, 'review');
  assert.equal(updateCall[2].meta.groupId, 'group-new');
  assert.deepEqual(updateCall[2].meta.ipIntel, { isVpn: true });
  assert.equal(updateCall[2].signals.includes('multi_account_cluster:2'), true);
  assert.equal(updateCall[2].signals.includes('shared_device_id'), true);
  assert.equal(updateCall[2].signals.includes('shared_device:device-1'), true);

  const createCall = calls.find((row) => row[0] === 'create');
  assert.deepEqual(createCall[1].relatedUsers, ['user-1']);
  assert.equal(createCall[1].groupId, 'group-new');
  assert.deepEqual(calls.filter((row) => row[0] === 'get').map((row) => row[2]), [
    { source: 'multi_account' },
    { source: 'multi_account' },
  ]);
});

test('multi-account risk case upsert creates frozen fallback for missing assessment', async () => {
  const calls = [];
  const upsert = createRiskCaseUpsert({
    now: () => new Date('2026-05-25T11:00:00.000Z'),
    getRiskCaseByUserId: async () => null,
    updateRiskCaseById: async () => null,
    createRiskCase: async (data) => {
      calls.push(data);
      return data;
    },
  }).upsertRiskCasesForAssessment;

  const result = await upsert({
    clusterUsers: [{ _id: 'user-1' }, { _id: 'user-2' }],
    frozen: true,
    groupId: 'freeze-group',
    currentSignals: { ip: '10.0.0.1' },
  });

  assert.equal(result.length, 2);
  assert.equal(calls[0].riskScore, 100);
  assert.equal(calls[0].riskLevel, 'critical');
  assert.equal(calls[0].status, 'frozen');
  assert.equal(calls[0].freezeStatus, 'frozen');
  assert.equal(calls[0].confidence, 'high');
  assert.equal(calls[0].meta.source, 'multi_account');
});

test('multi-account risk signals keep explicit stored signals when present', () => {
  assert.deepEqual(
    buildRiskSignals(
      { deviceId: 'device-1' },
      { signals: [' shared_device_id ', 'shared_device_id', 'manual_flag'] },
      2
    ),
    ['shared_device_id', 'manual_flag']
  );
});
