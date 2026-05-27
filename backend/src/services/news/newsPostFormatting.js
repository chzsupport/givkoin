const { pickLang, toId } = require('./newsCommon');

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

function clampLimit(value, defaultLimit, maxLimit) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return defaultLimit;
  return Math.max(1, Math.min(maxLimit, Math.round(raw)));
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

function paginateFeedPosts(posts, {
  cursor,
  defaultLimit,
  limit,
  maxLimit,
} = {}) {
  const safeLimit = clampLimit(limit, defaultLimit, maxLimit);
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
  const id = row?.id || row?._id;
  if (!createdAt || !id) return null;
  const raw = `${createdAt}|${id}`;
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

module.exports = {
  mapCommentDto,
  createEmptyPostStats,
  normalizePostStats,
  hasOwn,
  normalizeNewsPostStatus,
  normalizeScheduledAtValue,
  normalizeNewsText,
  normalizeNewsContent,
  normalizeNewsTranslations,
  getNewsPostSortTimestamp,
  applyStatsDelta,
  clampLimit,
  encodeFeedCursor,
  decodeFeedCursor,
  paginateFeedPosts,
  encodeCommentCursor,
  decodeCommentCursor,
};
