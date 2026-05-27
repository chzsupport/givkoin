const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildBattleResourceSnapshot,
    buildUserRowFromRequestUser,
    getUserData,
    isBoostActiveForBattle,
    readDeepValue,
    setDeepValue,
} = require('../controllers/battle/userData');

test('battle user data builds row from request user without changing data shape', () => {
    const row = buildUserRowFromRequestUser({
        _id: 'user-1',
        data: {
            lumens: 100,
            shopBoosts: {},
        },
    });

    assert.equal(row.id, 'user-1');
    assert.equal(row.data.lumens, 100);
    assert.deepEqual(getUserData(row), row.data);
    assert.equal(buildUserRowFromRequestUser({}), null);
});

test('battle user data builds battle resource snapshot with old field names', () => {
    assert.deepEqual(buildBattleResourceSnapshot({
        lumens: 100,
        k: 25,
        stars: 1.5,
    }), {
        lumensAtBattleStart: 100,
        kAtBattleStart: 25,
        starsAtBattleStart: 1.5,
    });

    assert.deepEqual(buildBattleResourceSnapshot({}), {
        lumensAtBattleStart: 0,
        kAtBattleStart: 0,
        starsAtBattleStart: 0,
    });
});

test('battle user data nested helpers read and write paths', () => {
    const data = {};
    setDeepValue(data, 'shopBoosts.battleDamage.pending', true);

    assert.equal(readDeepValue(data, 'shopBoosts.battleDamage.pending'), true);
    assert.equal(readDeepValue(data, 'shopBoosts.missing.pending'), undefined);
});

test('battle boost active check keeps pending and battle id contract', () => {
    assert.equal(isBoostActiveForBattle({ pending: true }, 'battle-1'), true);
    assert.equal(isBoostActiveForBattle({ battleId: 'battle-1' }, 'battle-1'), true);
    assert.equal(isBoostActiveForBattle({ battleId: 'battle-2' }, 'battle-1'), false);
    assert.equal(isBoostActiveForBattle(null, 'battle-1'), false);
});
