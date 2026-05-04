const crypto = require('crypto');
const { creditSc } = require('../services/scService');
const { recordActivity } = require('../services/activityService');
const { awardRadianceForActivity } = require('../services/activityRadianceService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { JWT_SECRET } = require('../config/auth');
const {
  NEWS_COMMENTS_PER_POST_LIMIT,
  NEWS_LIKE_LIMIT_PER_DAY,
  NEWS_COMMENT_LIMIT_PER_DAY,
  NEWS_REPOST_LIMIT_PER_DAY,
  NEWS_LIKE_REWARD,
  NEWS_COMMENT_REWARD,
  NEWS_REPOST_REWARD,
} = require('../config/constants');
const { adminAudit } = require('../middleware/adminAudit');
const { deleteNewsPostTotally } = require('../services/adminCleanupService');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
const NEWS_FEED_LIMIT = 100;
const NEWS_FEED_PAGE_DEFAULT = 5;
const NEWS_FEED_PAGE_MAX = 25;
const COMMENTS_PAGE_DEFAULT = 5;
const COMMENTS_PAGE_MAX = 50;

function normalizeLang(value) {
  const lang = String(value || 'ru').toLowerCase();
  return lang.startsWith('en') ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
  return normalizeLang(lang) === 'en' ? en : ru;
}

function generateObjectId() {
  return crypto.randomBytes(12).toString('hex');
}

function mapDocRow(row) {
  if (!row) return null;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return {
    ...data,
    _id: data._id || row.id,
    createdAt: data.createdAt || row.created_at || null,
    updatedAt: data.updatedAt || row.updated_at || null,
  };
}

async function getModelDocById(modelName, id) {
  const docId = toId(id);
  if (!modelName || !docId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', String(modelName))
    .eq('id', String(docId))
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

async function listModelDocs(modelName, { pageSize = 1000 } = {}) {
  const supabase = getSupabaseClient();
  const out = [];
  let from = 0;
  const size = Math.max(1, Math.min(2000, Number(pageSize) || 1000));
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', String(modelName))
      .range(from, from + size - 1);
    if (error || !Array.isArray(data) || data.length === 0) break;
    out.push(...data.map(mapDocRow).filter(Boolean));
    if (data.length < size) break;
    from += size;
  }
  return out;
}

async function insertModelDoc(modelName, doc) {
  const supabase = getSupabaseClient();
  const id = String(doc?._id || generateObjectId());
  const payload = { ...(doc && typeof doc === 'object' ? doc : {}) };
  payload._id = id;
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;

  const { data, error } = await supabase
    .from(DOC_TABLE)
    .insert({ model: String(modelName), id, data: payload })
    .select('id,data,created_at,updated_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapDocRow(data);
}

async function upsertModelDoc(modelName, id, doc) {
  const supabase = getSupabaseClient();
  const docId = String(id || '').trim();
  if (!docId) throw new Error('Missing id');
  const payload = { ...(doc && typeof doc === 'object' ? doc : {}) };
  payload._id = payload._id || docId;
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;

  const { data, error } = await supabase
    .from(DOC_TABLE)
    .upsert({ model: String(modelName), id: docId, data: payload }, { onConflict: 'model,id' })
    .select('id,data,created_at,updated_at')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapDocRow(data);
}

async function updateModelDoc(modelName, id, patch) {
  const existing = await getModelDocById(modelName, id);
  if (!existing) return null;
  const next = { ...existing, ...(patch && typeof patch === 'object' ? patch : {}) };
  return upsertModelDoc(modelName, existing._id, next);
}

async function updateExistingModelDoc(modelName, existing, patch) {
  if (!existing?._id) return null;
  const next = {
    ...existing,
    ...(patch && typeof patch === 'object' ? patch : {}),
  };
  return upsertModelDoc(modelName, existing._id, next);
}

async function deleteModelDoc(modelName, id) {
  const docId = toId(id);
  if (!docId) return false;
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(DOC_TABLE)
    .delete()
    .eq('model', String(modelName))
    .eq('id', String(docId));
  return !error;
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
    .select('id,data')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function hydrateCommentUsers(comments) {
  const list = Array.isArray(comments) ? comments : [];
  const ids = Array.from(new Set(list.map((c) => toId(c?.user)).filter(Boolean)));
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
    return [String(r.id), nick || ''];
  }));

  for (const c of list) {
    const uid = toId(c?.user);
    if (!uid) continue;
    c.user = { _id: uid, nickname: nickById.get(uid) || '' };
  }
  return list;
}

const NEWS_CATEGORIES_CACHE_TTL_MS = Math.max(
  1000,
  Number(process.env.NEWS_CATEGORIES_CACHE_TTL_MS) || 15 * 1000
);
const NEWS_FEED_CACHE_TTL_MS = Math.max(
  1000,
  Number(process.env.NEWS_FEED_CACHE_TTL_MS) || 5 * 1000
);
const NEWS_SCHEDULED_PUBLISH_SWEEP_INTERVAL_MS = Math.max(
  250,
  Number(process.env.NEWS_SCHEDULED_PUBLISH_SWEEP_INTERVAL_MS) || 2 * 1000
);
const NEWS_VIEW_BUCKET_LIMIT = Math.max(
  1,
  Number(process.env.NEWS_VIEW_BUCKET_LIMIT) || 500
);
const NEWS_VIEW_BATCH_KEY_TTL_MS = Math.max(
  60 * 1000,
  Number(process.env.NEWS_VIEW_BATCH_KEY_TTL_MS) || 7 * 24 * 60 * 60 * 1000
);
const NEWS_VIEW_BATCH_KEY_SECRET = String(process.env.NEWS_VIEW_BATCH_KEY_SECRET || JWT_SECRET).trim();
const NEWS_ACHIEVEMENT_DELAY_MIN_MS = Math.max(
  1000,
  Number(process.env.NEWS_ACHIEVEMENT_DELAY_MIN_MS) || 60 * 1000
);
const NEWS_ACHIEVEMENT_DELAY_MAX_MS = Math.max(
  NEWS_ACHIEVEMENT_DELAY_MIN_MS,
  Number(process.env.NEWS_ACHIEVEMENT_DELAY_MAX_MS) || 5 * 60 * 1000
);
let newsCategoriesCache = null;
let newsCategoriesCacheExpiresAt = 0;
let newsCategoriesInflight = null;
let newsFeedCache = null;
let newsFeedCacheExpiresAt = 0;
let newsFeedInflight = null;
let newsScheduledPublishSweepStartedAt = 0;
let newsScheduledPublishSweepInflight = null;
const NEWS_REPOST_CHANNELS = new Set([
  'twitter',
  'facebook',
  'vk',
  'ok',
  'telegram',
  'whatsapp',
  'wechat',
  'reddit',
  'threads',
  'mastodon',
  'bastyon',
  'line',
  'viber',
  'discord',
  'ameba',
  'bluesky',
  'gab',
  'weibo',
  'band',
  'taringa',
]);

function dateKey(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10); // YYYY-MM-DD
}

function getNewsViewDateKey(now = new Date()) {
  const d = new Date(now);
  // Сброс в 00:01 по серверному времени.
  // В интервале 00:00:00 - 00:00:59 считаем ещё «вчерашний» день.
  if (d.getHours() === 0 && d.getMinutes() === 0) {
    d.setDate(d.getDate() - 1);
  }
  return dateKey(d);
}

function buildNewsViewBucketId(userId, dateKey) {
  if (!userId || !dateKey) return '';
  return `news_view:${userId}:${dateKey}`;
}

function buildNewsDailyCounterId(userId, dateKey) {
  if (!userId || !dateKey) return '';
  return `news_daily_counter:${userId}:${dateKey}`;
}

function buildNewsCommentWindowId(userId, postId) {
  const uid = toId(userId);
  const pid = toId(postId);
  if (!uid || !pid) return '';
  return `news_comment_window:${uid}:${pid}`;
}

function buildNewsLikeInteractionId(userId, postId) {
  const uid = toId(userId);
  const pid = toId(postId);
  if (!uid || !pid) return '';
  return `news_like:${uid}:${pid}`;
}

function buildNewsRepostInteractionId(userId, postId) {
  const uid = toId(userId);
  const pid = toId(postId);
  if (!uid || !pid) return '';
  return `news_repost:${uid}:${pid}`;
}

function getNewsDailyCounterField(type) {
  if (type === 'like') return 'likes';
  if (type === 'comment') return 'comments';
  if (type === 'repost') return 'reposts';
  return '';
}

function signNewsViewBatchPayload(encodedPayload) {
  return crypto
    .createHmac('sha256', NEWS_VIEW_BATCH_KEY_SECRET)
    .update(String(encodedPayload || ''))
    .digest('hex');
}

function hasValidNewsViewBatchSignature(encodedPayload, signature) {
  const expected = Buffer.from(signNewsViewBatchPayload(encodedPayload));
  const actual = Buffer.from(String(signature || ''));
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function createNewsViewBatchKey({ userId, postIds, now = new Date() } = {}) {
  const safeUserId = toId(userId);
  const safePostIds = Array.from(new Set((Array.isArray(postIds) ? postIds : []).map(toId).filter(Boolean)));
  if (!safeUserId || !safePostIds.length) return null;

  const payload = {
    u: safeUserId,
    p: safePostIds,
    e: now.getTime() + NEWS_VIEW_BATCH_KEY_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${signNewsViewBatchPayload(encoded)}`;
}

function parseNewsViewBatchKey(viewBatchKey, userId) {
  const safeUserId = toId(userId);
  const raw = String(viewBatchKey || '').trim();
  if (!safeUserId || !raw) return null;

  const dotIndex = raw.lastIndexOf('.');
  if (dotIndex <= 0) return null;

  const encodedPayload = raw.slice(0, dotIndex);
  const signature = raw.slice(dotIndex + 1);
  if (!hasValidNewsViewBatchSignature(encodedPayload, signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    if (toId(payload.u) !== safeUserId) return null;
    if ((Number(payload.e) || 0) < Date.now()) return null;
    return Array.from(new Set((Array.isArray(payload.p) ? payload.p : []).map(toId).filter(Boolean)));
  } catch {
    return null;
  }
}

function normalizeViewBucketPostIds(postIds) {
  const out = [];
  const seen = new Set();
  const list = Array.isArray(postIds) ? postIds : [];
  for (const id of list) {
    const key = toId(id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  if (out.length <= NEWS_VIEW_BUCKET_LIMIT) return out;
  return out.slice(out.length - NEWS_VIEW_BUCKET_LIMIT);
}

function scheduleAchievementGrant({ userId, achievementId, meta = null } = {}) {
  if (!userId || !achievementId) return;
  const delayRange = Math.max(0, NEWS_ACHIEVEMENT_DELAY_MAX_MS - NEWS_ACHIEVEMENT_DELAY_MIN_MS);
  const delay = NEWS_ACHIEVEMENT_DELAY_MIN_MS + Math.floor(Math.random() * (delayRange + 1));
  setTimeout(() => {
    const { grantAchievement } = require('../services/achievementService');
    grantAchievement({ userId, achievementId, meta }).catch(() => { });
  }, delay);
}

function buildNewsUserCardFromCounter(counter, dateKey, extra = {}) {
  const dailyLikesUsed = Math.max(0, Number(counter?.likes) || 0);
  const dailyCommentsUsed = Math.max(0, Number(counter?.comments) || 0);
  const dailyRepostsUsed = Math.max(0, Number(counter?.reposts) || 0);
  const likedPostIds = Array.from(new Set((Array.isArray(extra?.likedPostIds) ? extra.likedPostIds : []).map(toId).filter(Boolean)));
  const repostedPostIds = Array.from(new Set((Array.isArray(extra?.repostedPostIds) ? extra.repostedPostIds : []).map(toId).filter(Boolean)));
  const viewedPostIds = normalizeViewBucketPostIds(extra?.viewedPostIds);
  const lastReadPostId = toId(extra?.lastReadPostId) || null;

  return {
    dateKey,
    likesPerPost: 1,
    repostsPerPost: 1,
    commentsPerPost: NEWS_COMMENTS_PER_POST_LIMIT,
    dailyLikesLimit: NEWS_LIKE_LIMIT_PER_DAY,
    dailyCommentsLimit: NEWS_COMMENT_LIMIT_PER_DAY,
    dailyRepostsLimit: NEWS_REPOST_LIMIT_PER_DAY,
    dailyLikesUsed,
    dailyCommentsUsed,
    dailyRepostsUsed,
    dailyLikesLeft: Math.max(0, NEWS_LIKE_LIMIT_PER_DAY - dailyLikesUsed),
    dailyCommentsLeft: Math.max(0, NEWS_COMMENT_LIMIT_PER_DAY - dailyCommentsUsed),
    dailyRepostsLeft: Math.max(0, NEWS_REPOST_LIMIT_PER_DAY - dailyRepostsUsed),
    likedPostIds,
    repostedPostIds,
    viewedPostIds,
    lastReadPostId,
  };
}

const COMMENT_EDIT_WINDOW_MS = 60 * 60 * 1000;
const COMMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

function mapCommentDto(comment, lang) {
  const user = comment.user || {};
  const userId = user._id ? user._id.toString() : comment.user?.toString();
  return {
    id: comment._id.toString(),
    postId: comment.post?.toString(),
    content: comment.content,
    createdAt: comment.createdAt,
    authorId: userId || null,
    authorName: user.nickname || pickLang(lang, 'Пользователь', 'User'),
  };
}

function createEmptyPostStats() {
  return { likes: 0, comments: 0, reposts: 0 };
}

function normalizePostStats(post) {
  if (!post || typeof post !== 'object') return post;
  const stats = post.stats && typeof post.stats === 'object' ? post.stats : {};
  return {
    ...post,
    stats: {
      likes: Math.max(0, Number(stats.likes) || 0),
      comments: Math.max(0, Number(stats.comments) || 0),
      reposts: Math.max(0, Number(stats.reposts) || 0),
    },
  };
}

function hasOwn(obj, key) {
  return Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);
}

function normalizeNewsPostStatus(value, fallback = 'draft') {
  const raw = String(value || '').trim();
  if (raw === 'draft' || raw === 'scheduled' || raw === 'published') return raw;
  return fallback;
}

function normalizeScheduledAtValue(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeNewsText(value, maxLen = 5000) {
  return String(value ?? '').trim().slice(0, maxLen);
}

function normalizeNewsContent(value, maxLen = 100000) {
  return String(value ?? '').slice(0, maxLen);
}

function normalizeNewsTranslations(raw, existing = null) {
  const current = existing && typeof existing === 'object' ? existing : {};
  const previousEn = current.en && typeof current.en === 'object' ? current.en : {};
  const source = raw && typeof raw === 'object' ? raw : {};
  const enSource = source.en && typeof source.en === 'object' ? source.en : {};

  const nextEn = { ...previousEn };
  if (hasOwn(enSource, 'title')) {
    nextEn.title = normalizeNewsText(enSource.title, 240);
  }
  if (hasOwn(enSource, 'content')) {
    nextEn.content = normalizeNewsContent(enSource.content);
  }

  return {
    ...current,
    en: nextEn,
  };
}

function getNewsPostSortTimestamp(post) {
  const publishedAtMs = post?.publishedAt ? new Date(post.publishedAt).getTime() : NaN;
  if (Number.isFinite(publishedAtMs)) return publishedAtMs;
  const scheduledAtMs = post?.scheduledAt ? new Date(post.scheduledAt).getTime() : NaN;
  if (Number.isFinite(scheduledAtMs)) return scheduledAtMs;
  const createdAtMs = post?.createdAt ? new Date(post.createdAt).getTime() : NaN;
  if (Number.isFinite(createdAtMs)) return createdAtMs;
  const updatedAtMs = post?.updatedAt ? new Date(post.updatedAt).getTime() : NaN;
  if (Number.isFinite(updatedAtMs)) return updatedAtMs;
  return 0;
}

function applyStatsDelta(stats, delta = {}) {
  const base = stats && typeof stats === 'object' ? stats : createEmptyPostStats();
  return {
    likes: Math.max(0, (Number(base.likes) || 0) + (Number(delta.likes) || 0)),
    comments: Math.max(0, (Number(base.comments) || 0) + (Number(delta.comments) || 0)),
    reposts: Math.max(0, (Number(base.reposts) || 0) + (Number(delta.reposts) || 0)),
  };
}

async function incrementPostStats(postId, delta, currentPost = null) {
  const post = currentPost || await getModelDocById('NewsPost', postId);
  if (!post) return null;
  const normalized = normalizePostStats(post);
  const nextStats = applyStatsDelta(normalized?.stats, delta);
  return upsertModelDoc('NewsPost', normalized._id, { ...normalized, stats: nextStats, updatedAt: new Date() });
}

function updateCachedNewsFeedPostStats(postId, delta) {
  const targetId = toId(postId);
  if (!targetId || !Array.isArray(newsFeedCache) || newsFeedCache.length === 0) return;

  newsFeedCache = newsFeedCache.map((post) => {
    if (toId(post?._id) !== targetId) return post;
    const normalized = normalizePostStats(post);
    return {
      ...normalized,
      stats: applyStatsDelta(normalized?.stats, delta),
      updatedAt: new Date(),
    };
  });
}

function queueNewsDeferredTask(task, delayMs = 0) {
  const safeDelay = Math.max(0, Number(delayMs) || 0);
  setTimeout(() => {
    Promise.resolve()
      .then(task)
      .catch(() => { });
  }, safeDelay);
}

async function updateNewsAchievementStats({ userId, type, scAwarded }) {
  const userRow = await getUserRowById(userId);
  if (!userRow) return;

  const data = getUserData(userRow);
  const stats = data.achievementStats && typeof data.achievementStats === 'object'
    ? data.achievementStats
    : {};
  const nextStats = {
    ...stats,
    totalNewsLikes: (Number(stats.totalNewsLikes) || 0) + (type === 'like' ? 1 : 0),
    totalNewsComments: (Number(stats.totalNewsComments) || 0) + (type === 'comment' ? 1 : 0),
    totalNewsReposts: (Number(stats.totalNewsReposts) || 0) + (type === 'repost' ? 1 : 0),
    totalNewsScEarned: (Number(stats.totalNewsScEarned) || 0) + (Number(scAwarded) || 0),
  };

  await updateUserDataById(userId, { achievementStats: nextStats });

  if ((Number(nextStats.totalNewsLikes) || 0) >= 500) {
    scheduleAchievementGrant({ userId, achievementId: 29 });
  }
  if ((Number(nextStats.totalNewsComments) || 0) >= 100) {
    scheduleAchievementGrant({ userId, achievementId: 30 });
  }
  if ((Number(nextStats.totalNewsScEarned) || 0) >= 1000) {
    scheduleAchievementGrant({ userId, achievementId: 94 });
  }
}

function scheduleNewsInteractionSideEffects({ userId, postId, type, scAwarded }) {
  if (!userId || !type) return;

  queueNewsDeferredTask(async () => {
    await recordActivity({ userId, type: `news_${type}`, minutes: 1, meta: { postId } });
  }, 5000);

  queueNewsDeferredTask(async () => {
    await updateNewsAchievementStats({ userId, type, scAwarded });
  }, 60000);
}

function clampCommentLimit(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return COMMENTS_PAGE_DEFAULT;
  return Math.max(1, Math.min(COMMENTS_PAGE_MAX, Math.round(raw)));
}

function clampFeedLimit(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return NEWS_FEED_PAGE_DEFAULT;
  return Math.max(1, Math.min(NEWS_FEED_PAGE_MAX, Math.round(raw)));
}

function encodeFeedCursor(post) {
  const id = toId(post?._id);
  return id || null;
}

function decodeFeedCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') return null;
  const id = toId(cursor);
  return id || null;
}

function paginateFeedPosts(posts, { limit, cursor } = {}) {
  const safeLimit = clampFeedLimit(limit);
  const cursorId = decodeFeedCursor(cursor);
  const list = Array.isArray(posts) ? posts : [];

  let startIndex = 0;
  if (cursorId) {
    const index = list.findIndex((post) => toId(post?._id) === cursorId);
    startIndex = index >= 0 ? index + 1 : 0;
  }

  const items = list.slice(startIndex, startIndex + safeLimit);
  const hasMore = startIndex + safeLimit < list.length;
  const nextCursor = hasMore && items.length ? encodeFeedCursor(items[items.length - 1]) : null;

  return {
    items,
    nextCursor,
    hasMore,
  };
}

function encodeCommentCursor(row) {
  const createdAt = row?.created_at || row?.createdAt;
  if (!createdAt || !row?.id) return null;
  const raw = `${createdAt}|${row.id}`;
  return Buffer.from(raw).toString('base64');
}

function decodeCommentCursor(cursor) {
  if (!cursor || typeof cursor !== 'string') return null;
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8');
    const [createdAt, id] = raw.split('|');
    if (!createdAt || !id) return null;
    const parsed = new Date(createdAt);
    if (Number.isNaN(parsed.getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function getCachedNewsCategories(nowMs = Date.now()) {
  if (!newsCategoriesCache || newsCategoriesCacheExpiresAt <= nowMs) {
    newsCategoriesCache = null;
    newsCategoriesCacheExpiresAt = 0;
    return null;
  }
  return newsCategoriesCache;
}

function setCachedNewsCategories(categories, nowMs = Date.now()) {
  newsCategoriesCache = Array.isArray(categories) ? categories : [];
  newsCategoriesCacheExpiresAt = nowMs + NEWS_CATEGORIES_CACHE_TTL_MS;
  return newsCategoriesCache;
}

function invalidateNewsCategoriesRuntimeState() {
  newsCategoriesCache = null;
  newsCategoriesCacheExpiresAt = 0;
  newsCategoriesInflight = null;
}

function getCachedNewsFeed(nowMs = Date.now()) {
  if (!newsFeedCache || newsFeedCacheExpiresAt <= nowMs) {
    newsFeedCache = null;
    newsFeedCacheExpiresAt = 0;
    return null;
  }
  return newsFeedCache;
}

function setCachedNewsFeed(posts, nowMs = Date.now()) {
  newsFeedCache = Array.isArray(posts) ? posts : [];
  newsFeedCacheExpiresAt = nowMs + NEWS_FEED_CACHE_TTL_MS;
  return newsFeedCache;
}

function invalidateNewsFeedRuntimeState({ resetSweep = false } = {}) {
  newsFeedCache = null;
  newsFeedCacheExpiresAt = 0;
  newsFeedInflight = null;
  if (resetSweep) {
    newsScheduledPublishSweepStartedAt = 0;
    newsScheduledPublishSweepInflight = null;
  }
}

function resetNewsControllerRuntimeState() {
  invalidateNewsCategoriesRuntimeState();
  invalidateNewsFeedRuntimeState({ resetSweep: true });
}

async function listNewsPosts({ status = 'published', limit = NEWS_FEED_LIMIT } = {}) {
  const all = await listModelDocs('NewsPost', { pageSize: 1000 });
  const safeStatus = String(status || 'published');
  const filtered = (Array.isArray(all) ? all : [])
    .filter(Boolean)
    .filter((post) => safeStatus === 'all' || String(post?.status || '') === safeStatus)
    .map(normalizePostStats)
    .sort((left, right) => {
      const timeDiff = getNewsPostSortTimestamp(right) - getNewsPostSortTimestamp(left);
      if (timeDiff !== 0) return timeDiff;
      return String(right?._id || '').localeCompare(String(left?._id || ''));
    });

  const safeLimit = Number(limit);
  if (!Number.isFinite(safeLimit) || safeLimit <= 0) {
    return filtered;
  }
  return filtered.slice(0, Math.max(1, Math.floor(safeLimit)));
}

async function findPublishedPostsByIds(postIds = []) {
  const ids = Array.from(new Set((Array.isArray(postIds) ? postIds : []).map(toId).filter(Boolean)));
  if (!ids.length) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', 'NewsPost')
    .in('id', ids)
    .eq('data->>status', 'published');
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data : []).map(mapDocRow).filter(Boolean).map(normalizePostStats);
}

async function buildNewsDailyCounterFromInteractions({ userId, dateKey, now = new Date() }) {
  if (!userId || !dateKey) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', 'NewsInteraction')
    .eq('data->>user', String(userId))
    .eq('data->>dateKey', String(dateKey));
  if (error) throw new Error(error.message);

  const counts = {
    likes: 0,
    comments: 0,
    reposts: 0,
  };

  (Array.isArray(data) ? data : [])
    .map(mapDocRow)
    .filter(Boolean)
    .forEach((interaction) => {
      const field = getNewsDailyCounterField(String(interaction?.type || ''));
      if (!field) return;
      counts[field] += 1;
    });

  return {
    _id: buildNewsDailyCounterId(toId(userId), dateKey),
    user: toId(userId),
    dateKey,
    likes: counts.likes,
    comments: counts.comments,
    reposts: counts.reposts,
    createdAt: now,
    updatedAt: now,
  };
}

async function ensureNewsDailyCounter({ userId, dateKey, now = new Date() }) {
  const counterId = buildNewsDailyCounterId(toId(userId), dateKey);
  if (!counterId) return null;

  const existing = await getModelDocById('NewsDailyCounter', counterId);
  if (existing) {
    return {
      ...existing,
      likes: Math.max(0, Number(existing.likes) || 0),
      comments: Math.max(0, Number(existing.comments) || 0),
      reposts: Math.max(0, Number(existing.reposts) || 0),
    };
  }

  return upsertModelDoc('NewsDailyCounter', counterId, {
    _id: counterId,
    user: toId(userId),
    dateKey,
    likes: 0,
    comments: 0,
    reposts: 0,
    createdAt: now,
    updatedAt: now,
  });
}

function getNewsDailyCounterValue(counter, type) {
  const field = getNewsDailyCounterField(type);
  if (!field) return 0;
  return Math.max(0, Number(counter?.[field]) || 0);
}

async function adjustNewsDailyCounter({ userId, type, dateKey, delta = 0, now = new Date() }) {
  const field = getNewsDailyCounterField(type);
  if (!field || !userId || !dateKey || !delta) return null;

  const counter = await ensureNewsDailyCounter({ userId, dateKey, now });
  if (!counter?._id) return null;
  const nextValue = Math.max(0, (Number(counter[field]) || 0) + Number(delta || 0));
  return updateExistingModelDoc('NewsDailyCounter', counter, {
    [field]: nextValue,
    updatedAt: now,
  });
}

async function getNewsInteractionMarksForUser({ userId, now = new Date() }) {
  const safeUserId = toId(userId);
  if (!safeUserId) {
    return {
      likedPostIds: [],
      repostedPostIds: [],
    };
  }

  const supabase = getSupabaseClient();
  const repostWindowStartedAt = new Date(now.getTime() - (24 * 60 * 60 * 1000)).toISOString();
  const [likesRes, repostsRes] = await Promise.all([
    supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', 'NewsInteraction')
      .eq('data->>user', safeUserId)
      .eq('data->>type', 'like')
      .range(0, NEWS_VIEW_BUCKET_LIMIT - 1),
    supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', 'NewsInteraction')
      .eq('data->>user', safeUserId)
      .eq('data->>type', 'repost')
      .gte('created_at', repostWindowStartedAt)
      .range(0, NEWS_VIEW_BUCKET_LIMIT - 1),
  ]);

  const likedPostIds = (Array.isArray(likesRes?.data) ? likesRes.data : [])
    .map(mapDocRow)
    .filter((interaction) => interaction && interaction.active !== false)
    .map((interaction) => toId(interaction?.post))
    .filter(Boolean);

  const repostedPostIds = (Array.isArray(repostsRes?.data) ? repostsRes.data : [])
    .map(mapDocRow)
    .filter(Boolean)
    .map((interaction) => toId(interaction?.post))
    .filter(Boolean);

  return {
    likedPostIds,
    repostedPostIds,
  };
}

async function getNewsUserCard({ userId, now = new Date() }) {
  const dateKey = getNewsViewDateKey(now);
  if (!userId) {
    return buildNewsUserCardFromCounter(null, dateKey);
  }

  const counterId = buildNewsDailyCounterId(toId(userId), dateKey);
  const [counter, viewBucket, marks] = await Promise.all([
    counterId ? getModelDocById('NewsDailyCounter', counterId) : Promise.resolve(null),
    getNewsViewBucketForUser(userId, dateKey),
    getNewsInteractionMarksForUser({ userId, now }),
  ]);
  return buildNewsUserCardFromCounter(counter, dateKey, {
    likedPostIds: marks?.likedPostIds,
    repostedPostIds: marks?.repostedPostIds,
    viewedPostIds: viewBucket?.postIds,
    lastReadPostId: viewBucket?.lastReadPostId,
  });
}

async function getCommentWindowForUser(userId, postId) {
  if (!userId || !postId) return null;
  const directId = buildNewsCommentWindowId(userId, postId);
  if (!directId) return null;
  return getModelDocById('NewsCommentWindow', directId);
}

async function getNewsViewBucketForUser(userId, dateKey) {
  const bucketId = buildNewsViewBucketId(toId(userId), dateKey);
  if (!bucketId) return null;
  return getModelDocById('NewsViewBucket', bucketId);
}

async function loadNewsCategories(nowMs = Date.now()) {
  const cached = getCachedNewsCategories(nowMs);
  if (cached) return cached;
  if (newsCategoriesInflight) return newsCategoriesInflight;

  const promise = listModelDocs('NewsCategory', { pageSize: 2000 })
    .then((categories) => {
      const sorted = (Array.isArray(categories) ? categories : [])
        .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
      return setCachedNewsCategories(sorted || [], nowMs);
    })
    .finally(() => {
      if (newsCategoriesInflight === promise) {
        newsCategoriesInflight = null;
      }
    });

  newsCategoriesInflight = promise;
  return promise;
}

async function maybePublishScheduledPosts(now = new Date()) {
  const nowMs = now.getTime();
  if (newsScheduledPublishSweepInflight) return newsScheduledPublishSweepInflight;
  if (
    newsScheduledPublishSweepStartedAt > 0
    && (nowMs - newsScheduledPublishSweepStartedAt) < NEWS_SCHEDULED_PUBLISH_SWEEP_INTERVAL_MS
  ) {
    return null;
  }

  newsScheduledPublishSweepStartedAt = nowMs;
  const promise = (async () => {
    const due = (await listNewsPosts({ status: 'scheduled' }))
      .filter(Boolean)
      .filter((post) => {
        if (!post?.scheduledAt) return false;
        const at = new Date(post.scheduledAt);
        return !Number.isNaN(at.getTime()) && at.getTime() <= now.getTime();
      });
    let modifiedCount = 0;
    for (const post of due) {
      // eslint-disable-next-line no-await-in-loop
      const saved = await updateModelDoc('NewsPost', post._id, { status: 'published', publishedAt: now, updatedAt: now });
      if (saved) modifiedCount += 1;
    }
    if (modifiedCount > 0) invalidateNewsFeedRuntimeState();
    return { modifiedCount };
  })()
    .catch((error) => {
      newsScheduledPublishSweepStartedAt = 0;
      throw error;
    })
    .finally(() => {
      if (newsScheduledPublishSweepInflight === promise) {
        newsScheduledPublishSweepInflight = null;
      }
    });

  newsScheduledPublishSweepInflight = promise;
  return promise;
}

async function loadPostsWithStats(query) {
  const statusFilter = query && typeof query === 'object' && query.status ? String(query.status) : 'all';
  return listNewsPosts({ status: statusFilter });
}

async function loadPublishedPosts(now = new Date()) {
  const cached = getCachedNewsFeed(Date.now());
  if (cached) return cached;
  if (newsFeedInflight) return newsFeedInflight;

  const promise = loadPostsWithStats({ status: 'published' })
    .then((posts) => setCachedNewsFeed(posts, Date.now()))
    .finally(() => {
      if (newsFeedInflight === promise) {
        newsFeedInflight = null;
      }
    });

  newsFeedInflight = promise;
  return promise;
}

async function createCategory(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const { name, slug } = req.body || {};
    if (!name || !slug) return res.status(400).json({ message: pickLang(userLang, 'name и slug обязательны', 'name and slug are required') });
    const all = await listModelDocs('NewsCategory', { pageSize: 2000 });
    const exists = (Array.isArray(all) ? all : []).some((row) => String(row?.name || '') === String(name) || String(row?.slug || '') === String(slug));
    if (exists) return res.status(400).json({ message: pickLang(userLang, 'Такая категория уже есть', 'This category already exists') });
    const now = new Date();
    const category = await insertModelDoc('NewsCategory', { name, slug, createdAt: now, updatedAt: now });
    invalidateNewsCategoriesRuntimeState();
    adminAudit('news.category.create', req, { categoryId: category._id, name, slug });
    return res.status(201).json(category);
  } catch (err) {
    return next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const { id } = req.params;
    const category = await updateModelDoc('NewsCategory', id, { ...(req.body || {}), updatedAt: new Date() });
    if (!category) return res.status(404).json({ message: pickLang(userLang, 'Категория не найдена', 'Category not found') });
    invalidateNewsCategoriesRuntimeState();
    adminAudit('news.category.update', req, { categoryId: id, updates: Object.keys(req.body) });
    return res.json(category);
  } catch (err) {
    return next(err);
  }
}

async function deleteCategory(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const { id } = req.params;
    await deleteModelDoc('NewsCategory', id);
    invalidateNewsCategoriesRuntimeState();
    adminAudit('news.category.delete', req, { categoryId: id });
    return res.json({ message: pickLang(userLang, 'Категория удалена', 'Category deleted') });
  } catch (err) {
    return next(err);
  }
}

async function listCategories(_req, res, next) {
  try {
    const categories = await loadNewsCategories();
    return res.json(categories);
  } catch (err) {
    return next(err);
  }
}

async function createPost(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const title = normalizeNewsText(body.title, 240);
    const content = normalizeNewsContent(body.content);
    const mediaUrl = normalizeNewsText(body.mediaUrl, 2000);
    const categoryId = body.categoryId;
    const status = body.status || 'draft';
    const scheduledAt = body.scheduledAt;
    const translations = normalizeNewsTranslations(body.translations);
    if (!title || !content) return res.status(400).json({ message: pickLang(userLang, 'title и content обязательны', 'title and content are required') });
    const now = new Date();
    const normalizedStatus = normalizeNewsPostStatus(status, 'draft');
    const normalizedScheduledAt = normalizeScheduledAtValue(scheduledAt);
    if (normalizedStatus === 'scheduled' && !normalizedScheduledAt) {
      return res.status(400).json({ message: pickLang(userLang, 'Укажите корректные дату и время публикации', 'Specify a valid publication date and time') });
    }
    const shouldPublishNow = normalizedStatus === 'published'
      || (normalizedStatus === 'scheduled' && normalizedScheduledAt && new Date(normalizedScheduledAt).getTime() <= now.getTime());
    const finalStatus = shouldPublishNow ? 'published' : normalizedStatus;
    const post = await insertModelDoc('NewsPost', {
      title,
      content,
      mediaUrl,
      category: categoryId,
      translations,
      status: finalStatus,
      scheduledAt: finalStatus === 'scheduled' ? normalizedScheduledAt : null,
      stats: createEmptyPostStats(),
      publishedAt: finalStatus === 'published' ? now : null,
      createdAt: now,
      updatedAt: now,
    });
    invalidateNewsFeedRuntimeState();
    adminAudit('news.post.create', req, { postId: post._id, status: finalStatus, scheduledAt: normalizedScheduledAt, categoryId });
    return res.status(201).json(post);
  } catch (err) {
    return next(err);
  }
}

async function updatePost(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const { id } = req.params;
    const existing = await getModelDocById('NewsPost', id);
    if (!existing) return res.status(404).json({ message: pickLang(userLang, 'Пост не найден', 'Post not found') });

    const now = new Date();
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const patch = { ...body, updatedAt: now };
    delete patch.translations;
    const statusProvided = hasOwn(body, 'status');
    const scheduledAtProvided = hasOwn(body, 'scheduledAt');
    const nextStatus = statusProvided
      ? normalizeNewsPostStatus(body.status, String(existing?.status || 'draft'))
      : String(existing?.status || 'draft');
    const nextScheduledAt = scheduledAtProvided
      ? normalizeScheduledAtValue(body.scheduledAt)
      : normalizeScheduledAtValue(existing?.scheduledAt);

    if ((statusProvided || scheduledAtProvided) && nextStatus === 'scheduled' && !nextScheduledAt) {
      return res.status(400).json({ message: pickLang(userLang, 'Укажите корректные дату и время публикации', 'Specify a valid publication date and time') });
    }

    if (statusProvided || scheduledAtProvided) {
      const shouldPublishNow = nextStatus === 'published'
        || (nextStatus === 'scheduled' && nextScheduledAt && new Date(nextScheduledAt).getTime() <= now.getTime());
      const finalStatus = shouldPublishNow ? 'published' : nextStatus;
      patch.status = finalStatus;
      patch.scheduledAt = finalStatus === 'scheduled' ? nextScheduledAt : null;
      if (finalStatus === 'published') {
        patch.publishedAt = statusProvided ? now : (existing?.publishedAt || now);
      } else if (statusProvided) {
        patch.publishedAt = null;
      }
    }

    if (hasOwn(body, 'title')) {
      patch.title = normalizeNewsText(body.title, 240);
    }
    if (hasOwn(body, 'content')) {
      patch.content = normalizeNewsContent(body.content);
    }
    if (hasOwn(body, 'mediaUrl')) {
      patch.mediaUrl = normalizeNewsText(body.mediaUrl, 2000);
    }
    if (hasOwn(body, 'translations')) {
      patch.translations = normalizeNewsTranslations(body.translations, existing?.translations);
    }

    const post = await updateModelDoc('NewsPost', id, patch);
    if (!post) return res.status(404).json({ message: pickLang(userLang, 'Пост не найден', 'Post not found') });
    invalidateNewsFeedRuntimeState();
    adminAudit('news.post.update', req, { postId: id, updates: Object.keys(req.body) });
    return res.json(post);
  } catch (err) {
    return next(err);
  }
}

async function deletePost(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const { id } = req.params;
    await deleteNewsPostTotally(id);
    invalidateNewsFeedRuntimeState();
    adminAudit('news.post.delete', req, { postId: id });
    return res.json({ message: pickLang(userLang, 'Пост удален', 'Post deleted') });
  } catch (err) {
    return next(err);
  }
}

async function publishPost(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const { id } = req.params;
    const post = await getModelDocById('NewsPost', id);
    if (!post) return res.status(404).json({ message: pickLang(userLang, 'Пост не найден', 'Post not found') });
    const now = new Date();
    const saved = await updateModelDoc('NewsPost', id, { status: 'published', scheduledAt: null, publishedAt: now, updatedAt: now });
    invalidateNewsFeedRuntimeState();
    adminAudit('news.post.publish', req, { postId: id });
    return res.json(saved || { ...post, status: 'published', scheduledAt: null, publishedAt: now, updatedAt: now });
  } catch (err) {
    return next(err);
  }
}

async function listPosts(req, res, next) {
  try {
    const now = new Date();
    const status = String(req.query.status || 'published');
    const posts = status === 'all'
      ? (await maybePublishScheduledPosts(now), await listNewsPosts({ status: 'all' }))
      : await loadPublishedPosts(now);

    const feedPage = paginateFeedPosts(posts, {
      limit: req.query?.limit,
      cursor: req.query?.cursor,
    });

    if (!feedPage.items.length) {
      return res.json({ items: [], nextCursor: null, hasMore: false });
    }

    const userId = req.user?._id;
    const out = feedPage.items.map((post) => {
      const normalized = normalizePostStats(post);
      return {
        ...normalized,
        stats: normalized?.stats || createEmptyPostStats(),
      };
    });
    const viewBatchKey = userId && status === 'published'
      ? createNewsViewBatchKey({
        userId,
        postIds: feedPage.items.map((post) => post?._id),
        now,
      })
      : null;

    return res.json({
      items: out,
      nextCursor: feedPage.nextCursor,
      hasMore: feedPage.hasMore,
      viewBatchKey,
    });
  } catch (err) {
    return next(err);
  }
}

async function listComments(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.query?.language || 'ru');
    const { id: postId } = req.params;
    const post = await getModelDocById('NewsPost', postId);
    if (!post || String(post?.status || '') !== 'published') {
      return res.status(404).json({ message: pickLang(userLang, 'Пост не найден или не опубликован', 'Post not found or not published') });
    }
    const limit = clampCommentLimit(req.query?.limit);
    const cursor = decodeCommentCursor(req.query?.cursor);
    const supabase = getSupabaseClient();
    let query = supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', 'NewsInteraction')
      .eq('data->>type', 'comment')
      .eq('data->>post', String(postId));

    if (cursor) {
      query = query.or(
        `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
      );
    }

    query = query.order('created_at', { ascending: false }).order('id', { ascending: false });

    const { data, error } = await query.range(0, limit);
    if (error) {
      throw new Error(error.message);
    }

    const rows = Array.isArray(data) ? data : [];
    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? encodeCommentCursor(pageRows[pageRows.length - 1]) : null;

    const comments = pageRows.map(mapDocRow).filter(Boolean);
    await hydrateCommentUsers(comments);

    return res.json({
      comments: comments.map((comment) => mapCommentDto(comment, userLang)),
      nextCursor,
      hasMore,
    });
  } catch (err) {
    return next(err);
  }
}

async function updateComment(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: pickLang(userLang, 'Требуется авторизация', 'Authorization required') });

    const { postId, commentId } = req.params;
    const { content } = req.body || {};
    if (!content || !content.trim()) {
      return res.status(400).json({ message: pickLang(userLang, 'Текст комментария обязателен', 'Comment text is required') });
    }

    const comment = await getModelDocById('NewsInteraction', commentId);
    if (!comment || String(comment?.type || '') !== 'comment' || toId(comment?.post) !== toId(postId)) {
      return res.status(404).json({ message: pickLang(userLang, 'Комментарий не найден', 'Comment not found') });
    }

    if (toId(comment?.user) !== toId(userId)) {
      return res.status(403).json({ message: pickLang(userLang, 'Можно редактировать только свой комментарий', 'You can only edit your own comment') });
    }

    const now = Date.now();
    if (now - new Date(comment.createdAt).getTime() > COMMENT_EDIT_WINDOW_MS) {
      return res.status(400).json({ message: pickLang(userLang, 'Время редактирования истекло', 'Edit time has expired') });
    }

    const saved = await updateModelDoc('NewsInteraction', commentId, { content: content.trim(), updatedAt: new Date() });

    const commentObj = saved || { ...comment, content: content.trim(), updatedAt: new Date() };
    await hydrateCommentUsers([commentObj]);
    return res.json({ comment: mapCommentDto(commentObj, userLang) });
  } catch (err) {
    return next(err);
  }
}

async function deleteComment(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const { postId, commentId } = req.params;
    const comment = await getModelDocById('NewsInteraction', commentId);
    if (!comment || String(comment?.type || '') !== 'comment' || toId(comment?.post) !== toId(postId)) {
      return res.status(404).json({ message: pickLang(userLang, 'Комментарий не найден', 'Comment not found') });
    }

    await deleteModelDoc('NewsInteraction', commentId);
    await incrementPostStats(postId, { comments: -1 });
    updateCachedNewsFeedPostStats(postId, { comments: -1 });
    adminAudit('news.comment.delete', req, { postId, commentId });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
}

async function saveViewsForUser({ userId, postIds, lastReadPostId = null, now = new Date(), allowedPostIds = null }) {
  const uniqueIds = Array.from(new Set((Array.isArray(postIds) ? postIds : []).map(toId).filter(Boolean)));
  const safeIds = uniqueIds.slice(0, NEWS_VIEW_BUCKET_LIMIT);
  const safeLastReadPostId = toId(lastReadPostId);
  if (!userId || (!safeIds.length && !safeLastReadPostId)) return { saved: 0, alreadyViewed: 0 };

  const today = getNewsViewDateKey(now);
  const requestedIds = Array.from(new Set([...safeIds, safeLastReadPostId].filter(Boolean)));
  let publishedIds = [];
  let validatedLastReadPostId = null;
  const allowedIds = Array.isArray(allowedPostIds)
    ? Array.from(new Set(allowedPostIds.map(toId).filter(Boolean)))
    : [];
  if (allowedIds.length) {
    const allowedSet = new Set(allowedIds);
    publishedIds = safeIds.filter((postId) => allowedSet.has(postId));
    if (safeLastReadPostId && allowedSet.has(safeLastReadPostId)) {
      validatedLastReadPostId = safeLastReadPostId;
    }
  } else {
    const published = await findPublishedPostsByIds(requestedIds);
    const publishedSet = new Set(published.map((post) => toId(post?._id)).filter(Boolean));
    publishedIds = safeIds.filter((postId) => publishedSet.has(postId));
    if (safeLastReadPostId && publishedSet.has(safeLastReadPostId)) {
      validatedLastReadPostId = safeLastReadPostId;
    }
  }
  if (!publishedIds.length && !validatedLastReadPostId) return { saved: 0, alreadyViewed: 0 };

  const bucket = await getNewsViewBucketForUser(userId, today);
  const existingIds = normalizeViewBucketPostIds(bucket?.postIds);
  const viewedSet = new Set(existingIds.map((pid) => String(pid)));
  const previousLastReadPostId = toId(bucket?.lastReadPostId) || null;

  const toAdd = publishedIds.filter((pid) => !viewedSet.has(String(pid)));
  const nextLastReadPostId = validatedLastReadPostId || previousLastReadPostId;
  if (!toAdd.length && nextLastReadPostId === previousLastReadPostId) {
    return { saved: 0, alreadyViewed: publishedIds.length, lastReadPostId: nextLastReadPostId };
  }

  const nextIds = normalizeViewBucketPostIds([...existingIds, ...toAdd]);
  const bucketId = buildNewsViewBucketId(toId(userId), today);
  await upsertModelDoc('NewsViewBucket', bucketId, {
    user: toId(userId),
    dateKey: today,
    postIds: nextIds,
    lastReadPostId: nextLastReadPostId,
    updatedAt: new Date(),
  });

  return {
    saved: toAdd.length,
    alreadyViewed: publishedIds.length - toAdd.length,
    lastReadPostId: nextLastReadPostId,
  };
}

async function recordViews(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: pickLang(userLang, 'Требуется авторизация', 'Authorization required') });

    const postIds = Array.isArray(req.body?.postIds) ? req.body.postIds : [];
    const lastReadPostId = req.body?.lastReadPostId;
    const viewBatchKey = typeof req.body?.viewBatchKey === 'string' ? req.body.viewBatchKey : '';
    let allowedPostIds = null;
    if (viewBatchKey) {
      allowedPostIds = parseNewsViewBatchKey(viewBatchKey, userId);
      if (!allowedPostIds) {
        return res.status(400).json({ message: pickLang(userLang, 'Неверная метка просмотра', 'Invalid view token') });
      }
    }

    const result = await saveViewsForUser({ userId, postIds, lastReadPostId, allowedPostIds });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function interact(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: pickLang(userLang, 'Требуется авторизация', 'Authorization required') });

    const { id: postId } = req.params;
    const { type, content } = req.body || {};
    if (!['like', 'comment', 'repost', 'view'].includes(type)) {
      return res.status(400).json({ message: pickLang(userLang, 'Некорректный тип действия', 'Invalid interaction type') });
    }

    const post = await getModelDocById('NewsPost', postId);
    if (!post || String(post?.status || '') !== 'published') {
      return res.status(404).json({ message: pickLang(userLang, 'Пост не найден или не опубликован', 'Post not found or not published') });
    }

    const now = new Date();
    const today = getNewsViewDateKey(now);

    if (type === 'view') {
      const result = await saveViewsForUser({ userId, postIds: [postId], lastReadPostId: postId, now });
      if (result.saved === 0 && result.alreadyViewed > 0) {
        return res.json({ ok: true, alreadyViewed: true });
      }
      return res.json({ ok: true, saved: result.saved });
    }

    if (type === 'like') {
      const likeInteractionId = buildNewsLikeInteractionId(userId, postId);
      const existing = likeInteractionId ? await getModelDocById('NewsInteraction', likeInteractionId) : null;
      if (existing && existing.active !== false) {
        await updateExistingModelDoc('NewsInteraction', existing, { active: false, updatedAt: now });
        await incrementPostStats(postId, { likes: -1 }, post);
        updateCachedNewsFeedPostStats(postId, { likes: -1 });
        return res.json({ ok: true, liked: false, removed: true, awarded: 0 });
      }

      if (existing && existing.active === false) {
        await updateExistingModelDoc('NewsInteraction', existing, { active: true, updatedAt: now });
        await incrementPostStats(postId, { likes: 1 }, post);
        updateCachedNewsFeedPostStats(postId, { likes: 1 });
        return res.json({ ok: true, liked: true, reactivated: true, awarded: 0 });
      }

      const dailyCounter = await ensureNewsDailyCounter({ userId, dateKey: today, now });
      const likesToday = getNewsDailyCounterValue(dailyCounter, 'like');
      if (likesToday >= NEWS_LIKE_LIMIT_PER_DAY) {
        return res.status(400).json({ message: pickLang(userLang, 'Дневной лимит лайков исчерпан', 'Daily like limit reached') });
      }

      const interaction = await upsertModelDoc('NewsInteraction', likeInteractionId, {
        _id: likeInteractionId,
        user: userId,
        post: postId,
        type,
        active: true,
        dateKey: today,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      });
      let dailyCounterApplied = false;
      let postStatsApplied = false;
      try {
        await Promise.all([
          adjustNewsDailyCounter({ userId, type: 'like', dateKey: today, delta: 1, now }).then(() => {
            dailyCounterApplied = true;
          }),
          incrementPostStats(postId, { likes: 1 }, post).then(() => {
            postStatsApplied = true;
          }),
        ]);
        updateCachedNewsFeedPostStats(postId, { likes: 1 });
        const user = await creditSc({ userId, amount: NEWS_LIKE_REWARD, type: 'news', description: pickLang(userLang, 'Лайк новости', 'News like'), relatedEntity: postId });
        awardRadianceForActivity({
          userId,
          amount: 2,
          activityType: 'news_like',
          meta: { postId, interactionId: interaction._id },
          dedupeKey: `news_like:${postId}:${userId}`,
        }).catch(() => { });
        scheduleNewsInteractionSideEffects({
          userId,
          postId,
          type: 'like',
          scAwarded: NEWS_LIKE_REWARD,
        });
        return res.json({ ok: true, liked: true, awarded: NEWS_LIKE_REWARD, sc: user.sc });
      } catch (err) {
        if (dailyCounterApplied) {
          await adjustNewsDailyCounter({ userId, type: 'like', dateKey: today, delta: -1, now: new Date() }).catch(() => { });
        }
        if (postStatsApplied) {
          await incrementPostStats(postId, { likes: -1 }).catch(() => { });
          updateCachedNewsFeedPostStats(postId, { likes: -1 });
        }
        await deleteModelDoc('NewsInteraction', interaction?._id);
        throw err;
      }
    }

    if (type === 'comment') {
      if (!content || !content.trim()) return res.status(400).json({ message: pickLang(userLang, 'Текст комментария обязателен', 'Comment text is required') });
      const trimmedContent = content.trim();
      let window = await getCommentWindowForUser(userId, postId);

      const windowExpired = !window?.windowStart
        || (now.getTime() - new Date(window.windowStart).getTime() >= COMMENT_WINDOW_MS);
      const currentWindowCount = windowExpired ? 0 : (Number(window?.count) || 0);
      if (currentWindowCount >= NEWS_COMMENTS_PER_POST_LIMIT) {
        return res.status(400).json({ message: pickLang(userLang, 'Лимит: 3 комментария за 24 часа к этому посту', 'Limit: 3 comments per 24 hours for this post') });
      }

      const dailyCounter = await ensureNewsDailyCounter({ userId, dateKey: today, now });
      const commentsToday = getNewsDailyCounterValue(dailyCounter, 'comment');
      if (commentsToday >= NEWS_COMMENT_LIMIT_PER_DAY) {
        return res.status(400).json({ message: pickLang(userLang, 'Дневной лимит комментариев исчерпан', 'Daily comment limit reached') });
      }

      const windowId = buildNewsCommentWindowId(userId, postId);
      const nextWindow = {
        _id: windowId,
        user: userId,
        post: postId,
        windowStart: windowExpired ? now : (window?.windowStart || now),
        count: currentWindowCount + 1,
        createdAt: window?.createdAt || now,
        updatedAt: now,
      };
      const interaction = await insertModelDoc('NewsInteraction', {
        user: userId,
        post: postId,
        type,
        content: trimmedContent,
        dateKey: today,
        createdAt: now,
        updatedAt: now,
      });
      let dailyCounterApplied = false;
      let windowCountApplied = false;
      let postStatsApplied = false;
      try {
        await Promise.all([
          adjustNewsDailyCounter({ userId, type: 'comment', dateKey: today, delta: 1, now }).then(() => {
            dailyCounterApplied = true;
          }),
          upsertModelDoc('NewsCommentWindow', windowId, nextWindow).then(() => {
            windowCountApplied = true;
          }),
          incrementPostStats(postId, { comments: 1 }, post).then(() => {
            postStatsApplied = true;
          }),
        ]);
        updateCachedNewsFeedPostStats(postId, { comments: 1 });
        const user = await creditSc({ userId, amount: NEWS_COMMENT_REWARD, type: 'news', description: pickLang(userLang, 'Комментарий к новости', 'News comment'), relatedEntity: postId });
        awardRadianceForActivity({
          userId,
          amount: 3,
          activityType: 'news_comment',
          meta: { postId, interactionId: interaction._id },
          dedupeKey: `news_comment:${interaction._id}:${userId}`,
        }).catch(() => { });
        scheduleNewsInteractionSideEffects({
          userId,
          postId,
          type: 'comment',
          scAwarded: NEWS_COMMENT_REWARD,
        });
        return res.json({
          ok: true,
          awarded: NEWS_COMMENT_REWARD,
          sc: user.sc,
          comment: {
            id: String(interaction._id),
            postId: String(postId),
            content: String(interaction.content || trimmedContent),
            createdAt: interaction.createdAt || now.toISOString(),
            authorId: String(userId),
            authorName: String(req.user?.nickname || pickLang(userLang, 'Пользователь', 'User')),
          },
        });
      } catch (err) {
        if (dailyCounterApplied) {
          await adjustNewsDailyCounter({ userId, type: 'comment', dateKey: today, delta: -1, now: new Date() }).catch(() => { });
        }
        if (windowCountApplied) {
          if (currentWindowCount <= 0) {
            await deleteModelDoc('NewsCommentWindow', windowId).catch(() => { });
          } else {
            await upsertModelDoc('NewsCommentWindow', windowId, {
              _id: windowId,
              user: userId,
              post: postId,
              windowStart: windowExpired ? now : (window?.windowStart || now),
              count: currentWindowCount,
              createdAt: window?.createdAt || now,
              updatedAt: new Date(),
            }).catch(() => { });
          }
        }
        if (postStatsApplied) {
          await incrementPostStats(postId, { comments: -1 }).catch(() => { });
          updateCachedNewsFeedPostStats(postId, { comments: -1 });
        }
        await deleteModelDoc('NewsInteraction', interaction?._id);
        throw err;
      }
    }

    if (type === 'repost') {
      const channel = String(req.body?.channel || '').trim().toLowerCase();
      if (!NEWS_REPOST_CHANNELS.has(channel)) {
        return res.status(400).json({ message: pickLang(userLang, 'Не выбрана сеть для репоста', 'No repost network selected') });
      }
      const repostInteractionId = buildNewsRepostInteractionId(userId, postId);
      const existing = repostInteractionId ? await getModelDocById('NewsInteraction', repostInteractionId) : null;
      const lastRepostedAt = existing?.lastRepostedAt || existing?.updatedAt || existing?.createdAt || null;
      if (lastRepostedAt && (now.getTime() - new Date(lastRepostedAt).getTime() < (24 * 60 * 60 * 1000))) {
        return res.status(400).json({ message: pickLang(userLang, 'Уже репостили этот пост', 'Already reposted this post') });
      }
      const dailyCounter = await ensureNewsDailyCounter({ userId, dateKey: today, now });
      const repostsToday = getNewsDailyCounterValue(dailyCounter, 'repost');
      if (repostsToday >= NEWS_REPOST_LIMIT_PER_DAY) {
        return res.status(400).json({ message: pickLang(userLang, 'Дневной лимит репостов исчерпан', 'Daily repost limit reached') });
      }

      const interaction = await upsertModelDoc('NewsInteraction', repostInteractionId, {
        _id: repostInteractionId,
        user: userId,
        post: postId,
        type,
        channel,
        dateKey: today,
        lastRepostedAt: now,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      });
      let dailyCounterApplied = false;
      let postStatsApplied = false;
      try {
        await Promise.all([
          adjustNewsDailyCounter({ userId, type: 'repost', dateKey: today, delta: 1, now }).then(() => {
            dailyCounterApplied = true;
          }),
          incrementPostStats(postId, { reposts: 1 }, post).then(() => {
            postStatsApplied = true;
          }),
        ]);
        updateCachedNewsFeedPostStats(postId, { reposts: 1 });
        const user = await creditSc({ userId, amount: NEWS_REPOST_REWARD, type: 'news', description: pickLang(userLang, 'Репост новости', 'News repost'), relatedEntity: postId });
        awardRadianceForActivity({
          userId,
          amount: 3,
          activityType: 'news_repost',
          meta: { postId, interactionId: interaction._id, channel },
          dedupeKey: `news_repost:${postId}:${userId}`,
        }).catch(() => { });
        scheduleNewsInteractionSideEffects({
          userId,
          postId,
          type: 'repost',
          scAwarded: NEWS_REPOST_REWARD,
        });
        return res.json({ ok: true, awarded: NEWS_REPOST_REWARD, sc: user.sc, isReposted: true });
      } catch (err) {
        if (dailyCounterApplied) {
          await adjustNewsDailyCounter({ userId, type: 'repost', dateKey: today, delta: -1, now: new Date() }).catch(() => { });
        }
        if (postStatsApplied) {
          await incrementPostStats(postId, { reposts: -1 }).catch(() => { });
          updateCachedNewsFeedPostStats(postId, { reposts: -1 });
        }
        if (existing?._id) {
          await upsertModelDoc('NewsInteraction', existing._id, existing).catch(() => { });
        } else {
          await deleteModelDoc('NewsInteraction', interaction?._id);
        }
        throw err;
      }
    }

    return res.status(400).json({ message: pickLang(userLang, 'Неверный тип действия', 'Invalid interaction type') });
  } catch (err) {
    return next(err);
  }
}

async function runScheduledNewsPublishSweep(now = new Date()) {
  return maybePublishScheduledPosts(now);
}

module.exports = {
  createCategory,
  updateCategory,
  deleteCategory,
  listCategories,
  createPost,
  updatePost,
  deletePost,
  publishPost,
  listPosts,
  getNewsUserCard,
  listComments,
  recordViews,
  interact,
  updateComment,
  deleteComment,
  runScheduledNewsPublishSweep,
  __resetNewsControllerRuntimeState: resetNewsControllerRuntimeState,
};

