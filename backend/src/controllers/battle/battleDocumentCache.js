function normalizeCacheKey(value) {
    return String(value || '').trim();
}

function createBattleDocumentCache({
    getBattleDocById,
    heartbeatTtlMs = 5000,
    summaryTtlMs = 30000,
} = {}) {
    if (typeof getBattleDocById !== 'function') {
        throw new TypeError('getBattleDocById is required');
    }

    const heartbeatBattleCache = new Map();
    const summaryBattleCache = new Map();
    const battleDocRefreshPromises = new Map();

    function setHeartbeatBattleSnapshot(battleId, battle, { nowMs = Date.now() } = {}) {
        const key = normalizeCacheKey(battleId);
        if (!key || !battle) return;
        heartbeatBattleCache.set(key, {
            battle,
            expiresAtMs: nowMs + heartbeatTtlMs,
        });
    }

    function setSummaryBattleSnapshot(battleId, battle, { ttlMs = summaryTtlMs, nowMs = Date.now() } = {}) {
        const key = normalizeCacheKey(battleId);
        if (!key || !battle) return;
        summaryBattleCache.set(key, {
            battle,
            expiresAtMs: nowMs + Math.max(1000, Number(ttlMs) || summaryTtlMs),
        });
    }

    function clearHeartbeatBattleSnapshot(battleId) {
        heartbeatBattleCache.delete(normalizeCacheKey(battleId));
    }

    function clearSummaryBattleSnapshot(battleId) {
        summaryBattleCache.delete(normalizeCacheKey(battleId));
    }

    async function getHeartbeatBattleSnapshot(battleId) {
        const key = normalizeCacheKey(battleId);
        if (!key) return null;
        const cached = heartbeatBattleCache.get(key);
        const nowMs = Date.now();
        if (cached && cached.expiresAtMs > nowMs) {
            return cached.battle;
        }
        const battle = await getBattleDocById(key);
        if (!battle) {
            if (cached?.battle && String(cached.battle.status || '') === 'active') {
                setHeartbeatBattleSnapshot(key, cached.battle, { nowMs });
                return cached.battle;
            }
            clearHeartbeatBattleSnapshot(key);
            return null;
        }
        setHeartbeatBattleSnapshot(key, battle, { nowMs });
        return battle;
    }

    async function getActiveHeartbeatBattleSnapshot(battleId) {
        const key = normalizeCacheKey(battleId);
        if (!key) return null;
        let battle = await getHeartbeatBattleSnapshot(key);
        if (battle && String(battle.status || '') !== 'active') {
            clearHeartbeatBattleSnapshot(key);
            const freshBattle = await getBattleDocById(key).catch(() => null);
            if (freshBattle && String(freshBattle.status || '') === 'active') {
                battle = freshBattle;
                setHeartbeatBattleSnapshot(key, battle);
            }
        }
        return battle;
    }

    async function getSummaryBattleSnapshot(battleId) {
        const key = normalizeCacheKey(battleId);
        if (!key) return null;
        const cached = summaryBattleCache.get(key);
        const nowMs = Date.now();
        if (cached && cached.expiresAtMs > nowMs) {
            return cached.battle;
        }

        const battle = await getBattleDocById(key);
        if (!battle) {
            clearSummaryBattleSnapshot(key);
            return null;
        }

        if (String(battle.status || '') === 'finished') {
            setSummaryBattleSnapshot(key, battle, { nowMs });
        } else {
            clearSummaryBattleSnapshot(key);
        }

        return battle;
    }

    async function getCachedBattleDocById(battleId, { ttlMs = summaryTtlMs } = {}) {
        const safeBattleId = normalizeCacheKey(battleId);
        if (!safeBattleId) return null;
        const nowMs = Date.now();
        const heartbeatCached = heartbeatBattleCache.get(safeBattleId);
        if (heartbeatCached?.battle && Number(heartbeatCached.expiresAtMs) > nowMs) {
            return heartbeatCached.battle;
        }
        const summaryCached = summaryBattleCache.get(safeBattleId);
        if (
            summaryCached?.battle
            && String(summaryCached.battle.status || '') === 'finished'
            && Number(summaryCached.expiresAtMs) > nowMs
        ) {
            return summaryCached.battle;
        }

        if (battleDocRefreshPromises.has(safeBattleId)) {
            return battleDocRefreshPromises.get(safeBattleId);
        }

        const refreshPromise = (async () => {
            const fresh = await getBattleDocById(safeBattleId);
            if (fresh) {
                if (String(fresh.status || '') === 'finished') {
                    setSummaryBattleSnapshot(safeBattleId, fresh, { ttlMs });
                } else {
                    setHeartbeatBattleSnapshot(safeBattleId, fresh);
                    clearSummaryBattleSnapshot(safeBattleId);
                }
                return fresh;
            }

            return summaryCached?.battle || heartbeatCached?.battle || null;
        })().finally(() => {
            battleDocRefreshPromises.delete(safeBattleId);
        });
        battleDocRefreshPromises.set(safeBattleId, refreshPromise);
        return refreshPromise;
    }

    async function refreshBattleSnapshotIfEndTimeChanged(battleId, battle, { endsAtMs = NaN } = {}) {
        const key = normalizeCacheKey(battleId);
        if (!key || !battle) {
            return {
                battle,
                endsAtMs,
                refreshed: false,
            };
        }
        const currentEndsAtMs = Number.isFinite(Number(endsAtMs))
            ? Number(endsAtMs)
            : (battle?.endsAt ? new Date(battle.endsAt).getTime() : NaN);
        const freshBattle = await getBattleDocById(key).catch(() => null);
        const freshEndsAtMs = freshBattle?.endsAt ? new Date(freshBattle.endsAt).getTime() : NaN;
        if (freshBattle && Number.isFinite(freshEndsAtMs) && freshEndsAtMs !== currentEndsAtMs) {
            setSummaryBattleSnapshot(key, freshBattle);
            setHeartbeatBattleSnapshot(key, freshBattle);
            return {
                battle: freshBattle,
                endsAtMs: freshEndsAtMs,
                refreshed: true,
            };
        }

        return {
            battle,
            endsAtMs: currentEndsAtMs,
            refreshed: false,
        };
    }

    return {
        clearHeartbeatBattleSnapshot,
        clearSummaryBattleSnapshot,
        getActiveHeartbeatBattleSnapshot,
        getCachedBattleDocById,
        getHeartbeatBattleSnapshot,
        refreshBattleSnapshotIfEndTimeChanged,
        getSummaryBattleSnapshot,
        setHeartbeatBattleSnapshot,
        setSummaryBattleSnapshot,
    };
}

module.exports = {
    createBattleDocumentCache,
    normalizeCacheKey,
};
