const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createBattleDocumentCache,
    normalizeCacheKey,
} = require('../controllers/battle/battleDocumentCache');

test('battle document cache normalizes ids without changing string contract', () => {
    assert.equal(normalizeCacheKey(' battle-1 '), 'battle-1');
    assert.equal(normalizeCacheKey(null), '');
});

test('battle document cache returns active heartbeat snapshot from cache', async () => {
    let reads = 0;
    const cache = createBattleDocumentCache({
        heartbeatTtlMs: 10000,
        getBattleDocById: async () => {
            reads += 1;
            return { _id: 'battle-1', status: 'active' };
        },
    });

    const first = await cache.getHeartbeatBattleSnapshot('battle-1');
    const second = await cache.getHeartbeatBattleSnapshot('battle-1');

    assert.equal(reads, 1);
    assert.equal(first, second);
    assert.equal(second.status, 'active');
});

test('battle document cache keeps finished summary separate from heartbeat', async () => {
    let reads = 0;
    const cache = createBattleDocumentCache({
        summaryTtlMs: 10000,
        getBattleDocById: async () => {
            reads += 1;
            return { _id: 'battle-2', status: 'finished' };
        },
    });

    const first = await cache.getSummaryBattleSnapshot('battle-2');
    const second = await cache.getCachedBattleDocById('battle-2');

    assert.equal(reads, 1);
    assert.equal(first, second);
    assert.equal(second.status, 'finished');
});

test('battle document cache reuses one refresh promise for parallel reads', async () => {
    let reads = 0;
    const cache = createBattleDocumentCache({
        getBattleDocById: async () => {
            reads += 1;
            await new Promise((resolve) => setTimeout(resolve, 5));
            return { _id: 'battle-3', status: 'active' };
        },
    });

    const [first, second] = await Promise.all([
        cache.getCachedBattleDocById('battle-3'),
        cache.getCachedBattleDocById('battle-3'),
    ]);

    assert.equal(reads, 1);
    assert.equal(first, second);
    assert.equal(first.status, 'active');
});

test('battle document cache refreshes stale heartbeat when fresh battle is active', async () => {
    let current = { _id: 'battle-4', status: 'finished' };
    const cache = createBattleDocumentCache({
        getBattleDocById: async () => current,
    });

    await cache.getHeartbeatBattleSnapshot('battle-4');
    current = { _id: 'battle-4', status: 'active' };

    const active = await cache.getActiveHeartbeatBattleSnapshot('battle-4');

    assert.equal(active.status, 'active');
});

test('battle document cache refreshes battle when end time changed', async () => {
    let current = { _id: 'battle-5', status: 'active', endsAt: '2026-01-01T00:01:00.000Z' };
    const cache = createBattleDocumentCache({
        getBattleDocById: async () => current,
    });

    const oldBattle = current;
    current = { _id: 'battle-5', status: 'active', endsAt: '2026-01-01T00:02:00.000Z' };
    const refreshed = await cache.refreshBattleSnapshotIfEndTimeChanged('battle-5', oldBattle, {
        endsAtMs: new Date('2026-01-01T00:01:00.000Z').getTime(),
    });

    assert.equal(refreshed.refreshed, true);
    assert.equal(refreshed.battle, current);
    assert.equal(refreshed.endsAtMs, new Date('2026-01-01T00:02:00.000Z').getTime());
});

test('battle document cache keeps battle when end time did not change', async () => {
    const current = { _id: 'battle-6', status: 'active', endsAt: '2026-01-01T00:01:00.000Z' };
    const cache = createBattleDocumentCache({
        getBattleDocById: async () => current,
    });

    const refreshed = await cache.refreshBattleSnapshotIfEndTimeChanged('battle-6', current, {
        endsAtMs: new Date('2026-01-01T00:01:00.000Z').getTime(),
    });

    assert.equal(refreshed.refreshed, false);
    assert.equal(refreshed.battle, current);
});
