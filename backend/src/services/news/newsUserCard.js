const { toId } = require('./newsCommon');

function isRecentNewsLastRead(value, ttlMs, nowMs = Date.now()) {
  const time = new Date(value || 0).getTime();
  return Number.isFinite(time) && time > 0 && nowMs - time <= ttlMs;
}

function buildNewsUserCardFromCounter(counter, dateKey, {
  commentsPerPost,
  dailyCommentsLimit,
  dailyLikesLimit,
  dailyRepostsLimit,
  extra = {},
  lastReadTtlMs,
  normalizeViewBucketPostIds,
  nowMs = Date.now(),
} = {}) {
  const dailyLikesUsed = Math.max(0, Number(counter?.likes) || 0);
  const dailyCommentsUsed = Math.max(0, Number(counter?.comments) || 0);
  const dailyRepostsUsed = Math.max(0, Number(counter?.reposts) || 0);
  const likedPostIds = Array.from(new Set((Array.isArray(extra?.likedPostIds) ? extra.likedPostIds : []).map(toId).filter(Boolean)));
  const repostedPostIds = Array.from(new Set((Array.isArray(extra?.repostedPostIds) ? extra.repostedPostIds : []).map(toId).filter(Boolean)));
  const viewedPostIds = normalizeViewBucketPostIds(extra?.viewedPostIds);
  const rawLastReadPostId = toId(extra?.lastReadPostId) || null;
  const lastReadPostId = rawLastReadPostId && isRecentNewsLastRead(extra?.lastReadUpdatedAt, lastReadTtlMs, nowMs)
    ? rawLastReadPostId
    : null;

  return {
    dateKey,
    likesPerPost: 1,
    repostsPerPost: 1,
    commentsPerPost,
    dailyLikesLimit,
    dailyCommentsLimit,
    dailyRepostsLimit,
    dailyLikesUsed,
    dailyCommentsUsed,
    dailyRepostsUsed,
    dailyLikesLeft: Math.max(0, dailyLikesLimit - dailyLikesUsed),
    dailyCommentsLeft: Math.max(0, dailyCommentsLimit - dailyCommentsUsed),
    dailyRepostsLeft: Math.max(0, dailyRepostsLimit - dailyRepostsUsed),
    likedPostIds,
    repostedPostIds,
    viewedPostIds,
    lastReadPostId,
  };
}

module.exports = {
  isRecentNewsLastRead,
  buildNewsUserCardFromCounter,
};
