const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAttendanceSyncState,
  computeBattleMaxLimits,
  getWeaponCombatRules,
} = require('../services/battle/battleCombat');

test('battle attendance sync state keeps the 60-slot wraparound contract', () => {
  assert.deepEqual(buildAttendanceSyncState(0), {
    syncSlot: 0,
    syncSlotCount: 60,
    syncIntervalSeconds: 60,
  });
  assert.deepEqual(buildAttendanceSyncState(59), {
    syncSlot: 59,
    syncSlotCount: 60,
    syncIntervalSeconds: 60,
  });
  assert.deepEqual(buildAttendanceSyncState(60), {
    syncSlot: 0,
    syncSlotCount: 60,
    syncIntervalSeconds: 60,
  });
  assert.deepEqual(buildAttendanceSyncState(61), {
    syncSlot: 1,
    syncSlotCount: 60,
    syncIntervalSeconds: 60,
  });
});

test('battle combat limits stay stable for a known duration', () => {
  const limits = computeBattleMaxLimits({ durationSeconds: 60 });

  assert.deepEqual(limits.maxShots, {
    weapon1: 3750,
    weapon2: 20,
    weapon3: 12,
  });
  assert.equal(limits.maxDamage, 457500);
  assert.equal(limits.maxLumensSpent, 45500);
  assert.equal(limits.maxCrystals, 2);
  assert.equal(limits.maxLumensGained, 72000);
});

test('battle weapon rules are available only for known weapons', () => {
  assert.deepEqual(getWeaponCombatRules(1), {
    damage: 6,
    costLumens: 10,
    maxHitsPerShot: 10,
    minShotGapMs: 16,
    maxAimDeviation: 85,
  });
  assert.equal(getWeaponCombatRules(99), null);
});
