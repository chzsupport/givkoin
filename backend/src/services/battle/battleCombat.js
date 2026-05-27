const {
  BATTLE_BASE_DURATION_SECONDS,
  BATTLE_SYNC_INTERVAL_SECONDS,
  BATTLE_SYNC_SLOT_COUNT,
} = require('./battleConfig');

const WEAPON_COMBAT_RULES = Object.freeze({
  1: { damage: 6, costLumens: 10, maxHitsPerShot: 10, minShotGapMs: 16, maxAimDeviation: 85 },
  2: { damage: 500, costLumens: 100, maxHitsPerShot: 2, minShotGapMs: 3000, maxAimDeviation: 45 },
  3: { damage: 5000, costLumens: 500, maxHitsPerShot: 1, minShotGapMs: 5000, maxAimDeviation: 28 },
});

function getWeaponCombatRules(weaponId) {
  return WEAPON_COMBAT_RULES[Number(weaponId)] || null;
}

function computeBattleMaxLimits(battle) {
  const durationSeconds = Number(battle?.durationSeconds) || BATTLE_BASE_DURATION_SECONDS;
  const rules1 = getWeaponCombatRules(1);
  const rules2 = getWeaponCombatRules(2);
  const rules3 = getWeaponCombatRules(3);
  const maxShots1 = rules1 ? Math.ceil((durationSeconds * 1000) / rules1.minShotGapMs) : 0;
  const maxShots2 = rules2 ? Math.ceil((durationSeconds * 1000) / rules2.minShotGapMs) : 0;
  const maxShots3 = rules3 ? Math.ceil((durationSeconds * 1000) / rules3.minShotGapMs) : 0;
  const clickDamage = {
    weapon1: 60,
    weapon2: 1000,
    weapon3: 5000,
  };
  const maxDamage = (
    maxShots1 * clickDamage.weapon1
    + maxShots2 * clickDamage.weapon2
    + maxShots3 * clickDamage.weapon3
  ) * 1.5;
  const maxLumensSpent =
    maxShots1 * (rules1?.costLumens || 0)
    + maxShots2 * (rules2?.costLumens || 0)
    + maxShots3 * (rules3?.costLumens || 0);
  const maxCrystals = Math.ceil(durationSeconds / 35);
  return {
    maxDamage: Math.floor(maxDamage),
    maxShots: { weapon1: maxShots1, weapon2: maxShots2, weapon3: maxShots3 },
    maxLumensSpent: Math.max(0, Math.floor(maxLumensSpent)),
    maxCrystals: Math.max(0, Math.floor(maxCrystals)),
    maxLumensGained: 72000,
  };
}

function buildAttendanceSyncState(attendanceIndex) {
  const safeIndex = Math.max(0, Math.floor(Number(attendanceIndex) || 0));
  return {
    syncSlot: safeIndex % BATTLE_SYNC_SLOT_COUNT,
    syncSlotCount: BATTLE_SYNC_SLOT_COUNT,
    syncIntervalSeconds: BATTLE_SYNC_INTERVAL_SECONDS,
  };
}

module.exports = {
  buildAttendanceSyncState,
  computeBattleMaxLimits,
  getWeaponCombatRules,
};
