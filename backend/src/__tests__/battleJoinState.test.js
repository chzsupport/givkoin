const test = require('node:test');
const assert = require('node:assert/strict');

const {
    getActiveJoinBattleId,
    isBattleAlreadyEndedForJoin,
    normalizeRequestedBattleId,
} = require('../controllers/battle/joinBattleState');

test('battle join state normalizes requested battle id', () => {
    assert.equal(normalizeRequestedBattleId('  battle-1  '), 'battle-1');
    assert.equal(normalizeRequestedBattleId(null), '');
    assert.equal(normalizeRequestedBattleId(123), '123');
});

test('battle join state returns active join battle id or null', () => {
    assert.equal(getActiveJoinBattleId({ _id: ' battle-1 ' }), 'battle-1');
    assert.equal(getActiveJoinBattleId({ _id: '' }), null);
    assert.equal(getActiveJoinBattleId(null), null);
});

test('battle join state detects ended battle without changing boundary', () => {
    const battle = { endsAt: '2026-01-01T00:10:00.000Z' };

    assert.equal(isBattleAlreadyEndedForJoin({
        battle,
        nowMs: new Date('2026-01-01T00:09:59.000Z').getTime(),
    }), false);

    assert.equal(isBattleAlreadyEndedForJoin({
        battle,
        nowMs: new Date('2026-01-01T00:10:00.000Z').getTime(),
    }), true);

    assert.equal(isBattleAlreadyEndedForJoin({ battle: {}, nowMs: Date.now() }), false);
});
