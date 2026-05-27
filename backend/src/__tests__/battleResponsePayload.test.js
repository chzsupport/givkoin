const test = require('node:test');
const assert = require('node:assert/strict');

const {
    attachBattleRewardBoost,
    buildBattleHeartbeatEndedResponsePayload,
    buildBattleHeartbeatResponsePayload,
    buildBattleHeartbeatTimingPayload,
    buildBattleJoinQueuedResponsePayload,
    buildBattleJoinResponsePayload,
    buildBattleJoinTimingPayload,
    buildBattlePersonalStatePayload,
    buildBattleSummaryApiPayload,
    buildBattleSummaryTimingPayload,
    buildCurrentBattleActiveResponsePayload,
    buildCurrentBattleFinalWindowResponsePayload,
    buildFinalReportAcceptedResponse,
    buildFinalReportEmptyIgnoredResponse,
    buildFinalReportIgnoredResponse,
    buildFinalReportLimitedResponse,
    clearBattleJoinPayloadCache,
    getBattleJoinSharedPayload,
    parseBattleJoinedAt,
    serializeBattleForClient,
} = require('../controllers/battle/responsePayload');

test('battle response payload keeps public battle fields stable', () => {
    clearBattleJoinPayloadCache();
    const battle = {
        _id: 'battle-response-test',
        status: 'active',
        durationSeconds: 120,
        attendanceCount: 7,
        injuries: [{ branchName: 'north' }],
        injury: { branchName: 'north' },
        scenario: {
            version: 2,
            durationSeconds: 120,
            sparkRewardLumens: 5,
            baddieDamagePerTick: 3,
            baddieDamageIntervalMs: 1000,
            weakZones: [{ id: 'w1' }],
            voiceCommands: [{ id: 'v1' }],
            sparks: [{ id: 's1' }],
            baddieWaves: [{ id: 'b1' }],
        },
    };

    assert.deepEqual(serializeBattleForClient(battle), {
        _id: 'battle-response-test',
        status: 'active',
        durationSeconds: 120,
        attendanceCount: 7,
        injuries: [{ branchName: 'north' }],
        injury: { branchName: 'north' },
    });

    const sharedPayload = getBattleJoinSharedPayload(battle);
    assert.deepEqual(sharedPayload.scenario, {
        version: 2,
        durationSeconds: 120,
        sparkRewardLumens: 5,
        baddieDamagePerTick: 3,
        baddieDamageIntervalMs: 1000,
        weakZones: [{ id: 'w1' }],
        voiceCommands: [{ id: 'v1' }],
        sparks: [{ id: 's1' }],
        baddieWaves: [{ id: 'b1' }],
    });
    assert.equal(getBattleJoinSharedPayload(battle), sharedPayload);
});

test('battle personal response payload keeps confirmed resources stable', () => {
    const personal = buildBattlePersonalStatePayload({
        joinedAt: '2026-01-01T00:00:00.000Z',
        sessionJoinedAt: '2026-01-01T00:00:01.000Z',
        damage: 0,
        lumensAtBattleStart: 100,
        kAtBattleStart: 5,
        starsAtBattleStart: 0.25,
        lastAcceptedReportSequence: 3,
        lastClientSyncAt: '2026-01-01T00:02:00.000Z',
        reported: {
            damage: 250,
            lumensGained: 20,
            lumensSpent: 5,
        },
    });

    assert.deepEqual(personal, {
        joinedAt: '2026-01-01T00:00:01.000Z',
        confirmedDamage: 250,
        confirmedLumens: 115,
        startLumens: 100,
        startK: 5,
        startStars: 0.25,
        lastAcceptedReportSequence: 3,
        lastClientSyncAt: '2026-01-01T00:02:00.000Z',
    });
});

test('current battle active response payload keeps old public shape stable', () => {
    const payload = buildCurrentBattleActiveResponsePayload({
        battle: {
            _id: 'battle-current',
            status: 'active',
            durationSeconds: 120,
            attendanceCount: 5,
            endsAt: '2026-01-01T00:02:00.000Z',
        },
        attendanceEntry: {
            joinedAt: '2026-01-01T00:00:00.000Z',
            sessionJoinedAt: '2026-01-01T00:00:01.000Z',
        },
        personalState: { confirmedDamage: 10 },
        nowMs: new Date('2026-01-01T00:01:00.000Z').getTime(),
    });

    assert.equal(payload.status, 'active');
    assert.equal(payload.battle._id, 'battle-current');
    assert.equal(payload.battle.status, 'active');
    assert.equal(payload.battle.durationSeconds, 120);
    assert.equal(payload.battle.attendanceCount, 5);
    assert.equal(payload.battle.serverNowMs, new Date('2026-01-01T00:01:00.000Z').getTime());
    assert.equal(payload.battle.joinedAt, '2026-01-01T00:00:01.000Z');
    assert.deepEqual(payload.battle.personalState, { confirmedDamage: 10 });
    assert.equal(payload.battle.timeLeftMs, 60000);
});

test('current battle final window response payload keeps old public shape stable', () => {
    const payload = buildCurrentBattleFinalWindowResponsePayload({
        battle: {
            _id: 'battle-final-window',
            status: 'active',
            durationSeconds: 120,
            attendanceCount: 5,
            endsAt: '2026-01-01T00:02:00.000Z',
        },
        attendanceEntry: {
            joinedAt: '2026-01-01T00:00:00.000Z',
        },
        personalState: { confirmedDamage: 20 },
        nowMs: new Date('2026-01-01T00:02:10.000Z').getTime(),
    });

    assert.equal(payload.status, 'final_window');
    assert.equal(payload.battle._id, 'battle-final-window');
    assert.equal(payload.battle.serverNowMs, new Date('2026-01-01T00:02:10.000Z').getTime());
    assert.equal(payload.battle.joinedAt, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(payload.battle.personalState, { confirmedDamage: 20 });
    assert.equal(Number.isFinite(payload.battle.finalWindowTimeLeftMs), true);
    assert.equal(typeof payload.battle.finalReportAcceptSeconds, 'number');
});

test('battle join response payload keeps old join fields stable', () => {
    const payload = buildBattleJoinResponsePayload({
        battle: {
            _id: 'battle-1',
            durationSeconds: 1800,
            attendanceCount: 7,
        },
        attendanceEntry: {
            joinedAt: '2026-01-01T00:00:00.000Z',
            sessionJoinedAt: '2026-01-01T00:00:01.000Z',
            syncSlot: 5,
            syncSlotCount: 60,
            syncIntervalSeconds: 30,
        },
        personalState: { confirmedDamage: 10 },
        joinedAt: 'fallback',
        serverNowMs: 123,
        battleStartsAtMs: 1000,
        timeLeftMs: 5000,
        sharedPayload: { scenario: { version: 1 } },
    });

    assert.equal(payload.ok, true);
    assert.equal(payload.battleId, 'battle-1');
    assert.equal(payload.serverNowMs, 123);
    assert.equal(payload.joinedAt, '2026-01-01T00:00:01.000Z');
    assert.deepEqual(payload.personalState, { confirmedDamage: 10 });
    assert.equal(payload.durationSeconds, 1800);
    assert.equal(payload.battleStartsAtMs, 1000);
    assert.equal(payload.timeLeftMs, 5000);
    assert.equal(payload.attendanceCount, 7);
    assert.equal(payload.syncSlot, 5);
    assert.equal(payload.syncSlotCount, 60);
    assert.equal(payload.syncIntervalSeconds, 30);
    assert.deepEqual(payload.scenario, { version: 1 });
    assert.equal(typeof payload.finalReportRetryIntervalMs, 'number');
});

test('battle join response payload keeps sync fallbacks stable', () => {
    const payload = buildBattleJoinResponsePayload({
        battle: { _id: 'battle-2' },
        attendanceEntry: {},
    });

    assert.equal(payload.durationSeconds, 3600);
    assert.equal(payload.attendanceCount, 0);
    assert.equal(payload.syncSlot, 0);
    assert.equal(payload.syncSlotCount, 60);
    assert.equal(payload.syncIntervalSeconds, 60);
});

test('battle join queued response payload keeps old queue fields stable', () => {
    assert.deepEqual(buildBattleJoinQueuedResponsePayload({
        joinSlot: { retryAfterMs: 1234 },
        battle: {
            _id: 'battle-queued',
            durationSeconds: 1800,
            attendanceCount: 12,
        },
    }), {
        ok: true,
        queued: true,
        retryAfterMs: 1234,
        battleId: 'battle-queued',
        durationSeconds: 1800,
        attendanceCount: 12,
    });
});

test('battle join date parsing keeps invalid client time harmless', () => {
    const fallback = new Date('2026-01-01T00:00:00.000Z');
    assert.equal(parseBattleJoinedAt('2026-01-01T00:01:00.000Z', fallback).toISOString(), '2026-01-01T00:01:00.000Z');
    assert.equal(parseBattleJoinedAt('bad-date', fallback), fallback);
    assert.equal(parseBattleJoinedAt(null, fallback), fallback);
});

test('battle join timing payload keeps old time fields stable', () => {
    assert.deepEqual(buildBattleJoinTimingPayload({
        battle: {
            durationSeconds: 60,
            endsAt: '2026-01-01T00:01:00.000Z',
        },
        nowMs: new Date('2026-01-01T00:00:10.000Z').getTime(),
    }), {
        battleDurationSeconds: 60,
        battleStartsAtMs: new Date('2026-01-01T00:00:00.000Z').getTime(),
        timeLeftMs: 50000,
    });

    assert.deepEqual(buildBattleJoinTimingPayload({
        battle: { durationSeconds: 120 },
        nowMs: 1,
    }), {
        battleDurationSeconds: 120,
        battleStartsAtMs: null,
        timeLeftMs: 120000,
    });
});

test('battle heartbeat response payload keeps old heartbeat fields stable', () => {
    const payload = buildBattleHeartbeatResponsePayload({
        serverNowMs: 123,
        timeLeftMs: 456,
        attendanceCount: 7,
        acceptedReport: 1,
        ignoredReport: 0,
        personalEntry: {
            damage: 10,
            lumensAtBattleStart: 100,
            reported: { damage: 5 },
        },
        fallbackUser: { lumens: 50 },
    });

    assert.equal(payload.ok, true);
    assert.equal(payload.serverNowMs, 123);
    assert.equal(payload.timeLeftMs, 456);
    assert.equal(payload.attendanceCount, 7);
    assert.equal(payload.acceptedReport, true);
    assert.equal(payload.ignoredReport, false);
    assert.equal(payload.personalState.confirmedDamage, 10);
});

test('battle heartbeat timing payload keeps old end-time behavior stable', () => {
    const nowMs = new Date('2026-01-01T00:00:10.000Z').getTime();

    assert.deepEqual(buildBattleHeartbeatTimingPayload({
        battle: { endsAt: '2026-01-01T00:00:40.000Z' },
        nowMs,
    }), {
        battleEnded: false,
        timeLeftMs: 30000,
    });

    assert.deepEqual(buildBattleHeartbeatTimingPayload({
        battle: { endsAt: '2026-01-01T00:00:10.000Z' },
        nowMs,
    }), {
        battleEnded: true,
        timeLeftMs: 0,
    });

    assert.deepEqual(buildBattleHeartbeatTimingPayload({
        battle: {},
        nowMs,
    }), {
        battleEnded: false,
        timeLeftMs: 0,
    });
});

test('battle heartbeat ended response payload keeps old conflict shape stable', () => {
    assert.deepEqual(buildBattleHeartbeatEndedResponsePayload(), {
        ok: false,
        battleEnded: true,
        timeLeftMs: 0,
    });
});

test('battle final report response payloads keep old shapes stable', () => {
    assert.deepEqual(buildFinalReportEmptyIgnoredResponse(), {
        ok: true,
        accepted: false,
        ignored: true,
    });
    assert.deepEqual(buildFinalReportIgnoredResponse(), {
        ok: true,
        accepted: false,
        ignored: true,
        retryAfterMs: 0,
    });
    assert.deepEqual(buildFinalReportLimitedResponse({ retryAfterMs: 100 }), {
        ok: true,
        accepted: false,
        ignored: false,
        limited: true,
        retryAfterMs: 250,
    });
    assert.deepEqual(buildFinalReportAcceptedResponse(), {
        ok: true,
        accepted: true,
        ignored: false,
        retryAfterMs: 0,
    });
});

test('battle summary response payload keeps localized lines and retry fields', () => {
    const payload = buildBattleSummaryApiPayload({
        battleId: 'summary-battle',
        introTextByLocale: { ru: 'Итог', en: 'Summary' },
        screenStage: 'streaming',
        isComplete: false,
        personalDataSource: 'final_report',
        personalDataSourceLabelByLocale: { ru: 'Финальный отчёт', en: 'Final report' },
        result: 'light',
        userDamage: 123,
        rewardK: 11,
        detailsPending: true,
        detailsRetryAfterMs: 500,
        detailsReadyAt: '2026-01-01T00:00:00.000Z',
        durationSeconds: 60,
        totalLightDamage: 1000,
        totalDarkDamage: 900,
        attendanceCount: 4,
        bestPlayer: { nickname: 'Best' },
        injury: { branchName: 'north' },
        awardedAchievements: ['1', 'x', 2],
        lines: [{
            key: 'damage',
            labelByLocale: { ru: 'Урон', en: 'Damage' },
            state: 'ready',
            valueTextByLocale: { ru: '123', en: '123' },
        }],
    });

    assert.equal(payload.ok, true);
    assert.equal(payload.battleId, 'summary-battle');
    assert.equal(payload.introText, 'Итог');
    assert.equal(payload.isComplete, false);
    assert.equal(payload.detailsRetryAfterMs, 1000);
    assert.equal(payload.detailsReadyAtMs, new Date('2026-01-01T00:00:00.000Z').getTime());
    assert.deepEqual(payload.awardedAchievements, [1, 2]);
    assert.deepEqual(payload.lines[0], {
        key: 'damage',
        label: 'Урон',
        labelByLocale: { ru: 'Урон', en: 'Damage' },
        state: 'ready',
        valueText: '123',
        valueTextByLocale: { ru: '123', en: '123' },
        errorText: null,
        errorTextByLocale: null,
    });
});

test('battle response timing and boost fallback stay lightweight', async () => {
    const timing = buildBattleSummaryTimingPayload();

    assert.equal(Number.isFinite(timing.finalWindowSeconds), true);
    assert.equal(Number.isFinite(timing.finalReportAcceptSeconds), true);
    assert.equal(timing.finalReportRetryIntervalMs >= 250, true);
    assert.equal(timing.finalReportWindowCapacity >= 1, true);

    const payload = { ok: true, isComplete: false, battleId: 'b1', rewardK: 0 };
    assert.equal(await attachBattleRewardBoost({ payload, userId: 'u1', userLang: 'ru' }), payload);
});
