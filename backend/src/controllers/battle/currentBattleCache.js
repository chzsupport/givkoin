const battleService = require('../../services/battleService');
const battleRuntimeStore = require('../../services/battleRuntimeStore');
const { buildBattlePersonalStatePayload } = require('./responsePayload');

const CURRENT_BATTLE_SHARED_CACHE_TTL_MS = 3000;
const CURRENT_BATTLE_PERSONAL_CACHE_TTL_MS = 1200;

let currentBattleSharedCache = {
    battle: null,
    upcoming: null,
    expiresAtMs: 0,
};
let currentBattleSharedRefreshPromise = null;
const currentBattlePersonalCache = new Map();

function clearCurrentBattlePersonalCache({ battleId = null, userId = null } = {}) {
    const safeBattleId = String(battleId || '').trim();
    const safeUserId = String(userId || '').trim();
    if (!safeBattleId && !safeUserId) {
        currentBattlePersonalCache.clear();
        return;
    }

    for (const key of currentBattlePersonalCache.keys()) {
        const [cachedBattleId, cachedUserId] = String(key || '').split(':');
        if (safeBattleId && cachedBattleId !== safeBattleId) continue;
        if (safeUserId && cachedUserId !== safeUserId) continue;
        currentBattlePersonalCache.delete(key);
    }
}

function clearCurrentBattleSharedCache() {
    currentBattleSharedCache = {
        battle: null,
        upcoming: null,
        expiresAtMs: 0,
    };
}

function primeCurrentBattleSharedCache({ battle = null, upcoming = null, nowMs = Date.now() } = {}) {
    currentBattleSharedCache = {
        battle,
        upcoming,
        expiresAtMs: nowMs + CURRENT_BATTLE_SHARED_CACHE_TTL_MS,
    };
}

async function getCachedCurrentBattleShared(nowMs = Date.now()) {
    if (currentBattleSharedCache.expiresAtMs > nowMs) {
        return {
            battle: currentBattleSharedCache.battle || null,
            upcoming: currentBattleSharedCache.upcoming || null,
        };
    }

    if (currentBattleSharedRefreshPromise) {
        return currentBattleSharedRefreshPromise;
    }

    currentBattleSharedRefreshPromise = (async () => {
        const battle = await battleService.getCurrentBattle();
        if (!battle) {
            const upcoming = await battleService.getUpcomingBattle();
            primeCurrentBattleSharedCache({ battle: null, upcoming, nowMs: Date.now() });
            return { battle: null, upcoming };
        }

        primeCurrentBattleSharedCache({ battle, upcoming: null, nowMs: Date.now() });
        return { battle, upcoming: null };
    })().finally(() => {
        currentBattleSharedRefreshPromise = null;
    });

    return currentBattleSharedRefreshPromise;
}

async function resolveJoinBattleCandidate({
    requestedBattleId = '',
    getCachedBattleDocById,
    requestedTtlMs,
} = {}) {
    const safeRequestedBattleId = String(requestedBattleId || '').trim();
    let battle = safeRequestedBattleId && typeof getCachedBattleDocById === 'function'
        ? await getCachedBattleDocById(safeRequestedBattleId, { ttlMs: requestedTtlMs })
        : null;
    if (battle && String(battle.status || '') !== 'active') {
        battle = null;
    }
    if (battle) {
        primeCurrentBattleSharedCache({ battle });
    }
    if (!battle) {
        ({ battle } = await getCachedCurrentBattleShared());
    }
    if (!battle) {
        clearCurrentBattleSharedCache();
        battle = await battleService.getCurrentBattle();
        if (battle) {
            primeCurrentBattleSharedCache({ battle });
        }
    }

    return battle || null;
}

function setCachedCurrentBattlePersonal({
    battleId,
    userId,
    attendanceEntry = null,
    personalState = null,
    nowMs = Date.now(),
} = {}) {
    const safeBattleId = String(battleId || '').trim();
    const safeUserId = String(userId || '').trim();
    if (!safeBattleId || !safeUserId) return;

    currentBattlePersonalCache.set(`${safeBattleId}:${safeUserId}`, {
        attendanceEntry,
        personalState: personalState || buildBattlePersonalStatePayload(attendanceEntry || null),
        expiresAtMs: nowMs + CURRENT_BATTLE_PERSONAL_CACHE_TTL_MS,
    });
}

async function getCachedCurrentBattlePersonal({ battleId, userId, fallbackUser = null, nowMs = Date.now() }) {
    const safeBattleId = String(battleId || '').trim();
    const safeUserId = String(userId || '').trim();

    if (!safeBattleId || !safeUserId) {
        return {
            attendanceEntry: null,
            personalState: buildBattlePersonalStatePayload(null, fallbackUser),
        };
    }

    const cacheKey = `${safeBattleId}:${safeUserId}`;
    const cached = currentBattlePersonalCache.get(cacheKey);
    if (cached && cached.expiresAtMs > nowMs) {
        return {
            attendanceEntry: cached.attendanceEntry || null,
            personalState: cached.personalState || buildBattlePersonalStatePayload(cached.attendanceEntry || null, fallbackUser),
        };
    }

    const attendanceEntry = battleRuntimeStore.getCachedAttendanceState({
        battleId: safeBattleId,
        userId: safeUserId,
    });
    const personalState = buildBattlePersonalStatePayload(attendanceEntry, fallbackUser);

    setCachedCurrentBattlePersonal({
        battleId: safeBattleId,
        userId: safeUserId,
        attendanceEntry,
        personalState,
        nowMs,
    });

    return { attendanceEntry, personalState };
}

module.exports = {
    clearCurrentBattlePersonalCache,
    clearCurrentBattleSharedCache,
    getCachedCurrentBattlePersonal,
    getCachedCurrentBattleShared,
    primeCurrentBattleSharedCache,
    resolveJoinBattleCandidate,
    setCachedCurrentBattlePersonal,
};
