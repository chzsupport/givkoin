const battleService = require('../../services/battleService');
const { createAdBoostOffer } = require('../../services/adBoostService');
const { normalizeBattleReport } = require('./reportPayload');
const { normalizeLang, pickLang } = require('./localizedResponse');

const battleJoinPayloadCache = new Map();

function getBattleScenarioForClient(battle) {
    const scenario = battleService.getBattleScenario && typeof battleService.getBattleScenario === 'function'
        ? battleService.getBattleScenario(battle)
        : (battle?.scenario && typeof battle.scenario === 'object' ? battle.scenario : null);
    if (!scenario) return null;
    return {
        version: Number(scenario.version) || 1,
        durationSeconds: Math.max(0, Number(scenario.durationSeconds) || 0),
        sparkRewardLumens: Math.max(0, Number(scenario.sparkRewardLumens) || 0),
        baddieDamagePerTick: Math.max(0, Number(scenario.baddieDamagePerTick) || 0),
        baddieDamageIntervalMs: Math.max(0, Number(scenario.baddieDamageIntervalMs) || 0),
        weakZones: Array.isArray(scenario.weakZones) ? scenario.weakZones : [],
        voiceCommands: Array.isArray(scenario.voiceCommands) ? scenario.voiceCommands : [],
        sparks: Array.isArray(scenario.sparks) ? scenario.sparks : [],
        baddieWaves: Array.isArray(scenario.baddieWaves) ? scenario.baddieWaves : [],
    };
}

function getBattleJoinSharedPayload(battle) {
    if (!battle?._id) {
        return {
            scenario: getBattleScenarioForClient(battle),
        };
    }

    const scenario = battleService.getBattleScenario && typeof battleService.getBattleScenario === 'function'
        ? battleService.getBattleScenario(battle)
        : (battle?.scenario && typeof battle.scenario === 'object' ? battle.scenario : null);
    const cacheKey = [
        String(battle._id),
        Number(battle.durationSeconds) || 0,
        Number(scenario?.version) || 0,
        Math.max(0, Number(scenario?.sparkRewardLumens) || 0),
    ].join(':');
    const cached = battleJoinPayloadCache.get(String(battle._id));
    if (cached?.cacheKey === cacheKey && cached.payload) {
        return cached.payload;
    }

    const payload = {
        scenario: getBattleScenarioForClient(battle),
    };
    battleJoinPayloadCache.set(String(battle._id), { cacheKey, payload });
    return payload;
}

function serializeBattleForClient(battle, { includeScenario = false } = {}) {
    if (!battle) return null;
    return {
        _id: battle._id,
        status: battle.status,
        durationSeconds: Number(battle.durationSeconds) || 0,
        attendanceCount: Number(battle.attendanceCount) || 0,
        injuries: Array.isArray(battle.injuries) ? battle.injuries : [],
        injury: battle.injury || null,
        ...(includeScenario ? { scenario: getBattleScenarioForClient(battle) } : {}),
    };
}

function buildBattleSummaryTimingPayload({ battle, entry = null, nowMs = Date.now() } = {}) {
    const finalConfig = battleService.getBattleFinalWindowConfig();
    void battle;
    void entry;
    void nowMs;
    return {
        finalWindowSeconds: Math.max(0, Number(finalConfig.windowSeconds) || 0),
        finalReportAcceptSeconds: Math.max(0, Number(finalConfig.reportAcceptSeconds) || 0),
        finalReportRetryIntervalMs: Math.max(250, Number(finalConfig.reportRetryIntervalMs) || 2000),
        finalReportWindowCapacity: Math.max(1, Number(finalConfig.reportWindowCapacity) || 2000),
    };
}

function getSafeBattleSyncValue(value, fallback, minValue = 0) {
    return Number.isFinite(Number(value))
        ? Math.max(minValue, Math.floor(Number(value)))
        : fallback;
}

function parseBattleJoinedAt(value, fallback = new Date()) {
    const safeFallback = fallback instanceof Date && Number.isFinite(fallback.getTime())
        ? fallback
        : new Date();
    if (typeof value !== 'string' || !value.trim()) {
        return safeFallback;
    }
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) ? parsed : safeFallback;
}

function buildBattleJoinTimingPayload({ battle, nowMs = Date.now() } = {}) {
    const durationSeconds = Number(battle?.durationSeconds) || 3600;
    const endsAtMs = battle?.endsAt ? new Date(battle.endsAt).getTime() : NaN;
    if (!Number.isFinite(endsAtMs)) {
        return {
            battleDurationSeconds: durationSeconds,
            battleStartsAtMs: null,
            timeLeftMs: Math.max(0, durationSeconds * 1000),
        };
    }

    return {
        battleDurationSeconds: durationSeconds,
        battleStartsAtMs: Math.max(0, endsAtMs - (durationSeconds * 1000)),
        timeLeftMs: Math.max(0, endsAtMs - (Number(nowMs) || Date.now())),
    };
}

function buildBattleHeartbeatTimingPayload({ battle, nowMs = Date.now() } = {}) {
    const endsAtMs = battle?.endsAt ? new Date(battle.endsAt).getTime() : NaN;
    if (!Number.isFinite(endsAtMs)) {
        return {
            battleEnded: false,
            timeLeftMs: 0,
        };
    }
    const safeNowMs = Number(nowMs) || Date.now();
    return {
        battleEnded: safeNowMs >= endsAtMs,
        timeLeftMs: Math.max(0, endsAtMs - safeNowMs),
    };
}

function buildCurrentBattleActiveResponsePayload({
    battle,
    attendanceEntry = null,
    personalState = null,
    nowMs = Date.now(),
} = {}) {
    const endsAtMs = battle?.endsAt ? new Date(battle.endsAt).getTime() : NaN;
    const battlePublic = serializeBattleForClient(battle, { includeScenario: false });
    return {
        status: 'active',
        battle: {
            ...battlePublic,
            serverNowMs: nowMs,
            joinedAt: attendanceEntry?.sessionJoinedAt || attendanceEntry?.joinedAt || null,
            personalState,
            timeLeftMs: Number.isFinite(endsAtMs) ? Math.max(0, endsAtMs - nowMs) : 0,
        },
    };
}

function buildCurrentBattleFinalWindowResponsePayload({
    battle,
    attendanceEntry = null,
    personalState = null,
    nowMs = Date.now(),
} = {}) {
    const finalConfig = battleService.getBattleFinalWindowConfig();
    const endsAtMs = battle?.endsAt ? new Date(battle.endsAt).getTime() : NaN;
    const battlePublic = serializeBattleForClient(battle, { includeScenario: false });
    return {
        status: 'final_window',
        battle: {
            ...battlePublic,
            serverNowMs: nowMs,
            joinedAt: attendanceEntry?.sessionJoinedAt || attendanceEntry?.joinedAt || null,
            personalState,
            finalWindowTimeLeftMs: Math.max(0, (endsAtMs + (Number(finalConfig.windowSeconds || 60) * 1000)) - nowMs),
            ...buildBattleSummaryTimingPayload({
                battle,
                entry: attendanceEntry,
                nowMs,
            }),
        },
    };
}

function buildBattleJoinResponsePayload({
    battle,
    attendanceEntry = null,
    personalState = null,
    joinedAt = null,
    serverNowMs = Date.now(),
    battleStartsAtMs = null,
    timeLeftMs = 0,
    sharedPayload = null,
}) {
    const durationSeconds = Number(battle?.durationSeconds) || 3600;
    return {
        ok: true,
        battleId: battle?._id,
        serverNowMs,
        joinedAt: attendanceEntry?.sessionJoinedAt || attendanceEntry?.joinedAt || joinedAt,
        personalState,
        durationSeconds,
        battleStartsAtMs,
        timeLeftMs,
        attendanceCount: Number(battle?.attendanceCount) || 0,
        syncSlot: getSafeBattleSyncValue(attendanceEntry?.syncSlot, 0, 0),
        syncSlotCount: getSafeBattleSyncValue(attendanceEntry?.syncSlotCount, 60, 1),
        syncIntervalSeconds: getSafeBattleSyncValue(attendanceEntry?.syncIntervalSeconds, 60, 1),
        ...buildBattleSummaryTimingPayload({
            battle,
            entry: attendanceEntry || null,
        }),
        scenario: sharedPayload?.scenario,
    };
}

function buildBattleJoinQueuedResponsePayload({ joinSlot, battle }) {
    return {
        ok: true,
        queued: true,
        retryAfterMs: Math.max(0, Math.floor(Number(joinSlot?.retryAfterMs) || 0)),
        battleId: battle?._id,
        durationSeconds: Number(battle?.durationSeconds) || 3600,
        attendanceCount: Number(battle?.attendanceCount) || 0,
    };
}

function buildBattleHeartbeatResponsePayload({
    serverNowMs = Date.now(),
    timeLeftMs = 0,
    attendanceCount = 0,
    acceptedReport = false,
    ignoredReport = false,
    personalEntry = null,
    fallbackUser = null,
}) {
    return {
        ok: true,
        serverNowMs,
        timeLeftMs: Math.max(0, Number(timeLeftMs) || 0),
        attendanceCount: Math.max(0, Number(attendanceCount) || 0),
        acceptedReport: Boolean(acceptedReport),
        ignoredReport: Boolean(ignoredReport),
        personalState: buildBattlePersonalStatePayload(personalEntry, fallbackUser || null),
    };
}

function buildBattleHeartbeatEndedResponsePayload() {
    return {
        ok: false,
        battleEnded: true,
        timeLeftMs: 0,
    };
}

function buildFinalReportIgnoredResponse({ retryAfterMs = 0 } = {}) {
    return {
        ok: true,
        accepted: false,
        ignored: true,
        retryAfterMs: Math.max(0, Math.floor(Number(retryAfterMs) || 0)),
    };
}

function buildFinalReportEmptyIgnoredResponse() {
    return {
        ok: true,
        accepted: false,
        ignored: true,
    };
}

function buildFinalReportLimitedResponse({ retryAfterMs = 2000 } = {}) {
    return {
        ok: true,
        accepted: false,
        ignored: false,
        limited: true,
        retryAfterMs: Math.max(250, Math.floor(Number(retryAfterMs) || 2000)),
    };
}

function buildFinalReportAcceptedResponse() {
    return {
        ok: true,
        accepted: true,
        ignored: false,
        retryAfterMs: 0,
    };
}

function buildBattlePersonalStatePayload(entry, fallbackUserData = null) {
    const safeEntry = entry && typeof entry === 'object' ? entry : null;
    const safeUserData = fallbackUserData && typeof fallbackUserData === 'object' ? fallbackUserData : null;
    const reported = normalizeBattleReport(safeEntry?.reported, safeEntry?.syncIntervalSeconds || 60);
    const startLumensRaw = safeEntry?.lumensAtBattleStart ?? safeUserData?.lumens ?? null;
    const startKRaw = safeEntry?.kAtBattleStart ?? safeUserData?.k ?? null;
    const startStarsRaw = safeEntry?.starsAtBattleStart ?? safeUserData?.stars ?? null;
    const startLumens = startLumensRaw == null ? null : Math.max(0, Number(startLumensRaw) || 0);
    const startK = startKRaw == null ? null : Math.max(0, Number(startKRaw) || 0);
    const startStars = startStarsRaw == null ? null : Math.max(0, Number(startStarsRaw) || 0);
    const confirmedDamage = Math.max(
        0,
        Number(safeEntry?.damage) || Number(reported.damage) || Number(reported.damageDelta) || 0,
    );
    const confirmedLumens = startLumens == null
        ? null
        : Math.max(0, startLumens + (Number(reported.lumensGained) || 0) - (Number(reported.lumensSpent) || 0));

    return {
        joinedAt: safeEntry?.sessionJoinedAt || safeEntry?.joinedAt || null,
        confirmedDamage,
        confirmedLumens,
        startLumens,
        startK,
        startStars,
        lastAcceptedReportSequence: Math.max(0, Math.floor(Number(safeEntry?.lastAcceptedReportSequence) || 0)),
        lastClientSyncAt: safeEntry?.lastClientSyncAt || null,
    };
}

function parseBattleSummaryDetailsReadyAtMs(summary) {
    if (!summary || typeof summary !== 'object') return NaN;
    if (typeof summary.detailsReadyAt === 'string' && summary.detailsReadyAt.trim()) {
        const parsed = new Date(summary.detailsReadyAt).getTime();
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    const numeric = Number(summary.detailsReadyAtMs);
    return Number.isFinite(numeric) ? numeric : NaN;
}

function normalizeBattleSummaryTextMap(value) {
    const row = value && typeof value === 'object' ? value : null;
    if (!row) return null;
    const ru = row.ru == null ? '' : String(row.ru);
    const en = row.en == null ? '' : String(row.en);
    if (!ru && !en) return null;
    return {
        ru: ru || en,
        en: en || ru,
    };
}

function getBattleSummaryTextFallback(localized, fallback = '') {
    if (localized?.ru) return localized.ru;
    if (localized?.en) return localized.en;
    return String(fallback || '').trim();
}

function buildBattleSummaryApiPayload(summary, fallbackBattleId) {
    const battleId = String(summary?.battleId || fallbackBattleId || '').trim();
    const detailsReadyAtMs = parseBattleSummaryDetailsReadyAtMs(summary);
    const detailsPending = Boolean(summary?.detailsPending);
    const lines = Array.isArray(summary?.lines)
        ? summary.lines
            .map((line) => {
                const row = line && typeof line === 'object' ? line : {};
                const key = String(row.key || '').trim();
                const labelByLocale = normalizeBattleSummaryTextMap(row.labelByLocale);
                const valueTextByLocale = normalizeBattleSummaryTextMap(row.valueTextByLocale);
                const errorTextByLocale = normalizeBattleSummaryTextMap(row.errorTextByLocale);
                const label = getBattleSummaryTextFallback(labelByLocale, row.label);
                if (!key || !label) return null;
                const state = String(row.state || '').trim();
                return {
                    key,
                    label,
                    labelByLocale,
                    state: state === 'ready' || state === 'error' ? state : 'pending',
                    valueText: valueTextByLocale
                        ? getBattleSummaryTextFallback(valueTextByLocale, row.valueText)
                        : (row.valueText == null ? null : String(row.valueText)),
                    valueTextByLocale,
                    errorText: errorTextByLocale
                        ? getBattleSummaryTextFallback(errorTextByLocale, row.errorText)
                        : (row.errorText == null ? null : String(row.errorText)),
                    errorTextByLocale,
                };
            })
            .filter(Boolean)
        : [];
    const introTextByLocale = normalizeBattleSummaryTextMap(summary?.introTextByLocale);
    const personalDataSourceLabelByLocale = normalizeBattleSummaryTextMap(summary?.personalDataSourceLabelByLocale);
    return {
        ok: true,
        battleId,
        introText: getBattleSummaryTextFallback(introTextByLocale, summary?.introText),
        introTextByLocale,
        screenStage: String(summary?.screenStage || (detailsPending ? 'streaming' : 'done')),
        isComplete: !detailsPending && Boolean(summary?.isComplete !== false),
        personalDataSource: typeof summary?.personalDataSource === 'string' ? summary.personalDataSource : 'none',
        personalDataSourceLabel: getBattleSummaryTextFallback(personalDataSourceLabelByLocale, summary?.personalDataSourceLabel),
        personalDataSourceLabelByLocale,
        result: summary?.result === 'light' || summary?.result === 'dark' || summary?.result === 'draw'
            ? summary.result
            : null,
        userDamage: Math.max(0, Number(summary?.userDamage) || 0),
        rewardK: Math.max(0, Number(summary?.rewardK) || 0),
        detailsPending,
        detailsRetryAfterMs: detailsPending
            ? Math.max(1000, Math.floor(Number(summary?.detailsRetryAfterMs) || 3000))
            : 0,
        detailsReadyAtMs: Number.isFinite(detailsReadyAtMs) ? Math.floor(detailsReadyAtMs) : null,
        durationSeconds: Number.isFinite(Number(summary?.durationSeconds))
            ? Math.max(0, Math.floor(Number(summary.durationSeconds) || 0))
            : null,
        totalLightDamage: Number.isFinite(Number(summary?.totalLightDamage))
            ? Math.max(0, Math.floor(Number(summary.totalLightDamage) || 0))
            : null,
        totalDarkDamage: Number.isFinite(Number(summary?.totalDarkDamage))
            ? Math.max(0, Math.floor(Number(summary.totalDarkDamage) || 0))
            : null,
        attendanceCount: Number.isFinite(Number(summary?.attendanceCount))
            ? Math.max(0, Math.floor(Number(summary.attendanceCount) || 0))
            : null,
        bestPlayer: summary?.bestPlayer?.nickname
            ? { nickname: String(summary.bestPlayer.nickname) }
            : null,
        injury: summary?.injury || null,
        awardedAchievements: Array.isArray(summary?.awardedAchievements)
            ? summary.awardedAchievements.map((id) => Number(id)).filter((id) => Number.isFinite(id))
            : [],
        lines,
    };
}

async function attachBattleRewardBoost({ payload, userId, userLang }) {
    const rewardK = Math.max(0, Number(payload?.rewardK) || 0);
    if (!payload?.isComplete || !payload?.battleId || rewardK <= 0) return payload;
    const boostOffer = await createAdBoostOffer({
        userId,
        type: 'battle_reward_bonus',
        contextKey: `battle:${userId}:${payload.battleId}`,
        page: 'battle',
        title: pickLang(userLang, 'Бонус за бой', 'Battle bonus'),
        description: pickLang(userLang, 'Досмотрите видео, чтобы получить +10% от награды за бой.', 'Watch the video to receive +10% of your battle reward.'),
        reward: {
            kind: 'currency',
            k: Math.round(rewardK * 0.1 * 1000) / 1000,
            transactionType: 'battle_ad_boost',
            description: pickLang(userLang, 'Дополнительная награда: Бой', 'Extra reward: Battle'),
        },
    }).catch(() => null);
    return { ...payload, boostOffer };
}

function clearBattleJoinPayloadCache() {
    battleJoinPayloadCache.clear();
}

module.exports = {
    attachBattleRewardBoost,
    buildBattleHeartbeatEndedResponsePayload,
    buildBattleHeartbeatResponsePayload,
    buildBattleHeartbeatTimingPayload,
    buildBattleJoinQueuedResponsePayload,
    buildBattleJoinResponsePayload,
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
    buildBattleJoinTimingPayload,
    getBattleJoinSharedPayload,
    getBattleScenarioForClient,
    parseBattleJoinedAt,
    serializeBattleForClient,
};
