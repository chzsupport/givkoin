const test = require('node:test');
const assert = require('node:assert/strict');

const {
    isCurrentBattleFinalWindow,
    shouldFinalizeCurrentBattle,
} = require('../controllers/battle/currentBattleState');

test('battle current state detects active and final window phases', () => {
    const battle = { endsAt: '2026-01-01T00:10:00.000Z' };

    assert.equal(isCurrentBattleFinalWindow({
        battle,
        nowMs: new Date('2026-01-01T00:09:59.000Z').getTime(),
    }), false);

    assert.equal(isCurrentBattleFinalWindow({
        battle,
        nowMs: new Date('2026-01-01T00:10:00.000Z').getTime(),
    }), true);

    assert.equal(isCurrentBattleFinalWindow({ battle: {}, nowMs: Date.now() }), false);
});

test('battle current state keeps finalization timing stable', () => {
    const battle = { endsAt: '2026-01-01T00:10:00.000Z' };
    const finalConfig = { reportAcceptSeconds: 30 };

    assert.equal(shouldFinalizeCurrentBattle({
        battle,
        nowMs: new Date('2026-01-01T00:10:29.000Z').getTime(),
        finalConfig,
    }), false);

    assert.equal(shouldFinalizeCurrentBattle({
        battle,
        nowMs: new Date('2026-01-01T00:10:30.000Z').getTime(),
        finalConfig,
    }), true);
});
