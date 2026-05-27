const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildBattleSnapshotAfterAttendanceJoin,
    buildInitialAttendanceRuntimeEntry,
} = require('../controllers/battle/attendanceRuntime');

test('battle attendance runtime initial entry keeps sync and resource fields stable', () => {
    const joinedAt = new Date('2026-01-01T00:00:00.000Z');
    const entry = buildInitialAttendanceRuntimeEntry({
        userId: 'user-1',
        joinedAt,
        sync: {
            syncSlot: 7,
            syncSlotCount: 60,
            syncIntervalSeconds: 60,
        },
        lumensAtBattleStart: 100,
        kAtBattleStart: 20,
        starsAtBattleStart: 1.5,
    });

    assert.equal(entry.user, 'user-1');
    assert.deepEqual(entry.joinedAt, joinedAt);
    assert.deepEqual(entry.enteredAt, joinedAt);
    assert.deepEqual(entry.sessionJoinedAt, joinedAt);
    assert.equal(entry.damage, 0);
    assert.equal(entry.comboMultiplier, 1);
    assert.equal(entry.syncSlot, 7);
    assert.equal(entry.syncSlotCount, 60);
    assert.equal(entry.syncIntervalSeconds, 60);
    assert.equal(entry.lumensAtBattleStart, 100);
    assert.equal(entry.kAtBattleStart, 20);
    assert.equal(entry.starsAtBattleStart, 1.5);
    assert.ok(entry.reported);
});

test('battle attendance runtime snapshot keeps public battle fields stable', () => {
    const snapshot = buildBattleSnapshotAfterAttendanceJoin({
        battle: {
            _id: 'battle-1',
            status: 'active',
            startsAt: '2026-01-01T00:00:00.000Z',
            firstPlayerJoinedAt: '2026-01-01T00:00:05.000Z',
            durationSeconds: 300,
            attendanceCount: 5,
            endsAt: '2026-01-01T00:05:00.000Z',
            isShrunken: true,
            activeUsersCountSnapshot: 9,
            attendance: [{ user: 'user-1' }],
            scenario: { waves: [] },
            injuries: [{ user: 'user-2' }],
            injury: { user: 'user-3' },
        },
        firstJoinBattle: {
            status: 'active',
            firstPlayerJoinedAt: '2026-01-01T00:00:06.000Z',
            durationSeconds: 240,
            attendanceCount: 6,
            endsAt: '2026-01-01T00:04:06.000Z',
        },
    });

    assert.equal(snapshot._id, 'battle-1');
    assert.equal(snapshot.firstPlayerJoinedAt, '2026-01-01T00:00:06.000Z');
    assert.equal(snapshot.durationSeconds, 240);
    assert.equal(snapshot.attendanceCount, 6);
    assert.equal(snapshot.endsAt, '2026-01-01T00:04:06.000Z');
    assert.equal(snapshot.isShrunken, true);
    assert.equal(snapshot.activeUsersCountSnapshot, 9);
    assert.equal(snapshot.attendance.length, 1);
    assert.equal(snapshot.injuries.length, 1);
});
