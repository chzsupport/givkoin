const {
  getModelDocById,
  updateModelDoc,
} = require('./battle/battleDocuments');
const {
  incrementAttendance,
  processActiveBattleTick,
  recordDamage,
} = require('./battle/battleDamage');
const {
  applyVoiceResolutionsForUser,
  buildVoiceResolutionUpdate,
  ensureAttendanceInitForUser,
  ensureAttendanceSyncState,
  markVoiceShotDetected,
} = require('./battle/battleAttendanceState');
const {
  computeBattleMaxLimits,
} = require('./battle/battleCombat');
const {
  clearAllBattleAttendanceCounters,
  clearBattleAttendanceCounter,
  flushBattleAttendanceCounter: flushBattleAttendanceCounterCore,
  scheduleBattleAttendanceCounterFlush: scheduleBattleAttendanceCounterFlushCore,
} = require('./battle/battleAttendanceCounter');
const { registerBattleAttendance } = require('./battle/battleAttendanceJoin');
const {
  buildAttendanceTimingUpdate,
} = require('./battle/battleTiming');
const { buildFinishedBattleSummary } = require('./battle/battleFinishedSummary');
const { dispatchBattleFinalSideEffects } = require('./battle/battleFinalSideEffects');
const { applyBattleInjuryIfNeeded } = require('./battle/battleInjuries');
const {
  listScheduledBattles,
  resolveBattleByPointer,
} = require('./battle/battleLookup');
const {
  getActiveUsersCountSnapshot,
} = require('./battle/battleUsers');
const {
  getBattleScenario,
  getVoiceCommandState,
  getWeakZoneState,
} = require('./battle/battleScenario');
const {
  buildFinalizedAttendanceFromReports,
  computeFinalizedBattleDamageTotals,
} = require('./battle/battleFinalization');
const {
  applyFinalSettlementNow: applyFinalSettlementNowCore,
  forceFinishBattleNow: forceFinishBattleNowCore,
  processDueBattleSettlements: processDueBattleSettlementsCore,
} = require('./battle/battleSettlements');
const {
  scheduleBattle,
  updateScheduledBattle,
} = require('./battle/battleSchedule');
const {
  acquireBattleEarlyFinalizeLock,
  clearAllBattleFinalizeSchedules,
  clearBattleEarlyFinalizeLocks,
  clearBattleFinalizeSchedule,
  releaseBattleEarlyFinalizeLock,
  scheduleBattleFinalize: scheduleBattleFinalizeTimer,
  shouldFinalizeBattleNow,
} = require('./battle/battleFinalizeScheduler');
const { buildStartBattlePatch } = require('./battle/battleStart');
const { notifyBattleStart } = require('./battle/battleNotifications');
const battleRuntimeStore = require('./battleRuntimeStore');
const { prepareBattleSummaries } = require('./battleSummaryService');
const {
  TICK_SECONDS,
  DARKNESS_DAMAGE_PER_TARGET_USER,
  GUARDIAN_DAMAGE_BEFORE_FIRST_JOIN,
  GUARDIAN_DAMAGE_AFTER_FIRST_JOIN,
  BATTLE_BASE_DURATION_SECONDS,
  BATTLE_MIN_DURATION_SECONDS,
  BATTLE_NO_ENTRY_DURATION_SECONDS,
  BATTLE_FINAL_REPORT_ACCEPT_SECONDS,
  BATTLE_FINAL_WINDOW_SECONDS,
  BATTLE_FINISHED_ATTENDANCE_INLINE_LIMIT,
  getBattlePolicy,
  getBattleSyncConfig,
  getBattleFinalWindowConfig,
} = require('./battle/battleConfig');

const CURRENT_BATTLE_POINTER_KIND = 'current';
const UPCOMING_BATTLE_POINTER_KIND = 'upcoming';

function clearBattleTransientState(battleId, { keepRuntime = false } = {}) {
  const safeBattleId = String(battleId || '').trim();
  if (!safeBattleId) return;
  clearBattleFinalizeSchedule(safeBattleId);
  releaseBattleEarlyFinalizeLock(safeBattleId);
  clearBattleAttendanceCounter(safeBattleId);
  if (!keepRuntime) {
    battleRuntimeStore.clearBattleRuntimeCache(safeBattleId);
  }
}

function clearAllBattleTransientState() {
  clearAllBattleFinalizeSchedules();
  clearBattleEarlyFinalizeLocks();
  clearAllBattleAttendanceCounters();
}

async function getBattleById(battleId) {
  return getModelDocById('Battle', battleId);
}

function scheduleBattleFinalize(battleLike) {
  return scheduleBattleFinalizeTimer(battleLike, { tryFinalizeBattleIfReady });
}

async function flushBattleAttendanceCounter(battleId) {
  return flushBattleAttendanceCounterCore(battleId, { scheduleBattleFinalize });
}

function scheduleBattleAttendanceCounterFlush(battleId, delayMs = 750) {
  scheduleBattleAttendanceCounterFlushCore(battleId, {
    delayMs,
    scheduleBattleFinalize,
  });
}

async function refreshBattleFinalizeSchedule(battleId) {
  const safeBattleId = String(battleId || '').trim();
  if (!safeBattleId) return null;
  const battle = await getModelDocById('Battle', safeBattleId);
  if (!battle) {
    clearBattleFinalizeSchedule(safeBattleId);
    return null;
  }
  scheduleBattleFinalize(battle);
  return battle;
}

async function recoverActiveBattleRuntime() {
  const battle = await getCurrentBattle().catch(() => null);
  if (!battle || String(battle.status || '') !== 'active') {
    return { recovered: false, battleId: null, attendancePrimed: 0 };
  }

  await battleRuntimeStore.setBattlePointer(CURRENT_BATTLE_POINTER_KIND, battle._id).catch(() => {});
  scheduleBattleFinalize(battle);

  const runtimeAttendance = await battleRuntimeStore
    .listAttendanceStatesByBattle({ battleId: battle._id, limit: 50000 })
    .catch(() => []);

  let attendancePrimed = Array.isArray(runtimeAttendance) ? runtimeAttendance.length : 0;
  if (Array.isArray(battle.attendance) && battle.attendance.length) {
    for (const row of battle.attendance) {
      const userId = String(row?.user || '').trim();
      if (!userId) continue;
      battleRuntimeStore.primeAttendanceStateCache({
        battleId: battle._id,
        userId,
        state: row,
      });
      attendancePrimed += 1;
    }
  }

  return {
    recovered: true,
    battleId: battle._id,
    attendancePrimed,
  };
}

async function startBattle(battleId, {
  startsAt,
  durationSeconds,
  durationLocked,
  scheduleSource,
  scheduledIntervalHours,
} = {}) {
  const battle = await getModelDocById('Battle', battleId);
  if (!battle) throw new Error('Battle not found');
  const patch = await buildStartBattlePatch(battleId, battle, {
    startsAt,
    durationSeconds,
    durationLocked,
    scheduleSource,
    scheduledIntervalHours,
  });

  const saved = await updateModelDoc('Battle', battleId, patch);
  if (!saved) throw new Error('Battle not found');
  await battleRuntimeStore.setBattlePointer(CURRENT_BATTLE_POINTER_KIND, saved._id).catch(() => {});
  await battleRuntimeStore.clearBattlePointer(UPCOMING_BATTLE_POINTER_KIND, saved._id).catch(() => {});
  await battleRuntimeStore.clearDarknessState('cycle_anchor').catch(() => {});
  scheduleBattleFinalize(saved);
  notifyBattleStart().catch((e) => {
    // eslint-disable-next-line no-console
    console.error('startBattle: notifyBattleStart error', e);
  });
  return saved;
}

async function markFirstPlayerJoinIfNeeded(battleId, at = new Date()) {
  const now = new Date(at);

  const battle = await getModelDocById('Battle', battleId);
  if (!battle) return null;
  if (String(battle.status) !== 'active') return null;
  if (battle.firstPlayerJoinedAt) return null;

  const patch = {
    firstPlayerJoinedAt: now,
    globalDebuffActive: false,
    globalDebuffPercent: 0,
  };

  if (!battle.durationLocked) {
    const baseDurationSeconds = BATTLE_BASE_DURATION_SECONDS;
    patch.durationSeconds = baseDurationSeconds;
    patch.endsAt = new Date(now.getTime() + baseDurationSeconds * 1000);
  }

  const saved = await updateModelDoc('Battle', battleId, patch);
  if (saved) {
    scheduleBattleFinalize(saved);
  }

  return saved;
}

async function recomputeEndsAtForAttendance(battleId, { battle: battleSnapshot = null } = {}) {
  const battle = battleSnapshot || await getModelDocById('Battle', battleId);
  if (!battle) throw new Error('Battle not found');
  if (battle.status !== 'active') return null;

  const nextTiming = buildAttendanceTimingUpdate(battle);
  if (!nextTiming) {
    return null;
  }

  const currentEndsAtMs = battle.endsAt ? new Date(battle.endsAt).getTime() : NaN;
  const nextEndsAtMs = nextTiming.endsAt ? new Date(nextTiming.endsAt).getTime() : NaN;
  const unchanged = Number(battle.durationSeconds || 0) === Number(nextTiming.durationSeconds || 0)
    && Boolean(battle.isShrunken) === Boolean(nextTiming.isShrunken)
    && currentEndsAtMs === nextEndsAtMs;

  if (unchanged) {
    return null;
  }

  const saved = await updateModelDoc('Battle', battleId, nextTiming);
  if (saved) {
    scheduleBattleFinalize(saved);
  }
  return saved;
}

async function finishBattle(
  battleId,
  {
    darknessDamage = 0,
    lightDamage = 0,
    absoluteDarknessDamage = null,
    absoluteLightDamage = null,
    attendance = null,
    attendanceCount,
    endedAt = null,
    deferSideEffects = false,
  } = {}
) {
  const battle = await getModelDocById('Battle', battleId);
  if (!battle) throw new Error('Battle not found');
  const finalAttendance = Array.isArray(attendance) ? attendance : (Array.isArray(battle.attendance) ? battle.attendance : []);
  const nextLightDamage = absoluteLightDamage == null
    ? (Number(battle.lightDamage) || 0) + (Number(lightDamage) || 0)
    : Math.max(0, Number(absoluteLightDamage) || 0);
  const nextDarknessDamage = absoluteDarknessDamage == null
    ? (Number(battle.darknessDamage) || 0) + (Number(darknessDamage) || 0)
    : Math.max(0, Number(absoluteDarknessDamage) || 0);
  const finalAttendanceCount = typeof attendanceCount === 'number'
    ? attendanceCount
    : finalAttendance.length;
  const shouldInlineFinishedAttendance = finalAttendance.length <= BATTLE_FINISHED_ATTENDANCE_INLINE_LIMIT;
  const patch = {
    status: 'finished',
    endsAt: endedAt ? new Date(endedAt) : new Date(),
    darknessDamage: nextDarknessDamage,
    lightDamage: nextLightDamage,
    attendance: shouldInlineFinishedAttendance ? finalAttendance : [],
    attendanceStoredInRuntime: !shouldInlineFinishedAttendance,
    attendanceRuntimeCount: finalAttendance.length,
  };
  if (typeof finalAttendanceCount === 'number') {
    patch.attendanceCount = finalAttendanceCount;
  }

  patch.injury = await applyBattleInjuryIfNeeded({
    battle,
    patch,
    finalAttendance,
    finalAttendanceCount,
    nextLightDamage,
    nextDarknessDamage,
  });

  let attendanceUsersById = new Map();
  try {
    const summary = await buildFinishedBattleSummary({ ...battle, ...patch, attendance: finalAttendance });
    attendanceUsersById = summary?.usersById || new Map();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('finishBattle: summary build failed', e);
    patch.summaryTopPlayer = null;
  }

  const saved = await updateModelDoc('Battle', battleId, patch);
  if (!saved) throw new Error('Battle not found');
  clearBattleTransientState(saved._id, { keepRuntime: true });
  await battleRuntimeStore.clearBattlePointer(CURRENT_BATTLE_POINTER_KIND, saved._id).catch(() => {});
  await battleRuntimeStore.clearBattlePointer(UPCOMING_BATTLE_POINTER_KIND, saved._id).catch(() => {});

  try {
    await prepareBattleSummaries(saved._id, { attendanceOverride: finalAttendance });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('finishBattle: prepare summaries failed', e);
  }

  await dispatchBattleFinalSideEffects({
    deferSideEffects,
    battleId,
    battle,
    saved,
    finalAttendance,
    attendanceUsersById,
  });
  return saved;
}

async function cancelBattle(battleId, reason = 'Cancelled by scheduler') {
  const battle = await getModelDocById('Battle', battleId);
  if (!battle) throw new Error('Battle not found');
  const saved = await updateModelDoc('Battle', battleId, {
    status: 'cancelled',
    cancellationReason: reason,
    endsAt: new Date(),
  });
  if (!saved) throw new Error('Battle not found');
  clearBattleTransientState(saved._id);
  await battleRuntimeStore.clearBattlePointer(CURRENT_BATTLE_POINTER_KIND, saved._id).catch(() => {});
  await battleRuntimeStore.clearBattlePointer(UPCOMING_BATTLE_POINTER_KIND, saved._id).catch(() => {});
  return saved;
}

async function registerAttendance(
  battleId,
  userId,
  {
    joinedAt = new Date(),
    battle = null,
  } = {}
) {
  return registerBattleAttendance(battleId, userId, {
    joinedAt,
    battle,
    scheduleBattleAttendanceCounterFlush,
  });
}

async function finalizeBattleWithReports(battleId) {
  await flushBattleAttendanceCounter(battleId).catch(() => {});
  const battle = await getModelDocById('Battle', battleId);
  if (!battle) throw new Error('Battle not found');
  if (String(battle.status) !== 'active') return null;

  const runtimeAttendance = await battleRuntimeStore.listAttendanceStatesByBattle({
    battleId,
    limit: 50000,
    preferCache: true,
  }).catch(() => []);
  const runtimeFinalReports = await battleRuntimeStore.listFinalReportsByBattle({
    battleId,
    limit: 50000,
    preferCache: true,
  }).catch(() => []);
  const updatedAttendance = await buildFinalizedAttendanceFromReports({
    runtimeAttendance,
    storedAttendance: battle.attendance,
    runtimeFinalReports,
  });

  const actualBattleEndAt = battle?.endsAt ? new Date(battle.endsAt) : new Date();
  const {
    forceTotals,
    totalLightDamage,
    totalDarknessDamage,
  } = computeFinalizedBattleDamageTotals(battle, updatedAttendance, actualBattleEndAt);

  try {
    await buildFinishedBattleSummary({
      ...battle,
      attendance: updatedAttendance,
      lightDamage: totalLightDamage,
      darknessDamage: totalDarknessDamage,
    });
  } catch (_error) {
    // Rank and top player will still be rechecked inside finishBattle if needed.
  }

  const finalizedBattle = await finishBattle(battleId, {
    attendance: updatedAttendance,
    attendanceCount: updatedAttendance.length,
    absoluteLightDamage: totalLightDamage,
    absoluteDarknessDamage: totalDarknessDamage,
    endedAt: actualBattleEndAt,
    deferSideEffects: true,
  });
  if (!finalizedBattle) return null;

  await updateModelDoc('Battle', battleId, {
    finalReportWindowSeconds: BATTLE_FINAL_WINDOW_SECONDS,
    finalReportWindowClosedAt: new Date().toISOString(),
    guardianDamage: forceTotals.guardianDamage,
    darknessBaseDamage: forceTotals.darknessBaseDamage,
    darknessDamageFromBaddies: forceTotals.darknessDamageFromBaddies,
  });
  await battleRuntimeStore.deleteFinalSettlement({ battleId }).catch(() => {});
  return getModelDocById('Battle', battleId);
}

async function tryFinalizeBattleIfReady(battleId, { allParticipantsReported = false } = {}) {
  const safeBattleId = String(battleId || '').trim();
  if (!safeBattleId || !acquireBattleEarlyFinalizeLock(safeBattleId)) {
    return false;
  }

  try {
    const battle = await getModelDocById('Battle', safeBattleId);
    if (!battle || String(battle.status || '') !== 'active') {
      return false;
    }

    if (!shouldFinalizeBattleNow(battle, { allParticipantsReported })) {
      return false;
    }

    await finalizeBattleWithReports(safeBattleId);
    return true;
  } catch (error) {
    console.error('tryFinalizeBattleIfReady error:', error);
    return false;
  } finally {
    releaseBattleEarlyFinalizeLock(safeBattleId);
  }
}

async function processDueBattleSettlements({ now = new Date() } = {}) {
  return processDueBattleSettlementsCore({ now, finishBattle });
}

async function applyFinalSettlementNow(battleId) {
  return applyFinalSettlementNowCore(battleId, { finishBattle });
}

async function forceFinishBattleNow(battleId) {
  return forceFinishBattleNowCore(battleId, {
    finishBattle,
    finalizeBattleWithReports,
  });
}

async function getCurrentBattle() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const battle = await resolveBattleByPointer({
      kind: CURRENT_BATTLE_POINTER_KIND,
      expectedStatus: 'active',
      fallbackSortMode: 'desc',
    });
    if (!battle) {
      return null;
    }

    const endsAtMs = battle?.endsAt ? new Date(battle.endsAt).getTime() : NaN;
    const finalAcceptEndsAtMs = Number.isFinite(endsAtMs)
      ? endsAtMs + (BATTLE_FINAL_REPORT_ACCEPT_SECONDS * 1000)
      : NaN;

    if (Number.isFinite(finalAcceptEndsAtMs) && Date.now() >= finalAcceptEndsAtMs) {
      try {
        await forceFinishBattleNow(battle._id);
        continue;
      } catch (error) {
        console.error('getCurrentBattle: stale active battle finish failed', error);
        await battleRuntimeStore.clearBattlePointer(CURRENT_BATTLE_POINTER_KIND, battle._id).catch(() => {});
        continue;
      }
    }

    scheduleBattleFinalize(battle);
    return battle;
  }

  return null;
}

async function getUpcomingBattle() {
  return resolveBattleByPointer({
    kind: UPCOMING_BATTLE_POINTER_KIND,
    expectedStatus: 'scheduled',
    fallbackSortMode: 'asc',
  });
}

async function clearUpcomingScheduledBattle({
  battleId = null,
  reason = 'Cancelled by admin',
  includeAuto = true,
} = {}) {
  const safeBattleId = String(battleId || '').trim();
  if (safeBattleId) {
    const battle = await getModelDocById('Battle', safeBattleId);
    if (!battle || String(battle.status || '') !== 'scheduled') {
      throw new Error('Scheduled battle not found');
    }
    return cancelBattle(safeBattleId, reason);
  }

  const upcoming = await getUpcomingBattle();
  if (upcoming && String(upcoming.status || '') === 'scheduled') {
    if (includeAuto || String(upcoming.scheduleSource || '') !== 'auto') {
      return cancelBattle(upcoming._id, reason);
    }
  }

  const scheduledBattles = await listScheduledBattles({ includeAuto });
  if (scheduledBattles.length > 0) {
    return cancelBattle(scheduledBattles[0]._id, reason);
  }

  await battleRuntimeStore.clearBattlePointer(UPCOMING_BATTLE_POINTER_KIND).catch(() => {});
  return null;
}

module.exports = {
  getBattleById,
  scheduleBattle,
  updateScheduledBattle,
  startBattle,
  finishBattle,
  cancelBattle,
  recordDamage,
  registerAttendance,
  incrementAttendance,
  getCurrentBattle,
  getUpcomingBattle,
  listScheduledBattles,
  clearUpcomingScheduledBattle,
  processActiveBattleTick,
  TICK_SECONDS,
  getWeakZoneState,
  getVoiceCommandState,
  buildVoiceResolutionUpdate,
  ensureAttendanceInitForUser,
  applyVoiceResolutionsForUser,
  markVoiceShotDetected,
  markFirstPlayerJoinIfNeeded,
  recomputeEndsAtForAttendance,
  ensureAttendanceSyncState,
  getBattlePolicy,
  getBattleSyncConfig,
  getBattleFinalWindowConfig,
  getBattleScenario,
  computeBattleMaxLimits,
  finalizeBattleWithReports,
  tryFinalizeBattleIfReady,
  refreshBattleFinalizeSchedule,
  recoverActiveBattleRuntime,
  processDueBattleSettlements,
  forceFinishBattleNow,
  BATTLE_BASE_DURATION_SECONDS,
  BATTLE_MIN_DURATION_SECONDS,
  BATTLE_NO_ENTRY_DURATION_SECONDS,
  BATTLE_FINAL_WINDOW_SECONDS,
  getActiveUsersCountSnapshot,
  clearBattleTransientState,
  clearAllBattleTransientState,
};
