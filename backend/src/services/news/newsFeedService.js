const {
  createEmptyPostStats,
  decodeFeedCursor,
  normalizePostStats,
} = require('./newsPostFormatting');

function createNewsFeedService({
  createNewsViewBatchKey,
  getNewsUserCard,
  getOrLoadPage,
  listNewsPosts,
  loadPublishedPosts,
  makePageCacheKey,
  maybePublishScheduledPosts,
  paginateFeedPosts,
  warmPage,
} = {}) {
  async function listPostsPage({
    status = 'published',
    limit,
    cursor: rawCursor,
    userId = null,
    now = new Date(),
  } = {}) {
    const safeStatus = String(status || 'published');
    const cursor = decodeFeedCursor(rawCursor);

    const loadPage = async (pageCursor = cursor) => {
      const posts = safeStatus === 'all'
        ? (await maybePublishScheduledPosts(now), await listNewsPosts({ status: 'all' }))
        : await loadPublishedPosts(now);

      const feedPage = paginateFeedPosts(posts, {
        limit,
        cursor: pageCursor,
      });

      if (!feedPage.items.length) {
        return { items: [], nextCursor: null, hasMore: false };
      }

      const out = feedPage.items.map((post) => {
        const normalized = normalizePostStats(post);
        return {
          ...normalized,
          stats: normalized?.stats || createEmptyPostStats(),
        };
      });
      return {
        items: out,
        nextCursor: feedPage.nextCursor,
        hasMore: feedPage.hasMore,
      };
    };

    const cacheKey = makePageCacheKey('news:posts', { status: safeStatus, limit, cursor });
    const { value: pageData } = await getOrLoadPage(cacheKey, () => loadPage(cursor));
    if (pageData?.hasMore && pageData?.nextCursor) {
      const nextKey = makePageCacheKey('news:posts', { status: safeStatus, limit, cursor: pageData.nextCursor });
      warmPage(nextKey, () => loadPage(pageData.nextCursor));
    }

    const safePageData = pageData || { items: [], nextCursor: null, hasMore: false };
    const viewBatchKey = userId && safeStatus === 'published' && Array.isArray(safePageData.items) && safePageData.items.length > 0
      ? createNewsViewBatchKey({
        userId,
        postIds: safePageData.items.map((post) => post?._id),
        now,
      })
      : null;
    const newsCard = userId ? await getNewsUserCard({ userId, now }).catch(() => null) : null;

    return {
      ...safePageData,
      viewBatchKey,
      newsCard,
    };
  }

  return {
    listPostsPage,
  };
}

module.exports = {
  createNewsFeedService,
};
