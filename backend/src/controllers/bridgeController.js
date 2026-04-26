const bridgesData = require('../config/bridges.json');
const { debitSc } = require('../services/scService');
const { recordActivity } = require('../services/activityService');
const { listActivities } = require('../services/activityService');
const { broadcastNotificationByPresence } = require('../services/notificationService');
const { awardRadianceForActivity } = require('../services/activityRadianceService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { deleteBridgeTotally } = require('../services/adminCleanupService');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

function normalizeLang(lang) {
    return String(lang || '').toLowerCase() === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
    return normalizeLang(lang) === 'en' ? en : ru;
}

const NEW_BRIDGE_DAILY_LIMIT = 3;
const EXISTING_BRIDGE_DAILY_LIMIT = 10;
const NEW_BRIDGE_COST_SC = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

function parsePagination(query = {}) {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(query?.limit) || 50));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
}

async function listBridges(filters = {}, pagination = {}) {
    const supabase = getSupabaseClient();
    let query = supabase
        .from(DOC_TABLE)
        .select('id,data,created_at,updated_at', { count: 'exact' })
        .eq('model', 'Bridge')
        .order('updated_at', { ascending: false });

    if (filters.createdBy) {
        query = query.eq('data->>createdBy', String(filters.createdBy));
    }
    if (filters.status) {
        query = query.eq('data->>status', String(filters.status));
    }

    const safeLimit = Math.max(1, Number(pagination.limit) || 1000);
    const safeOffset = Math.max(0, Number(pagination.offset) || 0);
    query = query.range(safeOffset, safeOffset + safeLimit - 1);

    const { data, error, count } = await query;
    if (error || !Array.isArray(data)) {
        return { bridges: [], total: 0 };
    }

    const bridges = data.map((row) => ({
        _id: row.id,
        ...row.data,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    }));

    return {
        bridges,
        total: Math.max(0, Number(count) || 0),
    };
}

async function findBridgeById(id) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from(DOC_TABLE)
        .select('id,data,created_at,updated_at')
        .eq('model', 'Bridge')
        .eq('id', String(id))
        .maybeSingle();
    if (error || !data) return null;
    return { _id: data.id, ...data.data, createdAt: data.created_at, updatedAt: data.updated_at };
}

async function findBridgeByCountries(fromCountry, toCountry) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from(DOC_TABLE)
        .select('id,data')
        .eq('model', 'Bridge')
        .limit(500);
    if (error || !Array.isArray(data)) return null;
    
    return data.find((row) => {
        const d = row.data || {};
        return (d.fromCountry === fromCountry && d.toCountry === toCountry) ||
               (d.fromCountry === toCountry && d.toCountry === fromCountry);
    }) || null;
}

async function insertBridge(doc) {
    const supabase = getSupabaseClient();
    const id = `bridge_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    await supabase.from(DOC_TABLE).insert({
        model: 'Bridge',
        id,
        data: doc,
        created_at: nowIso,
        updated_at: nowIso,
    });
    return { _id: id, ...doc, createdAt: nowIso, updatedAt: nowIso };
}

async function updateBridge(id, patch) {
    const supabase = getSupabaseClient();
    const { data: existing, error: findError } = await supabase
        .from(DOC_TABLE)
        .select('id,data')
        .eq('model', 'Bridge')
        .eq('id', String(id))
        .maybeSingle();
    if (findError || !existing) return null;
    
    const nextData = { ...existing.data, ...patch };
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from(DOC_TABLE)
        .update({ data: nextData, updated_at: nowIso })
        .eq('id', String(id))
        .select('id,data')
        .maybeSingle();
    if (error) return null;
    return { _id: data.id, ...data.data, updatedAt: nowIso };
}

async function deleteBridge(id) {
    const supabase = getSupabaseClient();
    const { error } = await supabase
        .from(DOC_TABLE)
        .delete()
        .eq('model', 'Bridge')
        .eq('id', String(id));
    return !error;
}

async function countBridges(filters = {}) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from(DOC_TABLE)
        .select('id,data')
        .eq('model', 'Bridge')
        .limit(5000);
    if (error || !Array.isArray(data)) return 0;
    
    return data.filter((row) => {
        const d = row.data || {};
        if (filters.createdBy && String(d.createdBy) !== String(filters.createdBy)) return false;
        if (filters.status && d.status !== filters.status) return false;
        if (filters.createdAt && d.createdAt && d.createdAt < filters.createdAt) return false;
        return true;
    }).length;
}

async function getBridgeUserStats(userId) {
    const safeUserId = toId(userId);
    if (!safeUserId) {
        return {
            createdToday: 0,
            stonesToday: 0,
            limits: {
                newBridgesPerDay: NEW_BRIDGE_DAILY_LIMIT,
                existingBridgeStonesPerDay: EXISTING_BRIDGE_DAILY_LIMIT,
            },
            serverNow: new Date().toISOString(),
        };
    }

    const since = new Date(Date.now() - DAY_MS);
    const [createdToday, rows] = await Promise.all([
        countBridges({ createdBy: safeUserId, createdAt: since.toISOString() }),
        listActivities({
            userIds: [safeUserId],
            types: ['bridge_contribute'],
            since,
            until: new Date(),
            limit: 5000,
        }),
    ]);

    const stonesToday = (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
        const src = row?.meta?.source;
        if (src && String(src) !== 'contribute') return sum;
        const value = Number(row?.meta?.stones);
        return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    return {
        createdToday,
        stonesToday,
        limits: {
            newBridgesPerDay: NEW_BRIDGE_DAILY_LIMIT,
            existingBridgeStonesPerDay: EXISTING_BRIDGE_DAILY_LIMIT,
        },
        serverNow: new Date().toISOString(),
    };
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

function getUserData(row) {
    return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function getUserRowById(userId) {
    const id = toId(userId);
    if (!id) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,email,nickname,data')
        .eq('id', String(id))
        .maybeSingle();
    if (error) return null;
    return data || null;
}

async function updateUserDataById(userId, patch) {
    const id = toId(userId);
    if (!id || !patch || typeof patch !== 'object') return null;
    const row = await getUserRowById(id);
    if (!row) return null;
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const existing = getUserData(row);
    const next = { ...existing, ...patch };
    const { data, error } = await supabase
        .from('users')
        .update({ data: next, updated_at: nowIso })
        .eq('id', String(id))
        .select('id,data,email,nickname')
        .maybeSingle();
    if (error) return null;
    return data || null;
}

async function hydrateBridgeContributors(bridges) {
    const list = Array.isArray(bridges) ? bridges : [];
    const userIds = new Set();
    for (const b of list) {
        const contributors = Array.isArray(b?.contributors) ? b.contributors : [];
        for (const c of contributors) {
            const uid = toId(c?.user);
            if (uid) userIds.add(uid);
        }
    }
    const ids = Array.from(userIds);
    if (!ids.length) return list;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,nickname,data')
        .in('id', ids);
    const rows = !error && Array.isArray(data) ? data : [];
    const nickById = new Map(rows.map((r) => {
        const d = getUserData(r);
        const nick = String(r?.nickname || d.nickname || '').trim();
        return [String(r.id), nick || 'Игрок'];
    }));

    for (const b of list) {
        const contributors = Array.isArray(b?.contributors) ? b.contributors : [];
        for (const c of contributors) {
            const uid = toId(c?.user);
            if (!uid) continue;
            c.user = { _id: uid, nickname: nickById.get(uid) || 'Игрок' };
        }
    }

    return list;
}

// Helper to find bridge distance
const getBridgeDistance = (c1, c2) => {
    const bridge = bridgesData.find(b =>
        (b.from.toLowerCase() === c1.toLowerCase() && b.to.toLowerCase() === c2.toLowerCase()) ||
        (b.from.toLowerCase() === c2.toLowerCase() && b.to.toLowerCase() === c1.toLowerCase())
    );
    return bridge ? bridge.distance : null;
};

exports.getMyBridges = async (req, res) => {
    try {
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.query?.language || 'ru');
        const { page, limit, offset } = parsePagination(req.query);
        const status = String(req.query?.status || '').trim() || null;
        const result = await listBridges({ createdBy: req.user._id, status }, { limit, offset });
        await hydrateBridgeContributors(result.bridges);
        res.json({
            bridges: result.bridges,
            pagination: {
                page,
                limit,
                total: result.total,
                hasMore: offset + result.bridges.length < result.total,
            },
        });
    } catch (error) {
        console.error('Get my bridges error:', error);
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.query?.language || 'ru');
        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
    }
};

exports.getAllBridges = async (req, res) => {
    try {
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.query?.language || 'ru');
        const { page, limit, offset } = parsePagination(req.query);
        const status = String(req.query?.status || '').trim() || null;
        const result = await listBridges({ status }, { limit, offset });
        await hydrateBridgeContributors(result.bridges);
        res.json({
            bridges: result.bridges,
            pagination: {
                page,
                limit,
                total: result.total,
                hasMore: offset + result.bridges.length < result.total,
            },
        });
    } catch (error) {
        console.error('Get all bridges error:', error);
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.query?.language || 'ru');
        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
    }
};

exports.getBridgeStats = async (req, res) => {
    try {
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.query?.language || 'ru');
        const stats = await getBridgeUserStats(req.user?._id);
        res.json(stats);
    } catch (error) {
        console.error('Get bridge stats error:', error);
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.query?.language || 'ru');
        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
    }
};

exports.createBridge = async (req, res) => {
    try {
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
        const { fromCountry, toCountry } = req.body;

        if (!fromCountry || !toCountry) {
            return res.status(400).json({ message: pickLang(userLang, 'Укажите обе страны', 'Specify both countries') });
        }

        // 1. Check if bridge data exists
        const distance = getBridgeDistance(fromCountry, toCountry);
        if (!distance) {
            return res.status(400).json({ message: pickLang(userLang, 'Такой мост не предусмотрен в системе', 'This bridge is not supported by the system') });
        }

        // 2. Check for duplicates
        const existingBridge = await findBridgeByCountries(fromCountry, toCountry);

        if (existingBridge) {
            return res.status(400).json({ message: pickLang(userLang, 'Этот мост уже строится или построен', 'This bridge is already being built or completed') });
        }

        const stats = await getBridgeUserStats(req.user._id);
        const createdToday = Number(stats?.createdToday) || 0;
        if (createdToday >= NEW_BRIDGE_DAILY_LIMIT) {
            return res.status(400).json({
                message: pickLang(
                    userLang,
                    `Не более ${NEW_BRIDGE_DAILY_LIMIT} новых мостов за 24 часа`,
                    `No more than ${NEW_BRIDGE_DAILY_LIMIT} new bridges per 24 hours`
                ),
            });
        }

        // 3. Check user balance
        const userRow = await getUserRowById(req.user._id);
        if (!userRow) {
            return res.status(404).json({ message: pickLang(userLang, 'Пользователь не найден', 'User not found') });
        }
        const userData = getUserData(userRow);
        const userId = String(req.user._id);
        const user = { _id: userId, achievementStats: userData.achievementStats || {}, sc: Number(userData.sc) || 0 };
        const creationCost = NEW_BRIDGE_COST_SC; // Cost to start a bridge project
        if (user.sc < creationCost) {
            return res.status(400).json({
                message: pickLang(
                    userLang,
                    `Недостаточно K для начала строительства (нужно ${creationCost})`,
                    `Not enough K to start construction (need ${creationCost})`
                ),
            });
        }

        // 4. Create bridge
        const bridge = await insertBridge({
            createdBy: user._id,
            fromCity: fromCountry,
            toCity: toCountry,
            fromCountry,
            toCountry,
            requiredStones: distance,
            currentStones: 1, // Start with 1 stone
            status: 'building',
            contributors: [{ user: user._id, stones: 1 }],
            lastContributionAt: new Date().toISOString(),
        });

        // 5. Deduct K with proper transaction (debit, positive amount, valid type)
        const updatedUser = await debitSc({
            userId: user._id,
            amount: creationCost,
            type: 'bridge',
            description: pickLang(
                userLang,
                `Начато строительство моста ${fromCountry} - ${toCountry} (${distance} км)`,
                `Bridge construction started: ${fromCountry} - ${toCountry} (${distance} km)`
            ),
            relatedEntity: bridge._id,
        });

        recordActivity({
            userId: user._id,
            type: 'bridge_contribute',
            minutes: 2,
            meta: { bridgeId: bridge._id, stones: 1, source: 'create' },
        }).catch(() => { });

        const radianceAward = await awardRadianceForActivity({
            userId: user._id,
            activityType: 'bridge_create',
            meta: { bridgeId: bridge._id },
            dedupeKey: `bridge_create:${bridge._id}:${user._id}`,
        }).catch(() => null);

        // Ачивка #66. Строитель будущего (Сразу после победы)
        try {
            const stats = user.achievementStats || {};
            const lastBattleAt = stats.lastBattleFinishedAt;
            const lastBattleWon = stats.lastBattleWon;
            if (lastBattleAt && lastBattleWon === true) {
                const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
                if (new Date(lastBattleAt) >= tenMinsAgo) {
                    const { grantAchievement } = require('../services/achievementService');
                    await grantAchievement({ userId: user._id, achievementId: 66 });
                }
            }
        } catch (e) {
            console.error('Achievement #66 grant error:', e);
        }

        broadcastNotificationByPresence({
            offline: {
                type: 'event',
                eventKey: 'bridge_started',
                title: {
                    ru: 'Начато строительство моста',
                    en: 'Bridge construction started',
                },
                message: {
                    ru: `Запущено строительство моста ${fromCountry} — ${toCountry} (${distance} км).`,
                    en: `Bridge construction started: ${fromCountry} — ${toCountry} (${distance} km).`,
                },
                link: '/bridges',
            },
        }).catch(() => { });

        res.status(201).json({
            bridge,
            user: updatedUser,
            radianceAward: radianceAward && radianceAward.ok
                ? { activityType: 'bridge_create', amount: radianceAward.granted || radianceAward.amount || 0, occurredAt: new Date().toISOString() }
                : null,
        });
    } catch (error) {
        console.error('Create bridge error:', error);
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
    }
};

exports.contributeToBridge = async (req, res) => {
    try {
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
        const { bridgeId } = req.params;
        const { stones = 1 } = req.body;

        const parsedStones = Number(stones);
        if (!Number.isFinite(parsedStones) || parsedStones <= 0 || !Number.isInteger(parsedStones)) {
            return res.status(400).json({
                message: pickLang(userLang, 'Количество камней должно быть целым числом больше 0', 'The number of stones must be an integer greater than 0'),
            });
        }

        const bridge = await findBridgeById(bridgeId);
        if (!bridge) {
            return res.status(404).json({ message: pickLang(userLang, 'Мост не найден', 'Bridge not found') });
        }

        if (bridge.status === 'completed') {
            return res.status(400).json({ message: pickLang(userLang, 'Мост уже достроен', 'Bridge is already completed') });
        }

        const userRow = await getUserRowById(req.user._id);
        if (!userRow) {
            return res.status(404).json({ message: pickLang(userLang, 'Пользователь не найден', 'User not found') });
        }
        const userData = getUserData(userRow);
        const user = {
            _id: String(req.user._id),
            sc: Number(userData.sc) || 0,
            achievementStats: userData.achievementStats && typeof userData.achievementStats === 'object' ? userData.achievementStats : {},
        };
        const stats = await getBridgeUserStats(user._id);
        const stonesToday = Number(stats?.stonesToday) || 0;
        if (stonesToday + parsedStones > EXISTING_BRIDGE_DAILY_LIMIT) {
            return res.status(400).json({
                message: pickLang(
                    userLang,
                    `Лимит: не более ${EXISTING_BRIDGE_DAILY_LIMIT} камней в сутки для существующих мостов`,
                    `Limit: no more than ${EXISTING_BRIDGE_DAILY_LIMIT} stones per day for existing bridges`
                ),
            });
        }

        if (user.sc < parsedStones) {
            return res.status(400).json({ message: pickLang(userLang, 'Недостаточно K', 'Not enough K') });
        }

        const wasCompleted = bridge.status === 'completed';

        // Update bridge
        bridge.currentStones += parsedStones;
        if (bridge.currentStones >= bridge.requiredStones) {
            bridge.currentStones = bridge.requiredStones;
            bridge.status = 'completed';
        }

        const contributorIndex = bridge.contributors.findIndex(c => String(c.user) === String(user._id));
        if (contributorIndex > -1) {
            bridge.contributors[contributorIndex].stones += parsedStones;
        } else {
            bridge.contributors.push({ user: user._id, stones: parsedStones });
        }

        const contributionAtIso = new Date().toISOString();
        bridge.lastContributionAt = contributionAtIso;
        await updateBridge(bridgeId, {
            currentStones: bridge.currentStones,
            status: bridge.status,
            contributors: bridge.contributors,
            lastContributionAt: contributionAtIso,
        });

        // Debit K from user using the service
        const updatedUser = await debitSc({
            userId: user._id,
            amount: parsedStones,
            type: 'bridge_contribute',
            description: pickLang(
                userLang,
                `Вложено ${parsedStones} камней в мост ${bridge.fromCountry} - ${bridge.toCountry}`,
                `Contributed ${parsedStones} stones to the bridge ${bridge.fromCountry} - ${bridge.toCountry}`
            ),
            relatedEntity: bridge._id,
        });

        // Лог активности для «Тихого ночного дозора»
        recordActivity({
            userId: user._id,
            type: 'bridge_contribute',
            minutes: 2,
            meta: { bridgeId, stones: parsedStones, source: 'contribute' },
        }).catch(() => { });

        const radianceAward = await awardRadianceForActivity({
            userId: user._id,
            activityType: 'bridge_contribute',
            meta: { bridgeId, stones: parsedStones },
            dedupeKey: `bridge_contribute:${bridge._id}:${user._id}:${contributionAtIso}`,
            units: parsedStones,
        });

        // Ачивка #66. Строитель будущего (Сразу после победы)
        try {
            const stats = user.achievementStats || {};
            const lastBattleAt = stats.lastBattleFinishedAt;
            const lastBattleWon = stats.lastBattleWon;
            if (lastBattleAt && lastBattleWon === true) {
                const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
                if (new Date(lastBattleAt) >= tenMinsAgo) {
                    const { grantAchievement } = require('../services/achievementService');
                    await grantAchievement({ userId: user._id, achievementId: 66 });
                }
            }
        } catch (e) {
            console.error('Achievement #66 grant error:', e);
        }

        if (!wasCompleted && bridge.status === 'completed') {
            // Ачивка #68. Финальный камень
            try {
                const { grantAchievement } = require('../services/achievementService');
                await grantAchievement({ userId: user._id, achievementId: 68 });

                const stats = user.achievementStats || {};
                const nextTotalFinal = (Number(stats.totalFinalStones) || 0) + 1;
                const nextStats = { ...stats, totalFinalStones: nextTotalFinal };
                await updateUserDataById(user._id, { achievementStats: nextStats });

                if (nextTotalFinal >= 3) {
                    await grantAchievement({ userId: user._id, achievementId: 71 });
                }
            } catch (e) {
                console.error('Bridge final stone achievement error:', e);
            }

            // Ачивки для всех участников при завершении моста
            try {
                const { grantAchievement } = require('../services/achievementService');
                const sortedContributors = [...bridge.contributors].sort((a, b) => b.stones - a.stones);

                for (let i = 0; i < sortedContributors.length; i++) {
                    const c = sortedContributors[i];
                    const pid = c.user;

                    const pidStr = toId(pid);
                    if (!pidStr) continue;
                    const row = await getUserRowById(pidStr);
                    if (!row) continue;
                    const data = getUserData(row);
                    const stats = data.achievementStats && typeof data.achievementStats === 'object' ? data.achievementStats : {};
                    const count = (Number(stats.totalBridgesCompleted) || 0) + 1;
                    await updateUserDataById(pidStr, { achievementStats: { ...stats, totalBridgesCompleted: count } });

                    // #74. Неутомимый строитель (50 мостов)
                    if (count >= 50) await grantAchievement({ userId: pid, achievementId: 74 });

                    // #69. Главный строитель (Топ-1 на мосту)
                    if (i === 0) {
                        await grantAchievement({ userId: pid, achievementId: 69 });
                    }
                    // #70. Тройка мастеров (Топ-3 на мосту)
                    if (i < 3) {
                        await grantAchievement({ userId: pid, achievementId: 70 });
                    }
                }
            } catch (e) {
                console.error('Bridge contributors achievement error:', e);
            }

            broadcastNotificationByPresence({
                offline: {
                    type: 'event',
                    eventKey: 'bridge_completed',
                    title: {
                        ru: 'Мост завершён',
                        en: 'Bridge completed',
                    },
                    message: {
                        ru: `Завершено строительство моста ${bridge.fromCountry} — ${bridge.toCountry}.`,
                        en: `Bridge construction completed: ${bridge.fromCountry} — ${bridge.toCountry}.`,
                    },
                    link: '/bridges',
                },
            }).catch(() => { });
        }

        // Ачивки за количество камней
        try {
            const { grantAchievement } = require('../services/achievementService');

            const stats = user.achievementStats || {};
            const nextBridgeStones = (Number(stats.totalBridgeStones) || 0) + parsedStones;
            const nextStats = { ...stats, totalBridgeStones: nextBridgeStones };
            await updateUserDataById(user._id, { achievementStats: nextStats });

            // #75. Мостовой рекордсмен (Топ-1 на 3 активных мостах)
            const { bridges: activeBridges } = await listBridges({ status: 'building' }, { limit: 5000, offset: 0 });
            let top1Count = 0;
            for (const b of activeBridges) {
                const contributors = [...b.contributors].sort((a, b) => b.stones - a.stones);
                if (contributors[0] && String(contributors[0].user) === String(user._id)) {
                    top1Count++;
                }
            }
            if (top1Count >= 3) {
                await grantAchievement({ userId: user._id, achievementId: 75 });
            }

            // #92. Мастер трех путей (2 боя, 10 ч чата, 20 камней)
            if ((Number(nextStats.totalChatMinutes) || 0) >= 600 && (Number(nextStats.totalBattlesParticipated) || 0) >= 2 && (Number(nextStats.totalBridgeStones) || 0) >= 20) {
                await grantAchievement({ userId: user._id, achievementId: 92 });
            }
        } catch (e) {
            console.error('Bridge stones achievement error:', e);
        }

        res.json({
            bridge,
            user: updatedUser,
            radianceAward: {
                activityType: 'bridge_contribute',
                amount: radianceAward?.granted || radianceAward?.amount || 0,
                occurredAt: contributionAtIso,
            },
        });
    } catch (error) {
        console.error('Contribute to bridge error:', error);
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
    }
};

exports.deleteBridge = async (req, res) => {
    try {
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
        const { bridgeId } = req.params;

        // Check if user is admin
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: pickLang(userLang, 'Доступ запрещён', 'Access denied') });
        }

        const bridge = await findBridgeById(bridgeId);

        if (!bridge) {
            return res.status(404).json({ message: pickLang(userLang, 'Мост не найден', 'Bridge not found') });
        }

        await deleteBridgeTotally(bridgeId);

        res.json({ message: pickLang(userLang, 'Мост удалён', 'Bridge deleted'), bridge });
    } catch (error) {
        console.error('Delete bridge error:', error);
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
        res.status(error.status || 500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
    }
};

