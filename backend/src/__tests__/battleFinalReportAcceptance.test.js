const test = require('node:test');
const assert = require('node:assert/strict');

const { acceptBattleFinalReport } = require('../controllers/battle/finalReportAcceptance');
const { normalizeBattleReport } = require('../controllers/battle/reportPayload');

test('battle final report acceptance saves report and publishes preview summary', async () => {
    const calls = {
        saved: null,
        published: null,
        noted: null,
    };
    const battle = { _id: 'battle-accept', attendanceCount: 3 };
    const attendanceEntry = {
        user: 'user-1',
        damage: 10,
        lastAcceptedReportSequence: 2,
    };
    const normalizedReport = normalizeBattleReport({ damage: 50 }, 60);
    const nowMs = new Date('2026-01-01T00:00:30.000Z').getTime();

    const result = await acceptBattleFinalReport({
        battle,
        battleId: 'battle-accept',
        userId: 'user-1',
        attendanceEntry,
        normalizedReport,
        hasReportPayload: true,
        reportSequence: 3,
        nowMs,
        runtimeStore: {
            upsertFinalReport: async (payload) => {
                calls.saved = payload;
            },
        },
        publishSummary: async (payload) => {
            calls.published = payload;
        },
        getExpectedFinalReportCount: () => 3,
        noteAccepted: (payload) => {
            calls.noted = payload;
        },
    });

    assert.equal(result.acceptedAtIso, '2026-01-01T00:00:30.000Z');
    assert.equal(result.expectedFinalReportCount, 3);
    assert.equal(result.previewEntry.finalReportHasPayload, true);
    assert.equal(result.previewEntry.damage, 50);

    assert.equal(calls.saved.battleId, 'battle-accept');
    assert.equal(calls.saved.userId, 'user-1');
    assert.equal(calls.saved.report.reportSequence, 3);
    assert.equal(calls.saved.report.hasPayload, true);

    assert.equal(calls.published.battle, battle);
    assert.equal(calls.published.userId, 'user-1');
    assert.equal(calls.published.attendanceCount, 3);
    assert.equal(calls.published.detailReady, false);
    assert.equal(calls.published.updatedAt, '2026-01-01T00:00:30.000Z');

    assert.deepEqual(calls.noted, {
        battleId: 'battle-accept',
        userId: 'user-1',
        expectedCount: 3,
        nowMs,
    });
});
