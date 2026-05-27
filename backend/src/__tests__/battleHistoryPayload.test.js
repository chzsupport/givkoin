const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildUserBattleHistoryList,
    getBattleHistorySortTime,
} = require('../controllers/battle/historyPayload');

test('battle history payload keeps only finished battles for user and sorts newest first', () => {
    const list = buildUserBattleHistoryList({
        userId: 'user-1',
        battles: [
            {
                _id: 'active',
                status: 'active',
                endsAt: '2026-01-01T00:10:00.000Z',
                attendance: [{ user: 'user-1', damage: 10 }],
            },
            {
                _id: 'old',
                status: 'finished',
                endsAt: '2026-01-01T00:05:00.000Z',
                lightDamage: 10,
                darknessDamage: 20,
                attendanceCount: 2,
                attendance: [{ user: 'user-1', damage: 7 }],
            },
            {
                _id: 'new',
                status: 'finished',
                endsAt: '2026-01-01T00:20:00.000Z',
                lightDamage: 30,
                darknessDamage: 20,
                attendanceCount: 3,
                attendance: [{ user: 'user-1', damage: 11 }],
            },
            {
                _id: 'other-user',
                status: 'finished',
                endsAt: '2026-01-01T00:30:00.000Z',
                attendance: [{ user: 'user-2', damage: 99 }],
            },
        ],
    });

    assert.deepEqual(list.map((item) => item.battleId), ['new', 'old']);
    assert.equal(list[0].result, 'light');
    assert.equal(list[0].userDamage, 11);
    assert.equal(list[1].result, 'dark');
    assert.equal(list[1].attendanceCount, 2);
});

test('battle history payload supports draw and fallback dates', () => {
    const list = buildUserBattleHistoryList({
        userId: 'user-1',
        battles: [
            {
                _id: 'draw',
                status: 'finished',
                updatedAt: '2026-01-01T00:20:00.000Z',
                createdAt: '2026-01-01T00:00:00.000Z',
                lightDamage: 20,
                darknessDamage: 20,
                attendance: [{ user: 'user-1' }],
            },
        ],
    });

    assert.equal(list[0].endedAt, '2026-01-01T00:20:00.000Z');
    assert.equal(list[0].result, 'draw');
    assert.equal(list[0].userDamage, 0);
});

test('battle history sort time uses updatedAt fallback', () => {
    assert.equal(
        getBattleHistorySortTime({ updatedAt: '2026-01-01T00:00:01.000Z' }),
        new Date('2026-01-01T00:00:01.000Z').getTime()
    );
});
