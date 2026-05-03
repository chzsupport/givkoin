const { getRadianceState } = require('../services/radianceService');
const { awardRadianceForActivity } = require('../services/activityRadianceService');
const { applyStarsDelta } = require('../utils/stars');
const { recordActivity } = require('../services/activityService');
const { awardReferralBlessingExternal } = require('../services/scService');
const { getTotalRewardMultiplier } = require('../services/scService');
const { recordTransaction } = require('../services/scService');
const { createAdBoostOffer } = require('../services/adBoostService');
const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

function normalizeLang(value) {
    return value === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
    return normalizeLang(lang) === 'en' ? en : ru;
}

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

async function getTreeDoc() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from(DOC_TABLE)
        .select('id,data,created_at,updated_at')
        .eq('model', 'Tree')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (error || !data) return null;
    return mapDocRow(data);
}

async function createTreeDoc(initialData) {
    const supabase = getSupabaseClient();
    const id = `tree_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from(DOC_TABLE)
        .insert({
            model: 'Tree',
            id,
            data: initialData,
            created_at: nowIso,
            updated_at: nowIso,
        })
        .select('id,data,created_at,updated_at')
        .maybeSingle();
    if (error || !data) return null;
    return mapDocRow(data);
}

function getDayStart(date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    return start;
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

function getUserData(row) {
    return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function updateUserDataById(userId, patch) {
    if (!userId || !patch || typeof patch !== 'object') return null;
    const row = await getUserRowById(userId);
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

function getFruitWindow(date) {
    const start = new Date(date);
    start.setHours(12, 0, 0, 0); // 12:00 server time
    const end = new Date(date);
    end.setHours(17, 0, 0, 0); // 17:00 server time (exclusive)
    return { start, end };
}

function keepPositiveReward(scaledReward, fallbackReward) {
    const safeScaled = Number(scaledReward) || 0;
    const safeFallback = Number(fallbackReward) || 0;
    if (safeScaled > 0) return safeScaled;
    return safeFallback > 0 ? safeFallback : 0;
}

exports.getTreeStatus = async (req, res) => {
    try {
        let tree = await getTreeDoc();
        if (!tree) {
            tree = await createTreeDoc({ healthPercent: 100, stage: 1, nextFruitAt: new Date().toISOString() });
        }

        const now = new Date();
        const start = getDayStart(now);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        // Per-user fruit:
        // - доступен только в окне 12:00-17:00 серверного времени;
        // - можно собрать не более 1 раза за серверный день.
        const user = req.user;
        const lastFruitCollectedAt = user?.lastFruitCollectedAt ? new Date(user.lastFruitCollectedAt) : null;
        const alreadyCollectedToday = !!(
            lastFruitCollectedAt &&
            lastFruitCollectedAt >= start &&
            lastFruitCollectedAt < end
        );
        const fruitWindow = getFruitWindow(now);
        const isInWindow = now >= fruitWindow.start && now < fruitWindow.end;
        const isFruitAvailable = isInWindow && !alreadyCollectedToday;

        res.json({
            ...tree,
            isFruitAvailable,
            fruitWindow: {
                start: fruitWindow.start,
                end: fruitWindow.end
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getRadianceState = async (req, res) => {
    try {
        const state = await getRadianceState();
        res.json(state);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.healTree = async (req, res) => {
    try {
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
        const lumens = Number(req.body?.lumens);
        if (!Number.isFinite(lumens) || lumens <= 0) {
            return res.status(400).json({ message: pickLang(userLang, 'Введите количество Lm', 'Enter amount of Lm') });
        }

        const userId = req.user?._id;
        const userRow = await getUserRowById(userId);
        if (!userRow) return res.status(404).json({ message: pickLang(userLang, 'Пользователь не найден', 'User not found') });
        const userData = getUserData(userRow);
        if ((Number(userData.lumens) || 0) < lumens) {
            return res.status(400).json({ message: pickLang(userLang, 'Недостаточно Люменов', 'Not enough Lumens') });
        }

        const radianceAmount = lumens * 4;
        let nextLumens = (Number(userData.lumens) || 0) - lumens;
        const starsAward = Math.floor(lumens / 100) * 0.001;
        let nextStars = Number(userData.stars) || 0;
        if (starsAward > 0) {
            const resStars = await applyStarsDelta({
                userId,
                delta: starsAward,
                type: 'tree_heal',
                description: pickLang(userLang, 'Лечение Древа', 'Tree healing'),
                relatedEntity: 'tree_heal',
            });
            if (resStars?.stars != null) nextStars = resStars.stars;
        }

        await updateUserDataById(userId, {
            lumens: nextLumens,
            stars: nextStars,
        });

        const radianceResult = await awardRadianceForActivity({
            userId,
            units: lumens,
            activityType: 'tree_heal_button',
            meta: {
                lumens,
                radiance: radianceAmount,
                conversionRate: 4,
            },
        });

        // Achievements Logic
        try {
            const { grantAchievement } = require('../services/achievementService');
            const now = new Date();
            const stats = userData.achievementStats && typeof userData.achievementStats === 'object'
                ? userData.achievementStats
                : {};
            const lastBattleAt = stats.lastBattleFinishedAt;
            const lastBattleWon = stats.lastBattleWon;

            // #86. Исцелитель мироздания (10к люменов суммарно)
            const newTotalTreeLumens = (stats.totalLumensToTree || 0) + lumens;
            await updateUserDataById(userId, {
                achievementStats: { ...stats, totalLumensToTree: newTotalTreeLumens },
            });
            if (newTotalTreeLumens >= 10000) {
                await grantAchievement({ userId, achievementId: 86 });
            }

            // #48. Целитель коры (Сразу после боя)
            if (lastBattleAt) {
                const diffMs = now.getTime() - new Date(lastBattleAt).getTime();
                if (diffMs < 5 * 60 * 1000) { // 5 minutes window
                    await grantAchievement({ userId, achievementId: 48 });
                }
            }

            // #49. Великий лекарь (1001+ люмен после поражения)
            if (lastBattleWon === false && lumens >= 1001) {
                await grantAchievement({ userId, achievementId: 49 });
            }

            // #88. Спаситель ветви (Внести >30% от нужного сияния для травмы)
            try {
                const tree = await getTreeDoc();
                if (tree && Array.isArray(tree.injuries) && tree.injuries.length > 0) {
                    const LUMEN_TO_RADIANCE = 4;
                    const userRadiance = lumens * LUMEN_TO_RADIANCE;
                    // Суммарное нужное сияние по всем активным травмам
                    const totalRequired = tree.injuries.reduce((acc, inj) => {
                        const req = inj.requiredRadiance && inj.requiredRadiance > 0 ? inj.requiredRadiance : (inj.severityPercent || 0) * 1000;
                        const healed = inj.healedRadiance || 0;
                        return acc + Math.max(0, req - healed);
                    }, 0);
                    if (totalRequired > 0 && userRadiance / totalRequired >= 0.3) {
                        await grantAchievement({ userId, achievementId: 88 });
                    }
                }
            } catch (e) {
                console.error('Achievement #88 error:', e);
            }
        } catch (e) {
            console.error('Tree healing achievements error:', e);
        }

        recordActivity({
            userId,
            type: 'tree_heal',
            minutes: 1,
            meta: { lumens, radiance: radianceAmount, conversionRate: 4, starsAward },
        }).catch(() => { });

        res.json({
            ok: true,
            lumens,
            starsAward,
            radianceAmount,
            radiance: radianceResult,
            user: { sc: userData.sc, stars: nextStars, lumens: nextLumens },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.collectFruit = async (req, res) => {
    try {
        const tree = await getTreeDoc();
        if (!tree) return res.status(404).json({ message: 'Tree not found' });

        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');

        const now = new Date();
        const start = getDayStart(now);
        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        const userId = req.user?._id;
        const userRow = await getUserRowById(userId);
        if (!userRow) return res.status(404).json({ message: pickLang(userLang, 'Пользователь не найден', 'User not found') });
        const userData = getUserData(userRow);
        const lastFruitCollectedAt = userData?.lastFruitCollectedAt ? new Date(userData.lastFruitCollectedAt) : null;
        const alreadyCollectedToday = !!(lastFruitCollectedAt && lastFruitCollectedAt >= start && lastFruitCollectedAt < end);
        if (alreadyCollectedToday) {
            return res.status(400).json({ message: pickLang(userLang, 'Вы уже собрали плод сегодня', 'You have already collected the fruit today') });
        }

        const fruitWindow = getFruitWindow(now);
        const isInWindow = now >= fruitWindow.start && now < fruitWindow.end;
        if (!isInWindow) {
            return res.status(400).json({
                message: pickLang(
                    userLang,
                    'Плод доступен только с 12:00 до 17:00 по серверному времени',
                    'The fruit is available only from 12:00 to 17:00 (server time)'
                ),
            });
        }

        // Award reward (PLAN.md): random 10–50 K OR 0.005 stars OR 10–50 Lm
        const roll = Math.floor(Math.random() * 3); // 0..2
        let rewardType = 'sc';
        let reward = 0;

        const rewardMultiplier = await getTotalRewardMultiplier(userId);

        let nextSc = Number(userData.sc) || 0;
        let nextStars = Number(userData.stars) || 0;
        let nextLumens = Number(userData.lumens) || 0;

        if (roll === 0) {
            rewardType = 'sc';
            const baseReward = Math.floor(Math.random() * 41) + 10; // 10-50 K
            reward = baseReward;
            const finalSc = keepPositiveReward(
                Math.max(0, Math.round(baseReward * rewardMultiplier * 1000) / 1000),
                baseReward
            );
            reward = finalSc;
            nextSc += finalSc;
            await recordTransaction({
                userId,
                type: 'fruit_collect',
                direction: 'credit',
                amount: finalSc,
                currency: 'K',
                description: pickLang(userLang, 'Сбор плода', 'Fruit collection'),
                relatedEntity: tree._id,
                occurredAt: now,
            }).catch(() => null);
            awardReferralBlessingExternal({
                receiverUserId: userId,
                amount: finalSc,
                sourceType: 'fruit_collect',
                relatedEntity: tree._id,
            }).catch(() => { });
        } else if (roll === 1) {
            rewardType = 'stars';
            reward = 0.005;
            const resStars = await applyStarsDelta({
                userId,
                delta: reward,
                type: 'fruit_collect',
                description: pickLang(userLang, 'Сбор плода', 'Fruit collection'),
                relatedEntity: tree._id,
                occurredAt: now,
            });
            if (resStars?.stars != null) nextStars = resStars.stars;
        } else {
            rewardType = 'lumens';
            const baseReward = Math.floor(Math.random() * 41) + 10; // 10-50 Lm
            reward = baseReward;
            const finalLm = keepPositiveReward(
                Math.max(0, Math.floor(baseReward * rewardMultiplier)),
                baseReward
            );
            reward = finalLm;
            nextLumens = (Number(nextLumens) || 0) + finalLm;
        }

        await updateUserDataById(userId, {
            sc: nextSc,
            stars: nextStars,
            lumens: nextLumens,
            lastFruitCollectedAt: now.toISOString(),
            lastMissedFruitNotificationAt: null,
        });

        awardRadianceForActivity({
            userId,
            amount: 2,
            activityType: 'fruit_collect',
            meta: { treeId: tree._id },
            dedupeKey: `fruit_collect:${userId}:${start.toISOString()}`,
        }).catch(() => { });

        recordActivity({
            userId,
            type: 'fruit_collect',
            minutes: 1,
            meta: { rewardType, reward },
        }).catch(() => { });

        // Schedule next fruit if this was the first collection of this fruit
        // Actually, let's just update the tree's nextFruitAt after some time or via cron
        // For now, let's say the fruit stays for everyone to collect until the next one is scheduled.

        const rewardPayload = {
            kind: 'currency',
            sc: rewardType === 'sc' ? reward : 0,
            lumens: rewardType === 'lumens' ? reward : 0,
            stars: rewardType === 'stars' ? reward : 0,
            radiance: 2,
            radianceActivityType: 'fruit_collect',
            radianceMeta: { source: 'ad_boost', treeId: tree._id },
            transactionType: 'fruit_ad_boost',
            description: pickLang(userLang, 'Буст: сбор плода', 'Boost: fruit collection'),
        };
        const boostOffer = await createAdBoostOffer({
            userId,
            type: 'fruit_collect_double',
            contextKey: `fruit:${userId}:${start.toISOString()}`,
            page: 'entity',
            title: pickLang(userLang, 'Удвоить плод', 'Double the fruit'),
            description: pickLang(userLang, 'Досмотрите видео, чтобы получить такую же награду ещё раз.', 'Watch the video to receive the same reward again.'),
            reward: rewardPayload,
        }).catch(() => null);

        res.json({
            message: pickLang(userLang, 'Плод собран!', 'Fruit collected!'),
            reward,
            rewardType,
            isFruitAvailable: false,
            radianceAwarded: 2,
            boostOffer,
            user: { sc: nextSc, stars: nextStars, lumens: nextLumens }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


