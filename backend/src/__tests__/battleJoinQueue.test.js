const test = require('node:test');
const assert = require('node:assert/strict');

const {
    clearBattleJoinQueueState,
    releaseBattleJoinSlot,
    reserveBattleJoinSlot,
} = require('../controllers/battle/joinQueue');

test('battle join queue keeps first batch immediate and later batches delayed', () => {
    clearBattleJoinQueueState();
    const battleId = 'join-queue-delay-test';

    assert.deepEqual(reserveBattleJoinSlot({
        battleId,
        userId: 'u1',
        nowMs: 1000,
    }), {
        queued: false,
        retryAfterMs: 0,
        batchSize: 100,
        waitingCount: 1,
    });

    let lastResult = null;
    for (let index = 2; index <= 101; index += 1) {
        lastResult = reserveBattleJoinSlot({
            battleId,
            userId: `u${index}`,
            nowMs: 1000,
        });
    }

    assert.deepEqual(lastResult, {
        queued: true,
        retryAfterMs: 2000,
        batchSize: 100,
        waitingCount: 101,
    });
});

test('battle join queue release clears empty queue', () => {
    clearBattleJoinQueueState();
    const battleId = 'join-queue-release-test';

    reserveBattleJoinSlot({ battleId, userId: 'u1', nowMs: 1000 });
    releaseBattleJoinSlot({ battleId, userId: 'u1' });

    assert.deepEqual(reserveBattleJoinSlot({
        battleId,
        userId: 'u1',
        nowMs: 5000,
    }), {
        queued: false,
        retryAfterMs: 0,
        batchSize: 100,
        waitingCount: 1,
    });
});
