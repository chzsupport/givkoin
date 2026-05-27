const { getModelDocById, updateModelDoc } = require('./battleDocuments');
const { getActiveUsersCountSnapshot } = require('./battleUsers');

async function recordDamage(battleId, { lightDamageDelta = 0, darknessDamageDelta = 0 } = {}) {
  const safeLightDamageDelta = Number(lightDamageDelta) || 0;
  const safeDarknessDamageDelta = Number(darknessDamageDelta) || 0;
  if (!safeLightDamageDelta && !safeDarknessDamageDelta) {
    return;
  }

  const battle = await getModelDocById('Battle', battleId);
  if (!battle) throw new Error('Battle not found');
  const saved = await updateModelDoc('Battle', battleId, {
    lightDamage: (Number(battle.lightDamage) || 0) + safeLightDamageDelta,
    darknessDamage: (Number(battle.darknessDamage) || 0) + safeDarknessDamageDelta,
  });
  if (!saved) throw new Error('Battle not found');
}

async function incrementAttendance(battleId, delta = 1) {
  const battle = await getModelDocById('Battle', battleId);
  if (!battle) throw new Error('Battle not found');
  const saved = await updateModelDoc('Battle', battleId, {
    attendanceCount: (Number(battle.attendanceCount) || 0) + (Number(delta) || 0),
  });
  if (!saved) throw new Error('Battle not found');
  return saved;
}

async function processActiveBattleTick(battle) {
  const battleId = battle?._id;
  if (!battleId) return;
  let activeUsersCount = Math.max(0, Number(battle.activeUsersCountSnapshot) || 0);

  if (activeUsersCount <= 0) {
    try {
      activeUsersCount = Math.max(0, Number(await getActiveUsersCountSnapshot()) || 0);
      if (activeUsersCount > 0) {
        await updateModelDoc('Battle', battleId, {
          activeUsersCountSnapshot: activeUsersCount,
        });
      }
    } catch (e) {
      // ignore snapshot failures to keep battle tick light
    }
  }

  if (activeUsersCount <= 0) return;
}

module.exports = {
  incrementAttendance,
  processActiveBattleTick,
  recordDamage,
};
