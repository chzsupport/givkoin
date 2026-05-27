const { creditK } = require('../services/kService');
const { recordActivity } = require('../services/activityService');
const { awardRadianceForActivity } = require('../services/activityRadianceService');
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
const {
  clearPageCacheByPrefix,
  getOrLoadPage,
  makePageCacheKey,
  warmPage,
} = require('../services/pageCacheService');
const {
  deleteDocsByModel,
  getDocByModelAndId,
  insertDoc,
  listAllDocsByModel,
  listDocsByModel,
  listDocsByModelBeforeCursor,
  upsertDoc,
} = require('../services/documentStore');
const {
  normalizeLang,
  toId,
  getNewsViewDateKey,
} = require('../services/news/newsCommon');
const {
  createNewsViewBatchKey: createSignedNewsViewBatchKey,
  parseNewsViewBatchKey: parseSignedNewsViewBatchKey,
  normalizeViewBucketPostIds: normalizeSignedViewBucketPostIds,
} = require('../services/news/newsViewBatchKey');
const { createNewsDocumentStore } = require('../services/news/newsDocumentStore');
const {
  normalizePostStats,
  applyStatsDelta,
  clampLimit: clampNewsLimit,
  paginateFeedPosts: paginateNewsFeedPosts,
} = require('../services/news/newsPostFormatting');
const { createNewsUserStore } = require('../services/news/newsUserStore');
const { buildNewsUserCardFromCounter } = require('../services/news/newsUserCard');
const { createNewsEngagementStore } = require('../services/news/newsEngagementStore');
const { createNewsPostQueries } = require('../services/news/newsPostQueries');
const { createNewsRuntimeState } = require('../services/news/newsRuntimeState');
const { createNewsSideEffects } = require('../services/news/newsSideEffects');
const { createNewsViewService } = require('../services/news/newsViewService');
const {
  buildNewsPostCreatePayload,
  buildNewsPostUpdatePatch,
} = require('../services/news/newsPostAdminPayload');
const { createNewsInteractionService } = require('../services/news/newsInteractionService');
const { createNewsCommentService } = require('../services/news/newsCommentService');
const { createNewsAdminService } = require('../services/news/newsAdminService');
const { createNewsFeedService } = require('../services/news/newsFeedService');
const { createNewsPublicActionService } = require('../services/news/newsPublicActionService');

const NEWS_FEED_LIMIT = 100;
const NEWS_FEED_PAGE_DEFAULT = 5;
const NEWS_FEED_PAGE_MAX = 25;
const COMMENTS_PAGE_DEFAULT = 5;
const COMMENTS_PAGE_MAX = 50;
const COMMENT_EDIT_WINDOW_MS = 60 * 60 * 1000;
const COMMENT_WINDOW_MS = 24 * 60 * 60 * 1000;

const {
  getModelDocById,
  listModelDocs,
  insertModelDoc,
  upsertModelDoc,
  updateModelDoc,
  updateExistingModelDoc,
  deleteModelDoc,
} = createNewsDocumentStore({
  deleteDocsByModel,
  getDocByModelAndId,
  insertDoc,
  listAllDocsByModel,
  upsertDoc,
});
const {
  getUserRowById,
  updateUserDataById,
  hydrateCommentUsers,
} = createNewsUserStore();

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
const NEWS_LAST_READ_TTL_MS = Math.max(
  60 * 1000,
  Number(process.env.NEWS_LAST_READ_TTL_MS) || 3 * 60 * 60 * 1000
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
const {
  getNewsDailyCounterForUser,
  ensureNewsDailyCounter,
  getNewsDailyCounterValue,
  adjustNewsDailyCounter,
  getNewsInteractionMarksForUser,
  getCommentWindowForUser,
  getNewsViewBucketForUser,
} = createNewsEngagementStore({
  getModelDocById,
  listDocsByModel,
  updateExistingModelDoc,
  upsertModelDoc,
  viewBucketLimit: NEWS_VIEW_BUCKET_LIMIT,
});
const {
  listNewsPosts,
  findPublishedPostsByIds,
  loadPostsWithStats,
} = createNewsPostQueries({
  listModelDocs,
  listDocsByModel,
  feedLimit: NEWS_FEED_LIMIT,
});
const newsRuntimeState = createNewsRuntimeState({
  categoriesTtlMs: NEWS_CATEGORIES_CACHE_TTL_MS,
  clearPageCacheByPrefix,
  feedTtlMs: NEWS_FEED_CACHE_TTL_MS,
  scheduledPublishSweepIntervalMs: NEWS_SCHEDULED_PUBLISH_SWEEP_INTERVAL_MS,
});
const { scheduleNewsInteractionSideEffects } = createNewsSideEffects({
  achievementDelayMinMs: NEWS_ACHIEVEMENT_DELAY_MIN_MS,
  achievementDelayMaxMs: NEWS_ACHIEVEMENT_DELAY_MAX_MS,
  getUserRowById,
  recordActivity,
  updateUserDataById,
});
const { saveViewsForUser } = createNewsViewService({
  findPublishedPostsByIds,
  getNewsViewBucketForUser,
  normalizeViewBucketPostIds,
  recordActivity,
  upsertModelDoc,
  viewBucketLimit: NEWS_VIEW_BUCKET_LIMIT,
});
const { handleNewsInteraction } = createNewsInteractionService({
  adjustNewsDailyCounter,
  awardRadianceForActivity,
  clearNewsCommentsCache: () => clearPageCacheByPrefix('news:comments:'),
  commentLimitPerDay: NEWS_COMMENT_LIMIT_PER_DAY,
  commentReward: NEWS_COMMENT_REWARD,
  commentsPerPostLimit: NEWS_COMMENTS_PER_POST_LIMIT,
  commentWindowMs: COMMENT_WINDOW_MS,
  creditK,
  deleteModelDoc,
  ensureNewsDailyCounter,
  getCommentWindowForUser,
  getModelDocById,
  getNewsDailyCounterValue,
  incrementPostStats,
  insertModelDoc,
  likeLimitPerDay: NEWS_LIKE_LIMIT_PER_DAY,
  likeReward: NEWS_LIKE_REWARD,
  repostChannels: NEWS_REPOST_CHANNELS,
  repostLimitPerDay: NEWS_REPOST_LIMIT_PER_DAY,
  repostReward: NEWS_REPOST_REWARD,
  saveViewsForUser,
  scheduleNewsInteractionSideEffects,
  updateCachedNewsFeedPostStats,
  updateExistingModelDoc,
  upsertModelDoc,
});
const {
  listCommentsForPost,
  updateCommentForUser,
  deleteCommentForAdmin,
} = createNewsCommentService({
  clearNewsCommentsCache: () => clearPageCacheByPrefix('news:comments:'),
  commentEditWindowMs: COMMENT_EDIT_WINDOW_MS,
  deleteModelDoc,
  getModelDocById,
  getOrLoadPage,
  hydrateCommentUsers,
  incrementPostStats,
  listDocsByModelBeforeCursor,
  makePageCacheKey,
  updateCachedNewsFeedPostStats,
  updateModelDoc,
  warmPage,
});
const {
  createCategory: createNewsCategoryAdmin,
  updateCategory: updateNewsCategoryAdmin,
  deleteCategory: deleteNewsCategoryAdmin,
  createPost: createNewsPostAdmin,
  updatePost: updateNewsPostAdmin,
  deletePost: deleteNewsPostAdmin,
  deletePostsBulk: deleteNewsPostsBulkAdmin,
  publishPost: publishNewsPostAdmin,
} = createNewsAdminService({
  buildNewsPostCreatePayload,
  buildNewsPostUpdatePatch,
  deleteModelDoc,
  deleteNewsPostTotally,
  getModelDocById,
  insertModelDoc,
  listModelDocs,
  updateModelDoc,
});
const { listPostsPage } = createNewsFeedService({
  createNewsViewBatchKey,
  getNewsUserCard,
  getOrLoadPage,
  listNewsPosts,
  loadPublishedPosts,
  makePageCacheKey,
  maybePublishScheduledPosts,
  paginateFeedPosts,
  warmPage,
});
const {
  recordViewsForUser,
  handlePostInteraction,
} = createNewsPublicActionService({
  getModelDocById,
  handleNewsInteraction,
  parseNewsViewBatchKey,
  saveViewsForUser,
});

function createNewsViewBatchKey({ userId, postIds, now = new Date() } = {}) {
  return createSignedNewsViewBatchKey({
    userId,
    postIds,
    now,
    secret: NEWS_VIEW_BATCH_KEY_SECRET,
    ttlMs: NEWS_VIEW_BATCH_KEY_TTL_MS,
  });
}

function parseNewsViewBatchKey(viewBatchKey, userId) {
  return parseSignedNewsViewBatchKey(viewBatchKey, userId, {
    secret: NEWS_VIEW_BATCH_KEY_SECRET,
  });
}

function normalizeViewBucketPostIds(postIds) {
  return normalizeSignedViewBucketPostIds(postIds, NEWS_VIEW_BUCKET_LIMIT);
}

async function incrementPostStats(postId, delta, currentPost = null) {
  const post = currentPost || await getModelDocById('NewsPost', postId);
  if (!post) return null;
  const normalized = normalizePostStats(post);
  const nextStats = applyStatsDelta(normalized?.stats, delta);
  clearPageCacheByPrefix('news:posts:');
  return upsertModelDoc('NewsPost', normalized._id, { ...normalized, stats: nextStats, updatedAt: new Date() });
}

function updateCachedNewsFeedPostStats(postId, delta) {
  const targetId = toId(postId);
  if (!targetId) return;

  newsRuntimeState.updateCachedNewsFeed((post) => {
    if (toId(post?._id) !== targetId) return post;
    const normalized = normalizePostStats(post);
    return {
      ...normalized,
      stats: applyStatsDelta(normalized?.stats, delta),
      updatedAt: new Date(),
    };
  });
}

function clampCommentLimit(value) {
  return clampNewsLimit(value, COMMENTS_PAGE_DEFAULT, COMMENTS_PAGE_MAX);
}

function clampFeedLimit(value) {
  return clampNewsLimit(value, NEWS_FEED_PAGE_DEFAULT, NEWS_FEED_PAGE_MAX);
}

function paginateFeedPosts(posts, { limit, cursor } = {}) {
  return paginateNewsFeedPosts(posts, {
    cursor,
    defaultLimit: NEWS_FEED_PAGE_DEFAULT,
    limit,
    maxLimit: NEWS_FEED_PAGE_MAX,
  });
}

function invalidateNewsCategoriesRuntimeState() {
  newsRuntimeState.invalidateNewsCategoriesRuntimeState();
}

function invalidateNewsFeedRuntimeState({ resetSweep = false } = {}) {
  newsRuntimeState.invalidateNewsFeedRuntimeState({ resetSweep });
}

function resetNewsControllerRuntimeState() {
  newsRuntimeState.resetNewsControllerRuntimeState();
}

function applyNewsAdminSideEffects(result, req) {
  if (result?.flags?.invalidateCategories) {
    invalidateNewsCategoriesRuntimeState();
  }
  if (result?.flags?.invalidateFeed) {
    invalidateNewsFeedRuntimeState();
  }

  const auditEntries = Array.isArray(result?.audit)
    ? result.audit
    : (result?.audit ? [result.audit] : []);
  for (const entry of auditEntries) {
    if (entry?.event) {
      adminAudit(entry.event, req, entry.payload || {});
    }
  }
}

function sendNewsServiceResult(res, result) {
  return res.status(result?.status || 200).json(result?.body || {});
}

async function getNewsUserCard({ userId, now = new Date() }) {
  const dateKey = getNewsViewDateKey(now);
  if (!userId) {
    return buildNewsUserCardFromCounter(null, dateKey, {
      commentsPerPost: NEWS_COMMENTS_PER_POST_LIMIT,
      dailyCommentsLimit: NEWS_COMMENT_LIMIT_PER_DAY,
      dailyLikesLimit: NEWS_LIKE_LIMIT_PER_DAY,
      dailyRepostsLimit: NEWS_REPOST_LIMIT_PER_DAY,
      lastReadTtlMs: NEWS_LAST_READ_TTL_MS,
      normalizeViewBucketPostIds,
    });
  }

  const [counter, viewBucket, marks] = await Promise.all([
    getNewsDailyCounterForUser({ userId, dateKey }),
    getNewsViewBucketForUser(userId, dateKey),
    getNewsInteractionMarksForUser({ userId, now }),
  ]);
  return buildNewsUserCardFromCounter(counter, dateKey, {
    commentsPerPost: NEWS_COMMENTS_PER_POST_LIMIT,
    dailyCommentsLimit: NEWS_COMMENT_LIMIT_PER_DAY,
    dailyLikesLimit: NEWS_LIKE_LIMIT_PER_DAY,
    dailyRepostsLimit: NEWS_REPOST_LIMIT_PER_DAY,
    lastReadTtlMs: NEWS_LAST_READ_TTL_MS,
    normalizeViewBucketPostIds,
    extra: {
      likedPostIds: marks?.likedPostIds,
      repostedPostIds: marks?.repostedPostIds,
      viewedPostIds: viewBucket?.postIds,
      lastReadPostId: viewBucket?.lastReadPostId,
      lastReadUpdatedAt: viewBucket?.lastReadUpdatedAt || viewBucket?.updatedAt,
    },
  });
}

async function loadNewsCategories(nowMs = Date.now()) {
  return newsRuntimeState.loadNewsCategories(async () => {
    const categories = await listModelDocs('NewsCategory', { pageSize: 2000 });
    return (Array.isArray(categories) ? categories : [])
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
  }, nowMs);
}

async function maybePublishScheduledPosts(now = new Date()) {
  return newsRuntimeState.runScheduledNewsPublishSweep(async () => {
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
  }, now);
}

async function loadPublishedPosts(now = new Date()) {
  return newsRuntimeState.loadNewsFeed(() => loadPostsWithStats({ status: 'published' }), Date.now());
}

async function createCategory(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const result = await createNewsCategoryAdmin({ body: req.body, userLang });
    applyNewsAdminSideEffects(result, req);
    return sendNewsServiceResult(res, result);
  } catch (err) {
    return next(err);
  }
}

async function updateCategory(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const { id } = req.params;
    const result = await updateNewsCategoryAdmin({ id, body: req.body, userLang });
    applyNewsAdminSideEffects(result, req);
    return sendNewsServiceResult(res, result);
  } catch (err) {
    return next(err);
  }
}

async function deleteCategory(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const { id } = req.params;
    const result = await deleteNewsCategoryAdmin({ id, userLang });
    applyNewsAdminSideEffects(result, req);
    return sendNewsServiceResult(res, result);
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
    const result = await createNewsPostAdmin({ body: req.body, userLang });
    applyNewsAdminSideEffects(result, req);
    return sendNewsServiceResult(res, result);
  } catch (err) {
    return next(err);
  }
}

async function updatePost(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const { id } = req.params;
    const result = await updateNewsPostAdmin({ id, body: req.body, userLang });
    applyNewsAdminSideEffects(result, req);
    return sendNewsServiceResult(res, result);
  } catch (err) {
    return next(err);
  }
}

async function deletePost(req, res, next) {
  const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
  try {
    const { id } = req.params;
    const result = await deleteNewsPostAdmin({ id, userLang });
    applyNewsAdminSideEffects(result, req);
    return sendNewsServiceResult(res, result);
  } catch (err) {
    return next(err);
  }
}

async function deletePostsBulk(req, res, next) {
  const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
  try {
    const result = await deleteNewsPostsBulkAdmin({ ids: req.body?.ids, userLang });
    applyNewsAdminSideEffects(result, req);
    return sendNewsServiceResult(res, result);
  } catch (err) {
    return next(err);
  }
}

async function publishPost(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const { id } = req.params;
    const result = await publishNewsPostAdmin({ id, userLang });
    applyNewsAdminSideEffects(result, req);
    return sendNewsServiceResult(res, result);
  } catch (err) {
    return next(err);
  }
}

async function listPosts(req, res, next) {
  try {
    const now = new Date();
    const status = String(req.query.status || 'published');
    const userId = req.user?._id;
    const limit = clampFeedLimit(req.query?.limit);
    const pageData = await listPostsPage({
      status,
      limit,
      cursor: req.query?.cursor,
      userId,
      now,
    });
    return res.json(pageData);
  } catch (err) {
    return next(err);
  }
}

async function listComments(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.query?.language || 'ru');
    const { id: postId } = req.params;
    const limit = clampCommentLimit(req.query?.limit);
    const result = await listCommentsForPost({
      postId,
      limit,
      cursor: req.query?.cursor,
      userLang,
    });
    return res.status(result.status || 200).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function updateComment(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const { postId, commentId } = req.params;
    const result = await updateCommentForUser({
      postId,
      commentId,
      content: req.body?.content,
      userId: req.user?._id,
      userLang,
    });
    return res.status(result.status || 200).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function deleteComment(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const { postId, commentId } = req.params;
    const result = await deleteCommentForAdmin({ postId, commentId, userLang });
    if (result.audit) {
      adminAudit(result.audit.event, req, result.audit.payload);
    }
    return res.status(result.status || 200).json(result.body);
  } catch (err) {
    return next(err);
  }
}

async function recordViews(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const result = await recordViewsForUser({
      userId: req.user?._id,
      postIds: req.body?.postIds,
      lastReadPostId: req.body?.lastReadPostId,
      viewBatchKey: typeof req.body?.viewBatchKey === 'string' ? req.body.viewBatchKey : '',
      userLang,
    });
    return sendNewsServiceResult(res, result);
  } catch (err) {
    return next(err);
  }
}

async function interact(req, res, next) {
  try {
    const userLang = normalizeLang(req.user?.language || req.user?.data?.language || req.body?.language || req.query?.language || 'ru');
    const { id: postId } = req.params;
    const { type, content } = req.body || {};
    const result = await handlePostInteraction({
      userId: req.user?._id,
      postId,
      type,
      content,
      channel: req.body?.channel,
      userLang,
      userNickname: req.user?.nickname,
    });
    return sendNewsServiceResult(res, result);
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
  deletePostsBulk,
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

