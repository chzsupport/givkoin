const test = require('node:test');
const assert = require('node:assert/strict');

const {
  appendBattleEvidence,
} = require('../services/multiAccount/battleEvidence');
const {
  DETAIL_SCORES,
} = require('../services/multiAccount/evidenceScoring');

test('multi-account battle evidence detects suspicious battle pattern and parallel battle', () => {
  const evidence = [];

  const result = appendBattleEvidence(evidence, {
    userIds: ['user-1', 'user-2'],
    parallelSessionRows: [{ userIds: ['user-1', 'user-2'] }],
    battleDocs: [{
      _id: 'battle-1',
      attendance: [
        {
          user: 'user-1',
          joinedAt: '2026-05-24T10:00:00.000Z',
          automationTelemetry: {
            shotTelemetryCount: 120,
            staticCursorShots: 90,
            intervalCount: 10,
            intervalSumMs: 1000,
            intervalSqSumMs: 100000,
          },
        },
        {
          user: 'user-2',
          joinedAt: '2026-05-24T10:01:00.000Z',
          automationTelemetry: {
            shotTelemetryCount: 20,
          },
        },
      ],
    }],
  });

  assert.deepEqual(result.parallelBattleDetails, [{
    battleId: 'battle-1',
    userIds: ['user-1', 'user-2'],
  }]);
  assert.deepEqual(evidence.map((entry) => entry.signal), [
    'battle_pattern',
    'parallel_battle',
  ]);
  assert.equal(evidence[0].score, DETAIL_SCORES.battle_pattern + 3);
  assert.equal(evidence[0].count, 1);
  assert.equal(evidence[0].lastSeenAt, '2026-05-24T10:01:00.000Z');
  assert.deepEqual(evidence[0].matchedUserIds, ['user-1']);
  assert.equal(evidence[0].details.users[0].staticRatio, 0.75);
  assert.deepEqual(evidence[0].details.users[0].battleIds, ['battle-1']);

  assert.equal(evidence[1].score, DETAIL_SCORES.parallel_battle + 2);
  assert.equal(evidence[1].count, 1);
  assert.deepEqual(evidence[1].matchedUserIds, ['user-1', 'user-2']);
  assert.deepEqual(evidence[1].details.battles, [{
    battleId: 'battle-1',
    userIds: ['user-1', 'user-2'],
  }]);
});

test('multi-account battle evidence detects close battle signatures', () => {
  const evidence = [];

  appendBattleEvidence(evidence, {
    userIds: ['user-1', 'user-2'],
    battleDocs: [{
      _id: 'battle-2',
      attendance: [
        {
          user: { _id: 'user-1' },
          joinedAt: '2026-05-24T12:00:00.000Z',
          automationTelemetry: {
            shotTelemetryCount: 120,
            staticCursorShots: 60,
            hiddenTabShotCount: 0,
            cursorDistancePxTotal: 1200,
            screenMinNx: 0.1,
            screenMaxNx: 0.8,
            screenMinNy: 0.1,
            screenMaxNy: 0.9,
          },
        },
        {
          user: { _id: 'user-2' },
          joinedAt: '2026-05-24T12:01:00.000Z',
          automationTelemetry: {
            shotTelemetryCount: 130,
            staticCursorShots: 66,
            hiddenTabShotCount: 0,
            cursorDistancePxTotal: 1300,
            screenMinNx: 0.1,
            screenMaxNx: 0.79,
            screenMinNy: 0.1,
            screenMaxNy: 0.88,
          },
        },
      ],
    }],
  });

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].signal, 'battle_signature_cluster');
  assert.equal(evidence[0].score, DETAIL_SCORES.battle_signature_cluster + 2);
  assert.equal(evidence[0].count, 1);
  assert.deepEqual(evidence[0].matchedUserIds, ['user-1', 'user-2']);
  assert.deepEqual(evidence[0].details.matches[0].battleIds, ['battle-2']);
  assert.equal(evidence[0].details.matches[0].closeMetrics >= 4, true);
});

test('multi-account battle evidence ignores battle rows outside the group', () => {
  const evidence = [];

  const result = appendBattleEvidence(evidence, {
    userIds: ['user-1'],
    battleDocs: [{
      _id: 'battle-3',
      attendance: [{
        user: 'user-2',
        automationTelemetry: {
          shotTelemetryCount: 200,
          staticCursorShots: 200,
        },
      }],
    }],
  });

  assert.deepEqual(evidence, []);
  assert.deepEqual(result.parallelBattleDetails, []);
});
