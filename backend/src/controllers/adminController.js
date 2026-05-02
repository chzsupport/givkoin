 
const { getSupabaseClient } = require('../lib/supabaseClient');
const { applyPenalty } = require('../utils/penalties');
const { updateEntityMoodForUser } = require('../services/entityMoodService');
const { getSetting, setSetting } = require('../utils/settings');
const { getPageTextBundle, savePageTextBundle } = require('../services/pageTextService');
const { normalizeLocalizedTextInput } = require('../utils/localizedContent');
const {
    getRegistrySettingValue,
    getNumericSettingValue,
    updateRegistrySettings,
} = require('../services/settingsRegistryService');
const {
    createOperationApproval,
    serializeApproval,
} = require('../services/operationApprovalService');
const {
    deleteScheduledBattleTotally,
    deleteEntityTotally,
    deleteWishTotally,
    deleteUserTotally,
    deleteFeedbackMessageTotally,
} = require('../services/adminCleanupService');
const { recordTransaction } = require('../services/scService');
const battleService = require('../services/battleService');
const { adminAudit } = require('../middleware/adminAudit');
const { forEachUserBatch } = require('../services/userBatchService');
const bcrypt = require('bcryptjs');
const { ADMIN_EMAIL_DOMAIN, isAdminEmail } = require('../utils/accountRole');
const {
    COLLECTIVE_MEDITATION_SCHEDULE_KEY,
    getDefaultSchedule,
    normalizeSchedule,
} = require('./meditationController');
const { getCollectiveMeditationAdminStats } = require('../services/meditationRuntimeService');
const quoteController = require('./quoteController');
const crypto = require('crypto');
const emailService = require('../services/emailService');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

function mapDocRow(row) {
    if (!row) return null;
    const data = row.data && typeof row.data === 'object' ? row.data : {};
    return {
        ...data,
        _id: String(row.id),
        createdAt: row.created_at ? new Date(row.created_at) : (data.createdAt || null),
        updatedAt: row.updated_at ? new Date(row.updated_at) : (data.updatedAt || null),
    };
}

async function listModelDocs(model, { pageSize = 1000 } = {}) {
    const supabase = getSupabaseClient();
    const out = [];
    let from = 0;
    const size = Math.max(1, Math.min(2000, Number(pageSize) || 1000));
    while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { data, error } = await supabase
            .from(DOC_TABLE)
            .select('id,data,created_at,updated_at')
            .eq('model', String(model))
            .range(from, from + size - 1);
        if (error || !Array.isArray(data) || data.length === 0) break;
        out.push(...data.map(mapDocRow).filter(Boolean));
        if (data.length < size) break;
        from += data.length;
    }
    return out;
}

async function getModelDocById(model, id) {
    if (!id) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from(DOC_TABLE)
        .select('id,data,created_at,updated_at')
        .eq('model', String(model))
        .eq('id', String(id))
        .maybeSingle();
    if (error || !data) return null;
    return mapDocRow(data);
}

async function updateModelDoc(model, id, patch) {
    if (!id || !patch || typeof patch !== 'object') return null;
    const supabase = getSupabaseClient();

    const current = await getModelDocById(model, id);
    if (!current) return null;

    const next = { ...current, ...patch };
    delete next._id;
    delete next.id;
    delete next.createdAt;
    delete next.updatedAt;

    const { data, error } = await supabase
        .from(DOC_TABLE)
        .update({ data: next })
        .eq('model', String(model))
        .eq('id', String(id))
        .select('id,data,created_at,updated_at')
        .maybeSingle();
    if (error || !data) return null;
    return mapDocRow(data);
}

async function listTableRows(table, columns, { pageSize = 1000, build } = {}) {
    const supabase = getSupabaseClient();
    const out = [];
    let from = 0;
    const size = Math.max(1, Math.min(2000, Number(pageSize) || 1000));
    while (true) {
        let query = supabase
            .from(String(table))
            .select(String(columns))
            .range(from, from + size - 1);
        if (typeof build === 'function') {
            query = build(query);
        }
        // eslint-disable-next-line no-await-in-loop
        const { data, error } = await query;
        if (error || !Array.isArray(data) || data.length === 0) break;
        out.push(...data);
        if (data.length < size) break;
        from += data.length;
    }
    return out;
}

function toId(value, depth = 0) {
    if (depth > 3) return '';
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (typeof value === 'object') {
        if (value._id != null) return toId(value._id, depth + 1);
        if (value.id != null) return toId(value.id, depth + 1);
        if (value.value != null) return toId(value.value, depth + 1);
        if (typeof value.toString === 'function') {
            const s = value.toString();
            if (s && s !== '[object Object]') return s;
        }
    }
    return '';
}

async function getUsersByIds(ids) {
    const list = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => toId(id)).filter(Boolean)));
    if (!list.length) return new Map();
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,nickname,email')
        .in('id', list);
    if (error) return new Map();
    return new Map((Array.isArray(data) ? data : []).map((row) => [String(row.id), row]));
}

function mapWishRowToAdminDto(row, usersById) {
    if (!row) return null;
    const author = row.author_id ? usersById.get(String(row.author_id)) : null;
    const executor = row.executor_id ? usersById.get(String(row.executor_id)) : null;
    return {
        _id: row.id,
        author: author ? { _id: author.id, nickname: author.nickname, email: author.email } : (row.author_id ? { _id: row.author_id } : null),
        executor: executor ? { _id: executor.id, nickname: executor.nickname, email: executor.email } : (row.executor_id ? { _id: row.executor_id } : null),
        text: row.text,
        status: row.status,
        supportCount: row.support_count ?? 0,
        supportSc: Number(row.support_sc ?? 0),
        language: row.language ?? undefined,
        costSc: Number(row.cost_sc ?? 0),
        executorContact: row.executor_contact ?? undefined,
        takenAt: row.taken_at ? new Date(row.taken_at) : null,
        fulfilledAt: row.fulfilled_at ? new Date(row.fulfilled_at) : null,
        createdAt: row.created_at ? new Date(row.created_at) : null,
        updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    };
}

function extractNicknameFromEmail(email) {
    const e = String(email || '').trim();
    const at = e.indexOf('@');
    const nick = at > 0 ? e.slice(0, at) : e;
    return nick.trim();
}

function generateUserId() {
    return crypto.randomBytes(12).toString('hex');
}

function validateSeedPhrase24(value) {
    const words = String(value || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    return words.length === 24;
}

function mapDuplicateKeyError(error) {
    const key = (error && error.keyPattern && Object.keys(error.keyPattern)[0]) || '';
    if (key === 'email') return 'Почта уже используется';
    if (key === 'nickname') return 'Никнейм уже занят';
    return 'Данные уже используются';
}

function hasValidEmailLocalPart(email) {
    const [local, domain] = String(email || '').trim().toLowerCase().split('@');
    if (!local || !domain) return false;
    if (local.includes('.') || /[^a-zA-Z0-9]/.test(local)) return false;
    return true;
}

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

async function updateUserDataById(userId, patch) {
    if (!userId || !patch || typeof patch !== 'object') return null;
    const supabase = getSupabaseClient();
    const row = await getUserRowById(userId);
    if (!row) return null;
    const existing = row.data && typeof row.data === 'object' ? row.data : {};
    const next = { ...existing, ...patch };
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from('users')
        .update({ data: next, updated_at: nowIso })
        .eq('id', String(userId))
        .select('id,data')
        .maybeSingle();
    if (error) return null;
    return data || null;
}

const ADMIN_EMAIL_REQUIREMENT_MESSAGE = `Email администратора должен быть в домене @${ADMIN_EMAIL_DOMAIN}`;

function operationMutationResponse({
    operationId = null,
    status = 'executed',
    requiresApproval = false,
    auditId = null,
    data = null,
    message = null,
}) {
    return {
        operationId,
        status,
        requiresApproval,
        auditId,
        ...(message ? { message } : {}),
        ...(data !== null && data !== undefined ? { data } : {}),
    };
}

function clampNumber(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.min(max, Math.max(min, n));
}

function clamp01(value) {
    return clampNumber(value, 0, 1);
}

function round2(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

function safeCountFromMap(map, key) {
    return Number(map.get(String(key)) || 0);
}

function formatShortDate(dateValue) {
    if (!dateValue) return null;
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString('ru-RU');
}

function getDarknessStage(score, { activeBattle = false } = {}) {
    if (activeBattle) {
        return {
            code: 'breach',
            title: 'Прорыв',
            tone: 'critical',
            forecast: 'Мрак уже в бою.',
            horizon: 'Сейчас',
        };
    }
    if (score >= 85) {
        return {
            code: 'near',
            title: 'Почти у врат',
            tone: 'critical',
            forecast: 'Прорыв может начаться в любой момент.',
            horizon: 'Часы',
        };
    }
    if (score >= 65) {
        return {
            code: 'alarm',
            title: 'Тревога',
            tone: 'high',
            forecast: 'Нападение вероятно в ближайшие 24–72 часа.',
            horizon: '1–3 дня',
        };
    }
    if (score >= 45) {
        return {
            code: 'gathering',
            title: 'Сгущение',
            tone: 'medium',
            forecast: 'Если мир не оживёт, Мрак может прийти довольно скоро.',
            horizon: '2–4 дня',
        };
    }
    if (score >= 25) {
        return {
            code: 'watching',
            title: 'Наблюдение',
            tone: 'low',
            forecast: 'Тень уже чувствуется, но до прорыва ещё есть запас.',
            horizon: '3–5 дней',
        };
    }
    return {
        code: 'sleeping',
        title: 'Тишь',
        tone: 'calm',
        forecast: 'В ближайшие дни нападение маловероятно.',
        horizon: 'Далеко',
    };
}

async function buildBattleMoodForecast() {
    const now = Date.now();
    const since72h = new Date(now - 72 * 60 * 60 * 1000);
    const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const since14d = new Date(now - 14 * 24 * 60 * 60 * 1000);
    const supabase = getSupabaseClient();

    const moodActivityTypes = [
        'solar_collect',
        'solar_share',
        'fruit_collect',
        'tree_heal',
        'battle_participation',
        'night_shift',
        'night_shift_anomaly',
        'night_shift_hour',
        'meditation_group',
        'news_like',
        'news_comment',
        'news_repost',
        'chat_rate',
        'chat_session',
        'crystal',
    ];

    const [
        totalUsersResult,
        entitiesResult,
        activeBattle,
        upcomingBattle,
        activityRows,
        transactionRows,
        adRows,
        appeals,
        battles,
    ] = await Promise.all([
        supabase.from('users').select('id', { head: true, count: 'exact' }),
        supabase.from('entities').select('id', { head: true, count: 'exact' }),
        battleService.getCurrentBattle(),
        battleService.getUpcomingBattle(),
        listTableRows('activity_logs', 'user_id,type,minutes,meta,created_at', {
            pageSize: 1000,
            build: (q) => q
                .gte('created_at', since72h.toISOString())
                .in('type', moodActivityTypes)
                .order('created_at', { ascending: false }),
        }),
        listTableRows('transactions', 'direction,amount,currency,type,occurred_at,created_at', {
            pageSize: 1000,
            build: (q) => q
                .gte('created_at', since7d.toISOString())
                .order('created_at', { ascending: false }),
        }),
        listTableRows(DOC_TABLE, 'id,data,created_at', {
            pageSize: 1000,
            build: (q) => q
                .eq('model', 'AdImpression')
                .gte('created_at', since7d.toISOString())
                .order('created_at', { ascending: false }),
        }),
        listModelDocs('Appeal'),
        listModelDocs('Battle'),
    ]);

    const totalUsers = Number(totalUsersResult?.count || 0);
    const totalEntities = Number(entitiesResult?.count || 0);

    const activityCountByType = new Map();
    const activeUsers = new Set();
    let usefulActivityWeight = 0;
    let socialActivityWeight = 0;
    let defenseActivityWeight = 0;
    let treeActivityWeight = 0;

    for (const row of (Array.isArray(activityRows) ? activityRows : [])) {
        const type = String(row?.type || '').trim();
        if (!type) continue;
        activityCountByType.set(type, safeCountFromMap(activityCountByType, type) + 1);
        if (row?.user_id) activeUsers.add(String(row.user_id));

        if (type === 'solar_collect') {
            usefulActivityWeight += 2;
            treeActivityWeight += 2;
        } else if (type === 'solar_share') {
            usefulActivityWeight += 2.5;
            treeActivityWeight += 2.5;
        } else if (type === 'fruit_collect') {
            usefulActivityWeight += 1.5;
            treeActivityWeight += 1.5;
        } else if (type === 'tree_heal') {
            usefulActivityWeight += 3;
            treeActivityWeight += 3;
            defenseActivityWeight += 3;
        } else if (type === 'battle_participation') {
            usefulActivityWeight += 5;
            defenseActivityWeight += 5;
        } else if (type === 'night_shift_hour') {
            usefulActivityWeight += 6;
            defenseActivityWeight += 6;
        } else if (type === 'night_shift_anomaly') {
            usefulActivityWeight += 0.15;
            defenseActivityWeight += 0.15;
        } else if (type === 'night_shift') {
            usefulActivityWeight += 2;
            defenseActivityWeight += 2;
        } else if (type === 'meditation_group') {
            usefulActivityWeight += 2;
            socialActivityWeight += 2;
        } else if (type === 'news_like') {
            usefulActivityWeight += 0.5;
            socialActivityWeight += 0.5;
        } else if (type === 'news_comment') {
            usefulActivityWeight += 2;
            socialActivityWeight += 2;
        } else if (type === 'news_repost') {
            usefulActivityWeight += 2.5;
            socialActivityWeight += 2.5;
        } else if (type === 'chat_rate') {
            usefulActivityWeight += 1.5;
            socialActivityWeight += 1.5;
        } else if (type === 'chat_session') {
            usefulActivityWeight += 2;
            socialActivityWeight += 2;
        } else if (type === 'crystal') {
            usefulActivityWeight += 2;
        }
    }

    let scEarned7d = 0;
    let scSpent7d = 0;
    for (const row of (Array.isArray(transactionRows) ? transactionRows : [])) {
        if (String(row?.currency || 'K') !== 'K') continue;
        const amount = Math.max(0, Number(row?.amount) || 0);
        const direction = String(row?.direction || '').trim();
        if (direction === 'credit') scEarned7d += amount;
        if (direction === 'debit') scSpent7d += amount;
    }

    let adRevenue7d = 0;
    for (const row of (Array.isArray(adRows) ? adRows : [])) {
        const data = row?.data && typeof row.data === 'object' ? row.data : {};
        if (String(data.eventType || '') === 'session') continue;
        const adRate = Number(data.adRate) || 0;
        adRevenue7d += (adRate / 1000) * 0.8;
    }

    const pendingAppeals = (Array.isArray(appeals) ? appeals : []).filter((row) => String(row?.status || '') === 'pending').length;

    const recentBattles = (Array.isArray(battles) ? battles : []).filter((battle) => {
        const time = battle?.startsAt ? new Date(battle.startsAt).getTime() : 0;
        return time >= since14d.getTime();
    });

    let suspiciousReports7d = 0;
    for (const battle of recentBattles) {
        const attendance = Array.isArray(battle?.attendance) ? battle.attendance : [];
        for (const entry of attendance) {
            if (!entry?.suspicious) continue;
            const suspiciousAt = entry?.suspiciousAt ? new Date(entry.suspiciousAt).getTime() : 0;
            if (suspiciousAt >= since7d.getTime()) suspiciousReports7d += 1;
        }
    }

    const latestFinishedBattle = recentBattles
        .filter((battle) => String(battle?.status || '') === 'finished')
        .sort((a, b) => {
            const aTime = a?.endsAt ? new Date(a.endsAt).getTime() : (a?.startsAt ? new Date(a.startsAt).getTime() : 0);
            const bTime = b?.endsAt ? new Date(b.endsAt).getTime() : (b?.startsAt ? new Date(b.startsAt).getTime() : 0);
            return bTime - aTime;
        })[0] || null;

    const latestBattleWasLost = latestFinishedBattle
        ? Number(latestFinishedBattle.lightDamage || 0) < Number(latestFinishedBattle.darknessDamage || 0)
        : false;

    const activeUsers72h = activeUsers.size;
    const entityCoverage = totalUsers > 0 ? totalEntities / totalUsers : 0;
    const activeRatio = totalUsers > 0 ? activeUsers72h / totalUsers : 0;
    const usefulPerActiveUser = activeUsers72h > 0 ? usefulActivityWeight / activeUsers72h : 0;

    const lifeScore = Math.round((
        clamp01(activeRatio / 0.28) * 0.5 +
        clamp01(usefulPerActiveUser / 12) * 0.35 +
        clamp01(entityCoverage / 0.6) * 0.15
    ) * 100);

    const communityWeight = socialActivityWeight;
    const communityScore = Math.round((
        clamp01(communityWeight / Math.max(40, totalUsers * 1.2)) * 0.7 +
        clamp01(safeCountFromMap(activityCountByType, 'chat_session') / Math.max(8, totalUsers * 0.08)) * 0.3
    ) * 100);

    const defenseScoreBase = Math.round((
        clamp01(defenseActivityWeight / Math.max(50, totalUsers * 1.5)) * 0.75 +
        clamp01(safeCountFromMap(activityCountByType, 'battle_participation') / Math.max(5, totalUsers * 0.05)) * 0.25
    ) * 100);
    const defenseScore = clampNumber(defenseScoreBase - (latestBattleWasLost ? 10 : 0), 0, 100);

    const flowScore = clamp01((scEarned7d + scSpent7d) / Math.max(500, totalUsers * 25));
    const balanceScore = clamp01((scEarned7d + 1) / Math.max(1, scSpent7d + 1));
    const adScore = clamp01(adRevenue7d / 5);
    const economyScore = Math.round((flowScore * 0.5 + balanceScore * 0.35 + adScore * 0.15) * 100);

    const appealPressure = clamp01(pendingAppeals / Math.max(3, totalUsers * 0.015));
    const suspiciousPressure = clamp01(suspiciousReports7d / Math.max(2, totalUsers * 0.01));
    const orderScore = Math.round((1 - clamp01(appealPressure * 0.6 + suspiciousPressure * 0.7)) * 100);

    const baseHarmony = (
        lifeScore * 0.32 +
        orderScore * 0.22 +
        defenseScore * 0.22 +
        communityScore * 0.14 +
        economyScore * 0.10
    );

    let riskScore = clampNumber(100 - Math.round(baseHarmony), 0, 100);
    if (latestBattleWasLost) riskScore = clampNumber(riskScore + 8, 0, 100);
    if (activeBattle) riskScore = 100;

    const stage = getDarknessStage(riskScore, { activeBattle: Boolean(activeBattle) });

    const scales = [
        {
            id: 'life',
            title: 'Живость мира',
            score: lifeScore,
            text: `Сколько людей реально живут на сайте и приносят пользу Древу.`,
        },
        {
            id: 'community',
            title: 'Связь между жителями',
            score: communityScore,
            text: `Общение, совместность и теплота между людьми.`,
        },
        {
            id: 'defense',
            title: 'Готовность к защите',
            score: defenseScore,
            text: `Насколько мир готов защищать Древо делом, а не словами.`,
        },
        {
            id: 'economy',
            title: 'Сила мира',
            score: economyScore,
            text: `Движение ценностей, трат и общей живости мира.`,
        },
        {
            id: 'order',
            title: 'Порядок мира',
            score: orderScore,
            text: `Сколько сейчас поводов для тени: жалобы, странные бои и внутренний шум.`,
        },
    ];

    const darkReasons = [];
    const calmReasons = [];

    if (activeRatio < 0.2) {
        darkReasons.push({
            title: 'Мир вялый',
            value: Math.round((1 - clamp01(activeRatio / 0.2)) * 100),
            text: `За последние 72 часа активных жителей мало: ${activeUsers72h} из ${totalUsers || 0}.`,
        });
    } else {
        calmReasons.push({
            title: 'Мир живой',
            value: Math.round(clamp01(activeRatio / 0.35) * 100),
            text: `За последние 72 часа были активны ${activeUsers72h} жителей.`,
        });
    }

    if (treeActivityWeight < Math.max(25, totalUsers * 0.7)) {
        darkReasons.push({
            title: 'Древо кормят слабо',
            value: Math.round((1 - clamp01(treeActivityWeight / Math.max(25, totalUsers * 0.7))) * 100),
            text: `Сбор солнца, плодов и лечение Древа идут слабее, чем нужно.`,
        });
    } else {
        calmReasons.push({
            title: 'Древо подпитывают',
            value: Math.round(clamp01(treeActivityWeight / Math.max(25, totalUsers * 0.7)) * 100),
            text: `У мира хватает действий, которые поддерживают Древо.`,
        });
    }

    if (pendingAppeals > 0) {
        darkReasons.push({
            title: 'В мире растёт грязь',
            value: Math.round(appealPressure * 100),
            text: `Сейчас висит ${pendingAppeals} необработанных жалоб.`,
        });
    } else {
        calmReasons.push({
            title: 'Жалоб почти нет',
            value: 80,
            text: 'Сейчас мир спокойнее обычного и не тонет в жалобах.',
        });
    }

    if (suspiciousReports7d > 0) {
        darkReasons.push({
            title: 'Есть мутные бои',
            value: Math.round(suspiciousPressure * 100),
            text: `За 7 дней найдено ${suspiciousReports7d} подозрительных боевых отчётов.`,
        });
    } else {
        calmReasons.push({
            title: 'Бои чище обычного',
            value: 75,
            text: 'За последние 7 дней не было новых подозрительных боевых отчётов.',
        });
    }

    if (latestBattleWasLost) {
        darkReasons.push({
            title: 'Последний бой проигран',
            value: 82,
            text: 'Недавняя победа Мрака добавляет тени и толкает следующий удар ближе.',
        });
    }

    if (defenseScore >= 60) {
        calmReasons.push({
            title: 'Мир умеет защищаться',
            value: defenseScore,
            text: 'Ночная Смена, лечение Древа и боевое участие держат защиту в тонусе.',
        });
    } else {
        darkReasons.push({
            title: 'Защита слабеет',
            value: Math.round((1 - defenseScore / 100) * 100),
            text: 'Люди слишком мало делают для защиты мира и самого Древа.',
        });
    }

    if (communityScore >= 55) {
        calmReasons.push({
            title: 'Люди не молчат',
            value: communityScore,
            text: 'Общение, отклик и совместные действия пока держат мир живым.',
        });
    } else {
        darkReasons.push({
            title: 'Связь между людьми слабеет',
            value: Math.round((1 - communityScore / 100) * 100),
            text: 'Слабое общение и малая общая вовлечённость всегда зовут Мрак ближе.',
        });
    }

    if (economyScore >= 55) {
        calmReasons.push({
            title: 'В мире есть движение',
            value: economyScore,
            text: `За 7 дней движение ценностей живое: приход ${round2(scEarned7d)} K, траты ${round2(scSpent7d)} K.`,
        });
    } else {
        darkReasons.push({
            title: 'Мир беднеет и замирает',
            value: Math.round((1 - economyScore / 100) * 100),
            text: `Слишком слабое движение ценностей: приход ${round2(scEarned7d)} K, траты ${round2(scSpent7d)} K.`,
        });
    }

    darkReasons.sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
    calmReasons.sort((a, b) => Number(b.value || 0) - Number(a.value || 0));

    return {
        generatedAt: new Date().toISOString(),
        riskScore,
        stage,
        scales,
        darkReasons: darkReasons.slice(0, 5),
        calmReasons: calmReasons.slice(0, 5),
        stats: {
            totalUsers,
            activeUsers72h,
            entityCoveragePercent: Math.round(entityCoverage * 100),
            usefulActions72h: Math.round(usefulActivityWeight),
            pendingAppeals,
            suspiciousReports7d,
            scEarned7d: round2(scEarned7d),
            scSpent7d: round2(scSpent7d),
            adRevenue7d: round2(adRevenue7d),
            latestBattleResult: latestFinishedBattle
                ? (latestBattleWasLost ? 'darkness' : Number(latestFinishedBattle.lightDamage || 0) === Number(latestFinishedBattle.darknessDamage || 0) ? 'draw' : 'light')
                : null,
        },
        battle: {
            active: activeBattle
                ? {
                    _id: activeBattle._id,
                    startsAt: activeBattle.startsAt,
                    endsAt: activeBattle.endsAt,
                }
                : null,
            upcoming: upcomingBattle
                ? {
                    _id: upcomingBattle._id,
                    startsAt: upcomingBattle.scheduleSource === 'auto' ? null : upcomingBattle.startsAt,
                    durationSeconds: upcomingBattle.scheduleSource === 'auto' ? null : upcomingBattle.durationSeconds,
                }
                : null,
        },
        notes: {
            activeBattleText: activeBattle ? `Сейчас уже идёт бой. Начался ${formatShortDate(activeBattle.startsAt)}.` : null,
            upcomingBattleText: upcomingBattle?.startsAt
                ? (upcomingBattle.scheduleSource === 'auto'
                    ? 'Мрак уже выбирает час удара, но точный момент скрыт.'
                    : `Следующий бой уже намечен на ${formatShortDate(upcomingBattle.startsAt)}.`)
                : null,
        },
    };
}

// Get entities
exports.getEntities = async (req, res) => {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('entities')
            .select('id,user_id,name,stage,mood,avatar_url,satiety_until,created_at,updated_at,history,user:users!entities_user_id_fkey(id,nickname,email)')
            .order('created_at', { ascending: false });
        if (error) {
            return res.status(500).json({ message: error.message });
        }

        const entities = (Array.isArray(data) ? data : []).map((row) => ({
            _id: row.id,
            user: row.user_id
                ? {
                    _id: row.user_id,
                    nickname: row?.user?.nickname,
                    email: row?.user?.email,
                }
                : null,
            name: row.name,
            stage: row.stage,
            mood: row.mood,
            avatarUrl: row.avatar_url,
            satietyUntil: row.satiety_until,
            history: row.history,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));

        return res.json({ entities });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getAdmins = async (req, res) => {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('users')
            .select('id,email,nickname,role,status,email_confirmed,created_at,updated_at')
            .eq('role', 'admin')
            .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ message: error.message });

        const admins = (Array.isArray(data) ? data : [])
            .filter((row) => isAdminEmail(row?.email))
            .map((row) => ({
                _id: row.id,
                email: row.email,
                nickname: row.nickname,
                role: row.role,
                status: row.status,
                emailConfirmed: Boolean(row.email_confirmed),
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            }));
        res.json({ admins });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.createAdmin = async (req, res) => {
    try {
        const { email, seedPhrase } = req.body || {};
        const e = String(email || '').trim().toLowerCase();
        const sp = String(seedPhrase || '').trim();

        if (!e) return res.status(400).json({ message: 'Email обязателен' });
        if (!e.includes('@')) return res.status(400).json({ message: 'Некорректный email' });
        if (!hasValidEmailLocalPart(e)) {
            return res.status(400).json({ message: 'Email не должен содержать точки и спецсимволы до @' });
        }
        if (!isAdminEmail(e)) return res.status(400).json({ message: ADMIN_EMAIL_REQUIREMENT_MESSAGE });
        if (!sp) return res.status(400).json({ message: 'Введите сид-фразу' });
        if (!validateSeedPhrase24(sp)) {
            return res.status(400).json({ message: 'Сид-фраза должна содержать 24 слова' });
        }

        const nickname = extractNicknameFromEmail(e);
        if (!nickname) return res.status(400).json({ message: 'Некорректный email' });

        const supabase = getSupabaseClient();

        const { data: existingEmail } = await supabase
            .from('users')
            .select('id')
            .eq('email', e)
            .maybeSingle();
        if (existingEmail) return res.status(400).json({ message: 'Почта уже используется' });

        const { data: existingNick } = await supabase
            .from('users')
            .select('id')
            .eq('nickname', nickname)
            .maybeSingle();
        if (existingNick) return res.status(400).json({ message: 'Никнейм уже занят' });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(sp, salt);
        const nowIso = new Date().toISOString();
        const adminId = generateUserId();

        const { data: admin, error } = await supabase
            .from('users')
            .insert({
                id: adminId,
                email: e,
                password_hash: passwordHash,
                role: 'admin',
                nickname,
                status: 'active',
                email_confirmed: true,
                email_confirmed_at: nowIso,
                access_restricted_until: null,
                access_restriction_reason: '',
                language: 'ru',
                data: {},
                created_at: nowIso,
                updated_at: nowIso,
            })
            .select('id,email,nickname,role,status,email_confirmed,created_at,updated_at')
            .maybeSingle();
        if (error || !admin) {
            return res.status(400).json({ message: 'Не удалось создать пользователя' });
        }

        res.status(201).json({
            admin: {
                _id: admin.id,
                email: admin.email,
                nickname: admin.nickname,
                role: admin.role,
                status: admin.status,
                emailConfirmed: Boolean(admin.email_confirmed),
                createdAt: admin.created_at,
                updatedAt: admin.updated_at,
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateAdminEmail = async (req, res) => {
    try {
        const { id } = req.params;
        const { email } = req.body || {};
        const e = String(email || '').trim().toLowerCase();

        if (!e) return res.status(400).json({ message: 'Email обязателен' });
        if (!e.includes('@')) return res.status(400).json({ message: 'Некорректный email' });
        if (!hasValidEmailLocalPart(e)) {
            return res.status(400).json({ message: 'Email не должен содержать точки и спецсимволы до @' });
        }
        if (!isAdminEmail(e)) return res.status(400).json({ message: ADMIN_EMAIL_REQUIREMENT_MESSAGE });

        const supabase = getSupabaseClient();
        const { data: admin, error: adminError } = await supabase
            .from('users')
            .select('id,email,nickname,role,status,email_confirmed,created_at,updated_at')
            .eq('id', String(id))
            .maybeSingle();
        if (adminError || !admin) return res.status(404).json({ message: 'Админ не найден' });
        if (admin.role !== 'admin' || !isAdminEmail(admin.email)) {
            return res.status(400).json({ message: 'Пользователь не является админом' });
        }

        const nickname = extractNicknameFromEmail(e);
        if (!nickname) return res.status(400).json({ message: 'Некорректный email' });

        const { data: existingEmail } = await supabase
            .from('users')
            .select('id')
            .eq('email', e)
            .neq('id', String(admin.id))
            .maybeSingle();
        if (existingEmail) return res.status(400).json({ message: 'Почта уже используется' });

        const { data: existingNick } = await supabase
            .from('users')
            .select('id')
            .eq('nickname', nickname)
            .neq('id', String(admin.id))
            .maybeSingle();
        if (existingNick) return res.status(400).json({ message: 'Никнейм уже занят' });

        const nowIso = new Date().toISOString();
        const { data: updated, error } = await supabase
            .from('users')
            .update({ email: e, nickname, updated_at: nowIso })
            .eq('id', String(admin.id))
            .select('id,email,nickname,role,status,email_confirmed,created_at,updated_at')
            .maybeSingle();
        if (error || !updated) return res.status(500).json({ message: 'Server error' });

        res.json({
            admin: {
                _id: updated.id,
                email: updated.email,
                nickname: updated.nickname,
                role: updated.role,
                status: updated.status,
                emailConfirmed: Boolean(updated.email_confirmed),
                createdAt: updated.created_at,
                updatedAt: updated.updated_at,
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update entity avatar
exports.updateEntityAvatar = async (req, res) => {
    try {
        const { id } = req.params;
        const { avatarUrl } = req.body || {};
        if (!avatarUrl) {
            return res.status(400).json({ message: 'avatarUrl is required' });
        }

        const supabase = getSupabaseClient();
        const nowIso = new Date().toISOString();
        const { data: entityRow, error } = await supabase
            .from('entities')
            .update({ avatar_url: avatarUrl.toString().trim(), updated_at: nowIso })
            .eq('id', Number(id))
            .select('id,user_id,name,stage,mood,avatar_url,satiety_until,created_at,updated_at,history,user:users!entities_user_id_fkey(id,nickname,email)')
            .maybeSingle();

        if (error || !entityRow) return res.status(404).json({ message: 'Сущность не найдена' });

        await adminAudit('entity.avatar.update', req, {
            targetId: id,
            userId: entityRow.user_id,
        });

        const entity = {
            _id: entityRow.id,
            user: entityRow.user_id
                ? {
                    _id: entityRow.user_id,
                    nickname: entityRow?.user?.nickname,
                    email: entityRow?.user?.email,
                }
                : null,
            name: entityRow.name,
            stage: entityRow.stage,
            mood: entityRow.mood,
            avatarUrl: entityRow.avatar_url,
            satietyUntil: entityRow.satiety_until,
            history: entityRow.history,
            createdAt: entityRow.created_at,
            updatedAt: entityRow.updated_at,
        };

        return res.json({ entity });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete entity
exports.deleteEntity = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await deleteEntityTotally(id);

        await adminAudit('entity.delete', req, {
            targetId: id,
            userId: result.userId,
        });

        return res.json({ message: 'Сущность удалена' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

// Get referrals
exports.getReferrals = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, status } = req.query;
        const safePage = Math.max(1, Number(page) || 1);
        const safeLimit = Math.max(1, Math.min(200, Number(limit) || 20));

        const supabase = getSupabaseClient();

        let userIdsForSearch = null;
        if (search) {
            const s = String(search || '').trim();
            if (s) {
                const { data: users, error: userError } = await supabase
                    .from('users')
                    .select('id')
                    .or(`nickname.ilike.%${s}%,email.ilike.%${s}%`);
                if (userError) {
                    return res.status(500).json({ message: 'Server error' });
                }
                const ids = (Array.isArray(users) ? users : []).map((u) => String(u?.id || '').trim()).filter(Boolean);
                if (!ids.length) {
                    return res.json({
                        referrals: [],
                        totalPages: 0,
                        currentPage: safePage,
                        totalReferrals: 0,
                        statusCounts: { active: 0, pending: 0, inactive: 0 },
                    });
                }
                userIdsForSearch = ids;
            }
        }

        let baseQuery = supabase
            .from('referrals')
            .select(
                'id,inviter_id,invitee_id,code,invitee_ip,invitee_fingerprint,bonus_granted,confirmed_at,status,checked_at,check_reason,active_since,activity_summary,created_at,updated_at,inviter:users!referrals_inviter_id_fkey(id,nickname,email),invitee:users!referrals_invitee_id_fkey(id,nickname,email,status,data)',
                { count: 'exact' }
            )
            .order('created_at', { ascending: false })
            .range((safePage - 1) * safeLimit, (safePage - 1) * safeLimit + safeLimit - 1);

        if (status) {
            baseQuery = baseQuery.eq('status', String(status));
        }

        if (Array.isArray(userIdsForSearch) && userIdsForSearch.length) {
            const inList = userIdsForSearch.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',');
            baseQuery = baseQuery.or(`inviter_id.in.(${inList}),invitee_id.in.(${inList})`);
        }

        const { data: rows, error, count } = await baseQuery;
        if (error) {
            return res.status(500).json({ message: 'Server error' });
        }

        const referrals = (Array.isArray(rows) ? rows : []).map((row) => {
            const inviteeData = row?.invitee?.data && typeof row.invitee.data === 'object' ? row.invitee.data : {};
            const hasEntity = Boolean(inviteeData?.entity || inviteeData?.entityId);
            const summary = row?.activity_summary && typeof row.activity_summary === 'object' ? row.activity_summary : {};
            return {
                id: row.id,
                inviter: row.inviter,
                invitee: row.invitee,
                code: row.code,
                inviteeIp: row.invitee_ip,
                inviteeFingerprint: row.invitee_fingerprint,
                bonusGranted: row.bonus_granted,
                confirmedAt: row.confirmed_at,
                status: row.status,
                checkedAt: row.checked_at,
                checkReason: row.check_reason,
                activeSince: row.active_since,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                activitySummary: {
                    daysActive: summary?.daysActive || 0,
                    minutesTotal: summary?.minutesTotal || 0,
                    solarCollects: summary?.solarCollects || 0,
                    battleCount: summary?.battleCount || 0,
                    searchCount: summary?.searchCount || 0,
                    bridgeStones: summary?.bridgeStones || 0,
                    hasEntity,
                },
            };
        });

        const total = Math.max(0, Number(count) || 0);

        let statusCountsQueryBase = supabase
            .from('referrals')
            .select('id', { head: true, count: 'exact' });
        if (Array.isArray(userIdsForSearch) && userIdsForSearch.length) {
            const inList = userIdsForSearch.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',');
            statusCountsQueryBase = statusCountsQueryBase.or(`inviter_id.in.(${inList}),invitee_id.in.(${inList})`);
        }

        const [activeCountRes, pendingCountRes, inactiveCountRes] = await Promise.all([
            statusCountsQueryBase.eq('status', 'active'),
            statusCountsQueryBase.eq('status', 'pending'),
            statusCountsQueryBase.eq('status', 'inactive'),
        ]);

        const statusCounts = {
            active: Math.max(0, Number(activeCountRes?.count) || 0),
            pending: Math.max(0, Number(pendingCountRes?.count) || 0),
            inactive: Math.max(0, Number(inactiveCountRes?.count) || 0),
        };

        return res.json({
            referrals,
            totalPages: Math.ceil(total / safeLimit),
            currentPage: safePage,
            totalReferrals: total,
            statusCounts,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};



// Get all users with search and pagination
exports.getUsers = async (req, res) => {
    try {
        const {
            search,
            role,
            status,
            minLives,
            minStars,
            page = 1,
            limit = 20,
        } = req.query;
        const safePage = Math.max(1, Number(page) || 1);
        const safeLimit = Math.max(1, Math.min(200, Number(limit) || 20));

        const supabase = getSupabaseClient();
        let baseQuery = supabase
            .from('users')
            .select('id,email,nickname,role,status,email_confirmed,created_at,updated_at,data', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range((safePage - 1) * safeLimit, (safePage - 1) * safeLimit + safeLimit - 1);

        if (role) baseQuery = baseQuery.eq('role', String(role));
        if (status) baseQuery = baseQuery.eq('status', String(status));
        if (search) {
            const s = String(search || '').trim();
            if (s) {
                baseQuery = baseQuery.or(`nickname.ilike.%${s}%,email.ilike.%${s}%`);
            }
        }

        const { data: rows, error, count } = await baseQuery;
        if (error) return res.status(500).json({ message: error.message });

        const livesThreshold = minLives !== undefined && minLives !== '' ? Number(minLives) : null;
        const starsThreshold = minStars !== undefined && minStars !== '' ? Number(minStars) : null;
        const filtered = (Array.isArray(rows) ? rows : []).filter((row) => {
            const d = row?.data && typeof row.data === 'object' ? row.data : {};
            const lives = Number(d.lives) || 0;
            const stars = Number(d.stars) || 0;
            if (Number.isFinite(livesThreshold) && lives < livesThreshold) return false;
            if (Number.isFinite(starsThreshold) && stars < starsThreshold) return false;
            return true;
        });

        const users = filtered.map((row) => ({
            _id: row.id,
            email: row.email,
            nickname: row.nickname,
            role: row.role,
            status: row.status,
            emailConfirmed: Boolean(row.email_confirmed),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            ...(row?.data && typeof row.data === 'object' ? row.data : {}),
        }));

        const total = Math.max(0, Number(count) || 0);

        res.json({
            users,
            totalPages: Math.ceil(total / safeLimit),
            currentPage: safePage,
            totalUsers: total,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get single user
exports.getUserById = async (req, res) => {
    try {
        const supabase = getSupabaseClient();
        const { data: row, error } = await supabase
            .from('users')
            .select('id,email,nickname,role,status,email_confirmed,created_at,updated_at,data')
            .eq('id', String(req.params.id))
            .maybeSingle();
        if (error || !row) return res.status(404).json({ message: 'Пользователь не найден' });

        const data = row?.data && typeof row.data === 'object' ? row.data : {};
        res.json({
            _id: row.id,
            email: row.email,
            nickname: row.nickname,
            role: row.role,
            status: row.status,
            emailConfirmed: Boolean(row.email_confirmed),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            ...data,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Update user
exports.updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const supabase = getSupabaseClient();
        const { data: current, error: currentError } = await supabase
            .from('users')
            .select('id,email,nickname,role,status,email_confirmed,created_at,updated_at,data')
            .eq('id', String(id))
            .maybeSingle();
        if (currentError || !current) return res.status(404).json({ message: 'Пользователь не найден' });

        const body = updates && typeof updates === 'object' ? updates : {};
        const nextData = { ...(current.data && typeof current.data === 'object' ? current.data : {}) };

        const columnUpdates = {};
        if (Object.prototype.hasOwnProperty.call(body, 'email')) columnUpdates.email = String(body.email || '').trim().toLowerCase();
        if (Object.prototype.hasOwnProperty.call(body, 'nickname')) columnUpdates.nickname = String(body.nickname || '').trim();
        if (Object.prototype.hasOwnProperty.call(body, 'role')) columnUpdates.role = String(body.role || '').trim();
        if (Object.prototype.hasOwnProperty.call(body, 'status')) columnUpdates.status = String(body.status || '').trim();
        if (Object.prototype.hasOwnProperty.call(body, 'emailConfirmed')) columnUpdates.email_confirmed = Boolean(body.emailConfirmed);
        if (Object.prototype.hasOwnProperty.call(body, 'email_confirmed')) columnUpdates.email_confirmed = Boolean(body.email_confirmed);

        for (const [key, value] of Object.entries(body)) {
            if (['email', 'nickname', 'role', 'status', 'emailConfirmed', 'email_confirmed'].includes(key)) continue;
            nextData[key] = value;
        }

        const nowIso = new Date().toISOString();
        const { data: updated, error } = await supabase
            .from('users')
            .update({
                ...columnUpdates,
                data: nextData,
                updated_at: nowIso,
            })
            .eq('id', String(id))
            .select('id,email,nickname,role,status,email_confirmed,created_at,updated_at,data')
            .maybeSingle();
        if (error || !updated) return res.status(500).json({ message: 'Server error' });

        await adminAudit('user.update', req, {
            targetId: id,
            nickname: updated.nickname,
            updates: Object.keys(body)
        });

        const outData = updated.data && typeof updated.data === 'object' ? updated.data : {};
        res.json({
            _id: updated.id,
            email: updated.email,
            nickname: updated.nickname,
            role: updated.role,
            status: updated.status,
            emailConfirmed: Boolean(updated.email_confirmed),
            createdAt: updated.created_at,
            updatedAt: updated.updated_at,
            ...outData,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Delete user
exports.deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await deleteUserTotally(id);

        await adminAudit('user.delete', req, { targetId: id, nickname: result.nickname });

        res.json({ message: 'Пользователь удален' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

// Reset password
exports.resetUserPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;
        if (!newPassword) return res.status(400).json({ message: 'Новый пароль обязателен' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        const supabase = getSupabaseClient();
        const nowIso = new Date().toISOString();
        const { data: updated, error } = await supabase
            .from('users')
            .update({ password_hash: hashedPassword, updated_at: nowIso })
            .eq('id', String(id))
            .select('id,nickname')
            .maybeSingle();
        if (error || !updated) return res.status(404).json({ message: 'Пользователь не найден' });

        await adminAudit('user.password_reset', req, { targetId: id, nickname: updated.nickname });

        res.json({ message: 'Пароль успешно сброшен' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get appeals
exports.getAppeals = async (req, res) => {
    try {
        const { status } = req.query;
        const statusAlias = {
            inProgress: 'pending',
            confirmed: 'resolved',
            declined: 'rejected',
        };
        const normalizedStatus = statusAlias[String(status || '').trim()] || status;
        const all = await listModelDocs('Appeal');
        const filtered = all.filter((row) => {
            if (!normalizedStatus) return true;
            return String(row?.status || '') === String(normalizedStatus);
        });
        filtered.sort((a, b) => {
            const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
        });

        const userIds = Array.from(new Set(
            filtered
                .flatMap((a) => [toId(a?.complainant), toId(a?.againstUser)])
                .filter(Boolean)
        ));
        const usersById = await getUsersByIds(userIds);

        const appeals = filtered.map((row) => {
            const complainantId = toId(row?.complainant);
            const againstId = toId(row?.againstUser);
            const complainant = complainantId ? usersById.get(complainantId) : null;
            const againstUser = againstId ? usersById.get(againstId) : null;
            return {
                ...row,
                complainant: complainant
                    ? { _id: complainant.id, nickname: complainant.nickname, email: complainant.email }
                    : row.complainant,
                againstUser: againstUser
                    ? { _id: againstUser.id, nickname: againstUser.nickname, email: againstUser.email }
                    : row.againstUser,
            };
        });

        res.json(appeals);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Handle appeal
exports.handleAppeal = async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body; // 'confirm' or 'cancel'

        const appeal = await getModelDocById('Appeal', id);
        if (!appeal) return res.status(404).json({ message: 'Апелляция не найдена' });
        if (appeal.status !== 'pending') return res.status(400).json({ message: 'Апелляция уже обработана' });

        if (action === 'confirm') {
            const penalty = await applyPenalty(appeal.againstUser);
            const saved = await updateModelDoc('Appeal', appeal._id, {
                status: 'resolved',
                penaltyApplied: true,
                resolvedAt: new Date(),
            });
            if (!saved) return res.status(500).json({ message: 'Server error' });

            updateEntityMoodForUser(appeal.againstUser).catch(() => { });
            await adminAudit('appeal.handle', req, { appealId: id, action, againstUser: appeal.againstUser });
            return res.json({ ok: true, status: saved.status, penalty });
        }

        if (action === 'cancel' || action === 'decline') {
            const compensationAmount = await getNumericSettingValue('SC_APPEAL_COMPENSATION', 100);
            const COMPENSATION_MONTH_LIMIT = 15;
            const monthAgo = new Date(Date.now() - 24 * 30 * 60 * 60 * 1000);

            const userId = String(appeal.againstUser);
            if (userId) {
                const allAppeals = await listModelDocs('Appeal');
                const compensationCount = allAppeals.filter((row) => {
                    if (String(row?.againstUser || '') !== String(userId)) return false;
                    if (String(row?.status || '') !== 'rejected') return false;
                    const resolvedAt = row?.resolvedAt ? new Date(row.resolvedAt) : null;
                    if (!resolvedAt || Number.isNaN(resolvedAt.getTime())) return false;
                    return resolvedAt.getTime() >= monthAgo.getTime();
                }).length;
                if (compensationCount < COMPENSATION_MONTH_LIMIT) {
                    const row = await getUserRowById(userId);
                    if (row) {
                        const data = row.data && typeof row.data === 'object' ? row.data : {};
                        const nextSc = (Number(data.sc) || 0) + compensationAmount;
                        await updateUserDataById(userId, { sc: nextSc });
                        await recordTransaction({
                            userId,
                            type: 'appeal_compensation',
                            direction: 'credit',
                            amount: compensationAmount,
                            currency: 'K',
                            description: 'Компенсация за ложную жалобу',
                            relatedEntity: id,
                        }).catch(() => null);
                    }
                }
            }

            const saved = await updateModelDoc('Appeal', appeal._id, {
                status: 'rejected',
                resolvedAt: new Date(),
            });
            if (!saved) return res.status(500).json({ message: 'Server error' });

            updateEntityMoodForUser(appeal.againstUser).catch(() => { });
            await adminAudit('appeal.handle', req, { appealId: id, action });
            return res.json({ ok: true, status: saved.status });
        }

        return res.status(400).json({ message: 'action must be confirm|cancel' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get stats
exports.getStats = async (req, res) => {
    try {
        const supabase = getSupabaseClient();
        const { count: totalUsers } = await supabase
            .from('users')
            .select('id', { head: true, count: 'exact' });

        const dayStart = new Date(new Date().setHours(0, 0, 0, 0));
        const { count: newUsersToday } = await supabase
            .from('users')
            .select('id', { head: true, count: 'exact' })
            .gte('created_at', dayStart.toISOString());
        const appeals = await listModelDocs('Appeal');
        const activeAppeals = appeals.filter((row) => String(row?.status || '') === 'pending').length;

        // Basic economy stats
        let totalScValue = 0;
        await forEachUserBatch({
            pageSize: 500,
            map: (user) => Number(user?.sc) || 0,
            handler: async (batch) => {
                for (const sc of batch) {
                    totalScValue += sc;
                }
            },
        });

        // Activity stats (last 7 days)
        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);

            const { count } = await supabase
                .from('users')
                .select('id', { head: true, count: 'exact' })
                .gte('created_at', date.toISOString())
                .lt('created_at', nextDate.toISOString());
            last7Days.push({
                name: date.toLocaleDateString('ru-RU', { weekday: 'short' }),
                users: count,
                date: date.toISOString().split('T')[0]
            });
        }

        res.json({
            totalUsers,
            newUsersToday,
            activeAppeals,
            totalSC: totalScValue,
            activityChart: last7Days
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Audit Logs
exports.getAuditLogs = async (req, res) => {
    try {
        const { page = 1, limit = 50 } = req.query;
        const safePage = Math.max(1, Number(page) || 1);
        const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));

        const all = await listModelDocs('AdminAudit');
        all.sort((a, b) => {
            const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
        });

        const logs = all.slice((safePage - 1) * safeLimit, (safePage - 1) * safeLimit + safeLimit);

        const safeLogs = Array.isArray(logs) ? logs : [];
        const userIds = Array.from(new Set(safeLogs
            .map((row) => (row?.user ? String(row.user) : ''))
            .filter(Boolean)));
        const supabase = getSupabaseClient();
        const { data: users, error } = userIds.length
            ? await supabase
                .from('users')
                .select('id,nickname,email,status')
                .in('id', userIds)
            : { data: [], error: null };
        if (error) return res.status(500).json({ message: error.message });

        const userMap = new Map((Array.isArray(users) ? users : []).map((u) => [String(u.id), u]));
        const enrichedLogs = safeLogs.map((row) => {
            const id = row?.user ? String(row.user) : '';
            const u = id ? userMap.get(id) : null;
            return {
                ...row,
                user: u ? { _id: u.id, nickname: u.nickname, email: u.email, status: u.status } : row.user,
            };
        });

        const count = all.length;

        res.json({
            logs: enrichedLogs,
            totalPages: Math.ceil(count / safeLimit),
            currentPage: safePage
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Chat History
exports.getChatHistory = async (req, res) => {
    try {
        const { chatId, userId } = req.query;
        const scopedUserId = req.params?.id || userId || null;
        const supabase = getSupabaseClient();

        const scopedUserKey = scopedUserId ? String(scopedUserId) : '';
        const chatKey = chatId ? String(chatId) : '';

        if (scopedUserKey) {
            const { data: userChats, error: chatError } = await supabase
                .from('chats')
                .select('id')
                .contains('participants', [scopedUserKey]);
            if (chatError) {
                return res.status(500).json({ message: 'Ошибка чтения чатов' });
            }
            const chatIds = (Array.isArray(userChats) ? userChats : []).map((c) => String(c.id)).filter(Boolean);
            if (!chatIds.length) return res.json([]);

            if (chatKey) {
                const isAllowedChat = chatIds.some((id) => String(id) === String(chatKey));
                if (!isAllowedChat) return res.json([]);
            }

            const { data: messages, error: messageError } = await supabase
                .from('chat_messages')
                .select('id,chat_id,sender_id,original_text,translated_text,created_at,status')
                .in('chat_id', chatKey ? [chatKey] : chatIds)
                .order('created_at', { ascending: true })
                .limit(500);
            if (messageError) {
                return res.status(500).json({ message: 'Ошибка чтения сообщений' });
            }

            const senderIds = Array.from(
                new Set((Array.isArray(messages) ? messages : []).map((m) => toId(m?.sender_id)).filter(Boolean))
            );
            const usersById = await getUsersByIds(senderIds);

            const normalized = (Array.isArray(messages) ? messages : []).map((m) => {
                const senderId = toId(m?.sender_id);
                const sender = senderId ? usersById.get(senderId) : null;
                return {
                    _id: String(m.id),
                    chatId: String(m.chat_id),
                    senderId,
                    sender: sender ? { _id: sender.id, nickname: sender.nickname, email: sender.email } : null,
                    content: String(m.original_text ?? ''),
                    translatedContent: String(m.translated_text ?? ''),
                    createdAt: m.created_at,
                    status: m.status,
                };
            });

            return res.json(normalized);
        }

        if (!chatKey) return res.json([]);

        const { data: messages, error: messageError } = await supabase
            .from('chat_messages')
            .select('id,chat_id,sender_id,original_text,translated_text,created_at,status')
            .eq('chat_id', chatKey)
            .order('created_at', { ascending: true })
            .limit(500);
        if (messageError) {
            return res.status(500).json({ message: 'Ошибка чтения сообщений' });
        }

        const senderIds = Array.from(
            new Set((Array.isArray(messages) ? messages : []).map((m) => toId(m?.sender_id)).filter(Boolean))
        );
        const usersById = await getUsersByIds(senderIds);

        const normalized = (Array.isArray(messages) ? messages : []).map((m) => {
            const senderId = toId(m?.sender_id);
            const sender = senderId ? usersById.get(senderId) : null;
            return {
                _id: String(m.id),
                chatId: String(m.chat_id),
                senderId,
                sender: sender ? { _id: sender.id, nickname: sender.nickname, email: sender.email } : null,
                content: String(m.original_text ?? ''),
                translatedContent: String(m.translated_text ?? ''),
                createdAt: m.created_at,
                status: m.status,
            };
        });

        return res.json(normalized);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Battle History
exports.getBattleHistory = async (req, res) => {
    try {
        const all = await listModelDocs('Battle');
        all.sort((a, b) => {
            const aTime = a?.startsAt ? new Date(a.startsAt).getTime() : 0;
            const bTime = b?.startsAt ? new Date(b.startsAt).getTime() : 0;
            return bTime - aTime;
        });
        res.json(all.slice(0, 50));
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getBattleControl = async (req, res) => {
    try {
        const [active, upcoming, scheduledBattles] = await Promise.all([
            battleService.getCurrentBattle(),
            battleService.getUpcomingBattle(),
            battleService.listScheduledBattles({ includeAuto: false }),
        ]);
        const safeUpcoming = upcoming && upcoming.scheduleSource === 'auto'
            ? {
                ...upcoming,
                startsAt: null,
                durationSeconds: null,
                scheduledIntervalHours: null,
            }
            : upcoming;
        const mergedScheduledBattles = [];
        const seenBattleIds = new Set();
        if (safeUpcoming && String(safeUpcoming.scheduleSource || '') !== 'auto' && String(safeUpcoming.status || '') === 'scheduled') {
            const upcomingId = String(safeUpcoming._id || '').trim();
            if (upcomingId) {
                seenBattleIds.add(upcomingId);
                mergedScheduledBattles.push(safeUpcoming);
            }
        }
        for (const battle of Array.isArray(scheduledBattles) ? scheduledBattles : []) {
            const battleId = String(battle?._id || '').trim();
            if (!battleId || seenBattleIds.has(battleId)) continue;
            seenBattleIds.add(battleId);
            mergedScheduledBattles.push(battle);
        }
        res.json({
            active,
            upcoming: safeUpcoming,
            scheduledBattles: mergedScheduledBattles,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getBattleMoodForecast = async (req, res) => {
    try {
        const data = await buildBattleMoodForecast();
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getSuspiciousBattleUsers = async (req, res) => {
    try {
        const limitRaw = Number(req.query?.limit);
        const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 200;

        const battles = await listModelDocs('Battle');
        const flat = [];

        for (const battle of battles) {
            if (!['active', 'finished'].includes(String(battle?.status || ''))) continue;
            const attendance = Array.isArray(battle?.attendance) ? battle.attendance : [];
            if (!attendance.length) continue;
            for (const entry of attendance) {
                if (!entry || !entry.suspicious) continue;
                flat.push({ battle, entry });
            }
        }

        flat.sort((a, b) => {
            const aSusp = a?.entry?.suspiciousAt ? new Date(a.entry.suspiciousAt).getTime() : 0;
            const bSusp = b?.entry?.suspiciousAt ? new Date(b.entry.suspiciousAt).getTime() : 0;
            if (bSusp !== aSusp) return bSusp - aSusp;
            const aEnds = a?.battle?.endsAt ? new Date(a.battle.endsAt).getTime() : 0;
            const bEnds = b?.battle?.endsAt ? new Date(b.battle.endsAt).getTime() : 0;
            if (bEnds !== aEnds) return bEnds - aEnds;
            const aStarts = a?.battle?.startsAt ? new Date(a.battle.startsAt).getTime() : 0;
            const bStarts = b?.battle?.startsAt ? new Date(b.battle.startsAt).getTime() : 0;
            return bStarts - aStarts;
        });

        const sliced = flat.slice(0, limit);
        const userIds = Array.from(new Set(sliced.map((row) => toId(row?.entry?.user)).filter(Boolean)));
        const usersById = await getUsersByIds(userIds);

        const rows = sliced.map(({ battle, entry }) => {
            const userId = toId(entry?.user);
            const user = userId ? usersById.get(userId) : null;
            return {
                battleId: battle?._id,
                battleStatus: battle?.status,
                startsAt: battle?.startsAt,
                endsAt: battle?.endsAt,
                scheduleSource: battle?.scheduleSource,
                scheduledIntervalHours: battle?.scheduledIntervalHours,
                attendanceCount: battle?.attendanceCount,
                userId,
                nickname: user?.nickname,
                email: user?.email,
                suspicious: Boolean(entry?.suspicious),
                suspiciousAt: entry?.suspiciousAt,
                suspiciousReasons: entry?.suspiciousReasons,
                suspiciousEvidence: entry?.suspiciousEvidence,
                damage: entry?.damage,
                totalShots: entry?.totalShots,
                totalHits: entry?.totalHits,
                crystalsCollected: entry?.crystalsCollected,
                lumensSpentTotal: entry?.lumensSpentTotal,
            };
        });

        res.json({ rows });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.startBattleNow = async (req, res) => {
    try {
        const durationSecondsRaw = Number(req.body?.durationSeconds);
        const durationLocked = Number.isFinite(durationSecondsRaw) && durationSecondsRaw > 0;
        const durationSeconds = durationLocked
            ? durationSecondsRaw
            : undefined;

        const active = await battleService.getCurrentBattle();
        if (active) {
            return res.status(400).json({ message: 'Сейчас уже идет бой' });
        }

        const now = new Date();
        const upcoming = await battleService.getUpcomingBattle();
        const battle = upcoming
            ? await battleService.startBattle(upcoming._id, {
                startsAt: now,
                durationSeconds,
                durationLocked,
                scheduleSource: 'admin_force',
                scheduledIntervalHours: null,
            })
            : await (async () => {
                const scheduled = await battleService.scheduleBattle({
                    startsAt: now,
                    durationSeconds,
                    durationLocked,
                    scheduleSource: 'admin_force',
                    scheduledIntervalHours: null,
                });
                return battleService.startBattle(scheduled._id, {
                    startsAt: now,
                    durationSeconds,
                    durationLocked,
                    scheduleSource: 'admin_force',
                    scheduledIntervalHours: null,
                });
            })();

        await adminAudit('battle.start_now', req, {
            battleId: battle?._id || null,
            startsAt: battle?.startsAt || null,
            durationSeconds: battle?.durationSeconds || null,
        });

        res.json({
            message: 'Бой запущен',
            battle,
        });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

exports.scheduleBattle = async (req, res) => {
    try {
        const {
            battleId,
            startsAt,
            durationSeconds: durationRaw,
            cancelScheduled,
        } = req.body || {};

        if (cancelScheduled) {
            const requestedBattleId = battleId ? String(battleId) : null;
            if (!requestedBattleId) {
                return res.status(400).json({ message: 'Не найден запланированный бой' });
            }
            const battle = await deleteScheduledBattleTotally(requestedBattleId, 'Удалено администратором');

            await adminAudit('battle.schedule_cancel', req, {
                battleId: requestedBattleId,
                cancelledBattleId: battle?.battleId || null,
            });

            return res.json({
                message: 'Запланированный бой удален',
                battle,
            });
        }

        if (!startsAt) {
            return res.status(400).json({ message: 'Укажите время запуска' });
        }

        const starts = new Date(startsAt);
        if (Number.isNaN(starts.getTime())) {
            return res.status(400).json({ message: 'Некорректная дата запуска' });
        }

        if (starts <= new Date()) {
            return res.status(400).json({ message: 'Время запуска должно быть в будущем' });
        }

        const durationSeconds = Number(durationRaw);
        const durationExplicitlySet = Number.isFinite(durationSeconds) && durationSeconds > 0;
        const durationPatch = durationExplicitlySet
            ? durationSeconds
            : undefined;

        const active = await battleService.getCurrentBattle();
        if (active) {
            return res.status(400).json({ message: 'Нельзя планировать, пока идет бой' });
        }

        let battle = null;
        let mode = 'create';

        if (battleId) {
            const existing = await battleService.getBattleById(String(battleId));
            if (!existing || String(existing.status || '') !== 'scheduled') {
                return res.status(404).json({ message: 'Запланированный бой не найден' });
            }

            battle = await battleService.updateScheduledBattle(String(battleId), {
                startsAt: starts,
                durationSeconds: durationPatch,
                durationLocked: durationExplicitlySet,
                scheduleSource: 'admin_schedule',
                scheduledIntervalHours: null,
            });
            mode = 'update';
        } else {
            const existingManual = await battleService.listScheduledBattles({ includeAuto: false });
            if (existingManual.length > 0) {
                return res.status(409).json({ message: 'Сначала измени или удали уже запланированный бой' });
            }

            const upcoming = await battleService.getUpcomingBattle();
            if (upcoming && String(upcoming.scheduleSource || '') === 'auto') {
                battle = await battleService.updateScheduledBattle(upcoming._id, {
                    startsAt: starts,
                    durationSeconds: durationPatch,
                    durationLocked: durationExplicitlySet,
                    scheduleSource: 'admin_schedule',
                    scheduledIntervalHours: null,
                });
                mode = 'replace_auto';
            } else {
                battle = await battleService.scheduleBattle({
                    startsAt: starts,
                    durationSeconds: durationPatch,
                    durationLocked: durationExplicitlySet,
                    scheduleSource: 'admin_schedule',
                    scheduledIntervalHours: null,
                });
            }
        }

        await adminAudit('battle.schedule', req, {
            battleId: battle?._id || null,
            startsAt: battle?.startsAt || null,
            durationSeconds: battle?.durationSeconds || null,
            mode,
        });

        res.json({
            message: mode === 'update' ? 'Запланированный бой обновлен' : 'Бой запланирован',
            battle,
        });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

exports.cancelScheduledBattle = async (req, res) => {
    try {
        const battleId = String(req.params?.id || '').trim();
        if (!battleId) {
            return res.status(400).json({ message: 'Не найден запланированный бой' });
        }

        const battle = await deleteScheduledBattleTotally(battleId, 'Удалено администратором');

        await adminAudit('battle.schedule_cancel', req, {
            battleId,
            cancelledBattleId: battle?.battleId || null,
        });

        res.json({
            message: 'Запланированный бой удален',
            battle,
        });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

exports.clearUpcomingBattle = async (req, res) => {
    try {
        const upcoming = await battleService.getUpcomingBattle();
        const battle = upcoming?._id
            ? await deleteScheduledBattleTotally(upcoming._id, 'Удалено администратором')
            : null;

        await adminAudit('battle.schedule_clear_next', req, {
            clearedBattleId: battle?.battleId || null,
        });

        res.json({
            message: battle ? 'Ближайший запуск убран' : 'Следующий запуск очищен',
            battle,
        });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

exports.finishBattleNow = async (req, res) => {
    try {
        const active = await battleService.getCurrentBattle();
        if (!active) {
            return res.status(400).json({ message: 'Сейчас нет активного боя' });
        }

        const battle = await battleService.forceFinishBattleNow(active._id);

        await adminAudit('battle.finish_now', req, {
            battleId: battle?._id || null,
            status: battle?.status || null,
        });

        res.json({
            message: 'Бой завершен',
            battle,
        });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

// Settings
exports.getSettings = async (req, res) => {
    try {
        const [chatScHourlyRate, initialLives, appealCompensation, chatMinutesCap] = await Promise.all([
            getRegistrySettingValue('CHAT_SC_PER_HOUR'),
            getRegistrySettingValue('INITIAL_LIVES'),
            getRegistrySettingValue('SC_APPEAL_COMPENSATION'),
            getRegistrySettingValue('CHAT_MINUTES_PER_DAY_CAP'),
        ]);

        const settings = {
            // Legacy key for existing admin UI compatibility
            SC_PER_HOUR_CHAT: chatScHourlyRate,
            CHAT_MINUTES_PER_DAY_CAP: chatMinutesCap,
            INITIAL_LIVES: initialLives,
            SC_APPEAL_COMPENSATION: appealCompensation,
        };

        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const updates = req.body && typeof req.body === 'object' ? req.body : {};
        const updated = await updateRegistrySettings(updates, {
            userId: req.user._id,
            description: 'Updated via Admin Panel (legacy /admin/settings)',
        });

        await adminAudit('settings.update', req, {
            keys: updated.updated.map((row) => row.key),
        });

        res.json({ message: 'Настройки успешно обновлены', results: updated.updated });
    } catch (error) {
        if (error.status === 400) {
            return res.status(400).json({ message: error.message, key: error.settingKey || null });
        }
        res.status(500).json({ message: error.message });
    }
};

// Backup
exports.createBackup = async (req, res) => {
    try {
        const result = await createOperationApproval({
            req,
            actionType: 'system.backup.create',
            reason: req.body?.reason,
            impactPreview: req.body?.impactPreview,
            confirmationPhrase: req.body?.confirmationPhrase,
            payload: {
                source: 'legacy_admin_backup_button',
            },
        });

        res.status(202).json(operationMutationResponse({
            operationId: result.operationId,
            status: result.approval.status,
            requiresApproval: true,
            auditId: result.auditId,
            data: { approval: serializeApproval(result.approval) },
            message: 'Заявка на резервную копию отправлена на подтверждение',
        }));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

// Collective Meditation Schedule
exports.getCollectiveMeditationSettings = async (_req, res) => {
    try {
        const serverNow = Date.now();
        const stored = await getSetting(COLLECTIVE_MEDITATION_SCHEDULE_KEY, getDefaultSchedule());
        const schedule = normalizeSchedule(stored);
        const stats = await getCollectiveMeditationAdminStats();
        res.json({ serverNow, schedule, stats });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateCollectiveMeditationSettings = async (req, res) => {
    try {
        const nextSchedule = normalizeSchedule(req.body?.schedule);

        await setSetting(
            COLLECTIVE_MEDITATION_SCHEDULE_KEY,
            nextSchedule,
            'Updated collective meditation schedule',
            req.user._id
        );

        await adminAudit('settings.meditation_schedule.update', req, {
            count: nextSchedule.length,
            startsAt: nextSchedule.slice(0, 5).map((s) => s.startsAt),
        });

        res.json({ message: 'Расписание коллективной медитации обновлено', schedule: nextSchedule, serverNow: Date.now() });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Wish management
exports.getWishes = async (req, res) => {
    try {
        const { status, authorId, page = 1, limit = 50 } = req.query;
        const supabase = getSupabaseClient();
        const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
        const safePage = Math.max(1, Number(page) || 1);
        const from = (safePage - 1) * safeLimit;
        const to = from + safeLimit - 1;

        let base = supabase.from('wishes');
        let listQuery = base.select('*').order('created_at', { ascending: false }).range(from, to);
        let countQuery = base.select('id', { head: true, count: 'exact' });

        if (status) {
            listQuery = listQuery.eq('status', String(status));
            countQuery = countQuery.eq('status', String(status));
        }
        if (authorId) {
            listQuery = listQuery.eq('author_id', String(authorId));
            countQuery = countQuery.eq('author_id', String(authorId));
        }

        const [{ data: wishRows, error: listError }, { count, error: countError }] = await Promise.all([
            listQuery,
            countQuery,
        ]);
        if (listError || countError) {
            return res.status(500).json({ message: 'Не удалось получить желания' });
        }

        const idsToHydrate = [];
        for (const row of (Array.isArray(wishRows) ? wishRows : [])) {
            if (row?.author_id) idsToHydrate.push(row.author_id);
            if (row?.executor_id) idsToHydrate.push(row.executor_id);
        }
        const usersById = await getUsersByIds(idsToHydrate);

        const wishes = (Array.isArray(wishRows) ? wishRows : []).map((row) => mapWishRowToAdminDto(row, usersById));
        const total = Number(count || 0);

        res.json({
            wishes,
            totalPages: Math.ceil(total / safeLimit),
            currentPage: safePage,
            totalWishes: total,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateWish = async (req, res) => {
    try {
        const { id } = req.params;
        const supabase = getSupabaseClient();
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patch = {};
        if (Object.prototype.hasOwnProperty.call(body, 'text')) patch.text = String(body.text ?? '');
        if (Object.prototype.hasOwnProperty.call(body, 'status')) patch.status = String(body.status ?? '');
        if (Object.prototype.hasOwnProperty.call(body, 'supportCount')) patch.support_count = Number(body.supportCount) || 0;
        if (Object.prototype.hasOwnProperty.call(body, 'supportSc')) patch.support_sc = Number(body.supportSc) || 0;
        if (Object.prototype.hasOwnProperty.call(body, 'language')) patch.language = body.language ? String(body.language) : null;
        if (Object.prototype.hasOwnProperty.call(body, 'costSc')) patch.cost_sc = Number(body.costSc) || 0;
        if (Object.prototype.hasOwnProperty.call(body, 'executor')) patch.executor_id = body.executor ? String(body.executor) : null;
        if (Object.prototype.hasOwnProperty.call(body, 'executorContact')) patch.executor_contact = body.executorContact ? String(body.executorContact) : null;
        if (Object.prototype.hasOwnProperty.call(body, 'takenAt')) patch.taken_at = body.takenAt ? new Date(body.takenAt).toISOString() : null;
        if (Object.prototype.hasOwnProperty.call(body, 'fulfilledAt')) patch.fulfilled_at = body.fulfilledAt ? new Date(body.fulfilledAt).toISOString() : null;
        patch.updated_at = new Date().toISOString();

        const { data: updatedRow, error } = await supabase
            .from('wishes')
            .update(patch)
            .eq('id', String(id))
            .select('*')
            .maybeSingle();
        if (error || !updatedRow) return res.status(404).json({ message: 'Желание не найдено' });

        const usersById = await getUsersByIds([updatedRow.author_id, updatedRow.executor_id]);
        const wish = mapWishRowToAdminDto(updatedRow, usersById);
        res.json(wish);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteWish = async (req, res) => {
    try {
        await deleteWishTotally(req.params.id);
        res.json({ message: 'Желание удалено' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};
// Rules management
exports.getRules = async (req, res) => {
    try {
        const rules = await getSetting('PROJECT_RULES', 'Здесь будут правила проекта...');
        res.json({ rules });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateRules = async (req, res) => {
    try {
        const { rules } = req.body;
        await setSetting('PROJECT_RULES', rules, 'Updated project rules', req.user._id);
        await adminAudit('rules.update', req, { rules: rules.substring(0, 50) + '...' });
        res.json({ message: 'Правила обновлены' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getPagesContent = async (_req, res) => {
    try {
        const payload = await getPageTextBundle();
        res.json(payload);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updatePagesContent = async (req, res) => {
    try {
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
        const updates = [];

        if (hasOwn(body, 'about')) {
            const about = normalizeLocalizedTextInput(body.about);
            updates.push(
                setSetting('PAGE_ABOUT', about.ru, 'Updated about page', req.user._id)
            );
        }

        if (hasOwn(body, 'roadmapHtml')) {
            const roadmapHtml = normalizeLocalizedTextInput(body.roadmapHtml);
            updates.push(
                setSetting('PAGE_ROADMAP_HTML', roadmapHtml.ru, 'Updated roadmap page', req.user._id)
            );
        }

        const rules = body.rules && typeof body.rules === 'object' ? body.rules : null;
        if (rules) {
            if (hasOwn(rules, 'battle')) {
                const battle = normalizeLocalizedTextInput(rules.battle);
                updates.push(
                    setSetting('RULES_BATTLE', battle.ru, 'Updated battle rules', req.user._id)
                );
            }
            if (hasOwn(rules, 'site')) {
                const site = normalizeLocalizedTextInput(rules.site);
                updates.push(
                    setSetting('RULES_SITE', site.ru, 'Updated site rules', req.user._id)
                );
            }
            if (hasOwn(rules, 'communication')) {
                const communication = normalizeLocalizedTextInput(rules.communication);
                updates.push(
                    setSetting('RULES_COMMUNICATION', communication.ru, 'Updated communication rules', req.user._id)
                );
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({ message: 'Нет данных для обновления' });
        }

        await Promise.all(updates);
        await savePageTextBundle(body, req.user?._id || null);

        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Ad Settings
exports.getAdSettings = async (req, res) => {
    try {
        const settings = await getSetting('AD_SETTINGS', {
            networks: ['AdMob', 'Unity'],
            rotation: 'random',
            active: true
        });
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateAdSettings = async (req, res) => {
    try {
        const settings = req.body;
        await setSetting('AD_SETTINGS', settings, 'Updated ad settings', req.user._id);
        await adminAudit('settings.ads.update', req, settings);
        res.json({ message: 'Настройки рекламы обновлены' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Quotes management
exports.getQuotes = quoteController.getAllQuotes;

// Feedback messages
exports.getFeedbackMessages = async (req, res) => {
    try {
        const { status, page = 1, limit = 50 } = req.query;
        const supabase = getSupabaseClient();
        
        const { data, error } = await supabase
            .from(DOC_TABLE)
            .select('id,data,created_at,updated_at')
            .eq('model', 'FeedbackMessage')
            .limit(1000);
        
        if (error) return res.status(500).json({ message: error.message });
        
        let items = (data || []).map(mapDocRow).map((item) => ({
            ...item,
            status: String(item?.status || 'new'),
        }));
        if (status) {
            items = items.filter((item) => String(item?.status || 'new') === String(status));
        }

        items.sort((a, b) => {
            const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
        });
        
        const count = items.length;
        const offset = (Number(page) - 1) * Number(limit);
        const pagedItems = items.slice(offset, offset + Number(limit));

        res.json({
            messages: pagedItems,
            totalPages: Math.ceil(count / Number(limit)),
            currentPage: Number(page),
            totalMessages: count,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.archiveFeedbackMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const existing = await getModelDocById('FeedbackMessage', id);
        if (!existing) return res.status(404).json({ message: 'Сообщение не найдено' });

        const nowIso = new Date().toISOString();
        await updateModelDoc('FeedbackMessage', id, {
            status: 'archived',
            archivedAt: nowIso,
        });

        await adminAudit('feedback.archive', req, { feedbackId: id });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

exports.replyFeedbackMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const subjectRaw = String(req.body?.subject || '').trim();
        const messageRaw = String(req.body?.message || '').trim();
        if (!messageRaw) return res.status(400).json({ message: 'Текст ответа обязателен' });
        if (messageRaw.length > 10000) return res.status(400).json({ message: 'Максимум 10 000 символов' });

        const existing = await getModelDocById('FeedbackMessage', id);
        if (!existing) return res.status(404).json({ message: 'Сообщение не найдено' });

        const to = String(existing?.email || '').trim().toLowerCase();
        if (!to) return res.status(400).json({ message: 'У сообщения нет почты для ответа' });

        const subject = subjectRaw || 'Ответ GIVKOIN на ваше обращение';
        const safeName = escapeHtml(String(existing?.name || '').trim() || 'друг');
        const safeMessage = escapeHtml(messageRaw).replace(/\r?\n/g, '<br/>');

        await emailService.sendGenericEventEmail(
            to,
            subject,
            `
              <h2>Здравствуйте, ${safeName}!</h2>
              <p>Это ответ команды GIVKOIN на ваше обращение.</p>
              <div style="margin:16px 0;padding:12px;border-radius:8px;border:1px solid #e5e7eb;background:#f8fafc;">
                ${safeMessage}
              </div>
            `
        );

        const nowIso = new Date().toISOString();
        const existingReplies = Array.isArray(existing?.replies) ? existing.replies : [];
        await updateModelDoc('FeedbackMessage', id, {
            repliedAt: nowIso,
            replies: [
                ...existingReplies,
                {
                    sentAt: nowIso,
                    subject,
                    message: messageRaw,
                    adminId: req.user?._id || null,
                    adminEmail: req.user?.email || null,
                },
            ],
        });

        await adminAudit('feedback.reply', req, { feedbackId: id, to });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.deleteFeedbackMessage = async (req, res) => {
    try {
        const { id } = req.params;
        await deleteFeedbackMessageTotally(id);

        await adminAudit('feedback.delete', req, { feedbackId: id });
        res.json({ ok: true });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

exports.createQuote = quoteController.createQuote;
exports.updateQuote = quoteController.updateQuote;
exports.deleteQuote = quoteController.deleteQuote;

// Get active quote for the day (public)
exports.getActiveQuote = quoteController.getActiveQuote;
// Feedback messages handlers... (already exist)

// Crystal activity
exports.getCrystalStats = async (req, res) => {
    try {
        const crystalCtrl = require('./crystalController');
        const sessionStart = crystalCtrl.getCrystalSessionStart();
        const supabase = getSupabaseClient();
        
        const { data: progressRows, error } = await supabase
            .from(DOC_TABLE)
            .select('id,data,created_at,updated_at')
            .eq('model', 'UserCrystalProgress')
            .limit(5000);
        
        if (error) return res.status(500).json({ message: error.message });
        
        // Filter by sessionStart
        const stats = (progressRows || [])
            .map(mapDocRow)
            .filter((row) => {
                const lastReset = row.lastResetDate ? new Date(row.lastResetDate) : null;
                return lastReset && lastReset >= sessionStart;
            });
        
        // Get user nicknames
        const userIds = stats.map((s) => s.userId).filter(Boolean);
        const { data: userRows } = await supabase
            .from('users')
            .select('id,nickname')
            .in('id', userIds);
        
        const userMap = new Map((userRows || []).map((row) => [String(row.id), row.nickname]));

        // Filter and map results
        const users = stats
            .filter(s => s.collectedShards && s.collectedShards.length > 0)
            .map(s => ({
                userId: s.userId,
                nickname: userMap.get(String(s.userId)) || 'Удаленный пользователь',
                collectedCount: s.collectedShards.length,
                isComplete: s.collectedShards.length === 12,
                reviewStatus: s.reviewStatus || 'clean',
                mismatchCount: Math.max(0, Number(s.mismatchCount) || 0),
            }))
            .sort((a, b) => b.collectedCount - a.collectedCount);

        const suspicious = stats
            .filter((s) => String(s.reviewStatus || 'clean') === 'pending' && (Number(s.mismatchCount) || 0) > 0)
            .map((s) => ({
                userId: s.userId,
                nickname: userMap.get(String(s.userId)) || 'Удаленный пользователь',
                collectedCount: Array.isArray(s.collectedShards) ? s.collectedShards.length : 0,
                mismatchCount: Math.max(0, Number(s.mismatchCount) || 0),
                mismatchDetails: Array.isArray(s.mismatchDetails) ? s.mismatchDetails : [],
                reviewQueuedAt: s.reviewQueuedAt || null,
            }))
            .sort((a, b) => b.mismatchCount - a.mismatchCount);

        console.log(`[Admin] Stats: found ${users.length} active users for session >= ${sessionStart.toISOString()}`);
        res.json({ users, suspicious });
    } catch (error) {
        console.error('[Admin] getCrystalStats error:', error);
        res.status(500).json({ message: error.message });
    }
};

exports.getCrystalLocations = async (req, res) => {
    try {
        const crystalCtrl = require('./crystalController');
        const daily = await crystalCtrl.generateDailyShards();
        console.log(`[Admin] Returning ${daily?.locations?.length || 0} locations for session ${daily?.date}`);
        res.json({ locations: daily ? daily.locations : [] });
    } catch (error) {
        console.error('[Admin] getCrystalLocations error:', error);
        res.status(500).json({ message: error.message });
    }
};

exports.forceGenerateCrystals = async (req, res) => {
    try {
        const crystalCtrl = require('./crystalController');
        const sessionStart = crystalCtrl.getCrystalSessionStart();
        const supabase = getSupabaseClient();

        // 1. force = true для пересоздания локаций
        const daily = await crystalCtrl.generateDailyShards(true);
        
        // 2. Сброс прогресса всех пользователей для этой сессии
        const { data: progressRows, error } = await supabase
            .from(DOC_TABLE)
            .select('id,data')
            .eq('model', 'UserCrystalProgress')
            .limit(5000);
        
        let deletedCount = 0;
        if (!error && progressRows) {
            const toDelete = progressRows.filter((row) => {
                const lastReset = row.data?.lastResetDate ? new Date(row.data.lastResetDate) : null;
                return lastReset && lastReset >= sessionStart;
            });
            for (const row of toDelete) {
                await supabase.from(DOC_TABLE).delete().eq('id', row.id);
                deletedCount++;
            }
        }

        console.log(`[Admin] Force generate: session ${sessionStart.toISOString()}, reset ${deletedCount} users progress`);

        await adminAudit('crystal.generate_force', req, {
            date: daily.date,
            shardsCount: daily.locations.length,
            usersReset: deletedCount
        });
        
        res.json({ 
            ok: true, 
            locations: daily.locations, 
            message: `Кристаллы пересозданы. Прогресс ${deletedCount} пользователей сброшен.` 
        });
    } catch (error) {
        console.error('[Admin] forceGenerateCrystals error:', error);
        res.status(500).json({ message: error.message });
    }
};

exports.getPracticeGratitudeAudit = async (req, res) => {
    try {
        const supabase = getSupabaseClient();
        const page = Math.max(1, Number(req.query?.page) || 1);
        const limit = Math.max(1, Math.min(100, Number(req.query?.limit) || 50));
        const skip = (page - 1) * limit;

        let query = supabase
            .from(DOC_TABLE)
            .select('id,data,created_at,updated_at', { count: 'exact' })
            .eq('model', 'PracticeGratitudeDaily')
            .order('data->>dayKey', { ascending: false });

        if (req.query?.userId) {
            query = query.eq('data->>user', String(req.query.userId));
        }
        if (req.query?.from) {
            query = query.gte('data->>dayKey', String(req.query.from));
        }
        if (req.query?.to) {
            query = query.lte('data->>dayKey', String(req.query.to));
        }

        const { data, error, count } = await query.range(skip, skip + limit - 1);
        if (error) return res.status(500).json({ message: error.message });

        const rows = (Array.isArray(data) ? data : []).map(mapDocRow).filter(Boolean);
        const userMap = await getUsersByIds(rows.map((row) => row?.user).filter(Boolean));
        const items = rows.map((row) => {
            const uid = toId(row?.user);
            const user = uid ? userMap.get(uid) : null;
            const completedIndexes = Array.isArray(row?.completedIndexes)
                ? row.completedIndexes.map((value) => Number(value)).filter(Number.isInteger).sort((a, b) => a - b)
                : [];
            return {
                _id: row._id,
                user: user ? { _id: user.id, nickname: user.nickname, email: user.email } : (uid ? { _id: uid } : null),
                dayKey: row.dayKey || null,
                completedIndexes,
                completedCount: completedIndexes.length,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
            };
        });

        return res.json({
            rows: items,
            pagination: {
                page,
                limit,
                total: Math.max(0, Number(count) || 0),
            },
        });
    } catch (error) {
        return res.status(500).json({ message: error.message || 'Ошибка сервера' });
    }
};

exports.getAttendanceAudit = async (req, res) => {
    try {
        const supabase = getSupabaseClient();
        const page = Math.max(1, Number(req.query?.page) || 1);
        const limit = Math.max(1, Math.min(100, Number(req.query?.limit) || 50));
        const skip = (page - 1) * limit;

        let query = supabase
            .from(DOC_TABLE)
            .select('id,data,created_at,updated_at', { count: 'exact' })
            .eq('model', 'DailyStreakState')
            .order('updated_at', { ascending: false });

        if (req.query?.userId) {
            query = query.eq('data->>user', String(req.query.userId));
        }
        if (req.query?.from) {
            query = query.gte('data->>lastSeenServerDay', String(req.query.from));
        }
        if (req.query?.to) {
            query = query.lte('data->>lastSeenServerDay', String(req.query.to));
        }

        const { data, error, count } = await query.range(skip, skip + limit - 1);
        if (error) return res.status(500).json({ message: error.message });

        const rows = (Array.isArray(data) ? data : []).map(mapDocRow).filter(Boolean);
        const userMap = await getUsersByIds(rows.map((row) => row?.user).filter(Boolean));
        const items = rows.map((row) => {
            const uid = toId(row?.user);
            const user = uid ? userMap.get(uid) : null;
            const claimedDays = Array.isArray(row?.claimedDays) ? row.claimedDays.map(Number).filter(Number.isInteger).sort((a, b) => a - b) : [];
            const missedDays = Array.isArray(row?.missedDays) ? row.missedDays.map(Number).filter(Number.isInteger).sort((a, b) => a - b) : [];
            const questDoneDays = Array.isArray(row?.questDoneDays) ? row.questDoneDays.map(Number).filter(Number.isInteger).sort((a, b) => a - b) : [];
            const currentDayIndex = row?.cycleStartDay && row?.lastSeenServerDay
                ? Math.max(1, Math.min(30, Math.floor((new Date(`${row.lastSeenServerDay}T00:00:00.000Z`).getTime() - new Date(`${row.cycleStartDay}T00:00:00.000Z`).getTime()) / (24 * 60 * 60 * 1000)) + 1))
                : 1;
            return {
                _id: row._id,
                user: user ? { _id: user.id, nickname: user.nickname, email: user.email } : (uid ? { _id: uid } : null),
                cycleStartDay: row.cycleStartDay || null,
                lastSeenServerDay: row.lastSeenServerDay || null,
                lastWelcomeShownServerDay: row.lastWelcomeShownServerDay || null,
                claimedDays,
                missedDays,
                questDoneDays,
                currentDayIndex,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
            };
        });

        return res.json({
            rows: items,
            pagination: {
                page,
                limit,
                total: Math.max(0, Number(count) || 0),
            },
        });
    } catch (error) {
        return res.status(500).json({ message: error.message || 'Ошибка сервера' });
    }
};

