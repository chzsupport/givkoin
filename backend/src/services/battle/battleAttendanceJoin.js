const {
  buildAttendanceSyncState,
} = require('./battleCombat');
const {
  buildBattleAttendanceSnapshot,
  getBattleAttendanceCounter,
  withBattleAttendanceLock,
} = require('./battleAttendanceCounter');
const { buildAttendanceTimingUpdate } = require('./battleTiming');
const {
  BATTLE_BASE_DURATION_SECONDS,
  BATTLE_SYNC_INTERVAL_SECONDS,
  BATTLE_SYNC_SLOT_COUNT,
} = require('./battleConfig');
const battleRuntimeStore = require('../battleRuntimeStore');
const { recordActivity } = require('../activityService');

function buildInitialAttendanceEntry(userId, joinedAt) {
  return {
    user: String(userId),
    joinedAt,
    damage: 0,
    syncSlot: 0,
    syncSlotCount: BATTLE_SYNC_SLOT_COUNT,
    syncIntervalSeconds: BATTLE_SYNC_INTERVAL_SECONDS,
  };
}

function buildExistingAttendanceSync(existing) {
  return {
    syncSlot: Math.max(0, Number(existing?.syncSlot) || 0),
    syncSlotCount: Math.max(1, Number(existing?.syncSlotCount) || BATTLE_SYNC_SLOT_COUNT),
    syncIntervalSeconds: Math.max(1, Number(existing?.syncIntervalSeconds) || BATTLE_SYNC_INTERVAL_SECONDS),
  };
}

function applyBattleAttendanceCounterJoin(counter, joinedAt) {
  const currentAttendanceCount = Math.max(0, Number(counter.attendanceCount) || 0);
  const sync = buildAttendanceSyncState(currentAttendanceCount);
  const nextAttendanceCount = currentAttendanceCount + 1;
  const nextUniqueAttendanceCount = Math.max(0, Number(counter.uniqueAttendanceCount) || 0) + 1;
  const nextMaxAttendanceCount = Math.max(
    Math.max(0, Number(counter.maxAttendanceCount) || 0),
    nextAttendanceCount,
  );
  const startedByFirstJoin = !counter.battle.firstPlayerJoinedAt;
  const baseBattleForTiming = startedByFirstJoin
    ? {
      ...counter.battle,
      firstPlayerJoinedAt: joinedAt,
      globalDebuffActive: false,
      globalDebuffPercent: 0,
      ...(!counter.battle.durationLocked
        ? {
          durationSeconds: BATTLE_BASE_DURATION_SECONDS,
          endsAt: new Date(joinedAt.getTime() + BATTLE_BASE_DURATION_SECONDS * 1000),
        }
        : {}),
    }
    : counter.battle;
  const nextBattleForTiming = {
    ...baseBattleForTiming,
    attendanceCount: nextAttendanceCount,
    uniqueAttendanceCount: nextUniqueAttendanceCount,
    maxAttendanceCount: nextMaxAttendanceCount,
  };
  const timingUpdate = buildAttendanceTimingUpdate(nextBattleForTiming);
  const nextBattle = {
    ...nextBattleForTiming,
    ...(timingUpdate || {}),
  };

  counter.attendanceCount = nextAttendanceCount;
  counter.uniqueAttendanceCount = nextUniqueAttendanceCount;
  counter.maxAttendanceCount = nextMaxAttendanceCount;
  counter.battle = nextBattle;
  counter.version = Math.max(0, Number(counter.version) || 0) + 1;
  counter.dirty = true;

  return {
    nextBattle,
    startedByFirstJoin,
    sync,
    timingUpdate,
  };
}

async function registerBattleAttendance(
  battleId,
  userId,
  {
    joinedAt = new Date(),
    battle = null,
    scheduleBattleAttendanceCounterFlush = () => {},
  } = {}
) {
  if (!userId) return { joined: false, appliedTimerUpdate: false, sync: null, battleSnapshot: null };

  const safeJoinedAt = new Date(joinedAt);
  const initialEntry = buildInitialAttendanceEntry(userId, safeJoinedAt);
  const claimedAttendance = await battleRuntimeStore.createAttendanceStateIfAbsent({
    battleId,
    userId,
    state: initialEntry,
  });

  if (!claimedAttendance?.created) {
    const existing = claimedAttendance?.state || await battleRuntimeStore.getAttendanceState({ battleId, userId }).catch(() => null);
    const snapshot = await getBattleAttendanceCounter(battleId, battle);
    return {
      joined: false,
      appliedTimerUpdate: false,
      sync: buildExistingAttendanceSync(existing),
      battleSnapshot: buildBattleAttendanceSnapshot(snapshot?.battle || battle),
    };
  }

  return withBattleAttendanceLock(battleId, async () => {
    const counter = await getBattleAttendanceCounter(battleId, battle);
    if (!counter?.battle) {
      await battleRuntimeStore.deleteAttendanceState({ battleId, userId }).catch(() => {});
      return { joined: false, appliedTimerUpdate: false, sync: null };
    }

    const {
      nextBattle,
      startedByFirstJoin,
      sync,
      timingUpdate,
    } = applyBattleAttendanceCounterJoin(counter, safeJoinedAt);
    scheduleBattleAttendanceCounterFlush(battleId);

    const nextEntry = {
      ...initialEntry,
      syncSlot: sync.syncSlot,
      syncSlotCount: sync.syncSlotCount,
      syncIntervalSeconds: sync.syncIntervalSeconds,
    };
    await battleRuntimeStore.upsertAttendanceState({
      battleId,
      userId,
      state: nextEntry,
    }).catch(() => {});

    recordActivity({
      userId,
      type: 'battle_participation',
      minutes: 0,
      meta: { battleId, joinedAt: safeJoinedAt.toISOString() },
      createdAt: safeJoinedAt,
    }).catch(() => {});

    return {
      joined: true,
      appliedTimerUpdate: Boolean(timingUpdate),
      startedByFirstJoin,
      sync,
      battleSnapshot: buildBattleAttendanceSnapshot(nextBattle),
    };
  });
}

module.exports = {
  applyBattleAttendanceCounterJoin,
  buildExistingAttendanceSync,
  buildInitialAttendanceEntry,
  registerBattleAttendance,
};
