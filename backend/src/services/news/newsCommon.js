function normalizeLang(value) {
  const lang = String(value || 'ru').toLowerCase();
  return lang.startsWith('en') ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
  return normalizeLang(lang) === 'en' ? en : ru;
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
      const text = value.toString();
      if (text && text !== '[object Object]') return text;
    }
  }
  return '';
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

function dateKey(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10);
}

function getNewsViewDateKey(now = new Date()) {
  const date = new Date(now);
  if (date.getHours() === 0 && date.getMinutes() === 0) {
    date.setDate(date.getDate() - 1);
  }
  return dateKey(date);
}

function buildNewsViewBucketId(userId, dayKey) {
  if (!userId || !dayKey) return '';
  return `news_view:${userId}:${dayKey}`;
}

function buildNewsDailyCounterId(userId, dayKey) {
  if (!userId || !dayKey) return '';
  return `news_daily_counter:${userId}:${dayKey}`;
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

module.exports = {
  normalizeLang,
  pickLang,
  toId,
  getUserData,
  dateKey,
  getNewsViewDateKey,
  buildNewsViewBucketId,
  buildNewsDailyCounterId,
  buildNewsCommentWindowId,
  buildNewsLikeInteractionId,
  buildNewsRepostInteractionId,
  getNewsDailyCounterField,
};
