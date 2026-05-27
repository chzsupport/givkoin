const test = require('node:test');
const assert = require('node:assert/strict');

const {
    clearCurrentBattlePersonalCache,
    clearCurrentBattleSharedCache,
    getCachedCurrentBattlePersonal,
    getCachedCurrentBattleShared,
    primeCurrentBattleSharedCache,
    resolveJoinBattleCandidate,
    setCachedCurrentBattlePersonal,
} = require('../controllers/battle/currentBattleCache');

test('battle current cache returns primed shared battle without refresh', async () => {
    clearCurrentBattleSharedCache();
    const battle = { _id: 'current-cache-battle', status: 'active' };
    primeCurrentBattleSharedCache({ battle, upcoming: null, nowMs: 1000 });

    assert.deepEqual(await getCachedCurrentBattleShared(1100), {
        battle,
        upcoming: null,
    });
});

test('battle current cache keeps personal payload and scoped clear', async () => {
    clearCurrentBattlePersonalCache();
    const attendanceEntry = {
        user: 'u1',
        joinedAt: '2026-01-01T00:00:00.000Z',
        damage: 15,
        lastAcceptedReportSequence: 2,
    };
    const personalState = {
        joinedAt: '2026-01-01T00:00:00.000Z',
        confirmedDamage: 15,
        confirmedLumens: null,
        startLumens: null,
        startK: null,
        startStars: null,
        lastAcceptedReportSequence: 2,
        lastClientSyncAt: null,
    };

    setCachedCurrentBattlePersonal({
        battleId: 'battle-a',
        userId: 'u1',
        attendanceEntry,
        personalState,
        nowMs: 1000,
    });

    assert.deepEqual(await getCachedCurrentBattlePersonal({
        battleId: 'battle-a',
        userId: 'u1',
        nowMs: 1100,
    }), {
        attendanceEntry,
        personalState,
    });

    clearCurrentBattlePersonalCache({ battleId: 'battle-a', userId: 'u1' });

    const cleared = await getCachedCurrentBattlePersonal({
        battleId: 'battle-a',
        userId: 'u1',
        nowMs: 1200,
    });
    assert.equal(cleared.attendanceEntry, null);
    assert.equal(cleared.personalState.confirmedDamage, 0);
});

test('battle current cache handles missing personal ids', async () => {
    const missing = await getCachedCurrentBattlePersonal({
        battleId: '',
        userId: '',
        fallbackUser: { lumens: 25, k: 4, stars: 1 },
    });

    assert.equal(missing.attendanceEntry, null);
    assert.equal(missing.personalState.confirmedDamage, 0);
    assert.equal(missing.personalState.startLumens, 25);
    assert.equal(missing.personalState.startK, 4);
    assert.equal(missing.personalState.startStars, 1);
});

test('battle current cache resolves requested active join battle first', async () => {
    clearCurrentBattleSharedCache();
    const requestedBattle = { _id: 'requested-battle', status: 'active' };
    const battle = await resolveJoinBattleCandidate({
        requestedBattleId: 'requested-battle',
        requestedTtlMs: 123,
        getCachedBattleDocById: async (battleId, options) => {
            assert.equal(battleId, 'requested-battle');
            assert.deepEqual(options, { ttlMs: 123 });
            return requestedBattle;
        },
    });

    assert.equal(battle, requestedBattle);
    assert.deepEqual(await getCachedCurrentBattleShared(), {
        battle: requestedBattle,
        upcoming: null,
    });
});

test('battle current cache ignores requested non-active join battle', async () => {
    clearCurrentBattleSharedCache();
    const cachedBattle = { _id: 'shared-battle', status: 'active' };
    primeCurrentBattleSharedCache({ battle: cachedBattle, nowMs: Date.now() });

    const battle = await resolveJoinBattleCandidate({
        requestedBattleId: 'finished-battle',
        getCachedBattleDocById: async () => ({ _id: 'finished-battle', status: 'finished' }),
    });

    assert.equal(battle, cachedBattle);
});
