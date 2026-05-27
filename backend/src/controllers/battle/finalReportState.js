const battleFinalReportCapacityState = new Map();
const battleFinalReportProgressState = new Map();

function getBattleFinalReportCapacityState(battleId) {
    const safeBattleId = String(battleId || '').trim();
    if (!safeBattleId) return null;
    let state = battleFinalReportCapacityState.get(safeBattleId);
    if (!state) {
        state = {
            windowStartedAtMs: 0,
            acceptedCount: 0,
            lastTouchedAtMs: 0,
        };
        battleFinalReportCapacityState.set(safeBattleId, state);
    }
    return state;
}

function getBattleFinalReportProgressState(battleId) {
    const safeBattleId = String(battleId || '').trim();
    if (!safeBattleId) return null;
    let state = battleFinalReportProgressState.get(safeBattleId);
    if (!state) {
        state = {
            acceptedUserIds: new Set(),
            expectedCount: 0,
            lastTouchedAtMs: 0,
        };
        battleFinalReportProgressState.set(safeBattleId, state);
    }
    return state;
}

function cleanupBattleFinalReportCapacityState(nowMs = Date.now()) {
    for (const [battleId, state] of battleFinalReportCapacityState.entries()) {
        if (!state || (nowMs - Number(state.lastTouchedAtMs || 0)) > (10 * 60 * 1000)) {
            battleFinalReportCapacityState.delete(battleId);
        }
    }
}

function cleanupBattleFinalReportProgressState(nowMs = Date.now()) {
    for (const [battleId, state] of battleFinalReportProgressState.entries()) {
        if (!state || (nowMs - Number(state.lastTouchedAtMs || 0)) > (10 * 60 * 1000)) {
            battleFinalReportProgressState.delete(battleId);
        }
    }
}

function noteBattleFinalReportAccepted({ battleId, userId, expectedCount = 0, nowMs = Date.now() }) {
    cleanupBattleFinalReportProgressState(nowMs);
    const state = getBattleFinalReportProgressState(battleId);
    const safeUserId = String(userId || '').trim();
    if (!state || !safeUserId) {
        return { acceptedCount: 0, expectedCount: 0, complete: false };
    }

    state.lastTouchedAtMs = nowMs;
    state.expectedCount = Math.max(0, Number(state.expectedCount) || 0, Math.floor(Number(expectedCount) || 0));
    state.acceptedUserIds.add(safeUserId);

    const acceptedCount = state.acceptedUserIds.size;
    return {
        acceptedCount,
        expectedCount: state.expectedCount,
        complete: state.expectedCount > 0 && acceptedCount >= state.expectedCount,
    };
}

function getBattleFinalReportExpectedCount(battle) {
    return Math.max(
        0,
        Number(battle?.uniqueAttendanceCount)
        || Number(battle?.attendanceCount)
        || (Array.isArray(battle?.attendance) ? battle.attendance.length : 0),
    );
}

function claimBattleFinalReportCapacity({
    battleId,
    endsAtMs,
    nowMs = Date.now(),
    windowMs = 2000,
    capacity = 2000,
}) {
    cleanupBattleFinalReportCapacityState(nowMs);
    const safeWindowMs = Math.max(250, Math.floor(Number(windowMs) || 2000));
    const safeCapacity = Math.max(1, Math.floor(Number(capacity) || 2000));
    const state = getBattleFinalReportCapacityState(battleId);
    if (!state) {
        return { accepted: true, retryAfterMs: 0 };
    }

    const anchorMs = Number.isFinite(Number(endsAtMs)) ? Math.floor(Number(endsAtMs)) : nowMs;
    const elapsedMs = Math.max(0, nowMs - anchorMs);
    const windowIndex = Math.floor(elapsedMs / safeWindowMs);
    const windowStartedAtMs = anchorMs + (windowIndex * safeWindowMs);
    const nextWindowAtMs = windowStartedAtMs + safeWindowMs;

    if (Number(state.windowStartedAtMs) !== windowStartedAtMs) {
        state.windowStartedAtMs = windowStartedAtMs;
        state.acceptedCount = 0;
    }

    state.lastTouchedAtMs = nowMs;
    if (state.acceptedCount >= safeCapacity) {
        return {
            accepted: false,
            retryAfterMs: Math.max(250, nextWindowAtMs - nowMs),
        };
    }

    state.acceptedCount += 1;
    return {
        accepted: true,
        retryAfterMs: 0,
    };
}

function clearBattleFinalReportState() {
    battleFinalReportCapacityState.clear();
    battleFinalReportProgressState.clear();
}

module.exports = {
    claimBattleFinalReportCapacity,
    clearBattleFinalReportState,
    cleanupBattleFinalReportCapacityState,
    cleanupBattleFinalReportProgressState,
    getBattleFinalReportExpectedCount,
    getBattleFinalReportCapacityState,
    getBattleFinalReportProgressState,
    noteBattleFinalReportAccepted,
};
