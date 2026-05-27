const { BATTLE_FINAL_REPORT_ACCEPT_SECONDS } = require('./battleConfig');

const battleEarlyFinalizeLocks = new Set();
const battleFinalizeTimers = new Map();

function normalizeBattleId(battleId) {
  return String(battleId || '').trim();
}

function getBattleFinalizeAtMs(battleLike) {
  const endsAtMs = battleLike?.endsAt ? new Date(battleLike.endsAt).getTime() : NaN;
  if (!Number.isFinite(endsAtMs)) return NaN;
  return endsAtMs + (BATTLE_FINAL_REPORT_ACCEPT_SECONDS * 1000);
}

function shouldFinalizeBattleNow(battleLike, {
  allParticipantsReported = false,
  nowMs = Date.now(),
} = {}) {
  const endsAtMs = battleLike?.endsAt ? new Date(battleLike.endsAt).getTime() : NaN;
  const reportAcceptEndsAtMs = Number.isFinite(endsAtMs)
    ? endsAtMs + (BATTLE_FINAL_REPORT_ACCEPT_SECONDS * 1000)
    : NaN;
  const safeNowMs = Number(nowMs);

  if (!Number.isFinite(endsAtMs) || !Number.isFinite(reportAcceptEndsAtMs) || !Number.isFinite(safeNowMs)) {
    return false;
  }
  if (safeNowMs < endsAtMs) {
    return false;
  }
  if (safeNowMs >= reportAcceptEndsAtMs) {
    return true;
  }
  return Boolean(allParticipantsReported);
}

function clearBattleFinalizeSchedule(battleId) {
  const safeBattleId = normalizeBattleId(battleId);
  if (!safeBattleId) return;
  const current = battleFinalizeTimers.get(safeBattleId);
  if (current?.timer) {
    clearTimeout(current.timer);
  }
  battleFinalizeTimers.delete(safeBattleId);
}

function clearAllBattleFinalizeSchedules() {
  for (const battleId of Array.from(battleFinalizeTimers.keys())) {
    clearBattleFinalizeSchedule(battleId);
  }
}

function scheduleBattleFinalize(battleLike, { tryFinalizeBattleIfReady } = {}) {
  const battleId = normalizeBattleId(battleLike?._id);
  if (!battleId) return false;
  if (String(battleLike?.status || '') !== 'active') {
    clearBattleFinalizeSchedule(battleId);
    return false;
  }

  const runAtMs = getBattleFinalizeAtMs(battleLike);
  if (!Number.isFinite(runAtMs)) {
    clearBattleFinalizeSchedule(battleId);
    return false;
  }

  const existing = battleFinalizeTimers.get(battleId);
  if (existing && Number(existing.runAtMs) === runAtMs) {
    return true;
  }

  clearBattleFinalizeSchedule(battleId);

  const delayMs = Math.max(0, runAtMs - Date.now());
  const timer = setTimeout(() => {
    battleFinalizeTimers.delete(battleId);
    if (typeof tryFinalizeBattleIfReady !== 'function') return;
    tryFinalizeBattleIfReady(battleId).catch((error) => {
      console.error('battle finalize timer error:', error);
    });
  }, delayMs);
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  battleFinalizeTimers.set(battleId, { runAtMs, timer });
  return true;
}

function hasBattleEarlyFinalizeLock(battleId) {
  const safeBattleId = normalizeBattleId(battleId);
  return Boolean(safeBattleId && battleEarlyFinalizeLocks.has(safeBattleId));
}

function acquireBattleEarlyFinalizeLock(battleId) {
  const safeBattleId = normalizeBattleId(battleId);
  if (!safeBattleId || battleEarlyFinalizeLocks.has(safeBattleId)) {
    return false;
  }
  battleEarlyFinalizeLocks.add(safeBattleId);
  return true;
}

function releaseBattleEarlyFinalizeLock(battleId) {
  const safeBattleId = normalizeBattleId(battleId);
  if (!safeBattleId) return;
  battleEarlyFinalizeLocks.delete(safeBattleId);
}

function clearBattleEarlyFinalizeLocks() {
  battleEarlyFinalizeLocks.clear();
}

module.exports = {
  acquireBattleEarlyFinalizeLock,
  clearAllBattleFinalizeSchedules,
  clearBattleEarlyFinalizeLocks,
  clearBattleFinalizeSchedule,
  getBattleFinalizeAtMs,
  hasBattleEarlyFinalizeLock,
  releaseBattleEarlyFinalizeLock,
  scheduleBattleFinalize,
  shouldFinalizeBattleNow,
};
