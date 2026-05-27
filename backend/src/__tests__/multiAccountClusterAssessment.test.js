const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createClusterAssessmentBuilder,
  getWindowSince,
} = require('../services/multiAccount/clusterAssessment');

test('multi-account cluster assessment skips data loading for a single valid user', async () => {
  const buildClusterAssessment = createClusterAssessmentBuilder({
    listSignalHistoryByUserIds: async () => {
      throw new Error('signal history should not be loaded');
    },
  }).buildClusterAssessment;

  const result = await buildClusterAssessment({
    clusterUsers: [{ _id: 'user-1' }],
    currentSignals: { ipIntel: { isVpn: true } },
  });

  assert.equal(result.riskScore, 0);
  assert.equal(result.status, 'watch');
  assert.equal(result.freezeStatus, 'watch');
  assert.equal(result.shouldFreeze, false);
  assert.deepEqual(result.categoryScores, {
    technical: 0,
    network: 0,
    sessions: 0,
    battle: 0,
    economy: 0,
  });
  assert.deepEqual(result.evidence, []);
  assert.deepEqual(result.rewardRollback, []);
  assert.deepEqual(result.signals, ['network_vpn']);
});

test('multi-account cluster assessment keeps group evidence and rollback payload stable', async () => {
  const calls = [];
  const fixedNow = () => new Date('2026-05-25T12:00:00.000Z');
  const signalHistory = [];
  const sessions = [
    {
      userId: 'user-1',
      sessionId: 's-1',
      startedAt: '2026-05-25T10:00:00.000Z',
      lastSeenAt: '2026-05-25T10:30:00.000Z',
    },
    {
      userId: 'user-2',
      sessionId: 's-2',
      startedAt: '2026-05-25T10:01:00.000Z',
      lastSeenAt: '2026-05-25T10:31:00.000Z',
    },
  ];
  const battleDocs = ['battle-1', 'battle-2', 'battle-3'].map((battleId, index) => ({
    _id: battleId,
    updatedAt: `2026-05-25T11:0${index}:00.000Z`,
    attendance: [
      { user: { _id: 'user-1' }, joinedAt: `2026-05-25T11:0${index}:01.000Z` },
      { user: 'user-2', joinedAt: `2026-05-25T11:0${index}:02.000Z` },
    ],
  }));
  const battleRewardRows = ['battle-1', 'battle-2', 'battle-3'].flatMap((battleId, index) => ([
    {
      id: `tx-${battleId}-user-1`,
      userId: 'user-1',
      battleId,
      amount: 12 + index,
      currency: 'K',
      occurredAt: `2026-05-25T11:1${index}:00.000Z`,
    },
    {
      id: `tx-${battleId}-user-2`,
      userId: 'user-2',
      battleId,
      amount: 14 + index,
      currency: 'K',
      occurredAt: `2026-05-25T11:1${index}:05.000Z`,
    },
  ]));
  const buildClusterAssessment = createClusterAssessmentBuilder({
    now: fixedNow,
    windowDays: 7,
    listSignalHistoryByUserIds: async (userIds, options) => {
      calls.push(['signalHistory', userIds, options]);
      return signalHistory;
    },
    listUserSessionsByUserIds: async (userIds, options) => {
      calls.push(['sessions', userIds, options]);
      return sessions;
    },
    listBattleDocsSince: async (since) => {
      calls.push(['battles', since]);
      return battleDocs;
    },
    listSolarShareActivitiesByUserIds: async (userIds, options) => {
      calls.push(['solarShares', userIds, options]);
      return [
        { userId: 'user-2', recipientId: 'user-1', amountLm: 50, createdAt: '2026-05-25T09:00:00.000Z' },
        { userId: 'helper-user', recipientId: 'user-1', amountLm: 50, createdAt: '2026-05-25T09:05:00.000Z' },
      ];
    },
    listBattleRewardTransactionsByUserIds: async (userIds, options) => {
      calls.push(['battleRewards', userIds, options]);
      return battleRewardRows;
    },
    listSignalHistoryByIps: async (ips, options) => {
      calls.push(['crowdedIps', ips, options]);
      return [];
    },
  }).buildClusterAssessment;

  const result = await buildClusterAssessment({
    primaryUser: { _id: 'user-1' },
    clusterUsers: [
      { _id: 'user-1', email: 'user1@example.com', nickname: 'User One', lastIp: '10.0.0.1' },
      { _id: 'user-2', email: 'user2@example.com', nickname: 'User Two', lastIp: '10.0.0.2' },
    ],
    assessments: [{
      user: { _id: 'user-2' },
      history: [{ createdAt: '2026-05-24T10:00:00.000Z' }],
      evidence: [{ type: 'device', value: 'device-1', count: 2 }],
    }],
    currentSignals: {
      ip: '10.0.0.3',
      deviceId: 'device-1',
    },
  });

  assert.equal(calls.find((row) => row[0] === 'sessions')[2].since.toISOString(), '2026-05-18T12:00:00.000Z');
  assert.deepEqual(calls.find((row) => row[0] === 'signalHistory').slice(1), [
    ['user-1', 'user-2'],
    { limit: 1000 },
  ]);
  assert.deepEqual(calls.find((row) => row[0] === 'crowdedIps')[1], [
    '10.0.0.3',
    '10.0.0.1',
    '10.0.0.2',
  ]);

  assert.equal(result.riskScore, 120);
  assert.equal(result.status, 'frozen');
  assert.equal(result.freezeStatus, 'frozen');
  assert.equal(result.shouldFreeze, true);
  assert.deepEqual(result.categoryScores, {
    technical: 40,
    network: 0,
    sessions: 16,
    battle: 20,
    economy: 44,
  });

  const signals = new Set(result.evidence.map((entry) => entry.signal));
  assert.equal(signals.has('shared_device_id'), true);
  assert.equal(signals.has('parallel_session_overlap'), true);
  assert.equal(signals.has('parallel_battle'), true);
  assert.equal(signals.has('economy_funneling'), true);
  assert.equal(signals.has('serial_battle_farming'), true);
  assert.equal(result.signals.includes('multi_account_cluster:2'), true);
  assert.equal(result.signals.includes('shared_device:device-1'), true);
  assert.equal(result.rewardRollback.length, 6);
  assert.equal(result.rewardRollback.some((entry) => entry.userEmail === 'user1@example.com'), true);
  assert.equal(result.rewardRollback.every((entry) => entry.status === 'pending'), true);
});

test('multi-account cluster window uses injected time', () => {
  assert.equal(
    getWindowSince({
      days: 2,
      now: () => new Date('2026-05-25T12:00:00.000Z'),
    }).toISOString(),
    '2026-05-23T12:00:00.000Z'
  );
});
