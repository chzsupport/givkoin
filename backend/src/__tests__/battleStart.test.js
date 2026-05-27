const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildStartBattleBasePatch,
  mapActiveTreeInjurySnapshots,
} = require('../services/battle/battleStart');

test('battle start base patch keeps active battle fields stable', () => {
  const { patch } = buildStartBattleBasePatch(
    'battle-start-test',
    { durationSeconds: 300, durationLocked: true },
    {
      startsAt: '2026-01-01T00:00:00.000Z',
      durationSeconds: 120,
      durationLocked: false,
      scheduleSource: 'manual',
      scheduledIntervalHours: 6,
    }
  );

  assert.equal(patch.status, 'active');
  assert.equal(patch.startsAt.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal(patch.durationSeconds, 120);
  assert.equal(patch.endsAt.toISOString(), '2026-01-01T00:02:00.000Z');
  assert.equal(patch.durationLocked, false);
  assert.equal(patch.firstPlayerJoinedAt, null);
  assert.equal(patch.globalDebuffActive, true);
  assert.equal(patch.globalDebuffPercent, 5);
  assert.equal(patch.scheduleSource, 'manual');
  assert.equal(patch.scheduledIntervalHours, 6);
  assert.equal(patch.scenario.durationSeconds, 120);
  assert.ok(Array.isArray(patch.scenario.weakZones));
});

test('battle start tree injury snapshot keeps only active injuries', () => {
  const snapshots = mapActiveTreeInjurySnapshots({
    injuries: [
      {
        branchName: 'north',
        requiredRadiance: 10,
        healedRadiance: 2,
        healedPercent: 20,
      },
      {
        branchName: 'south',
        requiredRadiance: 20,
        healedRadiance: 20,
        healedPercent: 100,
      },
    ],
  });

  assert.deepEqual(snapshots, [
    {
      branchName: 'north',
      requiredRadiance: 10,
      healedRadiance: 2,
      debuffPercent: 50,
    },
  ]);
});
