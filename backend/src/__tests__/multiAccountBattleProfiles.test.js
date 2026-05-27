const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBattleProfiles,
  overlapDurationMs,
} = require('../services/multiAccount/battleProfiles');

test('multi-account battle profiles calculate session overlap in milliseconds', () => {
  assert.equal(
    overlapDurationMs(
      '2026-05-25T10:00:00.000Z',
      '2026-05-25T10:20:00.000Z',
      '2026-05-25T10:05:00.000Z',
      '2026-05-25T10:30:00.000Z'
    ),
    15 * 60 * 1000
  );
  assert.equal(
    overlapDurationMs(
      '2026-05-25T10:00:00.000Z',
      '2026-05-25T10:05:00.000Z',
      '2026-05-25T10:06:00.000Z',
      '2026-05-25T10:30:00.000Z'
    ),
    0
  );
});

test('multi-account battle profiles aggregate telemetry per user', () => {
  const profiles = buildBattleProfiles([
    {
      userId: 'user-1',
      battleId: 'battle-1',
      happenedAt: '2026-05-25T10:00:00.000Z',
      automationTelemetry: {
        shotTelemetryCount: 10,
        intervalCount: 2,
        intervalSumMs: 200,
        intervalSqSumMs: 20000,
        staticCursorShots: 3,
        hiddenTabShotCount: 1,
        cursorDistancePxTotal: 42.1234,
        screenMinNx: 0.1,
        screenMaxNx: 0.7,
        screenMinNy: 0.2,
        screenMaxNy: 0.9,
      },
    },
    {
      userId: 'user-1',
      battleId: 'battle-2',
      happenedAt: '2026-05-25T10:05:00.000Z',
      automationTelemetry: {
        shotTelemetryCount: 5,
        intervalCount: 1,
        intervalSumMs: 100,
        intervalSqSumMs: 10000,
        staticCursorShots: 2,
        hiddenTabShotCount: 4,
        cursorDistancePxTotal: 7,
        screenMinNx: 0.05,
        screenMaxNx: 0.8,
        screenMinNy: 0.1,
        screenMaxNy: 0.95,
      },
    },
    {
      userId: 'user-2',
      battleId: 'battle-1',
      happenedAt: '2026-05-25T09:00:00.000Z',
      automationTelemetry: null,
    },
    {
      userId: '',
      battleId: 'ignored',
      automationTelemetry: { shotTelemetryCount: 99 },
    },
  ]);

  const userOne = profiles.get('user-1');
  assert.equal(userOne.shots, 15);
  assert.equal(userOne.intervalCount, 3);
  assert.equal(userOne.intervalSumMs, 300);
  assert.equal(userOne.intervalSqSumMs, 30000);
  assert.equal(userOne.staticCursorShots, 5);
  assert.equal(userOne.hiddenTabShotCount, 5);
  assert.equal(userOne.staticRatio, 0.33333);
  assert.equal(userOne.hiddenRatio, 0.33333);
  assert.equal(userOne.avgCursorDistancePx, 3.275);
  assert.equal(userOne.screenWidth, 0.75);
  assert.equal(userOne.screenHeight, 0.85);
  assert.deepEqual(userOne.battleIds, ['battle-1', 'battle-2']);
  assert.equal(userOne.latestAt, '2026-05-25T10:05:00.000Z');

  const userTwo = profiles.get('user-2');
  assert.equal(userTwo.shots, 0);
  assert.equal(userTwo.staticRatio, 0);
  assert.equal(userTwo.hiddenRatio, 0);
  assert.equal(userTwo.intervalCv, 0);
  assert.deepEqual(userTwo.battleIds, ['battle-1']);
  assert.equal(profiles.has(''), false);
});
