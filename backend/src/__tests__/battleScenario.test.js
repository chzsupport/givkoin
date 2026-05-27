const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBattleScenario,
  computeBattleForceTotals,
  getBattleScenario,
} = require('../services/battle/battleScenario');

test('battle scenario is deterministic for the same battle input', () => {
  const battle = {
    _id: 'battle_test_scenario',
    startsAt: '2026-01-01T00:00:00.000Z',
    durationSeconds: 120,
  };

  const first = buildBattleScenario(battle);
  const second = buildBattleScenario(battle);

  assert.deepEqual(second, first);
  assert.equal(first.version, 3);
  assert.equal(first.durationSeconds, 120);
  assert.ok(Array.isArray(first.weakZones));
  assert.ok(Array.isArray(first.voiceCommands));
  assert.ok(Array.isArray(first.sparks));
  assert.ok(Array.isArray(first.baddieWaves));
});

test('battle scenario returns stored scenario without rebuilding it', () => {
  const stored = {
    version: 99,
    durationSeconds: 10,
    weakZones: [{ id: 'stored_weak_zone' }],
  };

  assert.equal(getBattleScenario({ scenario: stored }), stored);
});

test('battle force totals keep tick math stable', () => {
  const totals = computeBattleForceTotals({
    startsAt: '2026-01-01T00:00:00.000Z',
    endsAt: '2026-01-01T00:00:10.000Z',
    activeUsersCountSnapshot: 2,
  }, { baddieDamage: 7 });

  assert.deepEqual(totals, {
    guardianDamage: 1000,
    darknessBaseDamage: 1000,
    darknessDamageFromBaddies: 7,
  });
});
