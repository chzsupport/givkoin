const { getSupabaseClient } = require('../../lib/supabaseClient');
const battleService = require('../../services/battleService');
const {
    listAllDocsByModel,
    listDocsByModel,
} = require('../../services/documentStore');
async function listModelDocs(model, { pageSize = 1000 } = {}) {
    return listAllDocsByModel(model, { pageSize });
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
        listDocsByModel('AdImpression', {
            limit: 1000,
            columnGte: { created_at: since7d.toISOString() },
            orderBy: 'created_at',
            ascending: false,
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

    let kEarned7d = 0;
    let kSpent7d = 0;
    for (const row of (Array.isArray(transactionRows) ? transactionRows : [])) {
        if (String(row?.currency || 'K') !== 'K') continue;
        const amount = Math.max(0, Number(row?.amount) || 0);
        const direction = String(row?.direction || '').trim();
        if (direction === 'credit') kEarned7d += amount;
        if (direction === 'debit') kSpent7d += amount;
    }

    let adRevenue7d = 0;
    for (const row of (Array.isArray(adRows) ? adRows : [])) {
        const data = row && typeof row === 'object' ? row : {};
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

    const flowScore = clamp01((kEarned7d + kSpent7d) / Math.max(500, totalUsers * 25));
    const balanceScore = clamp01((kEarned7d + 1) / Math.max(1, kSpent7d + 1));
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
            text: `За 7 дней движение ценностей живое: приход ${round2(kEarned7d)} K, траты ${round2(kSpent7d)} K.`,
        });
    } else {
        darkReasons.push({
            title: 'Мир беднеет и замирает',
            value: Math.round((1 - economyScore / 100) * 100),
            text: `Слишком слабое движение ценностей: приход ${round2(kEarned7d)} K, траты ${round2(kSpent7d)} K.`,
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
            kEarned7d: round2(kEarned7d),
            kSpent7d: round2(kSpent7d),
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

const getBattleMoodForecast = async (req, res) => {
    try {
        const data = await buildBattleMoodForecast();
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getBattleMoodForecast,
};