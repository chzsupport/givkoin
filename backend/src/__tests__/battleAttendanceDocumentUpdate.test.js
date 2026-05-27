const test = require('node:test');
const assert = require('node:assert/strict');

const {
    applyAttendanceUpdate,
    createBattleAttendanceDocumentUpdater,
    deepClone,
    setByPath,
} = require('../controllers/battle/attendanceDocumentUpdate');

test('battle attendance document update applies inc set and addToSet to attendance', () => {
    const entry = {
        damage: 10,
        reported: { totalHits: 1 },
        knownIds: ['a'],
    };

    const next = applyAttendanceUpdate(entry, {
        $inc: {
            'attendance.$.damage': 5,
        },
        $set: {
            'attendance.$.reported.totalHits': 2,
        },
        $addToSet: {
            'attendance.$.knownIds': { $each: ['a', 'b'] },
        },
    });

    assert.equal(next.damage, 15);
    assert.equal(next.reported.totalHits, 2);
    assert.deepEqual(next.knownIds, ['a', 'b']);
    assert.equal(entry.damage, 10);
    assert.equal(entry.reported.totalHits, 1);
});

test('battle attendance document updater keeps old battle update contract', async () => {
    const sourceBattle = {
        _id: 'battle-1',
        lightDamage: 10,
        meta: { status: 'old' },
        attendance: [
            { user: 'user-1', damage: 1 },
            { user: 'user-2', damage: 2 },
        ],
    };
    let savedBattle = null;
    const { applyBattleAttendanceUpdateByUser } = createBattleAttendanceDocumentUpdater({
        getBattleDocById: async () => sourceBattle,
        updateBattleDocById: async (_battleId, nextBattle) => {
            savedBattle = nextBattle;
            return nextBattle;
        },
    });

    const updated = await applyBattleAttendanceUpdateByUser({
        battleId: 'battle-1',
        userId: 'user-2',
        payload: {
            $inc: {
                lightDamage: 5,
                'attendance.$.damage': 7,
            },
            $set: {
                'meta.status': 'new',
                'attendance.$.lastClientSyncAt': 'now',
            },
        },
    });

    assert.equal(updated.lightDamage, 15);
    assert.equal(updated.meta.status, 'new');
    assert.equal(updated.attendance[0].damage, 1);
    assert.equal(updated.attendance[1].damage, 9);
    assert.equal(updated.attendance[1].lastClientSyncAt, 'now');
    assert.equal(savedBattle, updated);
});

test('battle attendance document updater returns null without matching user', async () => {
    const { applyBattleAttendanceUpdateByUser } = createBattleAttendanceDocumentUpdater({
        getBattleDocById: async () => ({ attendance: [{ user: 'user-1' }] }),
        updateBattleDocById: async () => {
            throw new Error('should not save');
        },
    });

    const updated = await applyBattleAttendanceUpdateByUser({
        battleId: 'battle-1',
        userId: 'missing-user',
        payload: { $inc: { 'attendance.$.damage': 1 } },
    });

    assert.equal(updated, null);
});

test('battle attendance document update path helpers keep nested data independent', () => {
    const target = {};
    setByPath(target, 'a.b.c', 1);
    const cloned = deepClone(target);
    cloned.a.b.c = 2;

    assert.equal(target.a.b.c, 1);
    assert.equal(cloned.a.b.c, 2);
});
