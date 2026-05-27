const { sendBattleResultEmail } = require('../emailService');
const { awardBattleK } = require('../kService');
const { computeBattleRewardK } = require('../../utils/battleReward');
const {
  randBetween,
  retryBattleSideEffect,
  sleep,
} = require('./battleAsync');
const {
  getUserData,
  updateUserDataById,
} = require('./battleUsers');
const {
  BATTLE_FINAL_DEFER_MAX_MS,
  BATTLE_FINAL_DEFER_MIN_MS,
  BATTLE_FINAL_SIDE_EFFECT_BATCH_SIZE,
} = require('./battleConfig');

function getBattleResultKey(savedBattle) {
  if (savedBattle.lightDamage === savedBattle.darknessDamage) return 'draw';
  return savedBattle.lightDamage > savedBattle.darknessDamage ? 'light' : 'dark';
}

function computeBattleFinalSideEffectDelay({ attendanceCount = 0, spreadMs = 0, batchSize = BATTLE_FINAL_SIDE_EFFECT_BATCH_SIZE } = {}) {
  const safeBatchSize = Math.max(1, Math.floor(Number(batchSize) || 1));
  const safeAttendanceCount = Math.max(0, Math.floor(Number(attendanceCount) || 0));
  const batches = Math.max(1, Math.ceil(safeAttendanceCount / safeBatchSize));
  return Math.max(0, Math.floor((Number(spreadMs) || 0) / batches));
}

async function runBattleFinalSideEffects({
  battleId,
  battle,
  saved,
  finalAttendance,
  attendanceUsersById,
  delayPerBatchMs = 0,
}) {
  try {
    const batchSize = BATTLE_FINAL_SIDE_EFFECT_BATCH_SIZE;
    for (let offset = 0; offset < finalAttendance.length; offset += batchSize) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(finalAttendance.slice(offset, offset + batchSize).map(async (row) => {
        const userId = row?.user;
        if (!userId) return;
        const amount = computeBattleRewardK({
          damage: Number(row?.damage) || 0,
        });
        const kUpdatedRow = await retryBattleSideEffect(() => awardBattleK({
          userId,
          amount,
          relatedEntity: battle._id,
          description: null,
          skipDebuff: true,
          skipBlessing: true,
          skipMood: true,
          skipReferral: true,
          skipExistingCheck: true,
        }), { attempts: 6, delayMs: 300 }).catch((error) => {
          // eslint-disable-next-line no-console
          console.error('finishBattle: awardBattleK failed', { battleId, userId, error });
          return null;
        });

        const userData = getUserData(kUpdatedRow);
        const startLumens = row?.lumensAtBattleStart == null
          ? Math.max(0, Number(userData?.lumens) || 0)
          : Math.max(0, Math.floor(Number(row.lumensAtBattleStart) || 0));
        const nextLumens = Math.max(
          0,
          startLumens
            + Math.max(0, Math.floor(Number(row?.lumensGainedTotal) || 0))
            - Math.max(0, Math.floor(Number(row?.lumensSpentTotal) || 0)),
        );

        if (Math.max(0, Math.floor(Number(userData?.lumens) || 0)) !== nextLumens) {
          await retryBattleSideEffect(() => updateUserDataById(
            userId,
            { lumens: nextLumens },
            { userRow: kUpdatedRow || null },
          ), { attempts: 6, delayMs: 300 }).catch((error) => {
            // eslint-disable-next-line no-console
            console.error('finishBattle: update battle lumens failed', { battleId, userId, error });
          });
        }
      }));
      if (delayPerBatchMs > 0) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(delayPerBatchMs);
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('finishBattle: final K award failed', e);
  }

  if ((saved.attendance || []).length) {
    try {
      const result = getBattleResultKey(saved);
      const users = Array.from(attendanceUsersById.values()).filter((user) => user?.email);
      const batchSize = BATTLE_FINAL_SIDE_EFFECT_BATCH_SIZE;
      for (let offset = 0; offset < users.length; offset += batchSize) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(users.slice(offset, offset + batchSize).map((u) =>
          sendBattleResultEmail(u.email, u.nickname, {
            result,
            damageLight: saved.lightDamage,
            damageDark: saved.darknessDamage,
            startedAt: saved.startsAt,
            endedAt: saved.endsAt,
          }, (u?.language || u?.data?.language || 'ru') === 'en' ? 'en' : 'ru').catch(() => { })
        ));
        if (delayPerBatchMs > 0) {
          // eslint-disable-next-line no-await-in-loop
          await sleep(delayPerBatchMs);
        }
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('sendBattleResultEmail error', e);
    }
  }
}

async function dispatchBattleFinalSideEffects({
  deferSideEffects = false,
  battleId,
  battle,
  saved,
  finalAttendance,
  attendanceUsersById,
}) {
  if (deferSideEffects) {
    const startDelayMs = Math.floor(randBetween(BATTLE_FINAL_DEFER_MIN_MS, BATTLE_FINAL_DEFER_MAX_MS));
    const spreadMs = Math.floor(randBetween(BATTLE_FINAL_DEFER_MIN_MS, BATTLE_FINAL_DEFER_MAX_MS));
    setTimeout(async () => {
      const perBatchDelay = computeBattleFinalSideEffectDelay({
        attendanceCount: finalAttendance.length,
        spreadMs,
        batchSize: BATTLE_FINAL_SIDE_EFFECT_BATCH_SIZE,
      });
      await runBattleFinalSideEffects({
        battleId,
        battle,
        saved,
        finalAttendance,
        attendanceUsersById,
        delayPerBatchMs: perBatchDelay,
      }).catch(() => {});
    }, startDelayMs);
  } else {
    await runBattleFinalSideEffects({
      battleId,
      battle,
      saved,
      finalAttendance,
      attendanceUsersById,
      delayPerBatchMs: 0,
    });
  }
}

module.exports = {
  computeBattleFinalSideEffectDelay,
  dispatchBattleFinalSideEffects,
  getBattleResultKey,
  runBattleFinalSideEffects,
};
