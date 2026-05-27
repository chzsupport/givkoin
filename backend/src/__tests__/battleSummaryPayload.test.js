const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildBattleFallbackSummarySnapshot,
    buildBattleSummaryPendingPayload,
    findBattleAttendanceEntry,
    getBattleEndsAtMs,
    getBattleReportAcceptEndsAtMs,
    isBattleSummaryPending,
    shouldFinalizeBeforeSummary,
} = require('../controllers/battle/summaryPayload');

test('battle summary payload finds participant by old user field contract', () => {
    const entry = { user: 123, damage: 10 };
    const battle = {
        attendance: [
            { user: 'other', damage: 1 },
            entry,
        ],
    };

    assert.equal(findBattleAttendanceEntry(battle, '123'), entry);
    assert.equal(findBattleAttendanceEntry(battle, 'missing'), null);
    assert.equal(findBattleAttendanceEntry(null, '123'), null);
});

test('battle summary payload keeps pending response shape stable', () => {
    assert.deepEqual(
        buildBattleSummaryPendingPayload({
            battle: { _id: 'battle-1' },
            battleId: 'fallback',
        }),
        {
            ok: false,
            pending: true,
            battleId: 'battle-1',
            retryAfterMs: 1000,
        }
    );
});

test('battle summary payload builds fallback snapshot with accepted final report', () => {
    const summary = buildBattleFallbackSummarySnapshot({
        battle: {
            _id: 'battle-summary-fallback',
            status: 'finished',
            attendance: [],
        },
        entry: {
            user: 'user-1',
            damage: 10,
            lastAcceptedReportSequence: 1,
        },
        acceptedFinalReport: {
            reportSequence: 2,
            acceptedAt: '2026-01-01T00:00:00.000Z',
            report: {
                damage: 25,
                damageDelta: 25,
                hits: 3,
            },
        },
    });

    assert.equal(summary.battleId, 'battle-summary-fallback');
    assert.equal(summary.userDamage, 25);
    assert.equal(summary.detailsPending, true);
});

test('battle summary payload keeps final window timing checks stable', () => {
    const battle = { endsAt: '2026-01-01T00:00:00.000Z' };
    const finalConfig = { reportAcceptSeconds: 30 };

    assert.equal(getBattleEndsAtMs(battle), new Date('2026-01-01T00:00:00.000Z').getTime());
    assert.equal(getBattleReportAcceptEndsAtMs({ battle, finalConfig }), new Date('2026-01-01T00:00:30.000Z').getTime());
    assert.equal(isBattleSummaryPending({ battle, nowMs: new Date('2025-12-31T23:59:59.000Z').getTime() }), true);
    assert.equal(isBattleSummaryPending({ battle, nowMs: new Date('2026-01-01T00:00:00.000Z').getTime() }), false);
    assert.equal(shouldFinalizeBeforeSummary({
        battle,
        nowMs: new Date('2026-01-01T00:00:30.000Z').getTime(),
        finalConfig,
    }), true);
});
