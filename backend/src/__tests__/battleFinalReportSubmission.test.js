const test = require('node:test');
const assert = require('node:assert/strict');

const {
    buildFinalReportCapacityClaimInput,
    getFinalReportWindowError,
    isFinalDamageAction,
    refreshFinalReportBattleSnapshotIfNeeded,
    shouldIgnoreEmptyFinalReport,
} = require('../controllers/battle/finalReportSubmission');

test('battle final report submission detects final action only', () => {
    assert.equal(isFinalDamageAction('final'), true);
    assert.equal(isFinalDamageAction('click'), false);
    assert.equal(isFinalDamageAction(undefined), false);
});

test('battle final report submission maps window errors without changing text', () => {
    assert.deepEqual(getFinalReportWindowError({ reason: 'missing_end_time' }), {
        status: 400,
        ru: 'Неизвестно время окончания боя',
        en: 'Battle end time missing',
    });
    assert.deepEqual(getFinalReportWindowError({ reason: 'battle_active' }), {
        status: 400,
        ru: 'Бой ещё активен',
        en: 'Battle is still active',
    });
    assert.deepEqual(getFinalReportWindowError({ reason: 'window_closed' }), {
        status: 400,
        ru: 'Окно финального отчёта закрыто',
        en: 'Final report window closed',
    });
    assert.equal(getFinalReportWindowError({ reason: 'ok' }), null);
});

test('battle final report submission keeps capacity defaults stable', () => {
    assert.deepEqual(buildFinalReportCapacityClaimInput({
        battleId: 'battle-1',
        endsAtMs: 1000,
        nowMs: 1500,
        finalConfig: {},
    }), {
        battleId: 'battle-1',
        endsAtMs: 1000,
        nowMs: 1500,
        windowMs: 2000,
        capacity: 2000,
    });

    assert.deepEqual(buildFinalReportCapacityClaimInput({
        battleId: 'battle-2',
        endsAtMs: 1000,
        nowMs: 1500,
        finalConfig: { reportRetryIntervalMs: 3000, reportWindowCapacity: 50 },
    }), {
        battleId: 'battle-2',
        endsAtMs: 1000,
        nowMs: 1500,
        windowMs: 3000,
        capacity: 50,
    });
});

test('battle final report submission refreshes only active snapshot', async () => {
    const battle = { _id: 'battle-1', endsAt: '2026-01-01T00:10:00.000Z' };
    const refreshedBattle = { _id: 'battle-1', endsAt: '2026-01-01T00:11:00.000Z' };
    let calls = 0;

    const refreshed = await refreshFinalReportBattleSnapshotIfNeeded({
        battleId: 'battle-1',
        battle,
        nowMs: new Date('2026-01-01T00:09:00.000Z').getTime(),
        refreshBattleSnapshotIfEndTimeChanged: async (battleId, sourceBattle, payload) => {
            calls += 1;
            assert.equal(battleId, 'battle-1');
            assert.equal(sourceBattle, battle);
            assert.deepEqual(payload, {
                endsAtMs: new Date('2026-01-01T00:10:00.000Z').getTime(),
            });
            return {
                battle: refreshedBattle,
                endsAtMs: new Date('2026-01-01T00:11:00.000Z').getTime(),
            };
        },
    });

    assert.equal(calls, 1);
    assert.equal(refreshed.battle, refreshedBattle);
    assert.equal(refreshed.endsAtMs, new Date('2026-01-01T00:11:00.000Z').getTime());
});

test('battle final report submission does not refresh ended snapshot', async () => {
    const battle = { _id: 'battle-1', endsAt: '2026-01-01T00:10:00.000Z' };
    const snapshot = await refreshFinalReportBattleSnapshotIfNeeded({
        battleId: 'battle-1',
        battle,
        nowMs: new Date('2026-01-01T00:10:00.000Z').getTime(),
        refreshBattleSnapshotIfEndTimeChanged: async () => {
            throw new Error('should not refresh');
        },
    });

    assert.equal(snapshot.battle, battle);
    assert.equal(snapshot.endsAtMs, new Date('2026-01-01T00:10:00.000Z').getTime());
});

test('battle final report submission ignores empty non-final marker report', () => {
    assert.equal(shouldIgnoreEmptyFinalReport({ hasReportPayload: false, finalMarker: false }), true);
    assert.equal(shouldIgnoreEmptyFinalReport({ hasReportPayload: true, finalMarker: false }), false);
    assert.equal(shouldIgnoreEmptyFinalReport({ hasReportPayload: false, finalMarker: true }), false);
});
