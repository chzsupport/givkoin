const { recordActivity: defaultRecordActivity } = require('../activityService');
const { awardRadianceForActivity: defaultAwardRadianceForActivity } = require('../activityRadianceService');
const {
  awardReferralBlessingExternal: defaultAwardReferralBlessingExternal,
  getBaseRewardMultiplier: defaultGetBaseRewardMultiplier,
  recordTransaction: defaultRecordTransaction,
} = require('../kService');
const { toIso: defaultToIso } = require('../documentStore');
const { applyTreeBlessingToReward: defaultApplyTreeBlessingToReward } = require('../treeBlessingService');
const { safeMs: defaultSafeMs } = require('./nightShiftRuntimeConfig');

function defaultListRuntimeSessionsByFilters(...args) {
  return require('./nightShiftRuntimeStore').listRuntimeSessionsByFilters(...args);
}

function defaultSaveRuntimeSession(...args) {
  return require('./nightShiftRuntimeStore').saveRuntimeSession(...args);
}

function defaultGetUserRowById(...args) {
  return require('./nightShiftUserState').getUserRowById(...args);
}

function defaultGetUserData(...args) {
  return require('./nightShiftUserState').getUserData(...args);
}

function defaultGetNightShiftFromUserData(...args) {
  return require('./nightShiftUserState').getNightShiftFromUserData(...args);
}

function defaultUpdateUserDataById(...args) {
  return require('./nightShiftUserState').updateUserDataById(...args);
}

function buildFinalSettlementReward(reward = {}, blessingReward = {}) {
  return {
    ...reward,
    k: blessingReward.k,
    lm: blessingReward.lumens,
    stars: Number((Number(reward.stars) || 0).toFixed(4)),
  };
}

function buildSettledNightShift(currentNightShift = {}, finalReward = {}) {
  return {
    ...currentNightShift,
    pendingSettlement: null,
    stats: {
      totalTimeMs: Number(currentNightShift.stats?.totalTimeMs) || 0,
      anomaliesCleared: Number(currentNightShift.stats?.anomaliesCleared) || 0,
      totalEarnings: {
        k: (Number(currentNightShift.stats?.totalEarnings?.k) || 0) + (Number(finalReward.k) || 0),
        lm: (Number(currentNightShift.stats?.totalEarnings?.lm) || 0) + (Number(finalReward.lm) || 0),
        stars: Number(((Number(currentNightShift.stats?.totalEarnings?.stars) || 0) + (Number(finalReward.stars) || 0)).toFixed(4)),
      },
    },
  };
}

async function settleEmptyNightShiftRow({ row, saveRuntimeSession, toIso, now }) {
  await saveRuntimeSession(row.sessionId, {
    ...row,
    settlementStatus: 'settled',
    settledAt: toIso(now),
    settlementError: null,
  }, { updatedAt: now });
}

async function recordSettlementTransactions({
  awardReferralBlessingExternal,
  finalReward,
  recordTransaction,
  row,
  userId,
  now,
}) {
  if ((Number(finalReward.k) || 0) > 0) {
    await recordTransaction({
      userId,
      type: 'night_shift',
      direction: 'credit',
      amount: Number(finalReward.k) || 0,
      currency: 'K',
      description: 'Ночная Смена: полный час',
      relatedEntity: row.sessionId,
      occurredAt: now,
    }).catch(() => null);
    awardReferralBlessingExternal({
      receiverUserId: userId,
      amount: Number(finalReward.k) || 0,
      sourceType: 'night_shift',
      relatedEntity: row.sessionId,
    }).catch(() => null);
  }

  if ((Number(finalReward.stars) || 0) > 0) {
    await recordTransaction({
      userId,
      type: 'night_shift',
      direction: 'credit',
      amount: Number(finalReward.stars) || 0,
      currency: 'STAR',
      description: 'Ночная Смена: полный час',
      relatedEntity: row.sessionId,
      occurredAt: now,
    }).catch(() => null);
  }
}

async function recordSettlementRadiance({
  acceptedAnomalies,
  awardRadianceForActivity,
  durationMinutes,
  payableHours,
  row,
  userId,
}) {
  if (acceptedAnomalies > 0) {
    await awardRadianceForActivity({
      userId,
      activityType: 'night_shift_anomaly',
      units: acceptedAnomalies,
      meta: { sessionId: row.sessionId, acceptedAnomalies },
      dedupeKey: `night_shift_anomaly:${String(userId)}:${String(row.sessionId)}`,
    });
  }

  if (payableHours > 0) {
    await awardRadianceForActivity({
      userId,
      activityType: 'night_shift_hour',
      units: payableHours,
      meta: { sessionId: row.sessionId, payableHours, durationMinutes },
      dedupeKey: `night_shift_hour:${String(userId)}:${String(row.sessionId)}`,
    });
  }
}

function createNightShiftSettlements({
  applyTreeBlessingToReward = defaultApplyTreeBlessingToReward,
  awardRadianceForActivity = defaultAwardRadianceForActivity,
  awardReferralBlessingExternal = defaultAwardReferralBlessingExternal,
  getBaseRewardMultiplier = defaultGetBaseRewardMultiplier,
  getNightShiftFromUserData = defaultGetNightShiftFromUserData,
  getUserData = defaultGetUserData,
  getUserRowById = defaultGetUserRowById,
  listRuntimeSessionsByFilters = defaultListRuntimeSessionsByFilters,
  recordActivity = defaultRecordActivity,
  recordTransaction = defaultRecordTransaction,
  safeMs = defaultSafeMs,
  saveRuntimeSession = defaultSaveRuntimeSession,
  toIso = defaultToIso,
  updateUserDataById = defaultUpdateUserDataById,
} = {}) {
  async function processDueNightShiftSettlements({ now = new Date() } = {}) {
    const rows = await listRuntimeSessionsByFilters({ settlementStatus: 'queued' });
    const nowMs = now.getTime();
    const results = [];

    for (const row of rows) {
      try {
        if (row.settlementStatus !== 'queued') continue;
        const dueAtMs = safeMs(row.settlementDueAt);
        if (dueAtMs == null || nowMs < dueAtMs) continue;

        const reward = row.reward || { k: 0, lm: 0, stars: 0 };
        const payableHours = Math.max(0, Math.floor(Number(row.payableHours) || 0));
        if (payableHours <= 0) {
          await settleEmptyNightShiftRow({ row, saveRuntimeSession, toIso, now });
          continue;
        }

        const userRow = await getUserRowById(row.userId);
        if (!userRow) {
          throw new Error('night_shift_settlement_user_not_found');
        }
        const userData = getUserData(userRow);
        const baseMultiplier = await getBaseRewardMultiplier(userRow.id);
        const blessingReward = await applyTreeBlessingToReward({
          userId: userRow.id,
          k: reward.k,
          lumens: reward.lm,
          now,
          baseMultiplier,
        });
        const finalReward = buildFinalSettlementReward(reward, blessingReward);
        const currentNightShift = getNightShiftFromUserData(userData);
        const nextNightShift = buildSettledNightShift(currentNightShift, finalReward);

        await updateUserDataById(userRow.id, {
          k: (Number(userData.k) || 0) + (Number(finalReward.k) || 0),
          lumens: (Number(userData.lumens) || 0) + (Number(finalReward.lm) || 0),
          stars: Number(((Number(userData.stars) || 0) + (Number(finalReward.stars) || 0)).toFixed(4)),
          nightShift: nextNightShift,
        });

        await recordSettlementTransactions({
          awardReferralBlessingExternal,
          finalReward,
          recordTransaction,
          row,
          userId: userRow.id,
          now,
        });

        const durationMinutes = payableHours * 60;
        const acceptedAnomalies = Math.max(0, Math.floor(Number(row.totalAcceptedAnomalies) || 0));
        await recordSettlementRadiance({
          acceptedAnomalies,
          awardRadianceForActivity,
          durationMinutes,
          payableHours,
          row,
          userId: userRow.id,
        });

        await recordActivity({
          userId: userRow.id,
          type: 'night_shift',
          minutes: durationMinutes,
          meta: {
            reward: finalReward,
            payableHours,
            anomaliesCleared: acceptedAnomalies,
            sessionId: row.sessionId,
          },
        }).catch(() => {});

        await saveRuntimeSession(row.sessionId, {
          ...row,
          settlementStatus: 'settled',
          settledAt: toIso(now),
          settlementError: null,
        }, { updatedAt: now });

        results.push({
          userId: String(userRow.id),
          nickname: userRow.nickname || '',
          sessionId: row.sessionId,
          reward: finalReward,
          payableHours,
        });
      } catch (error) {
        await saveRuntimeSession(row.sessionId, {
          ...row,
          settlementStatus: 'error',
          settlementError: String(error?.message || error || 'unknown_settlement_error'),
        }, { updatedAt: now }).catch(() => {});
      }
    }

    return results;
  }

  return {
    processDueNightShiftSettlements,
  };
}

const defaultSettlements = createNightShiftSettlements();

module.exports = {
  buildFinalSettlementReward,
  buildSettledNightShift,
  createNightShiftSettlements,
  processDueNightShiftSettlements: defaultSettlements.processDueNightShiftSettlements,
};
