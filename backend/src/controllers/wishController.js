const { debitSc, creditSc } = require('../services/scService');
const { createNotification } = require('./notificationController');
const { applyStarsDelta } = require('../utils/stars');
const { adminAudit } = require('../middleware/adminAudit');
const { awardRadianceForActivity } = require('../services/activityRadianceService');
const crypto = require('crypto');
const { getSupabaseClient } = require('../lib/supabaseClient');

const WISH_STATS_CACHE_TTL_MS = Math.max(1000, Number(process.env.WISH_STATS_CACHE_TTL_MS) || 10000);
const DAILY_WISH_LIMIT = 3;
const DAILY_FULFILL_LIMIT = 3;
const MONTHLY_FULFILL_LIMIT = 10;
const WISH_COST_SC = 100;
const FULFILL_REWARD_SC = 100;
const FULFILL_REWARD_STARS = 0.1;

function normalizeLang(value) {
  return value === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
  return normalizeLang(lang) === 'en' ? en : ru;
}

const wishStatsCache = new Map();
const wishStatsInflight = new Map();

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

function mapWishRowToDoc(row) {
  if (!row) return null;
  return {
    _id: row.id,
    author: row.author_id,
    text: row.text,
    status: row.status,
    supportCount: row.support_count ?? 0,
    supportSc: Number(row.support_sc ?? 0),
    language: row.language ?? undefined,
    costSc: Number(row.cost_sc ?? 0),
    executor: row.executor_id ?? null,
    executorContact: row.executor_contact ?? undefined,
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    takenAt: row.taken_at ? new Date(row.taken_at) : null,
    fulfilledAt: row.fulfilled_at ? new Date(row.fulfilled_at) : null,
  };
}

async function getWishRowById(wishId) {
  const id = toId(wishId);
  if (!id) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('wishes')
    .select('*')
    .eq('id', String(id))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function countWishesExact(filters = []) {
  const supabase = getSupabaseClient();
  let query = supabase.from('wishes').select('id', { head: true, count: 'exact' });
  for (const f of filters) {
    if (!f) continue;
    if (f.op === 'eq') query = query.eq(f.col, f.val);
    if (f.op === 'neq') query = query.neq(f.col, f.val);
    if (f.op === 'in') query = query.in(f.col, f.val);
    if (f.op === 'gte') query = query.gte(f.col, f.val);
  }
  const { count, error } = await query;
  if (error) return 0;
  return Number(count || 0);
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
    .select('id,data')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysAgo(num, date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() - num);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildWishStatsPayload({ createdToday, executedToday, executedLast30 }) {
  return {
    createdToday,
    dailyWishLimit: DAILY_WISH_LIMIT,
    executedToday,
    dailyFulfillLimit: DAILY_FULFILL_LIMIT,
    executedLast30,
    monthlyFulfillLimit: MONTHLY_FULFILL_LIMIT,
  };
}

function getWishStatsCacheKey(userId, dayStart) {
  return `${String(userId)}:${dayStart.toISOString()}`;
}

function getWishStatsCacheExpiry(dayStart, nowMs = Date.now()) {
  const nextDay = new Date(dayStart);
  nextDay.setDate(nextDay.getDate() + 1);
  return Math.min(nowMs + WISH_STATS_CACHE_TTL_MS, nextDay.getTime());
}

function getCachedWishStats(cacheKey, nowMs = Date.now()) {
  const cached = wishStatsCache.get(cacheKey);
  if (!cached) return null;
  if (cached.expiresAt <= nowMs) {
    wishStatsCache.delete(cacheKey);
    return null;
  }
  return { ...cached.value };
}

function setCachedWishStats(cacheKey, stats, dayStart, nowMs = Date.now()) {
  wishStatsCache.set(cacheKey, {
    value: { ...stats },
    expiresAt: getWishStatsCacheExpiry(dayStart, nowMs),
  });
  return stats;
}

function setCachedWishStatsForUser(userId, stats, now = new Date()) {
  const dayStart = startOfDay(now);
  const cacheKey = getWishStatsCacheKey(userId, dayStart);
  return setCachedWishStats(cacheKey, stats, dayStart, now.getTime());
}

function mapWishDto(wish) {
  if (!wish) return null;
  return {
    id: wish._id.toString(),
    text: wish.text,
    status: wish.status,
    supportCount: wish.supportCount || 0,
    supportSc: wish.supportSc || 0,
    authorId: wish.author ? wish.author.toString() : null,
    executorId: wish.executor ? wish.executor.toString() : null,
    createdAt: wish.createdAt,
    takenAt: wish.takenAt || null,
    fulfilledAt: wish.fulfilledAt || null,
  };
}

async function getStatsForUser(userId, { now = new Date(), useCache = true } = {}) {
  const today = startOfDay(now);
  const cacheKey = getWishStatsCacheKey(userId, today);

  if (useCache) {
    const cached = getCachedWishStats(cacheKey, now.getTime());
    if (cached) return cached;

    const inflight = wishStatsInflight.get(cacheKey);
    if (inflight) return inflight;
  }

  const monthAgo = daysAgo(30, now);

  const promise = Promise.all([
    countWishesExact([
      { op: 'eq', col: 'author_id', val: String(userId) },
      { op: 'gte', col: 'created_at', val: today.toISOString() },
    ]),
    countWishesExact([
      { op: 'eq', col: 'executor_id', val: String(userId) },
      { op: 'gte', col: 'taken_at', val: today.toISOString() },
    ]),
    countWishesExact([
      { op: 'eq', col: 'executor_id', val: String(userId) },
      { op: 'gte', col: 'taken_at', val: monthAgo.toISOString() },
    ]),
  ]).then(([createdToday, executedToday, executedLast30]) => {
    const stats = buildWishStatsPayload({ createdToday, executedToday, executedLast30 });
    if (useCache) {
      setCachedWishStats(cacheKey, stats, today, now.getTime());
    }
    return stats;
  }).finally(() => {
    if (useCache) {
      wishStatsInflight.delete(cacheKey);
    }
  });

  if (useCache) {
    wishStatsInflight.set(cacheKey, promise);
  }

  return promise;
}

async function createWish(req, res, next) {
  try {
    const { text, language } = req.body || {};
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ message: pickLang(userLang, 'Текст желания обязателен', 'Wish text is required') });
    }
    if (text.trim().length > 1000) {
      return res.status(400).json({ message: pickLang(userLang, 'Желание не должно превышать 1000 символов', 'Wish text must not exceed 1000 characters') });
    }

    const now = new Date();
    const stats = await getStatsForUser(req.user._id, { now, useCache: false });
    if (stats.createdToday >= DAILY_WISH_LIMIT) {
      return res.status(400).json({
        message: pickLang(userLang, `Максимум ${DAILY_WISH_LIMIT} желаний в день`, `Maximum ${DAILY_WISH_LIMIT} wishes per day`),
      });
    }

    // Списываем K через сервис (проверка баланса внутри)
    const updatedUser = await debitSc({
      userId: req.user._id,
      amount: WISH_COST_SC,
      type: 'wish',
      description: pickLang(userLang, 'Загадать желание', 'Make a wish'),
    });

    const wishId = crypto.randomBytes(12).toString('hex');
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const { data: inserted, error: insertError } = await supabase
      .from('wishes')
      .insert({
        id: wishId,
        author_id: String(req.user._id),
        text: text.trim(),
        status: 'open',
        cost_sc: WISH_COST_SC,
        ...(language ? { language } : {}),
        created_at: nowIso,
        updated_at: nowIso,
      })
      .select('*')
      .maybeSingle();
    if (insertError || !inserted) {
      return res.status(500).json({ message: pickLang(userLang, 'Не удалось создать желание', 'Failed to create wish') });
    }
    const wish = mapWishRowToDoc(inserted);

    awardRadianceForActivity({
      userId: req.user._id,
      amount: 3,
      activityType: 'wish_create',
      meta: { wishId: wish._id },
      dedupeKey: `wish_create:${wish._id}:${req.user._id}`,
    }).catch(() => { });

    // Ачивки за создание желаний
    try {
      const { grantAchievement } = require('../services/achievementService');
      const userRow = await getUserRowById(req.user._id);
      if (userRow) {
        const userData = getUserData(userRow);
        const stats = userData.achievementStats && typeof userData.achievementStats === 'object' ? userData.achievementStats : {};
        const created = (Number(stats.totalWishesCreated) || 0) + 1;
        await updateUserDataById(userRow.id, { achievementStats: { ...stats, totalWishesCreated: created } });

        // #72. Вестник мечты (30 желаний)
        if (created >= 30) await grantAchievement({ userId: userRow.id, achievementId: 72 });
      }
    } catch (e) {
      console.error('Wish create achievement error:', e);
    }

    const nextStats = buildWishStatsPayload({
      createdToday: stats.createdToday + 1,
      executedToday: stats.executedToday,
      executedLast30: stats.executedLast30,
    });
    setCachedWishStatsForUser(req.user._id, nextStats, now);

    return res.status(201).json({ wish: mapWishDto(wish), user: updatedUser, stats: nextStats });
  } catch (error) {
    return next(error);
  }
}

async function listWishes(req, res, next) {
  try {
    const { scope } = req.query;
    const userId = req.user._id;

    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.query?.language || 'ru');

    const supabase = getSupabaseClient();
    let query = supabase.from('wishes').select('*');
    if (scope === 'mine') {
      query = query.eq('author_id', String(userId)).neq('status', 'archived');
    } else {
      query = query.neq('author_id', String(userId)).in('status', ['open', 'supported', 'pending']);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) return res.status(500).json({ message: pickLang(userLang, 'Не удалось получить желания', 'Failed to fetch wishes') });
    const wishes = (Array.isArray(data) ? data : []).map((row) => mapWishDto(mapWishRowToDoc(row)));
    return res.json({ wishes });
  } catch (error) {
    return next(error);
  }
}

async function supportWish(req, res, next) {
  try {
    const { id } = req.params;
    const { amount } = req.body || {};

    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');

    const now = new Date();

    const value = Number(amount);
    if (!value || Number.isNaN(value) || value <= 0) {
      return res.status(400).json({ message: pickLang(userLang, 'Укажите положительное количество K', 'Enter a positive amount of K') });
    }

    const wishRow = await getWishRowById(id);
    const wish = mapWishRowToDoc(wishRow);
    if (!wish) {
      return res.status(404).json({ message: pickLang(userLang, 'Желание не найдено', 'Wish not found') });
    }

    if (wish.author.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: pickLang(userLang, 'Нельзя поддерживать своё собственное желание', 'You cannot support your own wish') });
    }

    if (['fulfilled', 'archived'].includes(wish.status)) {
      return res.status(400).json({ message: pickLang(userLang, 'Нельзя поддержать это желание', 'You cannot support this wish') });
    }

    const updatedUser = await debitSc({
      userId: req.user._id,
      amount: value,
      type: 'wish',
      description: pickLang(userLang, 'Поддержка желания', 'Support a wish'),
      relatedEntity: wish._id,
    });

    const nextSupportCount = (Number(wish.supportCount) || 0) + 1;
    const nextSupportSc = (Number(wish.supportSc) || 0) + value;
    const nextStatus = wish.status === 'open' ? 'supported' : wish.status;
    {
      const supabase = getSupabaseClient();
      const nowIso = new Date().toISOString();
      const { data: updated, error: updateError } = await supabase
        .from('wishes')
        .update({
          support_count: nextSupportCount,
          support_sc: nextSupportSc,
          status: nextStatus,
          updated_at: nowIso,
        })
        .eq('id', String(wish._id))
        .select('*')
        .maybeSingle();
      if (!updateError && updated) {
        Object.assign(wish, mapWishRowToDoc(updated));
      }
    }

    awardRadianceForActivity({
      userId: req.user._id,
      amount: 5,
      activityType: 'wish_support',
      meta: { wishId: wish._id, amountSc: value },
      dedupeKey: `wish_support:${wish._id}:${req.user._id}:${crypto.randomBytes(12).toString('hex')}`,
    }).catch(() => { });

    // Ачивка #61. Меценат (Отправить заработанные в бою ЦП на желание другого)
    try {
      const stats = req.user.achievementStats || {};
      const lastSc = stats.lastBattleScEarned || 0;
      if (lastSc > 0 && Math.floor(value) === Math.floor(lastSc)) {
        const { grantAchievement } = require('../services/achievementService');
        await grantAchievement({ userId: req.user._id, achievementId: 61 });
      }
    } catch (e) {
      console.error('Achievement #61 grant error:', e);
    }

    // Ачивки за поддержку желаний
    try {
      const { grantAchievement } = require('../services/achievementService');
      const userRow = await getUserRowById(req.user._id);
      if (userRow) {
        const userData = getUserData(userRow);
        const stats = userData.achievementStats && typeof userData.achievementStats === 'object' ? userData.achievementStats : {};
        const supported = (Number(stats.totalWishesSupported) || 0) + 1;
        await updateUserDataById(userRow.id, { achievementStats: { ...stats, totalWishesSupported: supported } });
        // #43. Помощник мечтателя (50 желаний)
        if (supported >= 50) await grantAchievement({ userId: userRow.id, achievementId: 43 });
      }
    } catch (e) {
      console.error('Wish support achievement error:', e);
    }

    const stats = await getStatsForUser(req.user._id);

    try {
      const io = req.app.get('io');
      const authorRow = await getUserRowById(wish.author);
      const authorLang = (authorRow?.language || authorRow?.data?.language || 'ru') === 'en' ? 'en' : 'ru';
      await createNotification({
        userId: wish.author,
        type: 'system',
        title: authorLang === 'en' ? 'Your wish was supported' : 'Желание поддержали',
        message: authorLang === 'en'
          ? `Your wish was supported! +${value} K`
          : `Ваше желание поддержали! +${value} K`,
        link: '/galaxy',
        io,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to notify wish author', e);
    }

    adminAudit('wish.support', req, {
      wishId: wish._id,
      authorId: wish.author,
      amount: value,
    });

    return res.json({ wish: mapWishDto(wish), user: updatedUser, stats });
  } catch (error) {
    return next(error);
  }
}

async function takeForFulfillment(req, res, next) {
  try {
    const { id } = req.params;
    const { contact } = req.body || {};
    const now = new Date();

    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');

    if (!contact || typeof contact !== 'string' || !contact.trim()) {
      return res.status(400).json({ message: pickLang(userLang, 'Укажите контакт для связи', 'Provide a contact to reach you') });
    }

    const wishRow = await getWishRowById(id);
    const wish = mapWishRowToDoc(wishRow);
    if (!wish) {
      return res.status(404).json({ message: pickLang(userLang, 'Желание не найдено', 'Wish not found') });
    }

    if (wish.author.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: pickLang(userLang, 'Нельзя исполнять своё собственное желание', 'You cannot fulfill your own wish') });
    }

    if (['fulfilled', 'archived'].includes(wish.status)) {
      return res.status(400).json({ message: pickLang(userLang, 'Это желание уже недоступно для исполнения', 'This wish is no longer available for fulfillment') });
    }

    if (wish.status === 'pending') {
      return res.status(400).json({ message: pickLang(userLang, 'Желание уже находится в исполнении', 'This wish is already being fulfilled') });
    }

    const stats = await getStatsForUser(req.user._id, { now, useCache: false });

    if (stats.executedToday >= DAILY_FULFILL_LIMIT) {
      return res.status(400).json({
        message: pickLang(
          userLang,
          `Не более ${DAILY_FULFILL_LIMIT} исполнений чужих желаний в сутки`,
          `No more than ${DAILY_FULFILL_LIMIT} fulfillments of other people's wishes per day`
        ),
      });
    }
    if (stats.executedLast30 >= MONTHLY_FULFILL_LIMIT) {
      return res.status(400).json({
        message: pickLang(userLang, `Не более ${MONTHLY_FULFILL_LIMIT} исполнений за 30 дней`, `No more than ${MONTHLY_FULFILL_LIMIT} fulfillments in 30 days`),
      });
    }

    {
      const supabase = getSupabaseClient();
      const nowIso = now.toISOString();
      const { data: updated, error: updateError } = await supabase
        .from('wishes')
        .update({
          executor_id: String(req.user._id),
          executor_contact: contact.trim(),
          status: 'pending',
          taken_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', String(wish._id))
        .select('*')
        .maybeSingle();
      if (updateError || !updated) {
        return res.status(500).json({ message: pickLang(userLang, 'Не удалось обновить желание', 'Failed to update wish') });
      }
      Object.assign(wish, mapWishRowToDoc(updated));
    }

    const nextStats = buildWishStatsPayload({
      createdToday: stats.createdToday,
      executedToday: stats.executedToday + 1,
      executedLast30: stats.executedLast30 + 1,
    });
    setCachedWishStatsForUser(req.user._id, nextStats, now);

    try {
      const io = req.app.get('io');
      const authorRow = await getUserRowById(wish.author);
      const authorLang = (authorRow?.language || authorRow?.data?.language || 'ru') === 'en' ? 'en' : 'ru';
      await createNotification({
        userId: wish.author,
        type: 'system',
        title: authorLang === 'en' ? 'Executor found' : 'Исполнитель найден',
        message: authorLang === 'en'
          ? 'Someone wants to fulfill your wish. A moderator will contact you for confirmation.'
          : 'Кто-то хочет исполнить ваше желание. Модератор свяжется с вами для подтверждения.',
        link: '/galaxy',
        io,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to notify wish author about fulfillment', e);
    }

    adminAudit('wish.fulfillment.request', req, {
      wishId: wish._id,
      authorId: wish.author,
      executorId: wish.executor,
    });

    return res.json({ wish: mapWishDto(wish), stats: nextStats });
  } catch (error) {
    return next(error);
  }
}

async function markFulfilled(req, res, next) {
  try {
    const { id } = req.params;
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || 'ru');

    const wishRow = await getWishRowById(id);
    const wish = mapWishRowToDoc(wishRow);
    if (!wish) {
      return res.status(404).json({ message: pickLang(userLang, 'Желание не найдено', 'Wish not found') });
    }

    if (wish.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: pickLang(userLang, 'Только автор может отметить исполнение желания', 'Only the author can mark the wish as fulfilled'),
      });
    }

    if (wish.status === 'fulfilled') {
      return res.status(400).json({
        message: pickLang(userLang, 'Желание уже отмечено как исполненное', 'The wish is already marked as fulfilled'),
      });
    }

    if (!wish.executor) {
      return res.status(400).json({
        message: pickLang(userLang, 'У этого желания ещё нет исполнителя', 'This wish does not have an executor yet'),
      });
    }

    {
      const supabase = getSupabaseClient();
      const now = new Date();
      const nowIso = now.toISOString();
      const { data: updated, error: updateError } = await supabase
        .from('wishes')
        .update({
          status: 'fulfilled',
          fulfilled_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', String(wish._id))
        .select('*')
        .maybeSingle();
      if (updateError || !updated) {
        return res.status(500).json({ message: pickLang(userLang, 'Не удалось отметить исполнение', 'Failed to mark fulfillment') });
      }
      Object.assign(wish, mapWishRowToDoc(updated));
    }

    // Ачивки за исполнение желаний
    if (wish.executor) {
      try {
        const { grantAchievement } = require('../services/achievementService');
        const executorId = toId(wish.executor);
        const executorRow = await getUserRowById(executorId);
        if (executorRow) {
          const executorData = getUserData(executorRow);
          const executorStats = executorData.achievementStats && typeof executorData.achievementStats === 'object' ? executorData.achievementStats : {};
          const fulfilledCount = (Number(executorStats.totalWishesFulfilled) || 0) + 1;
          await updateUserDataById(executorRow.id, { achievementStats: { ...executorStats, totalWishesFulfilled: fulfilledCount } });
          // #77. Исполнитель мечты (Исполнить и получить подтверждение)
          if (fulfilledCount >= 1) await grantAchievement({ userId: executorRow.id, achievementId: 77 });
        }
      } catch (e) {
        console.error('Wish fulfill achievement error:', e);
      }
    }

    // Ачивки за получение исполненного желания (автор)
    try {
      const authorId = toId(wish.author);
      const authorRow = await getUserRowById(authorId);
      if (authorRow) {
        const authorData = getUserData(authorRow);
        const authorStats = authorData.achievementStats && typeof authorData.achievementStats === 'object' ? authorData.achievementStats : {};
        const nextCount = (Number(authorStats.totalWishesFulfilledAuthor) || 0) + 1;
        await updateUserDataById(authorRow.id, { achievementStats: { ...authorStats, totalWishesFulfilledAuthor: nextCount } });
      }
    } catch (e) {
      console.error('Wish author stats update error:', e);
    }

    if (wish.executor) {
      try {
        await creditSc({
          userId: wish.executor,
          amount: FULFILL_REWARD_SC,
          type: 'wish',
          description: pickLang(userLang, 'Бонус за исполнение желания', 'Bonus for fulfilling a wish'),
          relatedEntity: wish._id,
        });
        await applyStarsDelta({
          userId: wish.executor,
          delta: FULFILL_REWARD_STARS,
          type: 'wish_fulfill',
          description: pickLang(userLang, 'Исполнение желания', 'Wish fulfillment'),
          relatedEntity: wish._id,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to reward executor for fulfilled wish', e);
      }
    }

    const userStats = await getStatsForUser(req.user._id);

    adminAudit('wish.fulfilled', req, {
      wishId: wish._id,
      authorId: wish.author,
      executorId: wish.executor,
    });

    return res.json({ wish: mapWishDto(wish), stats: userStats });
  } catch (error) {
    return next(error);
  }
}

async function getStats(req, res, next) {
  try {
    const currentSc = req.user.sc || 0;
    const stats = await getStatsForUser(req.user._id);
    return res.json({
      ...stats,
      userSc: currentSc,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createWish,
  listWishes,
  supportWish,
  takeForFulfillment,
  markFulfilled,
  getStats,
  __resetWishControllerRuntimeState: () => {
    wishStatsCache.clear();
    wishStatsInflight.clear();
  },
};


