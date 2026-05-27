const test = require('node:test');
const assert = require('node:assert/strict');

const {
    applyAcceptedFinalReportToEntry,
    applyBattleReportToAttendanceEntry,
    buildFinalReportPreviewEntry,
    buildFinalReportRequestPayload,
    buildFinalReportStoreRecord,
    createEmptyBattleReportedState,
    getAcceptedFinalReportSequence,
    getFinalReportWindowState,
    isBattleReportEmpty,
    isBattleReportReadyForEntry,
    mergeBattleReportedState,
    normalizeBattleReport,
    resolveBattleReportTargetMs,
    shouldIgnoreFinalReportSequence,
} = require('../controllers/battle/reportPayload');

test('battle report payload normalizes counters and lists', () => {
    const normalized = normalizeBattleReport({
        intervalSeconds: 30,
        shotsByWeapon: { weapon1: 2, 2: 3 },
        hitsByWeapon: { weapon1: 1, 2: 2 },
        hits: 3,
        damageDelta: 120,
        sparkIds: ['s1', 's1', 's2'],
        weakZoneHitsById: { z1: 2, z2: -1 },
        voiceResults: [{ id: 'v1', text: 'СТОЙ', acted: 1, success: true }],
        baddieDestroyedIds: ['b1', 'b1'],
    });

    assert.equal(normalized.intervalSeconds, 30);
    assert.deepEqual(normalized.shotsByWeapon, { 1: 2, 2: 3, 3: 0 });
    assert.deepEqual(normalized.hitsByWeapon, { 1: 1, 2: 2, 3: 0 });
    assert.equal(normalized.damage, 120);
    assert.deepEqual(normalized.sparkIds, ['s1', 's2']);
    assert.deepEqual(normalized.weakZoneHitsById, { z1: 2 });
    assert.deepEqual(normalized.voiceResults, [{ id: 'v1', text: 'СТОЙ', acted: true, success: true }]);
    assert.deepEqual(normalized.baddieDestroyedIds, ['b1']);
});

test('battle report payload emptiness keeps final marker logic stable', () => {
    assert.equal(isBattleReportEmpty(createEmptyBattleReportedState(60)), true);
    assert.equal(isBattleReportEmpty({ damageDelta: 1 }), false);
    assert.equal(isBattleReportEmpty({ sparkIds: ['s1'] }), false);
});

test('battle report payload merge and entry application keep old fields', () => {
    const merged = mergeBattleReportedState({
        damage: 100,
        hits: 1,
        sparkIds: ['s1'],
    }, {
        damageDelta: 200,
        hits: 2,
        sparkIds: ['s1', 's2'],
        baddieDamage: 3,
    });

    assert.equal(merged.damage, 300);
    assert.equal(merged.hits, 3);
    assert.deepEqual(merged.sparkIds, ['s1', 's2']);

    const entry = applyBattleReportToAttendanceEntry({
        user: 'u1',
        joinedAt: '2026-01-01T00:00:00.000Z',
        lastAcceptedReportSequence: 1,
        reported: { damage: 100, hits: 1 },
    }, {
        damageDelta: 50,
        hits: 1,
    }, {
        reportSequence: 2,
        receivedAt: '2026-01-01T00:01:00.000Z',
        markFinal: true,
    });

    assert.equal(entry.damage, 150);
    assert.equal(entry.totalHits, 2);
    assert.equal(entry.lastAcceptedReportSequence, 2);
    assert.equal(entry.lastClientSyncAt, '2026-01-01T00:01:00.000Z');
    assert.equal(entry.finalReportAt, '2026-01-01T00:01:00.000Z');
});

test('battle report payload readiness keeps sync slot timing stable', () => {
    const entry = {
        joinedAt: '2026-01-01T00:00:00.000Z',
        syncIntervalSeconds: 60,
        syncSlotCount: 60,
        syncSlot: 10,
        lastAcceptedReportSequence: 0,
    };

    assert.equal(
        resolveBattleReportTargetMs(entry, 0),
        new Date('2026-01-01T00:01:10.000Z').getTime()
    );
    assert.equal(isBattleReportReadyForEntry(entry, '2026-01-01T00:01:08.400Z'), false);
    assert.equal(isBattleReportReadyForEntry(entry, '2026-01-01T00:01:08.500Z'), true);
});

test('battle final report preview marks payload source correctly', () => {
    const entry = {
        user: 'u1',
        damage: 10,
        lastAcceptedReportSequence: 1,
        reported: createEmptyBattleReportedState(60),
    };
    const report = normalizeBattleReport({ damage: 5, totalShots: 1 }, 60);
    const preview = buildFinalReportPreviewEntry({
        attendanceEntry: entry,
        hasReportPayload: true,
        normalizedReport: report,
        reportSequence: 2,
        acceptedAt: '2026-01-01T00:00:00.000Z',
    });

    assert.equal(preview.finalReportHasPayload, true);
    assert.equal(preview.personalDataSource, 'final_report');
    assert.equal(preview.lastAcceptedReportSequence, 2);
    assert.equal(preview.damage, 5);
});

test('battle final report preview falls back to last heartbeat without payload', () => {
    const preview = buildFinalReportPreviewEntry({
        attendanceEntry: {
            user: 'u1',
            damage: 10,
            lastClientSyncAt: '2026-01-01T00:00:00.000Z',
        },
        hasReportPayload: false,
        normalizedReport: null,
        reportSequence: 2,
        acceptedAt: '2026-01-01T00:00:01.000Z',
    });

    assert.equal(preview.finalReportAt, '2026-01-01T00:00:01.000Z');
    assert.equal(preview.finalReportHasPayload, false);
    assert.equal(preview.personalDataSource, 'last_heartbeat');
});

test('battle accepted final report only applies newer sequence', () => {
    const entry = {
        user: 'u1',
        damage: 10,
        lastAcceptedReportSequence: 3,
        reported: createEmptyBattleReportedState(60),
    };

    const oldResult = applyAcceptedFinalReportToEntry(entry, {
        reportSequence: 2,
        report: normalizeBattleReport({ damage: 5 }, 60),
    });
    assert.equal(oldResult, entry);

    const next = applyAcceptedFinalReportToEntry(entry, {
        reportSequence: 4,
        acceptedAt: '2026-01-01T00:00:00.000Z',
        report: normalizeBattleReport({ damage: 5 }, 60),
    });
    assert.equal(next.damage, 5);
    assert.equal(next.lastAcceptedReportSequence, 4);
});

test('battle final report store record keeps saved shape stable', () => {
    const report = normalizeBattleReport({ damage: 5 }, 60);
    const record = buildFinalReportStoreRecord({
        battleId: 123,
        userId: 456,
        reportSequence: '7',
        normalizedReport: report,
        hasReportPayload: true,
        acceptedAt: '2026-01-01T00:00:00.000Z',
        attendanceEntry: { lastAcceptedReportSequence: 3 },
    });

    assert.deepEqual(record, {
        battleId: '123',
        userId: '456',
        reportSequence: 7,
        report,
        acceptedAt: '2026-01-01T00:00:00.000Z',
        hasPayload: true,
        lastAcceptedReportSequence: 3,
    });
});

test('battle final report request payload keeps sequence and empty marker behavior', () => {
    const withPayload = buildFinalReportRequestPayload({
        requestBody: {
            reportSequence: '7',
            finalMarker: false,
            report: { damage: 50 },
        },
        attendanceEntry: { syncIntervalSeconds: 30 },
    });

    assert.equal(withPayload.safeSequence, 7);
    assert.equal(withPayload.finalMarker, false);
    assert.equal(withPayload.hasReportPayload, true);
    assert.equal(withPayload.normalizedReport.intervalSeconds, 30);
    assert.equal(withPayload.normalizedReport.damage, 50);

    const markerOnly = buildFinalReportRequestPayload({
        requestBody: {
            reportSequence: 8,
            finalMarker: true,
            report: {},
        },
        attendanceEntry: {},
    });

    assert.equal(markerOnly.safeSequence, 8);
    assert.equal(markerOnly.finalMarker, true);
    assert.equal(markerOnly.hasReportPayload, false);
});

test('battle final report sequence helpers keep duplicate report behavior', () => {
    assert.equal(getAcceptedFinalReportSequence({ reportSequence: '5' }), 5);
    assert.equal(
        shouldIgnoreFinalReportSequence({
            existingFinalReport: { reportSequence: 5 },
            reportSequence: 5,
        }),
        true
    );
    assert.equal(
        shouldIgnoreFinalReportSequence({
            existingFinalReport: { reportSequence: 4 },
            reportSequence: 5,
        }),
        false
    );
});

test('battle final report window state keeps old accept window behavior', () => {
    const finalConfig = { reportAcceptSeconds: 30 };

    assert.deepEqual(
        getFinalReportWindowState({
            battle: {},
            finalConfig,
            nowMs: new Date('2026-01-01T00:00:00.000Z').getTime(),
        }),
        {
            ok: false,
            reason: 'missing_end_time',
            endsAtMs: NaN,
            reportAcceptEndsAtMs: NaN,
        }
    );

    assert.equal(getFinalReportWindowState({
        battle: { endsAt: '2026-01-01T00:00:10.000Z' },
        finalConfig,
        nowMs: new Date('2026-01-01T00:00:09.000Z').getTime(),
    }).reason, 'battle_active');

    assert.equal(getFinalReportWindowState({
        battle: { endsAt: '2026-01-01T00:00:10.000Z' },
        finalConfig,
        nowMs: new Date('2026-01-01T00:00:20.000Z').getTime(),
    }).reason, 'open');

    assert.equal(getFinalReportWindowState({
        battle: { endsAt: '2026-01-01T00:00:10.000Z' },
        finalConfig,
        nowMs: new Date('2026-01-01T00:00:41.000Z').getTime(),
    }).reason, 'window_closed');
});
