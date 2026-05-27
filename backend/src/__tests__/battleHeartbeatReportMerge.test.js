const test = require('node:test');
const assert = require('node:assert/strict');

const { createBattleReportMerger } = require('../controllers/battle/heartbeatReportMerge');

function createRuntimeStore(calls) {
    return {
        upsertAttendanceState: async (payload) => {
            calls.push(payload);
        },
    };
}

test('battle heartbeat report merge returns localized message without entry', async () => {
    const { mergeBattleReportIntoAttendanceState } = createBattleReportMerger({
        getAttendanceRuntimeSnapshot: async () => null,
        runtimeStore: createRuntimeStore([]),
        attendanceRuntimeTtlMs: 1000,
    });

    const result = await mergeBattleReportIntoAttendanceState({
        battleId: 'battle-1',
        userId: 'user-1',
        reportSequence: 1,
        report: { damage: 10 },
        lang: 'en',
    });

    assert.deepEqual(result, {
        entry: null,
        accepted: false,
        ignored: false,
        message: 'No participation in battle',
    });
});

test('battle heartbeat report merge requires report sequence', async () => {
    const entry = { user: 'user-1', syncIntervalSeconds: 60 };
    const { mergeBattleReportIntoAttendanceState } = createBattleReportMerger({
        getAttendanceRuntimeSnapshot: async () => entry,
        runtimeStore: createRuntimeStore([]),
        attendanceRuntimeTtlMs: 1000,
    });

    const result = await mergeBattleReportIntoAttendanceState({
        battleId: 'battle-1',
        userId: 'user-1',
        report: { damage: 10 },
    });

    assert.equal(result.entry, entry);
    assert.equal(result.accepted, false);
    assert.equal(result.ignored, false);
    assert.equal(result.message, 'Не указан reportSequence');
});

test('battle heartbeat report merge ignores duplicate or empty reports', async () => {
    const calls = [];
    const entry = {
        user: 'user-1',
        syncIntervalSeconds: 60,
        lastAcceptedReportSequence: 2,
    };
    const { mergeBattleReportIntoAttendanceState } = createBattleReportMerger({
        getAttendanceRuntimeSnapshot: async () => entry,
        runtimeStore: createRuntimeStore(calls),
        attendanceRuntimeTtlMs: 1000,
    });

    assert.deepEqual(await mergeBattleReportIntoAttendanceState({
        battleId: 'battle-1',
        userId: 'user-1',
        reportSequence: 2,
        report: { damage: 10 },
    }), {
        entry,
        accepted: false,
        ignored: true,
    });

    assert.deepEqual(await mergeBattleReportIntoAttendanceState({
        battleId: 'battle-1',
        userId: 'user-1',
        reportSequence: 3,
        report: {},
    }), {
        entry,
        accepted: false,
        ignored: true,
    });

    assert.equal(calls.length, 0);
});

test('battle heartbeat report merge accepts ready report and stores runtime state', async () => {
    const calls = [];
    const entry = {
        user: 'user-1',
        joinedAt: '2026-01-01T00:00:00.000Z',
        syncIntervalSeconds: 60,
        lastAcceptedReportSequence: 2,
        lastClientSyncAt: '2026-01-01T00:00:00.000Z',
        reported: {
            damage: 5,
        },
    };
    const { mergeBattleReportIntoAttendanceState } = createBattleReportMerger({
        getAttendanceRuntimeSnapshot: async () => entry,
        runtimeStore: createRuntimeStore(calls),
        attendanceRuntimeTtlMs: 1234,
    });

    const result = await mergeBattleReportIntoAttendanceState({
        battleId: 'battle-1',
        userId: 'user-1',
        reportSequence: 3,
        report: { damage: 10, lumensSpent: 2 },
    });

    assert.equal(result.accepted, true);
    assert.equal(result.ignored, false);
    assert.equal(result.entry.lastAcceptedReportSequence, 3);
    assert.equal(result.entry.reported.damage, 15);
    assert.equal(result.entry.reported.lumensSpent, 2);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].battleId, 'battle-1');
    assert.equal(calls[0].userId, 'user-1');
    assert.equal(calls[0].ttlMs, 1234);
    assert.equal(calls[0].state, result.entry);
});
