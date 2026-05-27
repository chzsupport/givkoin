const test = require('node:test');
const assert = require('node:assert/strict');

const {
    claimBattleFinalReportCapacity,
    clearBattleFinalReportState,
    getBattleFinalReportExpectedCount,
    noteBattleFinalReportAccepted,
} = require('../controllers/battle/finalReportState');

test('battle final report capacity keeps retry window stable', () => {
    clearBattleFinalReportState();
    const battleId = 'final-report-capacity-test';
    const endsAtMs = new Date('2026-01-01T00:00:00.000Z').getTime();

    assert.deepEqual(claimBattleFinalReportCapacity({
        battleId,
        endsAtMs,
        nowMs: endsAtMs + 100,
        windowMs: 1000,
        capacity: 1,
    }), {
        accepted: true,
        retryAfterMs: 0,
    });

    assert.deepEqual(claimBattleFinalReportCapacity({
        battleId,
        endsAtMs,
        nowMs: endsAtMs + 200,
        windowMs: 1000,
        capacity: 1,
    }), {
        accepted: false,
        retryAfterMs: 800,
    });

    assert.deepEqual(claimBattleFinalReportCapacity({
        battleId,
        endsAtMs,
        nowMs: endsAtMs + 1100,
        windowMs: 1000,
        capacity: 1,
    }), {
        accepted: true,
        retryAfterMs: 0,
    });
});

test('battle final report progress keeps unique accepted users', () => {
    clearBattleFinalReportState();
    const battleId = 'final-report-progress-test';

    assert.deepEqual(noteBattleFinalReportAccepted({
        battleId,
        userId: 'u1',
        expectedCount: 2,
        nowMs: 1,
    }), {
        acceptedCount: 1,
        expectedCount: 2,
        complete: false,
    });

    assert.deepEqual(noteBattleFinalReportAccepted({
        battleId,
        userId: 'u1',
        expectedCount: 2,
        nowMs: 2,
    }), {
        acceptedCount: 1,
        expectedCount: 2,
        complete: false,
    });

    assert.deepEqual(noteBattleFinalReportAccepted({
        battleId,
        userId: 'u2',
        expectedCount: 2,
        nowMs: 3,
    }), {
        acceptedCount: 2,
        expectedCount: 2,
        complete: true,
    });
});

test('battle final report expected count keeps old fallback order', () => {
    assert.equal(getBattleFinalReportExpectedCount({
        uniqueAttendanceCount: 3,
        attendanceCount: 5,
        attendance: [{}, {}, {}, {}, {}, {}, {}],
    }), 3);
    assert.equal(getBattleFinalReportExpectedCount({
        uniqueAttendanceCount: 0,
        attendanceCount: 5,
        attendance: [{}, {}, {}, {}, {}, {}, {}],
    }), 5);
    assert.equal(getBattleFinalReportExpectedCount({
        uniqueAttendanceCount: 0,
        attendanceCount: 0,
        attendance: [{}, {}],
    }), 2);
});
