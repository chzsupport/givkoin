const {
  buildNewsCommentWindowId,
  buildNewsDailyCounterId,
  buildNewsViewBucketId,
  getNewsDailyCounterField,
  toId,
} = require('./newsCommon');

function normalizeDailyCounter(counter) {
  return {
    ...counter,
    likes: Math.max(0, Number(counter?.likes) || 0),
    comments: Math.max(0, Number(counter?.comments) || 0),
    reposts: Math.max(0, Number(counter?.reposts) || 0),
  };
}

function getNewsDailyCounterValue(counter, type) {
  const field = getNewsDailyCounterField(type);
  if (!field) return 0;
  return Math.max(0, Number(counter?.[field]) || 0);
}

function buildNewsDailyCounterFromRows({ userId, dateKey, rows, now = new Date() }) {
  if (!userId || !dateKey) return null;

  const counts = {
    likes: 0,
    comments: 0,
    reposts: 0,
  };

  (Array.isArray(rows) ? rows : []).forEach((interaction) => {
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

function createNewsEngagementStore({
  getModelDocById,
  listDocsByModel,
  updateExistingModelDoc,
  upsertModelDoc,
  viewBucketLimit,
} = {}) {
  async function buildNewsDailyCounterFromInteractions({ userId, dateKey, now = new Date() }) {
    if (!userId || !dateKey) return null;
    const data = await listDocsByModel('NewsInteraction', {
      dataEq: {
        user: String(userId),
        dateKey: String(dateKey),
      },
      limit: 5000,
    });

    return buildNewsDailyCounterFromRows({
      userId,
      dateKey,
      rows: data,
      now,
    });
  }

  async function ensureNewsDailyCounter({ userId, dateKey, now = new Date() }) {
    const counterId = buildNewsDailyCounterId(toId(userId), dateKey);
    if (!counterId) return null;

    const existing = await getModelDocById('NewsDailyCounter', counterId);
    if (existing) {
      return normalizeDailyCounter(existing);
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

  async function getNewsDailyCounterForUser({ userId, dateKey }) {
    const counterId = buildNewsDailyCounterId(toId(userId), dateKey);
    if (!counterId) return null;
    return getModelDocById('NewsDailyCounter', counterId);
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

    const repostWindowStartedAt = new Date(now.getTime() - (24 * 60 * 60 * 1000)).toISOString();
    const [likes, reposts] = await Promise.all([
      listDocsByModel('NewsInteraction', {
        dataEq: { user: safeUserId, type: 'like' },
        limit: viewBucketLimit,
      }),
      listDocsByModel('NewsInteraction', {
        dataEq: { user: safeUserId, type: 'repost' },
        columnGte: { created_at: repostWindowStartedAt },
        limit: viewBucketLimit,
      }),
    ]);

    const likedPostIds = (Array.isArray(likes) ? likes : [])
      .filter((interaction) => interaction && interaction.active !== false)
      .map((interaction) => toId(interaction?.post))
      .filter(Boolean);

    const repostedPostIds = (Array.isArray(reposts) ? reposts : [])
      .filter(Boolean)
      .map((interaction) => toId(interaction?.post))
      .filter(Boolean);

    return {
      likedPostIds,
      repostedPostIds,
    };
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

  return {
    buildNewsDailyCounterFromInteractions,
    getNewsDailyCounterForUser,
    ensureNewsDailyCounter,
    getNewsDailyCounterValue,
    adjustNewsDailyCounter,
    getNewsInteractionMarksForUser,
    getCommentWindowForUser,
    getNewsViewBucketForUser,
  };
}

module.exports = {
  normalizeDailyCounter,
  getNewsDailyCounterValue,
  buildNewsDailyCounterFromRows,
  createNewsEngagementStore,
};
