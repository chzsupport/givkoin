const {
  getModelDocById,
  updateModelDoc,
} = require('./battleDocuments');
const { buildAttendanceTimingUpdate } = require('./battleTiming');
const { BATTLE_BASE_DURATION_SECONDS } = require('./battleConfig');

const battleAttendanceLocks = new Map();
const battleAttendanceCounters = new Map();

function normalizeBattleId(battleId) {
  return String(battleId || '').trim();
}

async function withBattleAttendanceLock(battleId, task) {
  const safeBattleId = normalizeBattleId(battleId);
  if (!safeBattleId || typeof task !== 'function') {
    return task();
  }

  const previous = battleAttendanceLocks.get(safeBattleId) || Promise.resolve();
  let releaseCurrent = () => {};
  const currentGate = new Promise((resolve) => {
    releaseCurrent = resolve;
  });
  const currentTail = previous.catch(() => {}).then(() => currentGate);
  battleAttendanceLocks.set(safeBattleId, currentTail);

  await previous.catch(() => {});
  try {
    return await task();
  } finally {
    releaseCurrent();
    if (battleAttendanceLocks.get(safeBattleId) === currentTail) {
      battleAttendanceLocks.delete(safeBattleId);
    }
  }
}

function buildBattleAttendanceSnapshot(battle) {
  if (!battle) return null;
  return {
    _id: battle._id,
    status: battle.status,
    startsAt: battle.startsAt || null,
    firstPlayerJoinedAt: battle.firstPlayerJoinedAt || null,
    durationSeconds: Number(battle.durationSeconds) || BATTLE_BASE_DURATION_SECONDS,
    attendanceCount: Math.max(0, Number(battle.attendanceCount) || 0),
    maxAttendanceCount: Math.max(0, Number(battle.maxAttendanceCount) || 0),
    uniqueAttendanceCount: Math.max(0, Number(battle.uniqueAttendanceCount) || 0),
    endsAt: battle.endsAt || null,
    isShrunken: Boolean(battle.isShrunken),
    activeUsersCountSnapshot: Math.max(0, Number(battle.activeUsersCountSnapshot) || 0),
    scenario: battle?.scenario && typeof battle.scenario === 'object' ? battle.scenario : null,
    injuries: Array.isArray(battle.injuries) ? battle.injuries : [],
    injury: battle.injury || null,
  };
}

function clearBattleAttendanceCounter(battleId) {
  const safeBattleId = normalizeBattleId(battleId);
  if (!safeBattleId) return;
  const state = battleAttendanceCounters.get(safeBattleId);
  if (state?.timer) {
    clearTimeout(state.timer);
  }
  battleAttendanceCounters.delete(safeBattleId);
}

function clearAllBattleAttendanceCounters() {
  for (const battleId of Array.from(battleAttendanceCounters.keys())) {
    clearBattleAttendanceCounter(battleId);
  }
}

async function getBattleAttendanceCounter(battleId, fallbackBattle = null) {
  const safeBattleId = normalizeBattleId(battleId);
  if (!safeBattleId) return null;

  let state = battleAttendanceCounters.get(safeBattleId);
  if (state?.battle) return state;

  const battle = await getModelDocById('Battle', safeBattleId) || fallbackBattle;
  if (!battle) return null;

  state = {
    battle: { ...battle },
    attendanceCount: Math.max(0, Number(battle.attendanceCount) || 0),
    uniqueAttendanceCount: Math.max(0, Number(battle.uniqueAttendanceCount) || Number(battle.attendanceCount) || 0),
    maxAttendanceCount: Math.max(0, Number(battle.maxAttendanceCount) || Number(battle.attendanceCount) || 0),
    dirty: false,
    version: 0,
    timer: null,
    flushing: null,
  };
  battleAttendanceCounters.set(safeBattleId, state);
  return state;
}

async function flushBattleAttendanceCounter(battleId, { scheduleBattleFinalize } = {}) {
  const safeBattleId = normalizeBattleId(battleId);
  if (!safeBattleId) return null;
  const state = battleAttendanceCounters.get(safeBattleId);
  if (!state) return null;
  if (state.flushing) return state.flushing;

  state.flushing = (async () => {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
    }
    if (!state.dirty || !state.battle) {
      return state.battle || null;
    }

    const flushVersion = Math.max(0, Number(state.version) || 0);
    const targetAttendanceCount = Math.max(0, Number(state.attendanceCount) || 0);
    const targetUniqueAttendanceCount = Math.max(0, Number(state.uniqueAttendanceCount) || 0);
    const targetMaxAttendanceCount = Math.max(0, Number(state.maxAttendanceCount) || 0);
    const patch = {
      attendanceCount: targetAttendanceCount,
      uniqueAttendanceCount: targetUniqueAttendanceCount,
      maxAttendanceCount: targetMaxAttendanceCount,
    };
    if (state.battle.firstPlayerJoinedAt) {
      patch.firstPlayerJoinedAt = state.battle.firstPlayerJoinedAt;
      patch.globalDebuffActive = false;
      patch.globalDebuffPercent = 0;
    }
    const timingUpdate = buildAttendanceTimingUpdate({
      ...state.battle,
      ...patch,
    });
    if (timingUpdate) {
      Object.assign(patch, timingUpdate);
    }

    const saved = await updateModelDoc('Battle', safeBattleId, patch);
    if (saved) {
      state.battle = {
        ...state.battle,
        ...saved,
        attendanceCount: state.attendanceCount,
        uniqueAttendanceCount: state.uniqueAttendanceCount,
        maxAttendanceCount: state.maxAttendanceCount,
      };
      if (Math.max(0, Number(state.version) || 0) === flushVersion) {
        state.attendanceCount = targetAttendanceCount;
        state.uniqueAttendanceCount = targetUniqueAttendanceCount;
        state.maxAttendanceCount = targetMaxAttendanceCount;
        state.battle = {
          ...saved,
          attendanceCount: targetAttendanceCount,
          uniqueAttendanceCount: targetUniqueAttendanceCount,
          maxAttendanceCount: targetMaxAttendanceCount,
        };
        state.dirty = false;
      } else {
        state.dirty = true;
        scheduleBattleAttendanceCounterFlush(safeBattleId, { scheduleBattleFinalize });
      }
      if (timingUpdate && typeof scheduleBattleFinalize === 'function') {
        scheduleBattleFinalize(saved);
      }
    }
    return state.battle || saved || null;
  })();

  try {
    return await state.flushing;
  } finally {
    state.flushing = null;
  }
}

function scheduleBattleAttendanceCounterFlush(
  battleId,
  { delayMs = 750, scheduleBattleFinalize } = {}
) {
  const safeBattleId = normalizeBattleId(battleId);
  const state = battleAttendanceCounters.get(safeBattleId);
  if (!state || state.timer) return;
  state.timer = setTimeout(() => {
    state.timer = null;
    flushBattleAttendanceCounter(safeBattleId, { scheduleBattleFinalize }).catch((error) => {
      console.error('flushBattleAttendanceCounter error:', error);
    });
  }, Math.max(0, Number(delayMs) || 0));
  if (typeof state.timer.unref === 'function') {
    state.timer.unref();
  }
}

module.exports = {
  buildBattleAttendanceSnapshot,
  clearAllBattleAttendanceCounters,
  clearBattleAttendanceCounter,
  flushBattleAttendanceCounter,
  getBattleAttendanceCounter,
  scheduleBattleAttendanceCounterFlush,
  withBattleAttendanceLock,
};
