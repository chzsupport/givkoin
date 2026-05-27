const {
  buildNewsViewBucketId,
  getNewsViewDateKey,
  toId,
} = require('./newsCommon');

function createNewsViewService({
  findPublishedPostsByIds,
  getNewsViewBucketForUser,
  normalizeViewBucketPostIds,
  recordActivity,
  upsertModelDoc,
  viewBucketLimit = 500,
} = {}) {
  async function saveViewsForUser({ userId, postIds, lastReadPostId = null, now = new Date(), allowedPostIds = null }) {
    const uniqueIds = Array.from(new Set((Array.isArray(postIds) ? postIds : []).map(toId).filter(Boolean)));
    const safeIds = uniqueIds.slice(0, viewBucketLimit);
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
    const previousLastReadUpdatedAt = bucket?.lastReadUpdatedAt || bucket?.updatedAt || null;

    const toAdd = publishedIds.filter((pid) => !viewedSet.has(String(pid)));
    const nextLastReadPostId = validatedLastReadPostId || previousLastReadPostId;
    const nextLastReadUpdatedAt = validatedLastReadPostId ? now.toISOString() : previousLastReadUpdatedAt;
    if (!toAdd.length && !validatedLastReadPostId && nextLastReadPostId === previousLastReadPostId) {
      return { saved: 0, alreadyViewed: publishedIds.length, lastReadPostId: nextLastReadPostId };
    }

    const nextIds = normalizeViewBucketPostIds([...existingIds, ...toAdd]);
    const bucketId = buildNewsViewBucketId(toId(userId), today);
    await upsertModelDoc('NewsViewBucket', bucketId, {
      user: toId(userId),
      dateKey: today,
      postIds: nextIds,
      lastReadPostId: nextLastReadPostId,
      lastReadUpdatedAt: nextLastReadUpdatedAt,
      updatedAt: new Date(),
    });

    if (toAdd.length) {
      Promise.all(toAdd.map((postId) => recordActivity({
        userId,
        type: 'news_view',
        minutes: 0,
        meta: { postId, dateKey: today },
        createdAt: now,
      }))).catch(() => { });
    }

    return {
      saved: toAdd.length,
      alreadyViewed: publishedIds.length - toAdd.length,
      lastReadPostId: nextLastReadPostId,
    };
  }

  return { saveViewsForUser };
}

module.exports = {
  createNewsViewService,
};
