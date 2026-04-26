const { recordActivity } = require('../services/activityService');
const { countActivities } = require('../services/activityService');
const { applyStarsDelta } = require('../utils/stars');
const { awardReferralBlessingExternal } = require('../services/scService');
const { getTotalRewardMultiplier } = require('../services/scService');
const { recordTransaction } = require('../services/scService');
const { awardRadianceForActivity } = require('../services/activityRadianceService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { getRequestLanguage } = require('../utils/requestLanguage');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

function normalizeLang(value) {
    return value === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
    return normalizeLang(lang) === 'en' ? en : ru;
}

const SOLAR_SHARE_COUNT_CACHE_TTL_MS = Math.max(1000, Number(process.env.SOLAR_SHARE_COUNT_CACHE_TTL_MS) || 10 * 1000);

const solarChargeInflight = new Map();
const solarShareCountCache = new Map();
const solarShareCountInflight = new Map();

function mapSolarChargeRow(row) {
    if (!row) return null;
    return {
        _id: row.id,
        user: row.user_id,
        currentLm: Number(row.current_lm ?? 0),
        capacityLm: Number(row.capacity_lm ?? 100),
        lastCollectedAt: row.last_collected_at ? new Date(row.last_collected_at) : null,
        nextAvailableAt: row.next_available_at ? new Date(row.next_available_at) : null,
        totalCollectedLm: Number(row.total_collected_lm ?? 0),
        createdAt: row.created_at ? new Date(row.created_at) : null,
        updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    };
}

async function getSolarChargeRowByUserId(userId) {
    const id = toId(userId);
    if (!id) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('solar_charges')
        .select('*')
        .eq('user_id', String(id))
        .maybeSingle();
    if (error) return null;
    return data || null;
}

async function upsertSolarChargeByUserId(userId, patch) {
    const id = toId(userId);
    if (!id) return null;
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const payload = {
        user_id: String(id),
        updated_at: nowIso,
        ...patch,
        ...(Object.prototype.hasOwnProperty.call(patch || {}, 'created_at') ? {} : { created_at: nowIso }),
    };
    const { data, error } = await supabase
        .from('solar_charges')
        .upsert(payload, { onConflict: 'user_id' })
        .select('*')
        .maybeSingle();
    if (error) return null;
    return data || null;
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
        .select('id,nickname,email,data')
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
    const existing = getUserData(row);
    const next = { ...existing, ...patch };
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from('users')
        .update({ data: next, updated_at: nowIso })
        .eq('id', String(id))
        .select('id,data,nickname,email')
        .maybeSingle();
    if (error) return null;
    return data || null;
}

function getDayStart(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function getSolarShareCountCacheKey(userId, dayStart) {
    return `${String(userId)}:${new Date(dayStart).toISOString()}`;
}

function getSolarShareCountCacheExpiry(dayStart, nowMs = Date.now()) {
    const nextDayStart = new Date(dayStart);
    nextDayStart.setDate(nextDayStart.getDate() + 1);
    const expiresAt = Math.min(nowMs + SOLAR_SHARE_COUNT_CACHE_TTL_MS, nextDayStart.getTime());
    return expiresAt > nowMs ? expiresAt : nowMs + 1;
}

function getCachedSolarShareCount(cacheKey, nowMs = Date.now()) {
    const cached = solarShareCountCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= nowMs) {
        solarShareCountCache.delete(cacheKey);
        return null;
    }
    return cached.value;
}

function setCachedSolarShareCount(cacheKey, count, dayStart, nowMs = Date.now()) {
    solarShareCountCache.set(cacheKey, {
        value: count,
        expiresAt: getSolarShareCountCacheExpiry(dayStart, nowMs),
    });
    return count;
}

async function getSolarShareCountToday(userId, now = new Date(), { useCache = true } = {}) {
    const dayStart = getDayStart(now);
    const cacheKey = getSolarShareCountCacheKey(userId, dayStart);
    const nowMs = now.getTime();

    if (useCache) {
        const cached = getCachedSolarShareCount(cacheKey, nowMs);
        if (cached != null) return cached;

        const inflight = solarShareCountInflight.get(cacheKey);
        if (inflight) return inflight;
    }

    const promise = countActivities({ userId, type: 'solar_share', from: dayStart, to: now }).then((count) => {
        if (useCache) {
            setCachedSolarShareCount(cacheKey, count, dayStart, nowMs);
        }
        return count;
    }).finally(() => {
        if (useCache) {
            solarShareCountInflight.delete(cacheKey);
        }
    });

    if (useCache) {
        solarShareCountInflight.set(cacheKey, promise);
    }

    return promise;
}

async function findOrCreateSolarCharge(userId) {
    const chargeKey = String(userId);
    const inflight = solarChargeInflight.get(chargeKey);
    if (inflight) return inflight;

    const promise = (async () => {
        const existing = await getSolarChargeRowByUserId(userId);
        if (existing) return mapSolarChargeRow(existing);

        const created = await upsertSolarChargeByUserId(userId, {
            capacity_lm: 100,
            current_lm: 0,
            next_available_at: new Date().toISOString(),
            total_collected_lm: 0,
        });
        return mapSolarChargeRow(created);
    })().finally(() => {
        solarChargeInflight.delete(chargeKey);
    });

    solarChargeInflight.set(chargeKey, promise);
    return promise;
}

function isSameLocalDay(d1, d2) {
    const a = new Date(d1);
    const b = new Date(d2);
    return a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
}

async function pickRandomRecipient(excludeUserId) {
    const supabase = getSupabaseClient();
    const excludeId = String(excludeUserId);

    const { count, error: countError } = await supabase
        .from('users')
        .select('id', { head: true, count: 'exact' })
        .neq('id', excludeId);
    if (countError) throw countError;

    const total = Number(count || 0);
    if (!total) return null;

    const offset = Math.floor(Math.random() * total);
    const { data, error } = await supabase
        .from('users')
        .select('id')
        .neq('id', excludeId)
        .range(offset, offset);
    if (error) throw error;

    const row = Array.isArray(data) && data.length ? data[0] : null;
    return row?.id ? { _id: row.id } : null;
}

// GET /solar
exports.getSolarStatus = async (req, res) => {
    try {
        const DAILY_LIMIT = 5;
        const now = new Date();
        const [charge, shareCountToday] = await Promise.all([
            findOrCreateSolarCharge(req.user._id),
            getSolarShareCountToday(req.user._id, now),
        ]);

        res.json({
            ...(charge || {}),
            shareCountToday,
            shareDailyLimit: DAILY_LIMIT,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /solar/collect
exports.collectSolarCharge = async (req, res) => {
    try {
        const userLang = normalizeLang(getRequestLanguage(req));
        const chargeRow = await getSolarChargeRowByUserId(req.user._id);
        const charge = mapSolarChargeRow(chargeRow);
        if (!charge) return res.status(404).json({ message: pickLang(userLang, 'Заряд не найден', 'Charge not found') });

        const now = new Date();
        if (charge.nextAvailableAt && charge.nextAvailableAt > now) {
            return res.status(400).json({ message: pickLang(userLang, 'Заряд еще не готов', 'Charge is not ready yet') });
        }

        const baseLmAward = 100; // TZ: 100 Lumens
        const scAward = 10;  // TZ: 10 K

        const [userRow, rewardMultiplier] = await Promise.all([
            getUserRowById(req.user._id),
            getTotalRewardMultiplier(req.user._id),
        ]);
        if (!userRow) return res.status(404).json({ message: pickLang(userLang, 'Пользователь не найден', 'User not found') });

        const userData = getUserData(userRow);
        const achievementStats = userData.achievementStats && typeof userData.achievementStats === 'object' ? userData.achievementStats : {};
        const shopBoosts = userData.shopBoosts && typeof userData.shopBoosts === 'object' ? userData.shopBoosts : {};
        const charges = Number(shopBoosts?.solarExtraLmCharges) || 0;
        const extraLm = charges > 0 ? 20 : 0;
        const lmAward = baseLmAward + extraLm;

        const finalLmAward = Math.max(0, Math.floor(lmAward * rewardMultiplier));
        const finalScAward = Math.max(0, Math.round(scAward * rewardMultiplier * 1000) / 1000);

        const nextLumens = (Number(userData.lumens) || 0) + finalLmAward;
        const nextSc = (Number(userData.sc) || 0) + finalScAward;
        const nextShopBoosts = charges > 0
            ? { ...shopBoosts, solarExtraLmCharges: Math.max(0, charges - 1) }
            : shopBoosts;

        awardReferralBlessingExternal({
            receiverUserId: userRow.id,
            amount: finalScAward,
            sourceType: 'solar_collect',
            relatedEntity: charge._id,
        }).catch(() => { });

        const nextAvailableAt = new Date(now.getTime() + 60 * 60 * 1000);
        const nextTotalCollectedLm = (Number(charge.totalCollectedLm) || 0) + lmAward;

        const updatedUserRow = await updateUserDataById(userRow.id, {
            lumens: nextLumens,
            sc: nextSc,
            shopBoosts: nextShopBoosts,
        });
        if (finalScAward > 0) {
            await recordTransaction({
                userId: userRow.id,
                type: 'solar_collect',
                direction: 'credit',
                amount: finalScAward,
                currency: 'K',
                description: pickLang(userLang, 'Сбор солнечного заряда', 'Solar charge collection'),
                relatedEntity: charge._id,
                occurredAt: now,
            }).catch(() => null);
        }
        await upsertSolarChargeByUserId(req.user._id, {
            current_lm: 0,
            last_collected_at: now.toISOString(),
            next_available_at: nextAvailableAt.toISOString(),
            total_collected_lm: nextTotalCollectedLm,
        });

        const hourStart = new Date(now);
        hourStart.setMinutes(0, 0, 0);

        awardRadianceForActivity({
            userId: req.user._id,
            amount: 10,
            activityType: 'solar_collect',
            meta: { solarChargeId: charge._id },
            dedupeKey: `solar_collect:${charge._id}:${hourStart.toISOString()}`,
        }).catch(() => { });

        // Лог активности для «Тихого ночного дозора»
        recordActivity({
            userId: req.user._id,
            type: 'solar_collect',
            minutes: 5,
            meta: {
                earnedLm: finalLmAward,
                earnedSc: finalScAward,
                baseLmAward,
                extraLm,
            },
        }).catch(() => { });

        // Ачивка #26. Второе дыхание (Вернуться в бой после зарядки)
        try {
            const supabase = getSupabaseClient();
            const { data: battleRows, error: battleError } = await supabase
                .from(DOC_TABLE)
                .select('id,data')
                .eq('model', 'Battle')
                .eq('data->>status', 'active')
                .limit(100);
            
            if (!battleError && Array.isArray(battleRows)) {
                for (const row of battleRows) {
                    const attendance = row.data?.attendance || [];
                    const idx = attendance.findIndex((a) => String(a.user) === String(req.user._id));
                    if (idx >= 0) {
                        attendance[idx].exitedAndReturnedWithSolarCharge = true;
                        await supabase
                            .from(DOC_TABLE)
                            .update({ data: { ...row.data, attendance }, updated_at: new Date().toISOString() })
                            .eq('id', row.id);
                        break;
                    }
                }
            }
        } catch (e) {
            console.error('Achievement #26 track error:', e);
        }

        // Достижение #90. Светоносец дня
        try {
            const { grantAchievement } = require('../services/achievementService');
            const lastChargeAt = achievementStats?.lastSolarChargeAt;
            let chargeCount = (achievementStats?.dailySolarChargesCount || 0) + 1;

            if (lastChargeAt) {
                const gapMs = now.getTime() - new Date(lastChargeAt).getTime();
                // Если пропуск более 2 часов (120 минут) - сброс
                if (gapMs > 120 * 60 * 1000) {
                    chargeCount = 1;
                }
            }

            await updateUserDataById(userRow.id, {
                achievementStats: {
                    ...achievementStats,
                    dailySolarChargesCount: chargeCount,
                    lastSolarChargeAt: now,
                },
            });

            if (chargeCount >= 24) {
                await grantAchievement({ userId: userRow.id, achievementId: 90 });
            }
        } catch (e) {
            console.error('Achievement solar collect error:', e);
        }

        res.json({
            message: pickLang(userLang, 'Заряд успешно впитан!', 'Charge successfully absorbed!'),
            lmAward: finalLmAward,
            scAward: finalScAward,
            user: {
                sc: updatedUserRow?.data?.sc ?? nextSc,
                lumens: updatedUserRow?.data?.lumens ?? nextLumens
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// POST /solar/share
exports.shareSolarLumens = async (req, res) => {
    try {
        const DAILY_LIMIT = 5;
        const amountLm = Number(req.body?.amountLm);

        const userLang = normalizeLang(getRequestLanguage(req));

        if (!Number.isFinite(amountLm) || amountLm < 1 || amountLm > 100) {
            return res.status(400).json({ message: pickLang(userLang, 'Введите количество Lm от 1 до 100', 'Enter amount of Lm from 1 to 100') });
        }

        const now = new Date();
        const dayStart = getDayStart(now);
        const [shareCountToday, senderRow] = await Promise.all([
            getSolarShareCountToday(req.user._id, now, { useCache: false }),
            getUserRowById(req.user._id),
        ]);

        if (shareCountToday >= DAILY_LIMIT) {
            return res.status(400).json({ message: pickLang(userLang, 'Достигнут дневной лимит раздач (5)', 'Daily sharing limit reached (5)') });
        }

        if (!senderRow) return res.status(404).json({ message: pickLang(userLang, 'Пользователь не найден', 'User not found') });

        const senderData = getUserData(senderRow);
        const senderAchievementStats = senderData.achievementStats && typeof senderData.achievementStats === 'object' ? senderData.achievementStats : {};

        if ((Number(senderData.lumens) || 0) < amountLm) {
            return res.status(400).json({ message: pickLang(userLang, 'Недостаточно Люменов', 'Not enough Lumens') });
        }

        const recipient = await pickRandomRecipient(senderRow.id);

        if (!recipient?._id) {
            return res.status(400).json({ message: pickLang(userLang, 'Нет доступных получателей', 'No available recipients') });
        }

        const [receiverRow, rewardMultiplier] = await Promise.all([
            getUserRowById(recipient._id),
            getTotalRewardMultiplier(senderRow.id),
        ]);
        if (!receiverRow) {
            return res.status(400).json({ message: pickLang(userLang, 'Получатель недоступен', 'Recipient is unavailable') });
        }

        const scAward = 5;

        const finalScAward = Math.max(0, Math.round(scAward * rewardMultiplier * 1000) / 1000);
        const starsAward = Math.round((Math.random() * (0.01 - 0.001) + 0.001) * 1000) / 1000;

        const nextSenderLumens = (Number(senderData.lumens) || 0) - amountLm;
        const nextSenderSc = (Number(senderData.sc) || 0) + finalScAward;

        const resStars = await applyStarsDelta({
            userId: senderRow.id,
            delta: starsAward,
            type: 'solar_share',
            description: pickLang(userLang, 'Передача Люменов', 'Lumens transfer'),
            relatedEntity: receiverRow.id,
            occurredAt: now,
        });
        const nextSenderStars = resStars?.stars;

        const receiverData = getUserData(receiverRow);
        const nextReceiverLumens = (Number(receiverData.lumens) || 0) + amountLm;

        const [updatedSenderRow] = await Promise.all([
            updateUserDataById(senderRow.id, {
                lumens: nextSenderLumens,
                sc: nextSenderSc,
                ...(nextSenderStars != null ? { stars: nextSenderStars } : {}),
            }),
            updateUserDataById(receiverRow.id, {
                lumens: nextReceiverLumens,
            }),
        ]);
        if (finalScAward > 0) {
            await recordTransaction({
                userId: senderRow.id,
                type: 'solar_share',
                direction: 'credit',
                amount: finalScAward,
                currency: 'K',
                description: pickLang(userLang, 'Передача Люменов', 'Lumens transfer'),
                relatedEntity: receiverRow.id,
                occurredAt: now,
            }).catch(() => null);
        }

        // Ачивка #27. Альтруист боя
        try {
            const supabase = getSupabaseClient();
            const { data: battleRows, error: battleError } = await supabase
                .from(DOC_TABLE)
                .select('id,data')
                .eq('model', 'Battle')
                .eq('data->>status', 'active')
                .limit(100);
            
            if (!battleError && Array.isArray(battleRows)) {
                for (const row of battleRows) {
                    const attendance = row.data?.attendance || [];
                    const idx = attendance.findIndex((a) => String(a.user) === String(receiverRow.id));
                    if (idx >= 0) {
                        attendance[idx].receivedGiftInBattle = true;
                        await supabase
                            .from(DOC_TABLE)
                            .update({ data: { ...row.data, attendance }, updated_at: new Date().toISOString() })
                            .eq('id', row.id);
                        break;
                    }
                }
            }
        } catch (e) {
            console.error('Achievement #27 recipient track error:', e);
        }

        awardReferralBlessingExternal({
            receiverUserId: senderRow.id,
            amount: finalScAward,
            sourceType: 'solar_share',
            relatedEntity: receiverRow.id,
        }).catch(() => { });

        // IMPORTANT: record synchronously to enforce DAILY_LIMIT without race conditions
        await recordActivity({
            userId: senderRow.id,
            type: 'solar_share',
            minutes: 1,
            meta: {
                amountLm,
                recipientId: receiverRow.id,
                scAward: finalScAward,
                starsAward,
            },
            createdAt: now,
        });
        setCachedSolarShareCount(
            getSolarShareCountCacheKey(senderRow.id, dayStart),
            shareCountToday + 1,
            dayStart,
            now.getTime()
        );

        awardRadianceForActivity({
            userId: senderRow.id,
            amount: 10,
            activityType: 'solar_share',
            meta: { amountLm, recipientId: receiverRow.id },
            dedupeKey: `solar_share:${senderRow.id}:${receiverRow.id}:${now.toISOString()}`,
        }).catch(() => { });


        // Достижение #28. Сияющий донор
        try {
            const lastBattleAt = senderAchievementStats?.lastBattleFinishedAt;
            if (lastBattleAt) {
                const diffMs = now.getTime() - new Date(lastBattleAt).getTime();
                if (diffMs < 5 * 60 * 1000) { // В течение 5 минут после боя
                    // Любое действие? Мы проверяем только донорство тут.
                    const sharesAfter = (senderAchievementStats?.sharesAfterLastBattle || 0) + 1;
                    await updateUserDataById(senderRow.id, {
                        achievementStats: { ...senderAchievementStats, sharesAfterLastBattle: sharesAfter },
                    });
                    if (sharesAfter >= 5) {
                        const { grantAchievement } = require('../services/achievementService');
                        await grantAchievement({ userId: senderRow.id, achievementId: 28 });
                    }
                }
            }
        } catch (e) {
            console.error('Achievement #28 track error:', e);
        }

        // Достижение #87. Щедрая душа (5000 люмен раздал)
        try {
            const { grantAchievement } = require('../services/achievementService');
            const totalShared = (senderAchievementStats?.totalEnergyShared || 0) + amountLm;
            await updateUserDataById(senderRow.id, {
                achievementStats: { ...senderAchievementStats, totalEnergyShared: totalShared },
            });

            if (totalShared >= 5000) {
                await grantAchievement({ userId: senderRow.id, achievementId: 87 });
            }
        } catch (e) {
            console.error('Achievement #87 track error:', e);
        }

        // Достижение #73. Постоянство Света (7 дней подряд)
        try {
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const lastShareAt = senderAchievementStats?.lastEnergyShareAt;
            let streak = senderAchievementStats?.consecutiveEnergyShareDays || 0;

            if (lastShareAt) {
                if (isSameLocalDay(lastShareAt, yesterday)) {
                    streak += 1;
                } else if (!isSameLocalDay(lastShareAt, now)) {
                    streak = 1;
                }
            } else {
                streak = 1;
            }

            await updateUserDataById(senderRow.id, {
                achievementStats: {
                    ...senderAchievementStats,
                    consecutiveEnergyShareDays: streak,
                    lastEnergyShareAt: now,
                },
            });

            if (streak >= 7) {
                const { grantAchievement } = require('../services/achievementService');
                await grantAchievement({ userId: senderRow.id, achievementId: 73 });
            }
        } catch (e) {
            console.error('Achievement #73 track error:', e);
        }

        res.json({
            message: pickLang(userLang, 'Свет отправлен!', 'Light sent!'),
            amountLm,
            scAward: finalScAward,
            starsAward,
            shareCountToday: shareCountToday + 1,
            shareDailyLimit: DAILY_LIMIT,
            user: {
                sc: updatedSenderRow?.data?.sc ?? nextSenderSc,
                lumens: updatedSenderRow?.data?.lumens ?? nextSenderLumens,
                stars: updatedSenderRow?.data?.stars ?? nextSenderStars,
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.__resetSolarControllerRuntimeState = () => {
    solarChargeInflight.clear();
    solarShareCountCache.clear();
    solarShareCountInflight.clear();
};

