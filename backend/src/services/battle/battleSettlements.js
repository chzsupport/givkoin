const { getModelDocById } = require('./battleDocuments');
const battleRuntimeStore = require('../battleRuntimeStore');

function buildBattleSettlementFinishOptions(settlement) {
  return {
    attendance: Array.isArray(settlement.attendance) ? settlement.attendance : [],
    attendanceCount: Number(settlement.attendanceCount) || 0,
    absoluteLightDamage: Number(settlement.totalLightDamage) || 0,
    absoluteDarknessDamage: Number(settlement.totalDarknessDamage) || 0,
    endedAt: settlement.finalReportWindowClosedAt || null,
    deferSideEffects: true,
  };
}

async function processDueBattleSettlements({ now = new Date(), finishBattle } = {}) {
  const settlements = await battleRuntimeStore.listDueFinalSettlements({ nowMs: now.getTime() });
  const processed = [];

  for (const settlement of settlements) {
    const battleId = String(settlement?.battleId || '').trim();
    if (!battleId) continue;

    const battle = await getModelDocById('Battle', battleId);
    if (!battle) {
      await battleRuntimeStore.deleteFinalSettlement({ battleId }).catch(() => {});
      continue;
    }

    if (String(battle.status) === 'finished') {
      await battleRuntimeStore.deleteFinalSettlement({ battleId }).catch(() => {});
      continue;
    }

    await finishBattle(battleId, buildBattleSettlementFinishOptions(settlement));
    await battleRuntimeStore.deleteFinalSettlement({ battleId }).catch(() => {});
    processed.push(battleId);
  }

  return processed;
}

async function applyFinalSettlementNow(battleId, { finishBattle } = {}) {
  const safeBattleId = String(battleId || '').trim();
  if (!safeBattleId) return null;

  const settlement = await battleRuntimeStore.getFinalSettlement({ battleId: safeBattleId }).catch(() => null);
  if (!settlement) {
    return getModelDocById('Battle', safeBattleId);
  }

  const battle = await getModelDocById('Battle', safeBattleId);
  if (!battle) {
    await battleRuntimeStore.deleteFinalSettlement({ battleId: safeBattleId }).catch(() => {});
    return null;
  }

  if (String(battle.status) === 'finished') {
    await battleRuntimeStore.deleteFinalSettlement({ battleId: safeBattleId }).catch(() => {});
    return battle;
  }

  await finishBattle(safeBattleId, buildBattleSettlementFinishOptions(settlement));
  await battleRuntimeStore.deleteFinalSettlement({ battleId: safeBattleId }).catch(() => {});
  return getModelDocById('Battle', safeBattleId);
}

async function forceFinishBattleNow(battleId, { finishBattle, finalizeBattleWithReports } = {}) {
  const safeBattleId = String(battleId || '').trim();
  if (!safeBattleId) throw new Error('Battle not found');

  const battle = await getModelDocById('Battle', safeBattleId);
  if (!battle) throw new Error('Battle not found');

  const status = String(battle.status || '').trim();
  if (status === 'finished') return battle;
  if (status === 'settling') {
    const settled = await applyFinalSettlementNow(safeBattleId, { finishBattle });
    if (!settled) throw new Error('Battle not found');
    return settled;
  }
  if (status !== 'active') {
    throw new Error('Only active battle can be finished now');
  }

  await finalizeBattleWithReports(safeBattleId);
  const settled = await applyFinalSettlementNow(safeBattleId, { finishBattle });
  if (!settled) throw new Error('Battle not found');
  return settled;
}

module.exports = {
  applyFinalSettlementNow,
  buildBattleSettlementFinishOptions,
  forceFinishBattleNow,
  processDueBattleSettlements,
};
