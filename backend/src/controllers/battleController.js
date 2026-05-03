const battleService = require('../services/battleService');
const crypto = require('crypto');
const { recordActivity } = require('../services/activityService');
const battleRuntimeStore = require('../services/battleRuntimeStore');
const { buildBattleSummarySnapshot, publishBattleSummary } = require('../services/battleSummaryService');
const { createAdBoostOffer } = require('../services/adBoostService');
const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
const BATTLE_REPORT_SECRET = String(process.env.BATTLE_REPORT_SECRET || 'givkoin_battle_secret_key_2026').trim();
const HEARTBEAT_BATTLE_CACHE_TTL_MS = 5000;
const CURRENT_BATTLE_SHARED_CACHE_TTL_MS = 3000;
const CURRENT_BATTLE_PERSONAL_CACHE_TTL_MS = 1200;
const BATTLE_JOIN_BATCH_SIZE = 100;
const BATTLE_JOIN_BATCH_DELAY_MS = 2000;
const BATTLE_JOIN_TICKET_TTL_MS = 10 * 60 * 1000;

const heartbeatBattleCache = new Map();
const battleJoinPayloadCache = new Map();
const battleJoinQueueState = new Map();
const battleFinalReportCapacityState = new Map();
const battleFinalReportProgressState = new Map();
let currentBattleSharedCache = {
    battle: null,
    upcoming: null,
    expiresAtMs: 0,
};
const currentBattlePersonalCache = new Map();

function normalizeLang(value) {
    return value === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
    return normalizeLang(lang) === 'en' ? en : ru;
}

function clearCurrentBattlePersonalCache({ battleId = null, userId = null } = {}) {
    const safeBattleId = String(battleId || '').trim();
    const safeUserId = String(userId || '').trim();
    if (!safeBattleId && !safeUserId) {
        currentBattlePersonalCache.clear();
        return;
    }

    for (const key of currentBattlePersonalCache.keys()) {
        const [cachedBattleId, cachedUserId] = String(key || '').split(':');
        if (safeBattleId && cachedBattleId !== safeBattleId) continue;
        if (safeUserId && cachedUserId !== safeUserId) continue;
        currentBattlePersonalCache.delete(key);
    }
}

function primeCurrentBattleSharedCache({ battle = null, upcoming = null, nowMs = Date.now() } = {}) {
    currentBattleSharedCache = {
        battle,
        upcoming,
        expiresAtMs: nowMs + CURRENT_BATTLE_SHARED_CACHE_TTL_MS,
    };
}

async function getCachedCurrentBattleShared(nowMs = Date.now()) {
    if (currentBattleSharedCache.expiresAtMs > nowMs) {
        return {
            battle: currentBattleSharedCache.battle || null,
            upcoming: currentBattleSharedCache.upcoming || null,
        };
    }

    const battle = await battleService.getCurrentBattle();
    if (!battle) {
        const upcoming = await battleService.getUpcomingBattle();
        primeCurrentBattleSharedCache({ battle: null, upcoming, nowMs });
        return { battle: null, upcoming };
    }

    primeCurrentBattleSharedCache({ battle, upcoming: null, nowMs });
    return { battle, upcoming: null };
}

async function getCachedCurrentBattlePersonal({ battleId, userId, fallbackUser = null, nowMs = Date.now() }) {
    const safeBattleId = String(battleId || '').trim();
    const safeUserId = String(userId || '').trim();

    if (!safeBattleId || !safeUserId) {
        return {
            attendanceEntry: null,
            personalState: buildBattlePersonalStatePayload(null, fallbackUser),
        };
    }

    const cacheKey = `${safeBattleId}:${safeUserId}`;
    const cached = currentBattlePersonalCache.get(cacheKey);
    if (cached && cached.expiresAtMs > nowMs) {
        return {
            attendanceEntry: cached.attendanceEntry || null,
            personalState: cached.personalState || buildBattlePersonalStatePayload(cached.attendanceEntry || null, fallbackUser),
        };
    }

    const attendanceEntry = await getAttendanceRuntimeSnapshot({
        battleId: safeBattleId,
        userId: safeUserId,
    }).catch(() => null);
    const personalState = buildBattlePersonalStatePayload(attendanceEntry, fallbackUser);

    currentBattlePersonalCache.set(cacheKey, {
        attendanceEntry,
        personalState,
        expiresAtMs: nowMs + CURRENT_BATTLE_PERSONAL_CACHE_TTL_MS,
    });

    return { attendanceEntry, personalState };
}

function getBattleFinalReportCapacityState(battleId) {
    const safeBattleId = String(battleId || '').trim();
    if (!safeBattleId) return null;
    let state = battleFinalReportCapacityState.get(safeBattleId);
    if (!state) {
        state = {
            windowStartedAtMs: 0,
            acceptedCount: 0,
            lastTouchedAtMs: 0,
        };
        battleFinalReportCapacityState.set(safeBattleId, state);
    }
    return state;
}

function getBattleFinalReportProgressState(battleId) {
    const safeBattleId = String(battleId || '').trim();
    if (!safeBattleId) return null;
    let state = battleFinalReportProgressState.get(safeBattleId);
    if (!state) {
        state = {
            acceptedUserIds: new Set(),
            expectedCount: 0,
            lastTouchedAtMs: 0,
        };
        battleFinalReportProgressState.set(safeBattleId, state);
    }
    return state;
}

function cleanupBattleFinalReportCapacityState(nowMs = Date.now()) {
    for (const [battleId, state] of battleFinalReportCapacityState.entries()) {
        if (!state || (nowMs - Number(state.lastTouchedAtMs || 0)) > (10 * 60 * 1000)) {
            battleFinalReportCapacityState.delete(battleId);
        }
    }
}

function cleanupBattleFinalReportProgressState(nowMs = Date.now()) {
    for (const [battleId, state] of battleFinalReportProgressState.entries()) {
        if (!state || (nowMs - Number(state.lastTouchedAtMs || 0)) > (10 * 60 * 1000)) {
            battleFinalReportProgressState.delete(battleId);
        }
    }
}

function noteBattleFinalReportAccepted({ battleId, userId, expectedCount = 0, nowMs = Date.now() }) {
    cleanupBattleFinalReportProgressState(nowMs);
    const state = getBattleFinalReportProgressState(battleId);
    const safeUserId = String(userId || '').trim();
    if (!state || !safeUserId) {
        return { acceptedCount: 0, expectedCount: 0, complete: false };
    }

    state.lastTouchedAtMs = nowMs;
    state.expectedCount = Math.max(0, Number(state.expectedCount) || 0, Math.floor(Number(expectedCount) || 0));
    state.acceptedUserIds.add(safeUserId);

    const acceptedCount = state.acceptedUserIds.size;
    return {
        acceptedCount,
        expectedCount: state.expectedCount,
        complete: state.expectedCount > 0 && acceptedCount >= state.expectedCount,
    };
}

function claimBattleFinalReportCapacity({
    battleId,
    endsAtMs,
    nowMs = Date.now(),
    windowMs = 2000,
    capacity = 2000,
}) {
    cleanupBattleFinalReportCapacityState(nowMs);
    const safeWindowMs = Math.max(250, Math.floor(Number(windowMs) || 2000));
    const safeCapacity = Math.max(1, Math.floor(Number(capacity) || 2000));
    const state = getBattleFinalReportCapacityState(battleId);
    if (!state) {
        return { accepted: true, retryAfterMs: 0 };
    }

    const anchorMs = Number.isFinite(Number(endsAtMs)) ? Math.floor(Number(endsAtMs)) : nowMs;
    const elapsedMs = Math.max(0, nowMs - anchorMs);
    const windowIndex = Math.floor(elapsedMs / safeWindowMs);
    const windowStartedAtMs = anchorMs + (windowIndex * safeWindowMs);
    const nextWindowAtMs = windowStartedAtMs + safeWindowMs;

    if (Number(state.windowStartedAtMs) !== windowStartedAtMs) {
        state.windowStartedAtMs = windowStartedAtMs;
        state.acceptedCount = 0;
    }

    state.lastTouchedAtMs = nowMs;
    if (state.acceptedCount >= safeCapacity) {
        return {
            accepted: false,
            retryAfterMs: Math.max(250, nextWindowAtMs - nowMs),
        };
    }

    state.acceptedCount += 1;
    return {
        accepted: true,
        retryAfterMs: 0,
    };
}

function getBattleJoinQueue(battleId) {
    const safeBattleId = String(battleId || '').trim();
    if (!safeBattleId) return null;
    let state = battleJoinQueueState.get(safeBattleId);
    if (!state) {
        state = {
            openedAtMs: 0,
            nextTicket: 0,
            ticketsByUser: new Map(),
        };
        battleJoinQueueState.set(safeBattleId, state);
    }
    return state;
}

function cleanupBattleJoinQueue(battleId, nowMs = Date.now()) {
    const state = getBattleJoinQueue(battleId);
    if (!state) return null;

    for (const [userId, ticketState] of state.ticketsByUser.entries()) {
        if (!ticketState || (nowMs - Number(ticketState.issuedAtMs || 0)) > BATTLE_JOIN_TICKET_TTL_MS) {
            state.ticketsByUser.delete(userId);
        }
    }

    if (state.ticketsByUser.size === 0) {
        state.openedAtMs = 0;
        state.nextTicket = 0;
    }

    return state;
}

function reserveBattleJoinSlot({ battleId, userId, nowMs = Date.now() }) {
    const state = cleanupBattleJoinQueue(battleId, nowMs);
    if (!state) {
        return { queued: false, retryAfterMs: 0 };
    }

    const safeUserId = String(userId || '').trim();
    if (!safeUserId) {
        return { queued: false, retryAfterMs: 0 };
    }

    if (!state.openedAtMs) {
        state.openedAtMs = nowMs;
    }

    let ticketState = state.ticketsByUser.get(safeUserId);
    if (!ticketState) {
        ticketState = {
            ticket: state.nextTicket,
            issuedAtMs: nowMs,
        };
        state.nextTicket += 1;
        state.ticketsByUser.set(safeUserId, ticketState);
    }

    const slotIndex = Math.floor(Math.max(0, Number(ticketState.ticket) || 0) / BATTLE_JOIN_BATCH_SIZE);
    const slotStartsAtMs = state.openedAtMs + slotIndex * BATTLE_JOIN_BATCH_DELAY_MS;
    const retryAfterMs = Math.max(0, slotStartsAtMs - nowMs);

    return {
        queued: retryAfterMs > 0,
        retryAfterMs,
    };
}

function releaseBattleJoinSlot({ battleId, userId }) {
    const state = getBattleJoinQueue(battleId);
    if (!state) return;
    state.ticketsByUser.delete(String(userId || '').trim());
    if (state.ticketsByUser.size === 0) {
        state.openedAtMs = 0;
        state.nextTicket = 0;
    }
}

function generateBattleHash(payload, token) {
    const message = `${payload.damage}_${payload.timeSeconds}_${token}`;
    return crypto.createHmac('sha256', BATTLE_REPORT_SECRET).update(message).digest('hex');
}

function verifyBattleHash(payload, token, clientHash) {
    const expected = generateBattleHash(payload, token);
    return expected === clientHash;
}

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

function buildBattlePersonalStatePayload(entry, fallbackUserData = null) {
    const safeEntry = entry && typeof entry === 'object' ? entry : null;
    const safeUserData = fallbackUserData && typeof fallbackUserData === 'object' ? fallbackUserData : null;
    const reported = normalizeBattleReport(safeEntry?.reported, safeEntry?.syncIntervalSeconds || 60);
    const startLumensRaw = safeEntry?.lumensAtBattleStart ?? safeUserData?.lumens ?? null;
    const startScRaw = safeEntry?.scAtBattleStart ?? safeUserData?.sc ?? null;
    const startStarsRaw = safeEntry?.starsAtBattleStart ?? safeUserData?.stars ?? null;
    const startLumens = startLumensRaw == null ? null : Math.max(0, Number(startLumensRaw) || 0);
    const startSc = startScRaw == null ? null : Math.max(0, Number(startScRaw) || 0);
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
        startSc,
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
        rewardSc: Math.max(0, Number(summary?.rewardSc) || 0),
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
    const rewardSc = Math.max(0, Number(payload?.rewardSc) || 0);
    if (!payload?.isComplete || !payload?.battleId || rewardSc <= 0) return payload;
    const boostOffer = await createAdBoostOffer({
        userId,
        type: 'battle_reward_bonus',
        contextKey: `battle:${userId}:${payload.battleId}`,
        page: 'battle',
        title: pickLang(userLang, 'Бонус за бой', 'Battle bonus'),
        description: pickLang(userLang, 'Досмотрите видео, чтобы получить +10% от награды за бой.', 'Watch the video to receive +10% of your battle reward.'),
        reward: {
            kind: 'currency',
            sc: Math.round(rewardSc * 0.1 * 1000) / 1000,
            transactionType: 'battle_ad_boost',
            description: pickLang(userLang, 'Буст: награда за бой', 'Boost: battle reward'),
        },
    }).catch(() => null);
    return { ...payload, boostOffer };
}

async function getHeartbeatBattleSnapshot(battleId) {
    const key = String(battleId || '').trim();
    if (!key) return null;
    const cached = heartbeatBattleCache.get(key);
    const nowMs = Date.now();
    if (cached && cached.expiresAtMs > nowMs) {
        return cached.battle;
    }
    const battle = await getBattleDocById(key);
    if (!battle) {
        heartbeatBattleCache.delete(key);
        return null;
    }
    heartbeatBattleCache.set(key, {
        battle,
        expiresAtMs: nowMs + HEARTBEAT_BATTLE_CACHE_TTL_MS,
    });
    return battle;
}

function mapBattleRow(row) {
    if (!row) return null;
    const data = row.data && typeof row.data === 'object' ? row.data : {};
    return {
        ...data,
        _id: data._id || row.id,
        createdAt: data.createdAt || row.created_at || null,
        updatedAt: data.updatedAt || row.updated_at || null,
    };
}

async function getBattleDocById(battleId) {
    if (!battleId) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from(DOC_TABLE)
        .select('id,data,created_at,updated_at')
        .eq('model', 'Battle')
        .eq('id', String(battleId))
        .maybeSingle();
    if (error || !data) return null;
    return mapBattleRow(data);
}

async function updateBattleDocById(battleId, nextBattle) {
    if (!battleId || !nextBattle) return null;
    const payloadDoc = { ...(nextBattle && typeof nextBattle === 'object' ? nextBattle : {}) };
    delete payloadDoc._id;
    delete payloadDoc.id;
    delete payloadDoc.createdAt;
    delete payloadDoc.updatedAt;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from(DOC_TABLE)
        .update({ data: payloadDoc })
        .eq('model', 'Battle')
        .eq('id', String(battleId))
        .select('id,data,created_at,updated_at')
        .maybeSingle();
    if (error || !data) return null;
    return mapBattleRow(data);
}

async function listBattleDocs({ pageSize = 1000 } = {}) {
    const supabase = getSupabaseClient();
    const out = [];
    let from = 0;
    const size = Math.max(1, Math.min(2000, Number(pageSize) || 1000));
    while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { data, error } = await supabase
            .from(DOC_TABLE)
            .select('id,data,created_at,updated_at')
            .eq('model', 'Battle')
            .range(from, from + size - 1);
        if (error || !Array.isArray(data) || data.length === 0) break;
        out.push(...data.map(mapBattleRow).filter(Boolean));
        if (data.length < size) break;
        from += size;
    }
    return out;
}

async function getUsersBasicsByIds(ids) {
    const list = Array.from(new Set((Array.isArray(ids) ? ids : [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)));
    if (!list.length) return new Map();
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,nickname,data')
        .in('id', list);
    if (error || !Array.isArray(data)) return new Map();
    const map = new Map();
    data.forEach((row) => {
        const userData = row?.data && typeof row.data === 'object' ? row.data : {};
        map.set(String(row.id), {
            _id: String(row.id),
            nickname: row.nickname || userData.nickname || null,
            treeBranch: userData.treeBranch || null,
        });
    });
    return map;
}

function deepClone(value) {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
}

function setByPath(target, path, value) {
    const parts = String(path || '').split('.').filter(Boolean);
    if (!parts.length) return;
    let cur = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
        const key = parts[i];
        if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
        cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
}

function applyAttendanceUpdate(entry, payload = {}) {
    const next = deepClone(entry) || {};
    const prefix = 'attendance.$.';
    for (const [path, delta] of Object.entries(payload.$inc || {})) {
        const raw = String(path || '');
        if (!raw.startsWith(prefix)) continue;
        const key = raw.slice(prefix.length);
        next[key] = (Number(next[key]) || 0) + (Number(delta) || 0);
    }
    for (const [path, value] of Object.entries(payload.$set || {})) {
        const raw = String(path || '');
        if (!raw.startsWith(prefix)) continue;
        setByPath(next, raw.slice(prefix.length), value);
    }
    for (const [path, value] of Object.entries(payload.$addToSet || {})) {
        const raw = String(path || '');
        if (!raw.startsWith(prefix)) continue;
        const key = raw.slice(prefix.length);
        const current = Array.isArray(next[key]) ? [...next[key]] : [];
        const toAdd = value && typeof value === 'object' && Array.isArray(value.$each) ? value.$each : [value];
        for (const item of toAdd) {
            if (item === undefined) continue;
            if (!current.some((existing) => JSON.stringify(existing) === JSON.stringify(item))) {
                current.push(item);
            }
        }
        next[key] = current;
    }
    return next;
}

async function applyBattleAttendanceUpdateByUser({ battleId, userId, payload }) {
    if (!battleId || !userId || !payload) return null;
    const battle = await getBattleDocById(battleId);
    if (!battle) return null;
    const attendance = Array.isArray(battle.attendance) ? [...battle.attendance] : [];
    const idx = attendance.findIndex((row) => String(row?.user || '') === String(userId));
    if (idx < 0) return null;
    const nextBattle = { ...battle, attendance };

    // Apply top-level $inc/$set to the battle itself (e.g. lightDamage/darknessDamage)
    for (const [path, delta] of Object.entries(payload.$inc || {})) {
        const raw = String(path || '');
        if (raw.startsWith('attendance.$.')) continue;
        nextBattle[raw] = (Number(nextBattle[raw]) || 0) + (Number(delta) || 0);
    }
    for (const [path, value] of Object.entries(payload.$set || {})) {
        const raw = String(path || '');
        if (raw.startsWith('attendance.$.')) continue;
        setByPath(nextBattle, raw, value);
    }

    // Attendance patch
    nextBattle.attendance[idx] = applyAttendanceUpdate(nextBattle.attendance[idx] || {}, payload);
    const payloadDoc = { ...(nextBattle && typeof nextBattle === 'object' ? nextBattle : {}) };
    delete payloadDoc._id;
    delete payloadDoc.id;
    delete payloadDoc.createdAt;
    delete payloadDoc.updatedAt;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from(DOC_TABLE)
        .update({ data: payloadDoc })
        .eq('model', 'Battle')
        .eq('id', String(battleId))
        .select('id,data,created_at,updated_at')
        .maybeSingle();
    if (error || !data) return null;
    return mapBattleRow(data);
}

const BATTLE_USER_SELECT = [
    '_id',
    'lumens',
    'sc',
    'treeBranch',
    'nightShift.isServing',
    'shopBoosts.battleDamage',
    'shopBoosts.battleLumensDiscount',
    'shopBoosts.weakZoneDamage',
].join(' ');

async function getUserRowById(userId) {
    if (!userId) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,data')
        .eq('id', String(userId))
        .maybeSingle();
    if (error) return null;
    return data || null;
}

function getUserData(row) {
    return row?.data && typeof row.data === 'object' ? row.data : {};
}

function setDeepValue(obj, path, value) {
    if (!obj || typeof obj !== 'object') return;
    const parts = String(path || '').split('.').filter(Boolean);
    if (!parts.length) return;
    let cursor = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        if (!cursor[key] || typeof cursor[key] !== 'object') {
            cursor[key] = {};
        }
        cursor = cursor[key];
    }
    cursor[parts[parts.length - 1]] = value;
}

async function updateUserDataById(userId, patch, { userRow = null } = {}) {
    if (!userId || !patch || typeof patch !== 'object') return null;
    const row = userRow || await getUserRowById(userId);
    if (!row) return null;
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const existing = getUserData(row);
    const next = { ...existing, ...patch };
    const { data, error } = await supabase
        .from('users')
        .update({ data: next, updated_at: nowIso })
        .eq('id', String(userId))
        .select('id,data')
        .maybeSingle();
    if (error) return null;
    return data || null;
}

async function updateUserDataByIdDeepPatch(userId, changes = {}, { userRow = null } = {}) {
    if (!userId || !changes || typeof changes !== 'object') return null;
    const row = userRow || await getUserRowById(userId);
    if (!row) return null;
    const existing = getUserData(row);
    const next = { ...existing };
    for (const [path, value] of Object.entries(changes)) {
        setDeepValue(next, path, value);
    }
    return updateUserDataById(userId, next, { userRow: row });
}

function readDeepValue(obj, path) {
    if (!obj || typeof obj !== 'object') return undefined;
    const parts = String(path || '').split('.').filter(Boolean);
    if (!parts.length) return obj;
    let cursor = obj;
    for (const key of parts) {
        if (!cursor || typeof cursor !== 'object') return undefined;
        cursor = cursor[key];
    }
    return cursor;
}

const ACHIEVEMENT_TITLES = {
    1: 'Первая Искра',
    2: 'Защитник Ветви',
    3: 'Гроза Тени',
    4: 'Светоносный Титан',
    5: 'Ритм Света',
    6: 'Точечный Удар',
    7: 'Прилив Сил',
    8: 'Гнев Мироздания',
    9: 'Стабильность',
    10: 'Мастер Перегрузки',
    11: 'Диалоги без Границ',
    12: 'Экономный Боец',
    13: 'Шаг за Шагом',
    14: 'Ярость Листочка',
    15: 'Хирургическая точность',
    16: 'Пробуждение силы',
    17: 'Тяжелая артиллерия',
    18: 'Несгибаемый',
    19: 'Полный бак',
    20: 'До последней капли',
    21: 'Ловец искр',
    22: 'Энергофил',
    23: 'Рисковый маневр',
    24: 'Батарейка Древа',
    25: 'Энергетический магнат',
    26: 'Второе дыхание',
    27: 'Альтруист боя',
    28: 'Сияющий донор',
    29: 'Активный читатель',
    30: 'Комментатор',
    31: 'Абсолютный резонанс',
    32: 'Неудержимый',
    33: 'Мастер комбо',
    34: 'Феникс',
    35: 'Быстрая рука',
    36: 'Стальные нервы',
    37: 'Тишина в ответ',
    38: 'Вопреки тьме',
    39: 'Иммунитет к хаосу',
    40: 'Слышащий истину',
    41: 'Звезда общения',
    42: 'Магнит дружбы',
    43: 'Помощник мечтателя',
    44: 'Коллекционер искр',
    45: 'Единство душ',
    46: 'Плечом к плечу',
    47: 'Братство листьев',
    48: 'Целитель коры',
    49: 'Великий лекарь',
    50: 'Командир звена',
    51: 'Очищение души',
    52: 'Ветеран Первой войны',
    53: 'Страж мироздания',
    54: 'Вечный защитник',
    55: 'Ночная смена',
    56: 'Воскресный воитель',
    57: 'Марафонец',
    58: 'Молниеносная реакция',
    59: 'Наемник Света',
    60: 'Богатый улов',
    61: 'Меценат',
    62: 'Пацифист',
    63: 'Любимчик Фортуны',
    64: 'Чистый лист',
    65: 'Голос Разума',
    66: 'Строитель будущего',
    67: 'Вне времени',
    68: 'Финальный камень',
    69: 'Главный строитель',
    70: 'Тройка мастеров',
    71: 'Абсолютный созидатель',
    72: 'Вестник мечты',
    73: 'Постоянство Света',
    74: 'Неутомимый строитель',
    75: 'Мостовой рекордсмен',
    76: 'Голос сообщества',
    77: 'Исполнитель мечты',
    78: 'Душевный марафон',
    79: 'Удар судьбы',
    80: 'Триумф удачи',
    81: 'Марафонец рулетки',
    82: 'Благословение Фортуны',
    83: 'Джекпот пророка',
    84: 'Властелин лотереи',
    85: 'Двойное попадание',
    86: 'Исцелитель мироздания',
    87: 'Щедрая душа',
    88: 'Спаситель ветви',
    89: 'Элитный защитник',
    90: 'Светоносец дня',
    91: 'Воин Света',
    92: 'Мастер трех путей',
    93: 'Хранитель гармонии',
    94: 'Созидатель сообщества',
    95: 'Никогда не сдаваться',
    96: 'Ритуал перерождения',
    97: 'Создатель Легиона',
    98: 'Сеятель Света',
};

function sanitizeShotTelemetry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const telemetry = {
        intervalMs: Number(raw.intervalMs),
        cursorDistancePx: Number(raw.cursorDistancePx),
        screenNx: Number(raw.screenNx),
        screenNy: Number(raw.screenNy),
        staticCursor: Boolean(raw.staticCursor),
        isTabHidden: Boolean(raw.isTabHidden),
        inputSource: String(raw.inputSource || '').trim().slice(0, 20),
        worldPoint: sanitizeWorldPoint(raw.worldPoint),
    };

    if (!Number.isFinite(telemetry.screenNx) || !Number.isFinite(telemetry.screenNy)) {
        return null;
    }

    telemetry.screenNx = Math.max(0, Math.min(1, telemetry.screenNx));
    telemetry.screenNy = Math.max(0, Math.min(1, telemetry.screenNy));
    telemetry.intervalMs = Number.isFinite(telemetry.intervalMs) ? Math.max(0, telemetry.intervalMs) : 0;
    telemetry.cursorDistancePx = Number.isFinite(telemetry.cursorDistancePx) ? Math.max(0, telemetry.cursorDistancePx) : 0;

    return telemetry;
}

function pickTelemetryMin(prev, next) {
    return Number.isFinite(Number(prev)) ? Math.min(Number(prev), next) : next;
}

function pickTelemetryMax(prev, next) {
    return Number.isFinite(Number(prev)) ? Math.max(Number(prev), next) : next;
}

function buildBattleClickStatsUpdate({ snapshotEntry = null, events = [] }) {
    const safeEvents = Array.isArray(events) ? events : [];
    if (!safeEvents.length) {
        return null;
    }

    const prevAutomationTelemetry = snapshotEntry?.automationTelemetry || {};
    let prevLastClickAt = snapshotEntry?.lastClickAt ? new Date(snapshotEntry.lastClickAt) : null;
    let nextMaxGap = Number(snapshotEntry?.maxClickGapMs) || 0;
    let weapon2Hits = 0;
    let weapon3Hits = 0;
    let shotTelemetryCount = 0;
    let staticCursorShots = 0;
    let hiddenTabShotCount = 0;
    let cursorDistancePxTotal = 0;
    let intervalCount = 0;
    let intervalSumMs = 0;
    let intervalSqSumMs = 0;
    let lastTelemetryAt = prevAutomationTelemetry.lastTelemetryAt ? new Date(prevAutomationTelemetry.lastTelemetryAt) : null;
    let lastInputSource = String(prevAutomationTelemetry.lastInputSource || '');
    let screenMinNx = prevAutomationTelemetry.screenMinNx;
    let screenMaxNx = prevAutomationTelemetry.screenMaxNx;
    let screenMinNy = prevAutomationTelemetry.screenMinNy;
    let screenMaxNy = prevAutomationTelemetry.screenMaxNy;
    let minIntervalMs = prevAutomationTelemetry.minIntervalMs;
    let maxIntervalMs = prevAutomationTelemetry.maxIntervalMs;
    let lastClickAt = prevLastClickAt;

    for (const event of safeEvents) {
        const eventAt = event?.at ? new Date(event.at) : new Date();
        const weapon = Number(event?.weaponId);
        const telemetry = sanitizeShotTelemetry(event?.telemetry);

        if (weapon === 2) weapon2Hits += 1;
        if (weapon === 3) weapon3Hits += 1;

        if (lastClickAt) {
            const gapMs = Math.max(0, eventAt.getTime() - lastClickAt.getTime());
            nextMaxGap = Math.max(nextMaxGap, gapMs);
        }
        lastClickAt = eventAt;

        if (!telemetry) {
            continue;
        }

        shotTelemetryCount += 1;
        staticCursorShots += telemetry.staticCursor ? 1 : 0;
        hiddenTabShotCount += telemetry.isTabHidden ? 1 : 0;
        cursorDistancePxTotal += telemetry.cursorDistancePx;
        lastTelemetryAt = eventAt;
        lastInputSource = telemetry.inputSource || '';
        screenMinNx = pickTelemetryMin(screenMinNx, telemetry.screenNx);
        screenMaxNx = pickTelemetryMax(screenMaxNx, telemetry.screenNx);
        screenMinNy = pickTelemetryMin(screenMinNy, telemetry.screenNy);
        screenMaxNy = pickTelemetryMax(screenMaxNy, telemetry.screenNy);

        if (telemetry.intervalMs > 0) {
            intervalCount += 1;
            intervalSumMs += telemetry.intervalMs;
            intervalSqSumMs += telemetry.intervalMs * telemetry.intervalMs;
            minIntervalMs = pickTelemetryMin(minIntervalMs, telemetry.intervalMs);
            maxIntervalMs = pickTelemetryMax(maxIntervalMs, telemetry.intervalMs);
        }
    }

    const inc = {};
    const set = {};

    if (weapon2Hits > 0) inc['attendance.$.weapon2Hits'] = weapon2Hits;
    if (weapon3Hits > 0) inc['attendance.$.weapon3Hits'] = weapon3Hits;
    if (lastClickAt) {
        set['attendance.$.lastClickAt'] = lastClickAt;
        set['attendance.$.maxClickGapMs'] = nextMaxGap;
    }

    if (shotTelemetryCount > 0) {
        inc['attendance.$.automationTelemetry.shotTelemetryCount'] = shotTelemetryCount;
        inc['attendance.$.automationTelemetry.staticCursorShots'] = staticCursorShots;
        inc['attendance.$.automationTelemetry.hiddenTabShotCount'] = hiddenTabShotCount;
        inc['attendance.$.automationTelemetry.cursorDistancePxTotal'] = cursorDistancePxTotal;
        set['attendance.$.automationTelemetry.lastTelemetryAt'] = lastTelemetryAt || new Date();
        set['attendance.$.automationTelemetry.lastInputSource'] = lastInputSource;
        set['attendance.$.automationTelemetry.screenMinNx'] = screenMinNx;
        set['attendance.$.automationTelemetry.screenMaxNx'] = screenMaxNx;
        set['attendance.$.automationTelemetry.screenMinNy'] = screenMinNy;
        set['attendance.$.automationTelemetry.screenMaxNy'] = screenMaxNy;

        if (intervalCount > 0) {
            inc['attendance.$.automationTelemetry.intervalCount'] = intervalCount;
            inc['attendance.$.automationTelemetry.intervalSumMs'] = intervalSumMs;
            inc['attendance.$.automationTelemetry.intervalSqSumMs'] = intervalSqSumMs;
            set['attendance.$.automationTelemetry.minIntervalMs'] = minIntervalMs;
            set['attendance.$.automationTelemetry.maxIntervalMs'] = maxIntervalMs;
        }
    }

    return { inc, set };
}

async function updateBattleClickStats({ battleId, userId, snapshotEntry = null, events = [] }) {
    const safeEvents = Array.isArray(events) ? events : [];
    if (!safeEvents.length) {
        return snapshotEntry || null;
    }

    let entry = snapshotEntry;
    if (!entry) {
        entry = await getAttendanceRuntimeSnapshot({ battleId, userId });
    }

    const update = buildBattleClickStatsUpdate({ snapshotEntry: entry, events: safeEvents });
    if (!update) {
        return entry || null;
    }

    const payload = {};
    if (Object.keys(update.inc).length > 0) payload.$inc = update.inc;
    if (Object.keys(update.set).length > 0) payload.$set = update.set;
    if (!Object.keys(payload).length) {
        return entry || null;
    }

    return syncAttendanceRuntimeSnapshot({
        battleId,
        userId,
        payload,
        baseState: entry,
    });
}

const ATTENDANCE_RUNTIME_TTL_MS = 3 * 60 * 60 * 1000;
const BATTLE_REPORT_EARLY_GRACE_MS = 1500;
const ATTENDANCE_PATH_PREFIX = 'attendance.$.';

function cloneRuntimeEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    return JSON.parse(JSON.stringify(entry));
}

function normalizeAttendanceRuntimePath(path) {
    return String(path || '').replace(ATTENDANCE_PATH_PREFIX, '').trim();
}

function getRuntimeEntryValue(target, path) {
    const segments = normalizeAttendanceRuntimePath(path).split('.').filter(Boolean);
    let current = target;
    for (const segment of segments) {
        if (!current || typeof current !== 'object') return undefined;
        current = current[segment];
    }
    return current;
}

function setRuntimeEntryValue(target, path, value) {
    const segments = normalizeAttendanceRuntimePath(path).split('.').filter(Boolean);
    if (!segments.length) return;
    let current = target;
    for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        if (!current[segment] || typeof current[segment] !== 'object' || Array.isArray(current[segment])) {
            current[segment] = {};
        }
        current = current[segment];
    }
    current[segments[segments.length - 1]] = value;
}

function applyAttendancePayloadToRuntimeEntry(entry, payload = {}) {
    const nextEntry = cloneRuntimeEntry(entry) || {};

    for (const [path, delta] of Object.entries(payload.$inc || {})) {
        const currentValue = Number(getRuntimeEntryValue(nextEntry, path)) || 0;
        const nextValue = currentValue + (Number(delta) || 0);
        setRuntimeEntryValue(nextEntry, path, nextValue);
    }

    for (const [path, value] of Object.entries(payload.$set || {})) {
        setRuntimeEntryValue(nextEntry, path, value);
    }

    return nextEntry;
}

function mergeUpdatePayload(target, source = {}) {
    if (!target || typeof target !== 'object' || !source || typeof source !== 'object') {
        return target;
    }

    if (source.$inc && typeof source.$inc === 'object') {
        target.$inc = target.$inc || {};
        for (const [path, delta] of Object.entries(source.$inc)) {
            target.$inc[path] = (Number(target.$inc[path]) || 0) + (Number(delta) || 0);
        }
        if (!Object.keys(target.$inc).length) delete target.$inc;
    }

    if (source.$set && typeof source.$set === 'object' && Object.keys(source.$set).length > 0) {
        target.$set = {
            ...(target.$set || {}),
            ...source.$set,
        };
    }

    return target;
}

function createEmptyBattleReportedState(intervalSeconds = 60) {
    const safeIntervalSeconds = Math.max(1, Math.floor(Number(intervalSeconds) || 60));
    return {
        intervalSeconds: safeIntervalSeconds,
        shotsByWeapon: { 1: 0, 2: 0, 3: 0 },
        hitsByWeapon: { 1: 0, 2: 0, 3: 0 },
        hits: 0,
        damage: 0,
        damageDelta: 0,
        totalShots: 0,
        totalHits: 0,
        lumensSpent: 0,
        lumensGained: 0,
        crystalsCollected: 0,
        sparkIds: [],
        weakZoneHitsById: {},
        voiceResults: [],
        baddieDestroyedIds: [],
        baddieDamage: 0,
        maxComboHits: 0,
        maxComboMultiplier: 1,
        heldComboX2MaxDuration: 0,
        reachedX1_5InFirst30s: false,
        phoenixStage: 0,
        lumensSpentWeapon3First2Min: 0,
        lumensSpentOtherFirst2Min: 0,
        damageAfterZeroLumens: 0,
    };
}

function normalizeUniqueBattleIds(value, { limit = 2000 } = {}) {
    return Array.from(
        new Set((Array.isArray(value) ? value : []).map((item) => String(item || '').trim()).filter(Boolean)),
    ).slice(0, limit);
}

function normalizeBattleCountMap(value, { limit = 1000 } = {}) {
    if (!value || typeof value !== 'object') return {};
    const out = {};
    let used = 0;
    for (const [rawKey, rawValue] of Object.entries(value)) {
        if (used >= limit) break;
        const key = String(rawKey || '').trim();
        if (!key) continue;
        const count = Math.max(0, Math.floor(Number(rawValue) || 0));
        if (!count) continue;
        out[key] = count;
        used += 1;
    }
    return out;
}

function normalizeBattleVoiceResults(value, { limit = 1000 } = {}) {
    return (Array.isArray(value) ? value : [])
        .map((row) => ({
            id: String(row?.id || '').trim(),
            text: String(row?.text || '').trim() === 'СТОЙ' ? 'СТОЙ' : 'СТРЕЛЯЙ',
            acted: Boolean(row?.acted),
            success: Boolean(row?.success),
        }))
        .filter((row) => Boolean(row.id))
        .slice(0, limit);
}

function normalizeBattleReport(report, intervalSeconds = 60) {
    const safeReport = report && typeof report === 'object' ? report : {};
    const shotsByWeapon = safeReport.shotsByWeapon && typeof safeReport.shotsByWeapon === 'object'
        ? safeReport.shotsByWeapon
        : {};
    const hitsByWeaponRaw = safeReport.hitsByWeapon && typeof safeReport.hitsByWeapon === 'object'
        ? safeReport.hitsByWeapon
        : {};

    const normalized = createEmptyBattleReportedState(
        Number(safeReport.intervalSeconds) || intervalSeconds,
    );

    normalized.shotsByWeapon = {
        1: Math.max(0, Math.floor(Number(shotsByWeapon[1] ?? shotsByWeapon.weapon1) || 0)),
        2: Math.max(0, Math.floor(Number(shotsByWeapon[2] ?? shotsByWeapon.weapon2) || 0)),
        3: Math.max(0, Math.floor(Number(shotsByWeapon[3] ?? shotsByWeapon.weapon3) || 0)),
    };
    normalized.hitsByWeapon = {
        1: Math.max(0, Math.floor(Number(hitsByWeaponRaw[1] ?? hitsByWeaponRaw.weapon1) || 0)),
        2: Math.max(0, Math.floor(Number(hitsByWeaponRaw[2] ?? hitsByWeaponRaw.weapon2) || 0)),
        3: Math.max(0, Math.floor(Number(hitsByWeaponRaw[3] ?? hitsByWeaponRaw.weapon3) || 0)),
    };
    normalized.hits = Math.max(0, Math.floor(Number(safeReport.hits) || 0));
    normalized.damageDelta = Math.max(0, Math.floor(Number(safeReport.damageDelta ?? safeReport.damage) || 0));
    normalized.damage = normalized.damageDelta;
    normalized.totalShots = normalized.shotsByWeapon[1] + normalized.shotsByWeapon[2] + normalized.shotsByWeapon[3];
    normalized.totalHits = normalized.hits;
    normalized.lumensSpent = Math.max(0, Math.floor(Number(safeReport.lumensSpent) || 0));
    normalized.lumensGained = Math.max(0, Math.floor(Number(safeReport.lumensGained) || 0));
    normalized.crystalsCollected = Math.max(0, Math.floor(Number(safeReport.crystalsCollected) || 0));
    normalized.sparkIds = normalizeUniqueBattleIds(safeReport.sparkIds, { limit: 1000 });
    normalized.weakZoneHitsById = normalizeBattleCountMap(safeReport.weakZoneHitsById, { limit: 1000 });
    normalized.voiceResults = normalizeBattleVoiceResults(safeReport.voiceResults, { limit: 1000 });
    normalized.baddieDestroyedIds = normalizeUniqueBattleIds(safeReport.baddieDestroyedIds, { limit: 2000 });
    normalized.baddieDamage = Math.max(0, Math.floor(Number(safeReport.baddieDamage) || 0));
    normalized.maxComboHits = Math.max(0, Math.floor(Number(safeReport.maxComboHits) || 0));
    normalized.maxComboMultiplier = Math.max(1, Number(safeReport.maxComboMultiplier) || 1);
    normalized.heldComboX2MaxDuration = Math.max(0, Math.floor(Number(safeReport.heldComboX2MaxDuration) || 0));
    normalized.reachedX1_5InFirst30s = Boolean(safeReport.reachedX1_5InFirst30s);
    normalized.phoenixStage = Math.max(0, Math.floor(Number(safeReport.phoenixStage) || 0));
    normalized.lumensSpentWeapon3First2Min = Math.max(0, Math.floor(Number(safeReport.lumensSpentWeapon3First2Min) || 0));
    normalized.lumensSpentOtherFirst2Min = Math.max(0, Math.floor(Number(safeReport.lumensSpentOtherFirst2Min) || 0));
    normalized.damageAfterZeroLumens = Math.max(0, Math.floor(Number(safeReport.damageAfterZeroLumens) || 0));

    return normalized;
}

function isBattleReportEmpty(report) {
    if (!report || typeof report !== 'object') return true;
    const shotsByWeapon = report.shotsByWeapon && typeof report.shotsByWeapon === 'object'
        ? report.shotsByWeapon
        : {};
    const hitsByWeapon = report.hitsByWeapon && typeof report.hitsByWeapon === 'object'
        ? report.hitsByWeapon
        : {};
    const weakZoneHitsById = report.weakZoneHitsById && typeof report.weakZoneHitsById === 'object'
        ? report.weakZoneHitsById
        : {};

    return (
        (Number(report.hits) || 0) <= 0
        && (Number(report.damageDelta ?? report.damage) || 0) <= 0
        && (Number(report.lumensSpent) || 0) <= 0
        && (Number(report.lumensGained) || 0) <= 0
        && (Number(report.crystalsCollected) || 0) <= 0
        && (Number(report.baddieDamage) || 0) <= 0
        && (Number(report.maxComboHits) || 0) <= 0
        && (Number(report.heldComboX2MaxDuration) || 0) <= 0
        && (Number(report.phoenixStage) || 0) <= 0
        && (Number(report.lumensSpentWeapon3First2Min) || 0) <= 0
        && (Number(report.lumensSpentOtherFirst2Min) || 0) <= 0
        && (Number(report.damageAfterZeroLumens) || 0) <= 0
        && !Boolean(report.reachedX1_5InFirst30s)
        && (Number(shotsByWeapon[1] ?? shotsByWeapon.weapon1) || 0) <= 0
        && (Number(shotsByWeapon[2] ?? shotsByWeapon.weapon2) || 0) <= 0
        && (Number(shotsByWeapon[3] ?? shotsByWeapon.weapon3) || 0) <= 0
        && (Number(hitsByWeapon[1] ?? hitsByWeapon.weapon1) || 0) <= 0
        && (Number(hitsByWeapon[2] ?? hitsByWeapon.weapon2) || 0) <= 0
        && (Number(hitsByWeapon[3] ?? hitsByWeapon.weapon3) || 0) <= 0
        && !Object.keys(weakZoneHitsById).length
        && !normalizeUniqueBattleIds(report.sparkIds, { limit: 1 }).length
        && !normalizeBattleVoiceResults(report.voiceResults, { limit: 1 }).length
        && !normalizeUniqueBattleIds(report.baddieDestroyedIds, { limit: 1 }).length
    );
}

function mergeBattleCountMaps(base = {}, chunk = {}, { limit = 1000 } = {}) {
    const merged = { ...normalizeBattleCountMap(base, { limit }) };
    for (const [key, value] of Object.entries(normalizeBattleCountMap(chunk, { limit }))) {
        merged[key] = (Number(merged[key]) || 0) + (Number(value) || 0);
    }
    return normalizeBattleCountMap(merged, { limit });
}

function mergeBattleVoiceResults(base = [], chunk = [], { limit = 1000 } = {}) {
    const map = new Map();
    for (const row of normalizeBattleVoiceResults(base, { limit })) {
        map.set(row.id, row);
    }
    for (const row of normalizeBattleVoiceResults(chunk, { limit })) {
        map.set(row.id, row);
    }
    return Array.from(map.values()).slice(0, limit);
}

function buildAttendanceDerivedMetricsFromReported(reported) {
    const safeReported = normalizeBattleReport(reported);
    const weakZoneHits = Object.values(safeReported.weakZoneHitsById || {}).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const totalHits = Math.max(
        0,
        Number(safeReported.totalHits)
        || Number(safeReported.hits)
        || (Number(safeReported.hitsByWeapon?.[1]) || 0) + (Number(safeReported.hitsByWeapon?.[2]) || 0) + (Number(safeReported.hitsByWeapon?.[3]) || 0),
    );
    let voiceCommandsSuccess = 0;
    let voiceCommandsSilenceSuccess = 0;
    let voiceCommandsAttackSuccess = 0;
    let voiceCommandsConsecutive = 0;
    let voiceCommandsTotalAttempts = 0;
    let bestVoiceConsecutive = 0;
    const voiceCommandsHistory = [];

    for (const voiceRow of safeReported.voiceResults) {
        const success = Boolean(voiceRow.success);
        voiceCommandsHistory.push(success);
        voiceCommandsTotalAttempts += 1;
        if (success) {
            voiceCommandsSuccess += 1;
            voiceCommandsConsecutive += 1;
            if (voiceRow.text === 'СТРЕЛЯЙ') voiceCommandsSilenceSuccess += 1;
            if (voiceRow.text === 'СТОЙ') voiceCommandsAttackSuccess += 1;
        } else {
            voiceCommandsConsecutive = 0;
        }
        bestVoiceConsecutive = Math.max(bestVoiceConsecutive, voiceCommandsConsecutive);
    }

    return {
        damage: Math.max(0, Number(safeReported.damage) || Number(safeReported.damageDelta) || 0),
        totalShots: Math.max(0, Number(safeReported.totalShots) || 0),
        totalHits,
        lumensSpentTotal: Math.max(0, Number(safeReported.lumensSpent) || 0),
        lumensGainedTotal: Math.max(0, Number(safeReported.lumensGained) || 0),
        crystalsCollected: Math.max(0, Number(safeReported.crystalsCollected) || safeReported.sparkIds.length || 0),
        sparkIds: safeReported.sparkIds,
        weakZoneHits,
        nonWeakZoneHits: Math.max(0, totalHits - weakZoneHits),
        weapon2Hits: Math.max(0, Number(safeReported.hitsByWeapon?.[2]) || 0),
        weapon3Hits: Math.max(0, Number(safeReported.hitsByWeapon?.[3]) || 0),
        nonBaseWeaponHits: Math.max(0, Number(safeReported.hitsByWeapon?.[2]) || 0) + Math.max(0, Number(safeReported.hitsByWeapon?.[3]) || 0),
        voiceCommandsSuccess,
        voiceCommandsSilenceSuccess,
        voiceCommandsAttackSuccess,
        voiceCommandsConsecutive: bestVoiceConsecutive,
        voiceCommandsTotalAttempts,
        voiceCommandsHistory,
        baddieDestroyedIds: safeReported.baddieDestroyedIds,
        darknessDamageFromBaddies: Math.max(0, Number(safeReported.baddieDamage) || 0),
        comboHits: Math.max(0, Number(safeReported.maxComboHits) || 0),
        comboMultiplier: Math.max(1, Number(safeReported.maxComboMultiplier) || 1),
        heldComboX2MaxDuration: Math.max(0, Number(safeReported.heldComboX2MaxDuration) || 0),
        reachedX1_5InFirst30s: Boolean(safeReported.reachedX1_5InFirst30s),
        phoenixStage: Math.max(0, Number(safeReported.phoenixStage) || 0),
        lumensSpentWeapon3First2Min: Math.max(0, Number(safeReported.lumensSpentWeapon3First2Min) || 0),
        lumensSpentOtherFirst2Min: Math.max(0, Number(safeReported.lumensSpentOtherFirst2Min) || 0),
        damageAfterZeroLumens: Math.max(0, Number(safeReported.damageAfterZeroLumens) || 0),
    };
}

function mergeBattleReportedState(current, chunk) {
    const base = normalizeBattleReport(current);
    const incoming = normalizeBattleReport(chunk, base.intervalSeconds || 60);
    const merged = createEmptyBattleReportedState(base.intervalSeconds || incoming.intervalSeconds || 60);

    merged.shotsByWeapon = {
        1: (Number(base.shotsByWeapon?.[1]) || 0) + (Number(incoming.shotsByWeapon?.[1]) || 0),
        2: (Number(base.shotsByWeapon?.[2]) || 0) + (Number(incoming.shotsByWeapon?.[2]) || 0),
        3: (Number(base.shotsByWeapon?.[3]) || 0) + (Number(incoming.shotsByWeapon?.[3]) || 0),
    };
    merged.hitsByWeapon = {
        1: (Number(base.hitsByWeapon?.[1]) || 0) + (Number(incoming.hitsByWeapon?.[1]) || 0),
        2: (Number(base.hitsByWeapon?.[2]) || 0) + (Number(incoming.hitsByWeapon?.[2]) || 0),
        3: (Number(base.hitsByWeapon?.[3]) || 0) + (Number(incoming.hitsByWeapon?.[3]) || 0),
    };
    merged.hits = (Number(base.hits) || 0) + (Number(incoming.hits) || 0);
    merged.damageDelta = (Number(base.damageDelta) || 0) + (Number(incoming.damageDelta) || 0);
    merged.damage = merged.damageDelta;
    merged.totalShots = merged.shotsByWeapon[1] + merged.shotsByWeapon[2] + merged.shotsByWeapon[3];
    merged.totalHits = merged.hits;
    merged.lumensSpent = (Number(base.lumensSpent) || 0) + (Number(incoming.lumensSpent) || 0);
    merged.lumensGained = (Number(base.lumensGained) || 0) + (Number(incoming.lumensGained) || 0);
    merged.crystalsCollected = (Number(base.crystalsCollected) || 0) + (Number(incoming.crystalsCollected) || 0);
    merged.sparkIds = normalizeUniqueBattleIds([...(base.sparkIds || []), ...(incoming.sparkIds || [])], { limit: 1000 });
    merged.weakZoneHitsById = mergeBattleCountMaps(base.weakZoneHitsById, incoming.weakZoneHitsById, { limit: 1000 });
    merged.voiceResults = mergeBattleVoiceResults(base.voiceResults, incoming.voiceResults, { limit: 1000 });
    merged.baddieDestroyedIds = normalizeUniqueBattleIds([...(base.baddieDestroyedIds || []), ...(incoming.baddieDestroyedIds || [])], { limit: 2000 });
    merged.baddieDamage = (Number(base.baddieDamage) || 0) + (Number(incoming.baddieDamage) || 0);
    merged.maxComboHits = Math.max(Number(base.maxComboHits) || 0, Number(incoming.maxComboHits) || 0);
    merged.maxComboMultiplier = Math.max(Number(base.maxComboMultiplier) || 1, Number(incoming.maxComboMultiplier) || 1);
    merged.heldComboX2MaxDuration = Math.max(Number(base.heldComboX2MaxDuration) || 0, Number(incoming.heldComboX2MaxDuration) || 0);
    merged.reachedX1_5InFirst30s = Boolean(base.reachedX1_5InFirst30s || incoming.reachedX1_5InFirst30s);
    merged.phoenixStage = Math.max(Number(base.phoenixStage) || 0, Number(incoming.phoenixStage) || 0);
    merged.lumensSpentWeapon3First2Min = (Number(base.lumensSpentWeapon3First2Min) || 0) + (Number(incoming.lumensSpentWeapon3First2Min) || 0);
    merged.lumensSpentOtherFirst2Min = (Number(base.lumensSpentOtherFirst2Min) || 0) + (Number(incoming.lumensSpentOtherFirst2Min) || 0);
    merged.damageAfterZeroLumens = (Number(base.damageAfterZeroLumens) || 0) + (Number(incoming.damageAfterZeroLumens) || 0);

    return merged;
}

function applyBattleReportToAttendanceEntry(entry, report, {
    reportSequence = null,
    receivedAt = new Date(),
    markFinal = false,
} = {}) {
    const nextEntry = cloneRuntimeEntry(entry) || {};
    const mergedReported = mergeBattleReportedState(nextEntry.reported, report);
    const derived = buildAttendanceDerivedMetricsFromReported(mergedReported);
    const receivedAtIso = receivedAt instanceof Date ? receivedAt.toISOString() : new Date(receivedAt || Date.now()).toISOString();

    nextEntry.reported = mergedReported;
    Object.assign(nextEntry, derived);
    nextEntry.lastClientSyncAt = receivedAtIso;
    if (Number.isFinite(Number(reportSequence)) && Number(reportSequence) > 0) {
        nextEntry.lastAcceptedReportSequence = Math.max(
            0,
            Number(nextEntry.lastAcceptedReportSequence) || 0,
            Math.floor(Number(reportSequence) || 0),
        );
    }
    if (markFinal) {
        nextEntry.finalReportAt = receivedAtIso;
    }

    return nextEntry;
}

function resolveBattleReportTargetMs(entry, reportIndex = 0) {
    const joinedAtMs = new Date(entry?.joinedAt || Date.now()).getTime();
    if (!Number.isFinite(joinedAtMs)) {
        return null;
    }

    const intervalMs = Math.max(
        1000,
        Math.floor((Number(entry?.syncIntervalSeconds) || 60) * 1000),
    );
    const slotCount = Math.max(1, Math.floor(Number(entry?.syncSlotCount) || 60));
    const slot = Math.max(0, Math.floor(Number(entry?.syncSlot) || 0)) % slotCount;
    const safeReportIndex = Math.max(0, Math.floor(Number(reportIndex) || 0));

    let targetMs = joinedAtMs + intervalMs + (safeReportIndex * intervalMs);
    if (slotCount > 1) {
        const slotWindowMs = Math.max(1, Math.floor(intervalMs / slotCount));
        const cycleStartMs = Math.floor(targetMs / intervalMs) * intervalMs;
        const slotTargetMs = cycleStartMs + (slot * slotWindowMs);
        targetMs = slotTargetMs >= targetMs ? slotTargetMs : slotTargetMs + intervalMs;
    }

    return targetMs;
}

function isBattleReportReadyForEntry(entry, receivedAt = new Date()) {
    const nextReportIndex = Math.max(0, Math.floor(Number(entry?.lastAcceptedReportSequence) || 0));
    const targetMs = resolveBattleReportTargetMs(entry, nextReportIndex);
    if (!Number.isFinite(targetMs)) {
        return true;
    }

    const receivedAtMs = receivedAt instanceof Date
        ? receivedAt.getTime()
        : new Date(receivedAt || Date.now()).getTime();
    if (!Number.isFinite(receivedAtMs)) {
        return true;
    }

    return (receivedAtMs + BATTLE_REPORT_EARLY_GRACE_MS) >= targetMs;
}

async function mergeBattleReportIntoAttendanceState({
    battleId,
    userId,
    entry = null,
    report = null,
    reportSequence = null,
    markFinal = false,
    lang = 'ru',
}) {
    const baseEntry = entry || await getAttendanceRuntimeSnapshot({ battleId, userId });
    if (!baseEntry) {
        return {
            entry: null,
            accepted: false,
            ignored: false,
            message: pickLang(lang, 'Нет участия в бою', 'No participation in battle'),
        };
    }

    const safeSequence = Math.max(0, Math.floor(Number(reportSequence) || 0));
    if (!safeSequence) {
        return {
            entry: baseEntry,
            accepted: false,
            ignored: false,
            message: pickLang(lang, 'Не указан reportSequence', 'Missing reportSequence'),
        };
    }

    const lastAcceptedSequence = Math.max(0, Math.floor(Number(baseEntry.lastAcceptedReportSequence) || 0));
    if (safeSequence <= lastAcceptedSequence) {
        return { entry: baseEntry, accepted: false, ignored: true };
    }

    const normalizedReport = normalizeBattleReport(report, baseEntry.syncIntervalSeconds || 60);
    if (isBattleReportEmpty(normalizedReport)) {
        return { entry: baseEntry, accepted: false, ignored: true };
    }

    const receivedAt = new Date();
    if (!markFinal && !isBattleReportReadyForEntry(baseEntry, receivedAt)) {
        return { entry: baseEntry, accepted: false, ignored: true, message: 'Report window not reached' };
    }

    const nextEntry = applyBattleReportToAttendanceEntry(baseEntry, normalizedReport, {
        reportSequence: safeSequence,
        receivedAt,
        markFinal,
    });

    await battleRuntimeStore.upsertAttendanceState({
        battleId,
        userId,
        state: nextEntry,
        ttlMs: ATTENDANCE_RUNTIME_TTL_MS,
    }).catch(() => {});

    return { entry: nextEntry, accepted: true, ignored: false };
}

function buildInitialAttendanceRuntimeEntry({
    userId,
    joinedAt = new Date(),
    sync = null,
    lumensAtBattleStart = null,
    scAtBattleStart = null,
    starsAtBattleStart = null,
}) {
    const safeSync = sync && typeof sync === 'object' ? sync : null;
    const syncSlot = Number(safeSync?.syncSlot);
    const syncSlotCount = Number(safeSync?.syncSlotCount);
    const syncIntervalSeconds = Number(safeSync?.syncIntervalSeconds);

    return {
        user: userId?.toString?.() || userId,
        joinedAt: new Date(joinedAt),
        enteredAt: new Date(joinedAt),
        sessionJoinedAt: new Date(joinedAt),
        damage: 0,
        comboHits: 0,
        comboDamage: 0,
        comboMultiplier: 1,
        comboLastHitAt: null,
        nonBaseWeaponHits: 0,
        totalShots: 0,
        totalHits: 0,
        sectorDarknessDamage: 0,
        weakZoneHits: 0,
        nonWeakZoneHits: 0,
        weapon2Hits: 0,
        weapon3Hits: 0,
        lastClickAt: null,
        maxClickGapMs: 0,
        lastClientSyncAt: null,
        syncSlot: Number.isFinite(syncSlot) && syncSlot >= 0 ? syncSlot : null,
        syncSlotCount: Number.isFinite(syncSlotCount) && syncSlotCount >= 1 ? syncSlotCount : null,
        syncIntervalSeconds: Number.isFinite(syncIntervalSeconds) && syncIntervalSeconds >= 1 ? syncIntervalSeconds : null,
        personalSlider: 0,
        voiceLastResolvedBucket: 0,
        voiceShotDetectedBucket: 0,
        sectorLastMinuteViolation: false,
        lumensSpentWeapon3First2Min: 0,
        lumensSpentOtherFirst2Min: 0,
        crystalsCollected: 0,
        lumensSpentTotal: 0,
        damageAfterZeroLumens: 0,
        voiceCommandsSuccess: 0,
        voiceCommandsSilenceSuccess: 0,
        voiceCommandsAttackSuccess: 0,
        voiceCommandsConsecutive: 0,
        voiceCommandsTotalAttempts: 0,
        voiceCommandsHistory: [],
        automationTelemetry: {},
        exitedAndReturnedWithSolarCharge: false,
        receivedGiftInBattle: false,
        lumensAtBattleStart: lumensAtBattleStart == null ? null : Math.max(0, Number(lumensAtBattleStart) || 0),
        scAtBattleStart: scAtBattleStart == null ? null : Math.max(0, Number(scAtBattleStart) || 0),
        starsAtBattleStart: starsAtBattleStart == null ? null : Math.max(0, Number(starsAtBattleStart) || 0),
        heldComboX2StartAt: null,
        heldComboX2MaxDuration: 0,
        phoenixStage: 0,
        reachedX1_5InFirst30s: false,
        shotOutsideWeakZone: false,
        finalRank: null,
        finalBranchAvgDamageOther: null,
        lastAcceptedReportSequence: 0,
        finalReportAt: null,
        reported: createEmptyBattleReportedState(syncIntervalSeconds),
    };
}

async function ensureAttendanceRuntimeSyncMetadata({ battleId, userId, entry = null, sync = null }) {
    const resolvedSync = sync && typeof sync === 'object' ? sync : null;
    if (!resolvedSync) {
        return entry || null;
    }

    const currentSlot = Number(entry?.syncSlot);
    const currentSlotCount = Number(entry?.syncSlotCount);
    const currentIntervalSeconds = Number(entry?.syncIntervalSeconds);
    const unchanged = Number.isFinite(currentSlot)
        && Number.isFinite(currentSlotCount)
        && Number.isFinite(currentIntervalSeconds)
        && currentSlot === resolvedSync.syncSlot
        && currentSlotCount === resolvedSync.syncSlotCount
        && currentIntervalSeconds === resolvedSync.syncIntervalSeconds;

    if (unchanged) {
        return entry;
    }

    return await syncAttendanceRuntimeSnapshot({
        battleId,
        userId,
        payload: {
            $set: {
                'attendance.$.syncSlot': resolvedSync.syncSlot,
                'attendance.$.syncSlotCount': resolvedSync.syncSlotCount,
                'attendance.$.syncIntervalSeconds': resolvedSync.syncIntervalSeconds,
            },
        },
        baseState: entry,
    }) || entry;
}

function buildBattleSnapshotAfterAttendanceJoin({ battle, firstJoinBattle = null }) {
    if (!battle) {
        return null;
    }

    return {
        _id: battle._id,
        status: firstJoinBattle?.status || battle.status || 'active',
        startsAt: battle.startsAt || null,
        firstPlayerJoinedAt: firstJoinBattle?.firstPlayerJoinedAt || battle.firstPlayerJoinedAt || null,
        durationSeconds: Number(firstJoinBattle?.durationSeconds ?? battle.durationSeconds) || battleService.BATTLE_BASE_DURATION_SECONDS,
        attendanceCount: Math.max(0, Number(firstJoinBattle?.attendanceCount ?? battle.attendanceCount) || 0),
        endsAt: firstJoinBattle?.endsAt || battle.endsAt || null,
        isShrunken: Boolean(firstJoinBattle?.isShrunken || battle.isShrunken),
        activeUsersCountSnapshot: Math.max(0, Number(battle.activeUsersCountSnapshot) || 0),
        attendance: Array.isArray(battle.attendance) ? battle.attendance : [],
        scenario: battle?.scenario && typeof battle.scenario === 'object' ? battle.scenario : null,
        injuries: Array.isArray(battle.injuries) ? battle.injuries : [],
        injury: battle.injury || null,
    };
}

async function getAttendanceRuntimeSnapshot({ battleId, userId }) {
    const cached = await battleRuntimeStore.getAttendanceState({ battleId, userId }).catch(() => null);
    if (cached) {
        return cached;
    }

    const snapshot = await getHeartbeatBattleSnapshot(battleId);
    const attendance = Array.isArray(snapshot?.attendance) ? snapshot.attendance : [];
    const entry = attendance.find((row) => String(row?.user || '') === String(userId)) || null;
    if (entry) {
        await battleRuntimeStore.upsertAttendanceState({
            battleId,
            userId,
            state: entry,
            ttlMs: ATTENDANCE_RUNTIME_TTL_MS,
        }).catch(() => {});
    }
    return entry;
}

async function syncAttendanceRuntimeSnapshot({ battleId, userId, payload, baseState = null }) {
    if (!payload || typeof payload !== 'object') {
        return baseState || null;
    }

    let currentState = baseState || await battleRuntimeStore.getAttendanceState({ battleId, userId }).catch(() => null);
    if (!currentState) {
        currentState = await getAttendanceRuntimeSnapshot({ battleId, userId });
    }
    if (!currentState) {
        return null;
    }

    const nextState = applyAttendancePayloadToRuntimeEntry(currentState, payload);
    await battleRuntimeStore.upsertAttendanceState({
        battleId,
        userId,
        state: nextState,
        ttlMs: ATTENDANCE_RUNTIME_TTL_MS,
    }).catch(() => {});

    return nextState;
}

async function ensureBattleAttendanceReady({
    battleId,
    userId,
    battle = null,
    shouldEnsureFirstJoin = false,
    joinedAt = null,
    resourceSnapshot = null,
}) {
    let entry = await battleRuntimeStore.getAttendanceState({ battleId, userId }).catch(() => null);
    let joinedAttendance = false;
    let startedByFirstJoin = false;
    let battleSnapshot = battle;

    if (!entry) {
        const safeJoinedAt = joinedAt instanceof Date && Number.isFinite(joinedAt.getTime())
            ? new Date(joinedAt)
            : new Date();
        const safeResources = resourceSnapshot && typeof resourceSnapshot === 'object'
            ? resourceSnapshot
            : {};
        let firstJoinBattle = null;
        if (shouldEnsureFirstJoin) {
            firstJoinBattle = await battleService.markFirstPlayerJoinIfNeeded(battleId, safeJoinedAt);
            startedByFirstJoin = Boolean(firstJoinBattle);
            if (firstJoinBattle) {
                battleSnapshot = firstJoinBattle;
            }
        }
        const registration = await battleService.registerAttendance(battleId, userId, {
            joinedAt: safeJoinedAt,
            battle: buildBattleSnapshotAfterAttendanceJoin({ battle, firstJoinBattle }),
        });
        joinedAttendance = Boolean(registration?.joined);
        if (joinedAttendance) {
            battleSnapshot = registration?.battleSnapshot || battleSnapshot || battle;
            if (!registration?.appliedTimerUpdate) {
                await battleService.recomputeEndsAtForAttendance(battleId);
            }
            entry = buildInitialAttendanceRuntimeEntry({
                userId,
                joinedAt: safeJoinedAt,
                sync: registration?.sync || null,
                lumensAtBattleStart: safeResources.lumensAtBattleStart ?? null,
                scAtBattleStart: safeResources.scAtBattleStart ?? null,
                starsAtBattleStart: safeResources.starsAtBattleStart ?? null,
            });
            entry = await ensureAttendanceRuntimeSyncMetadata({
                battleId,
                userId,
                entry,
                sync: registration?.sync || null,
            }) || entry;
            await battleRuntimeStore.upsertAttendanceState({
                battleId,
                userId,
                state: entry,
                ttlMs: ATTENDANCE_RUNTIME_TTL_MS,
            }).catch(() => {});
            return { entry, joinedAttendance, startedByFirstJoin, battleSnapshot };
        }
        entry = await getAttendanceRuntimeSnapshot({ battleId, userId });
        entry = await ensureAttendanceRuntimeSyncMetadata({ battleId, userId, entry }) || entry;
        return { entry, joinedAttendance, startedByFirstJoin, battleSnapshot };
    }

    if (shouldEnsureFirstJoin) {
        const firstJoinBattle = await battleService.markFirstPlayerJoinIfNeeded(battleId);
        startedByFirstJoin = Boolean(firstJoinBattle);
        if (firstJoinBattle) {
            battleSnapshot = firstJoinBattle;
        }
    }

    entry = await ensureAttendanceRuntimeSyncMetadata({ battleId, userId, entry }) || entry;

    const safeRejoinAt = joinedAt instanceof Date && Number.isFinite(joinedAt.getTime())
        ? new Date(joinedAt)
        : null;
    const currentJoinedAtMs = entry?.joinedAt ? new Date(entry.joinedAt).getTime() : NaN;
    const nextJoinedAtMs = safeRejoinAt ? safeRejoinAt.getTime() : NaN;
    const needsJoinAnchorPatch = safeRejoinAt
        && (
            !entry?.sessionJoinedAt
            || !Number.isFinite(nextJoinedAtMs)
            || Math.abs(new Date(entry.sessionJoinedAt).getTime() - nextJoinedAtMs) > 1000
            || !entry?.enteredAt
        );
    if (needsJoinAnchorPatch) {
        entry = await syncAttendanceRuntimeSnapshot({
            battleId,
            userId,
            payload: {
                $set: {
                    'attendance.$.sessionJoinedAt': safeRejoinAt,
                    'attendance.$.enteredAt': entry?.enteredAt || entry?.joinedAt || safeRejoinAt,
                },
            },
            baseState: entry,
        }) || entry;
    }

    const safeResources = resourceSnapshot && typeof resourceSnapshot === 'object'
        ? resourceSnapshot
        : {};
    const needsResourcePatch = (
        (entry?.lumensAtBattleStart == null && safeResources.lumensAtBattleStart != null)
        || (entry?.scAtBattleStart == null && safeResources.scAtBattleStart != null)
        || (entry?.starsAtBattleStart == null && safeResources.starsAtBattleStart != null)
    );
    if (needsResourcePatch) {
        entry = await syncAttendanceRuntimeSnapshot({
            battleId,
            userId,
            payload: {
                $set: {
                    ...(entry?.lumensAtBattleStart == null && safeResources.lumensAtBattleStart != null
                        ? { 'attendance.$.lumensAtBattleStart': Math.max(0, Number(safeResources.lumensAtBattleStart) || 0) }
                        : {}),
                    ...(entry?.scAtBattleStart == null && safeResources.scAtBattleStart != null
                        ? { 'attendance.$.scAtBattleStart': Math.max(0, Number(safeResources.scAtBattleStart) || 0) }
                        : {}),
                    ...(entry?.starsAtBattleStart == null && safeResources.starsAtBattleStart != null
                        ? { 'attendance.$.starsAtBattleStart': Math.max(0, Number(safeResources.starsAtBattleStart) || 0) }
                        : {}),
                },
            },
            baseState: entry,
        }) || entry;
    }

    return { entry, joinedAttendance, startedByFirstJoin, battleSnapshot };
}

function isBoostActiveForBattle(boost, battleId) {
    if (!boost) return false;
    if (boost.pending) return true;
    if (!boost.battleId) return false;
    return boost.battleId.toString() === battleId.toString();
}

const BATTLE_BOOST_PATHS = Object.freeze([
    'shopBoosts.battleDamage',
    'shopBoosts.battleLumensDiscount',
    'shopBoosts.weakZoneDamage',
]);

async function bindPendingBattleBoosts(userId, battleId, at, { userRow = null } = {}) {
    const now = at || new Date();
    const row = userRow || await getUserRowById(userId);
    if (!row) return {};

    const data = getUserData(row);
    const updates = {};
    let hasUpdates = false;

    for (const path of BATTLE_BOOST_PATHS) {
        const pending = Boolean(readDeepValue(data, `${path}.pending`));
        if (!pending) continue;
        updates[`${path}.pending`] = false;
        updates[`${path}.battleId`] = String(battleId);
        updates[`${path}.activatedAt`] = now.toISOString();
        hasUpdates = true;
    }

    if (!hasUpdates) {
        return data.shopBoosts && typeof data.shopBoosts === 'object'
            ? data.shopBoosts
            : {};
    }

    const updatedRow = await updateUserDataByIdDeepPatch(userId, updates, { userRow: row });
    const updatedData = updatedRow ? getUserData(updatedRow) : data;
    return updatedData.shopBoosts && typeof updatedData.shopBoosts === 'object'
        ? updatedData.shopBoosts
        : {};
}

const ENEMY_WORLD_BOUNDS = Object.freeze({
    minX: -368.32,
    maxX: 368.32,
    minY: -207.18,
    maxY: 207.18,
});
const ENEMY_PLANE_Z = -260;
const MAX_HIT_BATCH_ITEMS = 400;
const MAX_SHOT_BATCH_ITEMS = 400;
const MAX_HIT_REPORT_LAG_MS = 20000;
const MAX_HIT_FUTURE_TOLERANCE_MS = 2000;
const MAX_SHOT_BACKFILL_MS = 4000;
const CLIENT_SYNC_GRACE_MS = 15000;
const SHARED_SHOT_TTL_MS = 60000;
const PROCESSED_HIT_TTL_MS = 60000;
const WEAPON_COMBAT_RULES = Object.freeze({
    1: { damage: 6, costLumens: 10, maxHitsPerShot: 10, minShotGapMs: 35, maxAimDeviation: 85 },
    2: { damage: 500, costLumens: 100, maxHitsPerShot: 2, minShotGapMs: 2600, maxAimDeviation: 45 },
    3: { damage: 5000, costLumens: 500, maxHitsPerShot: 1, minShotGapMs: 4500, maxAimDeviation: 28 },
});

function getWeaponCombatRules(weaponId) {
    return WEAPON_COMBAT_RULES[Number(weaponId)] || null;
}

function sanitizeWorldPoint(raw) {
    const x = Number(raw?.x);
    const y = Number(raw?.y);
    const z = Number(raw?.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return null;
    }
    return { x, y, z };
}

function isWorldPointWithinEnemyBounds(worldPoint) {
    if (!worldPoint) return false;
    return worldPoint.x >= ENEMY_WORLD_BOUNDS.minX
        && worldPoint.x <= ENEMY_WORLD_BOUNDS.maxX
        && worldPoint.y >= ENEMY_WORLD_BOUNDS.minY
        && worldPoint.y <= ENEMY_WORLD_BOUNDS.maxY
        && Math.abs(worldPoint.z - ENEMY_PLANE_Z) <= 8;
}

function sanitizeReportedHit(raw, fallbackBattleElapsedMs = null) {
    if (!raw || typeof raw !== 'object') return null;
    const shotId = String(raw.shotId || '').trim().slice(0, 120);
    const worldPoint = sanitizeWorldPoint(raw.worldPoint);
    const aimWorldPoint = sanitizeWorldPoint(raw.aimWorldPoint);
    const rawElapsed = Number(raw.battleElapsedMs ?? raw.elapsedMs ?? fallbackBattleElapsedMs);
    const battleElapsedMs = Number.isFinite(rawElapsed) ? Math.max(0, Math.round(rawElapsed)) : null;
    if (!shotId || !worldPoint || battleElapsedMs == null) {
        return null;
    }
    return {
        shotId,
        worldPoint,
        aimWorldPoint,
        battleElapsedMs,
    };
}

function sanitizeReportedShot(raw, fallbackBattleElapsedMs = null) {
    if (!raw || typeof raw !== 'object') return null;
    const shotId = String(raw.shotId || '').trim().slice(0, 120);
    const weaponId = Number(raw.weaponId);
    const rawElapsed = Number(raw.battleElapsedMs ?? raw.elapsedMs ?? fallbackBattleElapsedMs);
    const battleElapsedMs = Number.isFinite(rawElapsed) ? Math.max(0, Math.round(rawElapsed)) : null;
    const telemetry = sanitizeShotTelemetry(raw.telemetry);
    if (!shotId) {
        return null;
    }
    return {
        shotId,
        weaponId: Number.isFinite(weaponId) ? weaponId : null,
        battleElapsedMs,
        telemetry,
    };
}

function normalizeHitPoint(worldPoint) {
    const x = Number(worldPoint?.x);
    const y = Number(worldPoint?.y);
    const z = Number(worldPoint?.z);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return 'na:na:na';
    }
    const rx = Math.round(x * 10);
    const ry = Math.round(y * 10);
    const rz = Math.round(z * 10);
    return `${rx}:${ry}:${rz}`;
}

function buildProcessedHitId({ shotId, worldPoint, action, battleElapsedMs }) {
    const elapsed = Number.isFinite(Number(battleElapsedMs)) ? Math.round(Number(battleElapsedMs)) : 'na';
    return `${action || 'hit'}:${shotId || 'none'}:${normalizeHitPoint(worldPoint)}:${elapsed}`;
}

function getHitOccurredAtMs(battle, battleElapsedMs) {
    const startMs = battle?.startsAt ? new Date(battle.startsAt).getTime() : NaN;
    if (!Number.isFinite(startMs) || !Number.isFinite(Number(battleElapsedMs))) {
        return NaN;
    }
    return startMs + Number(battleElapsedMs);
}

function isReplayStillAllowed(battle, nowMs) {
    const endMs = battle?.endsAt ? new Date(battle.endsAt).getTime() : Number.POSITIVE_INFINITY;
    return nowMs <= endMs + CLIENT_SYNC_GRACE_MS;
}

function isReportedActionTimingPlausible({ battle, battleElapsedMs, occurredAtMs, nowMs, shotMeta }) {
    const startMs = battle?.startsAt ? new Date(battle.startsAt).getTime() : NaN;
    const endMs = battle?.endsAt ? new Date(battle.endsAt).getTime() : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(startMs) || !Number.isFinite(occurredAtMs)) {
        return false;
    }
    if (!Number.isFinite(Number(battleElapsedMs)) || Number(battleElapsedMs) < 0) {
        return false;
    }
    if (occurredAtMs < startMs - 1000) {
        return false;
    }
    if (occurredAtMs > endMs + MAX_HIT_FUTURE_TOLERANCE_MS) {
        return false;
    }
    if (occurredAtMs > nowMs + MAX_HIT_FUTURE_TOLERANCE_MS) {
        return false;
    }
    if (nowMs - occurredAtMs > MAX_HIT_REPORT_LAG_MS && !isReplayStillAllowed(battle, nowMs)) {
        return false;
    }

    const shotAtMs = Number.isFinite(Number(shotMeta?.at)) ? Number(shotMeta.at) : NaN;
    if (Number.isFinite(shotAtMs) && occurredAtMs < shotAtMs - MAX_SHOT_BACKFILL_MS) {
        return false;
    }

    return true;
}

function isReportedHitTimingPlausible({ battle, battleElapsedMs, occurredAtMs, nowMs, shotMeta }) {
    return isReportedActionTimingPlausible({
        battle,
        battleElapsedMs,
        occurredAtMs,
        nowMs,
        shotMeta,
    });
}

function isWeakZoneHit(weakZone, worldPoint) {
    if (!weakZone?.active || !weakZone.center || !worldPoint) {
        return false;
    }
    const dx = Number(worldPoint.x) - weakZone.center.x;
    const dy = Number(worldPoint.y) - weakZone.center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist <= weakZone.radius;
}

function isHitNearAimPoint({ shotMeta, worldPoint, weaponId }) {
    const aimWorldPoint = sanitizeWorldPoint(shotMeta?.aimWorldPoint);
    if (!aimWorldPoint || !worldPoint) {
        return true;
    }
    const rules = getWeaponCombatRules(weaponId);
    if (!rules) {
        return false;
    }
    const dx = worldPoint.x - aimWorldPoint.x;
    const dy = worldPoint.y - aimWorldPoint.y;
    const dz = worldPoint.z - aimWorldPoint.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return dist <= rules.maxAimDeviation;
}

function computeSectorIntensity(userDamage, sectorDarknessDamage) {
    const diff = Number(userDamage || 0) - Number(sectorDarknessDamage || 0);
    const raw = Math.round(diff / 1000);
    const sectorScore = Math.max(-50, Math.min(50, raw));
    return Math.max(0, Math.min(100, 50 + sectorScore));
}

const COMBO_GAP_MS = 3000;

function getComboMultiplier(comboHits) {
    const h = Number(comboHits) || 0;
    if (h >= 200) return 2;
    if (h >= 150) return 1.5;
    return 1;
}

async function finalizeComboIfExpired({ battleId, userId, at, entry: inputEntry = null }) {
    const entry = inputEntry || await getAttendanceRuntimeSnapshot({ battleId, userId });
    if (!entry) return { finalized: false, bonusDamage: 0, bonusSc: 0, entry: null };

    const lastHitAt = entry.comboLastHitAt ? new Date(entry.comboLastHitAt) : null;
    const comboHits = Number(entry.comboHits) || 0;
    const comboDamage = Number(entry.comboDamage) || 0;
    const comboMultiplier = Number(entry.comboMultiplier) || 1;
    const phoenixStage = Number(entry.phoenixStage) || 0;

    if (!lastHitAt || comboHits <= 0) return { finalized: false, bonusDamage: 0, bonusSc: 0, entry };
    if (at.getTime() - lastHitAt.getTime() <= COMBO_GAP_MS) return { finalized: false, bonusDamage: 0, bonusSc: 0, entry };

    const mult = Math.max(1, comboMultiplier);
    const bonusDamage = mult > 1 ? Math.max(0, Math.round(comboDamage * (mult - 1))) : 0;
    const bonusSc = bonusDamage > 0 ? Math.max(0, Math.ceil(bonusDamage / 1000)) : 0;

    // Phoenix logic: if it was stage 1 (reached x2 once), and now dropped -> stage 2
    let nextPhoenixStage = phoenixStage;
    if (mult >= 2 && phoenixStage === 1) nextPhoenixStage = 2;

    const attendancePayload = {
        ...(bonusDamage > 0 ? { $inc: { 'attendance.$.damage': bonusDamage } } : {}),
        $set: {
            'attendance.$.comboHits': 0,
            'attendance.$.comboDamage': 0,
            'attendance.$.comboMultiplier': 1,
            'attendance.$.comboLastHitAt': null,
            'attendance.$.heldComboX2StartAt': null,
            'attendance.$.phoenixStage': nextPhoenixStage,
        },
    };

    const nextEntry = await syncAttendanceRuntimeSnapshot({
        battleId,
        userId,
        payload: attendancePayload,
        baseState: entry,
    });

    return { finalized: true, bonusDamage, bonusSc, entry: nextEntry };
}

exports.getCurrentBattle = async (req, res) => {
    try {
        const nowMs = Date.now();
        const { battle, upcoming } = await getCachedCurrentBattleShared(nowMs);
        if (!battle) {
            return res.json({ status: 'none', upcoming });
        }
        const { attendanceEntry, personalState } = await getCachedCurrentBattlePersonal({
            battleId: battle._id,
            userId: req.user?._id,
            fallbackUser: req.user || null,
            nowMs,
        });

        const endsAtMs = battle?.endsAt ? new Date(battle.endsAt).getTime() : NaN;
        const battlePublic = serializeBattleForClient(battle, { includeScenario: true });
        const timeLeftMs = Number.isFinite(endsAtMs) ? Math.max(0, endsAtMs - nowMs) : 0;

        if (Number.isFinite(endsAtMs) && nowMs >= endsAtMs) {
            const finalConfig = battleService.getBattleFinalWindowConfig();
            const reportAcceptEndsAtMs = endsAtMs + (Number(finalConfig.reportAcceptSeconds || 60) * 1000);
            if (nowMs >= reportAcceptEndsAtMs) {
                battleService.tryFinalizeBattleIfReady(battle._id).catch(() => {});
            }
            return res.json({
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
            });
        }

        res.json({
            status: 'active',
            battle: {
                ...battlePublic,
                serverNowMs: nowMs,
                joinedAt: attendanceEntry?.sessionJoinedAt || attendanceEntry?.joinedAt || null,
                personalState,
                timeLeftMs,
            },
        });
    } catch (error) {
        console.error('Get current battle error:', error);
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || 'ru');
        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
    }
};

exports.getUserBattleHistory = async (req, res) => {
    try {
        const userId = req.user?._id;
        const all = await listBattleDocs({ pageSize: 2000 });
        const battles = (Array.isArray(all) ? all : [])
            .filter((battle) => {
                if (String(battle?.status || '') !== 'finished') return false;
                const attendance = Array.isArray(battle.attendance) ? battle.attendance : [];
                return attendance.some((row) => String(row?.user || '') === String(userId));
            })
            .sort((a, b) => {
                const aTime = a?.endsAt ? new Date(a.endsAt).getTime() : (a?.updatedAt ? new Date(a.updatedAt).getTime() : 0);
                const bTime = b?.endsAt ? new Date(b.endsAt).getTime() : (b?.updatedAt ? new Date(b.updatedAt).getTime() : 0);
                return bTime - aTime;
            })
            .slice(0, 50);

        const list = battles.map((battle) => {
            const attendance = Array.isArray(battle.attendance) ? battle.attendance : [];
            const entry = attendance.find((row) => row?.user?.toString() === req.user._id.toString());
            const lightDamage = battle.lightDamage || 0;
            const darknessDamage = battle.darknessDamage || 0;
            return {
                battleId: battle._id,
                endedAt: battle.endsAt || battle.updatedAt || battle.createdAt,
                lightDamage,
                darknessDamage,
                attendanceCount: Number.isFinite(Number(battle.attendanceCount)) ? Number(battle.attendanceCount) : 0,
                result: lightDamage === darknessDamage ? 'draw' : lightDamage > darknessDamage ? 'light' : 'dark',
                userDamage: entry?.damage || 0,
            };
        });

        res.json({ battles: list });
    } catch (error) {
        console.error('Get user battle history error:', error);
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || 'ru');
        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
    }
};

exports.getBattleSummary = async (req, res) => {
    try {
        const battleId = req.query.battleId;
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.query?.language || 'ru');
        if (!battleId) {
            return res.status(400).json({ message: pickLang(userLang, 'Не указан battleId', 'Missing battleId') });
        }
        const nowMs = Date.now();

        const preparedSummary = await battleRuntimeStore.getFinalSummary({
            battleId,
            userId: req.user?._id,
        }).catch(() => null);

        if (preparedSummary && typeof preparedSummary === 'object') {
            const payload = buildBattleSummaryApiPayload(preparedSummary, battleId);
            return res.json(await attachBattleRewardBoost({ payload, userId: req.user?._id, userLang }));
        }

        let battle = await getHeartbeatBattleSnapshot(battleId);
        if (!battle) {
            return res.status(404).json({ message: pickLang(userLang, 'Бой не найден', 'Battle not found') });
        }
        let attendance = Array.isArray(battle?.attendance) ? battle.attendance : [];
        let userAttendanceEntry = attendance.find((row) => String(row?.user || '') === String(req.user?._id)) || null;
        if (battle.status !== 'finished') {
            const finalConfig = battleService.getBattleFinalWindowConfig();
            const endsAtMs = battle?.endsAt ? new Date(battle.endsAt).getTime() : NaN;
            const reportAcceptEndsAtMs = Number.isFinite(endsAtMs)
                ? endsAtMs + (Number(finalConfig.reportAcceptSeconds || 60) * 1000)
                : NaN;
            if (Number.isFinite(endsAtMs) && nowMs < endsAtMs) {
                return res.json({
                    ok: false,
                    pending: true,
                    battleId: String(battle?._id || battleId),
                    retryAfterMs: 1000,
                });
            }
            userAttendanceEntry = await getAttendanceRuntimeSnapshot({
                battleId,
                userId: req.user?._id,
            }).catch(() => userAttendanceEntry);
            if (Number.isFinite(reportAcceptEndsAtMs) && nowMs >= reportAcceptEndsAtMs) {
                battleService.tryFinalizeBattleIfReady(battleId).catch(() => {});
                battle = await getBattleDocById(battleId);
                attendance = Array.isArray(battle?.attendance) ? battle.attendance : [];
                userAttendanceEntry = attendance.find((row) => String(row?.user || '') === String(req.user?._id)) || null;
            }
        }

        if (!userAttendanceEntry) {
            const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
            return res.status(404).json({ message: pickLang(userLang, 'Участник боя не найден', 'Battle participant not found') });
        }

        const acceptedFinalReport = await battleRuntimeStore.getFinalReport({
            battleId,
            userId: req.user?._id,
        }).catch(() => null);
        const acceptedFinalSequence = Math.max(0, Math.floor(Number(acceptedFinalReport?.reportSequence) || 0));
        const currentAcceptedSequence = Math.max(0, Math.floor(Number(userAttendanceEntry?.lastAcceptedReportSequence) || 0));
        if (
            acceptedFinalReport?.report
            && acceptedFinalSequence > currentAcceptedSequence
        ) {
            userAttendanceEntry = applyBattleReportToAttendanceEntry(userAttendanceEntry, acceptedFinalReport.report, {
                reportSequence: acceptedFinalSequence,
                receivedAt: acceptedFinalReport.acceptedAt || new Date(),
                markFinal: true,
            });
        }

        const fallbackSummary = buildBattleSummarySnapshot({
            battle,
            entry: userAttendanceEntry,
            detailReady: false,
        });
        const payload = buildBattleSummaryApiPayload(fallbackSummary, battleId);
        res.json(await attachBattleRewardBoost({ payload, userId: req.user?._id, userLang }));
    } catch (error) {
        console.error('Get battle summary error:', error);
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.query?.language || 'ru');
        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
    }
};

exports.submitDamage = async (req, res) => {
    try {
        battleRuntimeStore.maybeCleanupExpiredEntries().catch(() => {});
        const { battleId, action, reportSequence } = req.body || {};
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
        const finalMarker = Boolean(req.body?.finalMarker);

        const isFinal = action === 'final';
        if (!isFinal) {
            return res.json({ ok: true, ignored: true });
        }

        if (!battleId) {
            return res.status(400).json({ message: pickLang(userLang, 'Не указан battleId', 'Missing battleId') });
        }

        const battle = await getBattleDocById(battleId);
        if (!battle) {
            return res.status(404).json({ message: pickLang(userLang, 'Бой не найден', 'Battle not found') });
        }

        const finalConfig = battleService.getBattleFinalWindowConfig();
        const endsAtMs = battle.endsAt ? new Date(battle.endsAt).getTime() : NaN;
        if (!Number.isFinite(endsAtMs)) {
            return res.status(400).json({ message: pickLang(userLang, 'Неизвестно время окончания боя', 'Battle end time missing') });
        }
        const nowMs = Date.now();
        const reportAcceptEndsAtMs = endsAtMs + (finalConfig.reportAcceptSeconds * 1000);
        if (nowMs < endsAtMs) {
            return res.status(400).json({ message: pickLang(userLang, 'Бой ещё активен', 'Battle is still active') });
        }
        // После конца боя ещё 60 секунд принимаем опоздавшие последние данные.
        // Дальше бой закрывается, а подробный разбор может дособираться отдельно без жёсткого лимита.
        if (nowMs > reportAcceptEndsAtMs) {
            return res.status(400).json({ message: pickLang(userLang, 'Окно финального отчёта закрыто', 'Final report window closed') });
        }

        const attendanceEntry = await getAttendanceRuntimeSnapshot({ battleId, userId: req.user._id });
        if (!attendanceEntry) {
            return res.status(400).json({ message: pickLang(userLang, 'Нет участия в бою', 'No participation in battle') });
        }

        const safeSequence = Math.max(0, Math.floor(Number(reportSequence) || 0));
        if (!safeSequence) {
            return res.status(400).json({ message: pickLang(userLang, 'Не указан reportSequence', 'Missing reportSequence') });
        }

        const report = req.body?.report && typeof req.body.report === 'object' ? req.body.report : null;
        const normalizedReport = normalizeBattleReport(report, attendanceEntry.syncIntervalSeconds || 60);
        const hasReportPayload = Boolean(report) && !isBattleReportEmpty(normalizedReport);
        if (!hasReportPayload && !finalMarker) {
            battleService.tryFinalizeBattleIfReady(battleId).catch(() => {});
            return res.json({ ok: true, accepted: false, ignored: true });
        }

        const existingFinalReport = await battleRuntimeStore.getFinalReport({
            battleId,
            userId: req.user._id,
        }).catch(() => null);
        const existingFinalSequence = Math.max(0, Math.floor(Number(existingFinalReport?.reportSequence) || 0));
        if (existingFinalSequence >= safeSequence) {
            return res.json({
                ok: true,
                accepted: false,
                ignored: true,
                retryAfterMs: 0,
            });
        }

        const capacityClaim = claimBattleFinalReportCapacity({
            battleId,
            endsAtMs,
            nowMs,
            windowMs: Number(finalConfig.reportRetryIntervalMs) || 2000,
            capacity: Number(finalConfig.reportWindowCapacity) || 2000,
        });
        if (!capacityClaim.accepted) {
            return res.json({
                ok: true,
                accepted: false,
                ignored: false,
                limited: true,
                retryAfterMs: Math.max(250, Math.floor(Number(capacityClaim.retryAfterMs) || 2000)),
            });
        }

        const acceptedAtIso = new Date(nowMs).toISOString();
        await battleRuntimeStore.upsertFinalReport({
            battleId,
            userId: req.user._id,
            report: {
                battleId: String(battleId),
                userId: String(req.user._id),
                reportSequence: safeSequence,
                report: hasReportPayload ? normalizedReport : null,
                acceptedAt: acceptedAtIso,
                hasPayload: hasReportPayload,
                lastAcceptedReportSequence: Math.max(0, Math.floor(Number(attendanceEntry.lastAcceptedReportSequence) || 0)),
            },
        });

        const previewEntry = hasReportPayload
            ? applyBattleReportToAttendanceEntry(attendanceEntry, normalizedReport, {
                reportSequence: safeSequence,
                receivedAt: acceptedAtIso,
                markFinal: true,
            })
            : {
                ...cloneRuntimeEntry(attendanceEntry),
                finalReportAt: acceptedAtIso,
                finalReportHasPayload: false,
                personalDataSource: (attendanceEntry?.lastClientSyncAt || attendanceEntry?.reported)
                    ? 'last_heartbeat'
                    : 'none',
            };
        if (hasReportPayload) {
            previewEntry.finalReportHasPayload = true;
            previewEntry.personalDataSource = 'final_report';
        }

        await publishBattleSummary({
            battle,
            userId: req.user?._id,
            entry: previewEntry,
            attendanceCount: Math.max(
                0,
                Number(battle.uniqueAttendanceCount) || Number(battle.attendanceCount) || (Array.isArray(battle.attendance) ? battle.attendance.length : 0),
            ),
            detailReady: false,
            updatedAt: acceptedAtIso,
        }).catch(() => null);

        const finalProgress = noteBattleFinalReportAccepted({
            battleId,
            userId: req.user?._id,
            expectedCount: Math.max(
                0,
                Number(battle.uniqueAttendanceCount) || Number(battle.attendanceCount) || (Array.isArray(battle.attendance) ? battle.attendance.length : 0),
            ),
            nowMs,
        });

        if (finalProgress.complete) {
            battleService.tryFinalizeBattleIfReady(battleId, {
                allParticipantsReported: true,
            }).catch(() => {});
        }

        return res.json({
            ok: true,
            accepted: true,
            ignored: false,
            retryAfterMs: 0,
        });
    } catch (error) {
        console.error('Submit damage error:', error);
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || 'ru');
        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
    }
};
exports.joinBattle = async (req, res) => {
    let activeBattleId = null;
    try {
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
        const battle = await battleService.getCurrentBattle();
        if (!battle) {
            return res.status(400).json({ message: pickLang(userLang, 'Нет активного боя', 'No active battle') });
        }
        activeBattleId = String(battle._id || '').trim() || null;
        const endsAtMs = battle?.endsAt ? new Date(battle.endsAt).getTime() : NaN;
        if (Number.isFinite(endsAtMs) && Date.now() >= endsAtMs) {
            return res.status(400).json({ message: pickLang(userLang, 'Бой уже закончился', 'Battle has already ended') });
        }

        const joinSlot = reserveBattleJoinSlot({
            battleId: battle._id,
            userId: req.user._id,
        });
        if (joinSlot.queued) {
            return res.status(202).json({
                ok: true,
                queued: true,
                retryAfterMs: joinSlot.retryAfterMs,
                battleId: battle._id,
                durationSeconds: Number(battle.durationSeconds) || 3600,
                attendanceCount: Number(battle.attendanceCount) || 0,
            });
        }

        const userRow = await getUserRowById(req.user._id);
        if (!userRow) {
            releaseBattleJoinSlot({ battleId: battle._id, userId: req.user._id });
            return res.status(404).json({ message: pickLang(userLang, 'Пользователь не найден', 'User not found') });
        }
        const userData = getUserData(userRow);
        const joinedAtRaw = typeof req.body?.joinedAt === 'string'
            ? req.body.joinedAt
            : '';
        const parsedJoinedAt = joinedAtRaw ? new Date(joinedAtRaw) : new Date();
        const safeJoinedAt = Number.isFinite(parsedJoinedAt.getTime()) ? parsedJoinedAt : new Date();
        const attendanceReady = await ensureBattleAttendanceReady({
            battleId: battle._id,
            userId: req.user._id,
            battle,
            shouldEnsureFirstJoin: !battle.firstPlayerJoinedAt,
            joinedAt: safeJoinedAt,
            resourceSnapshot: {
                lumensAtBattleStart: Number(userData?.lumens) || 0,
                scAtBattleStart: Number(userData?.sc) || 0,
                starsAtBattleStart: Number(userData?.stars) || 0,
            },
        });

        const updatedBattle = attendanceReady.battleSnapshot || battle;
        const battleDurationSeconds = Number(updatedBattle.durationSeconds) || 3600;
        const responseNowMs = Date.now();
        const updatedEndsAtMs = updatedBattle?.endsAt ? new Date(updatedBattle.endsAt).getTime() : NaN;
        const battleStartsAtMs = Number.isFinite(updatedEndsAtMs)
            ? Math.max(0, updatedEndsAtMs - (battleDurationSeconds * 1000))
            : null;
        const timeLeftMs = Number.isFinite(updatedEndsAtMs)
            ? Math.max(0, updatedEndsAtMs - responseNowMs)
            : Math.max(0, battleDurationSeconds * 1000);
        const sharedPayload = getBattleJoinSharedPayload(updatedBattle);
        await battleService.ensureAttendanceInitForUser({
            battleId: updatedBattle._id,
            userId: req.user._id,
            lumensAtStart: Number(userData?.lumens) || 0,
            scAtStart: Number(userData?.sc) || 0,
            starsAtStart: Number(userData?.stars) || 0,
        }).catch(() => {});
        await bindPendingBattleBoosts(req.user._id, updatedBattle._id, new Date(), { userRow });
        heartbeatBattleCache.set(String(updatedBattle._id), {
            battle: updatedBattle,
            expiresAtMs: Date.now() + HEARTBEAT_BATTLE_CACHE_TTL_MS,
        });
        primeCurrentBattleSharedCache({ battle: updatedBattle });
        clearCurrentBattlePersonalCache({ battleId: updatedBattle._id });
        releaseBattleJoinSlot({ battleId: updatedBattle._id, userId: req.user._id });
        const personalState = buildBattlePersonalStatePayload(attendanceReady?.entry || null, userData);
        currentBattlePersonalCache.set(`${String(updatedBattle._id)}:${String(req.user._id)}`, {
            attendanceEntry: attendanceReady?.entry || null,
            personalState,
            expiresAtMs: Date.now() + CURRENT_BATTLE_PERSONAL_CACHE_TTL_MS,
        });

        res.json({
            ok: true,
            battleId: updatedBattle._id,
            serverNowMs: responseNowMs,
            joinedAt: attendanceReady?.entry?.sessionJoinedAt || attendanceReady?.entry?.joinedAt || safeJoinedAt,
            personalState,
            durationSeconds: Number(updatedBattle.durationSeconds) || battleDurationSeconds,
            battleStartsAtMs,
            timeLeftMs,
            attendanceCount: Number(updatedBattle.attendanceCount) || 0,
            syncSlot: Number.isFinite(Number(attendanceReady?.entry?.syncSlot))
                ? Math.max(0, Math.floor(Number(attendanceReady.entry.syncSlot)))
                : 0,
            syncSlotCount: Number.isFinite(Number(attendanceReady?.entry?.syncSlotCount))
                ? Math.max(1, Math.floor(Number(attendanceReady.entry.syncSlotCount)))
                : 60,
            syncIntervalSeconds: Number.isFinite(Number(attendanceReady?.entry?.syncIntervalSeconds))
                ? Math.max(1, Math.floor(Number(attendanceReady.entry.syncIntervalSeconds)))
                : 60,
            ...buildBattleSummaryTimingPayload({
                battle: updatedBattle,
                entry: attendanceReady?.entry || null,
            }),
            scenario: sharedPayload.scenario,
        });
    } catch (error) {
        if (activeBattleId) {
            releaseBattleJoinSlot({ battleId: activeBattleId, userId: req.user?._id });
        }
        console.error('Join battle error:', error);
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
    }
};

exports.battleHeartbeat = async (req, res) => {
    try {
        const { battleId, report, reportSequence } = req.body || {};
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
        if (!battleId) {
            return res.status(400).json({ message: pickLang(userLang, 'Не указан battleId', 'Missing battleId') });
        }

        const battle = await getHeartbeatBattleSnapshot(battleId);
        if (!battle || battle.status !== 'active') {
            return res.status(400).json({ message: pickLang(userLang, 'Бой не активен', 'Battle is not active') });
        }

        const endsAt = battle.endsAt ? new Date(battle.endsAt).getTime() : null;
        const nowMs = Date.now();
        if (endsAt && nowMs >= endsAt) {
            return res.status(409).json({
                ok: false,
                battleEnded: true,
                timeLeftMs: 0,
            });
        }
        const timeLeftMs = endsAt ? Math.max(0, endsAt - nowMs) : 0;
        const attendanceCount = Number(battle.attendanceCount) || 0;
        let acceptedReport = false;
        let ignoredReport = false;
        let personalEntry = null;

        if (report && typeof report === 'object') {
            const attendanceEntry = await getAttendanceRuntimeSnapshot({ battleId, userId: req.user._id });
            if (!attendanceEntry) {
                return res.status(400).json({ message: pickLang(userLang, 'Нет участия в бою', 'No participation in battle') });
            }
            const mergeResult = await mergeBattleReportIntoAttendanceState({
                battleId,
                userId: req.user._id,
                entry: attendanceEntry,
                report,
                reportSequence,
                markFinal: false,
                lang: userLang,
            });
            if (mergeResult?.message === pickLang(userLang, 'Не указан reportSequence', 'Missing reportSequence')) {
                return res.status(400).json({ message: pickLang(userLang, 'Не указан reportSequence', 'Missing reportSequence') });
            }
            acceptedReport = Boolean(mergeResult?.accepted);
            ignoredReport = Boolean(mergeResult?.ignored);
            personalEntry = mergeResult?.entry || attendanceEntry;
        } else {
            personalEntry = await getAttendanceRuntimeSnapshot({ battleId, userId: req.user._id }).catch(() => null);
        }

        res.json({
            ok: true,
            serverNowMs: nowMs,
            timeLeftMs,
            attendanceCount,
            acceptedReport,
            ignoredReport,
            personalState: buildBattlePersonalStatePayload(personalEntry, req.user || null),
        });
    } catch (error) {
        console.error('Battle heartbeat error:', error);
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
    }
};

