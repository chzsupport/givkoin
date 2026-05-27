const test = require('node:test');
const assert = require('node:assert/strict');

const {
  appendEconomyEvidence,
} = require('../services/multiAccount/economyEvidence');
const {
  DETAIL_SCORES,
} = require('../services/multiAccount/evidenceScoring');

test('multi-account economy evidence detects lumens funneling into one account', () => {
  const evidence = [];

  appendEconomyEvidence(evidence, {
    userIds: ['recipient-1'],
    solarShareRows: [
      {
        userId: 'sender-1',
        recipientId: 'recipient-1',
        amountLm: 50.1234,
        createdAt: '2026-05-24T10:00:00.000Z',
      },
      {
        userId: 'sender-2',
        recipientId: 'recipient-1',
        amountLm: 50,
        createdAt: '2026-05-24T11:00:00.000Z',
      },
    ],
  });

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].signal, 'economy_funneling');
  assert.equal(evidence[0].category, 'economy');
  assert.equal(evidence[0].score, DETAIL_SCORES.economy_funneling + 3);
  assert.equal(evidence[0].count, 1);
  assert.equal(evidence[0].firstSeenAt, '2026-05-24T10:00:00.000Z');
  assert.equal(evidence[0].lastSeenAt, '2026-05-24T11:00:00.000Z');
  assert.deepEqual(evidence[0].matchedUserIds, ['recipient-1']);
  assert.deepEqual(evidence[0].details.targets, [{
    recipientId: 'recipient-1',
    totalLm: 100.123,
    senderCount: 2,
    transfers: 2,
    latestAt: '2026-05-24T11:00:00.000Z',
  }]);
});

test('multi-account economy evidence detects repeated battle reward farming with battle context', () => {
  const evidence = [];

  appendEconomyEvidence(evidence, {
    parallelBattleDetails: [{ battleId: 'battle-1', userIds: ['user-1', 'user-2'] }],
    battleRewardRows: [
      { battleId: 'battle-1', userId: 'user-1' },
      { battleId: 'battle-1', userId: 'user-2' },
      { battleId: 'battle-2', userId: 'user-1' },
      { battleId: 'battle-2', userId: 'user-2' },
      { battleId: 'battle-3', userId: 'user-1' },
      { battleId: 'battle-3', userId: 'user-2' },
    ],
  });

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].signal, 'serial_battle_farming');
  assert.equal(evidence[0].category, 'economy');
  assert.equal(evidence[0].score, DETAIL_SCORES.serial_battle_farming + 3);
  assert.equal(evidence[0].count, 3);
  assert.deepEqual(evidence[0].matchedUserIds, ['user-1', 'user-2']);
  assert.deepEqual(evidence[0].details.battles, [
    { battleId: 'battle-1', userIds: ['user-1', 'user-2'] },
    { battleId: 'battle-2', userIds: ['user-1', 'user-2'] },
    { battleId: 'battle-3', userIds: ['user-1', 'user-2'] },
  ]);
});

test('multi-account economy evidence does not flag serial battle farming without battle or session context', () => {
  const evidence = [];

  appendEconomyEvidence(evidence, {
    battleRewardRows: [
      { battleId: 'battle-1', userId: 'user-1' },
      { battleId: 'battle-1', userId: 'user-2' },
      { battleId: 'battle-2', userId: 'user-1' },
      { battleId: 'battle-2', userId: 'user-2' },
      { battleId: 'battle-3', userId: 'user-1' },
      { battleId: 'battle-3', userId: 'user-2' },
    ],
  });

  assert.deepEqual(evidence, []);
});
