function createNewsRuntimeState({
  categoriesTtlMs,
  clearPageCacheByPrefix = () => {},
  feedTtlMs,
  scheduledPublishSweepIntervalMs,
} = {}) {
  let newsCategoriesCache = null;
  let newsCategoriesCacheExpiresAt = 0;
  let newsCategoriesInflight = null;
  let newsFeedCache = null;
  let newsFeedCacheExpiresAt = 0;
  let newsFeedInflight = null;
  let newsScheduledPublishSweepStartedAt = 0;
  let newsScheduledPublishSweepInflight = null;

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
    newsCategoriesCacheExpiresAt = nowMs + categoriesTtlMs;
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
    newsFeedCacheExpiresAt = nowMs + feedTtlMs;
    return newsFeedCache;
  }

  function updateCachedNewsFeed(mapper) {
    if (!Array.isArray(newsFeedCache) || newsFeedCache.length === 0 || typeof mapper !== 'function') return;
    newsFeedCache = newsFeedCache.map(mapper);
  }

  function invalidateNewsFeedRuntimeState({ resetSweep = false } = {}) {
    newsFeedCache = null;
    newsFeedCacheExpiresAt = 0;
    newsFeedInflight = null;
    clearPageCacheByPrefix('news:posts:');
    if (resetSweep) {
      newsScheduledPublishSweepStartedAt = 0;
      newsScheduledPublishSweepInflight = null;
    }
  }

  function resetNewsControllerRuntimeState() {
    invalidateNewsCategoriesRuntimeState();
    invalidateNewsFeedRuntimeState({ resetSweep: true });
  }

  async function loadNewsCategories(loader, nowMs = Date.now()) {
    const cached = getCachedNewsCategories(nowMs);
    if (cached) return cached;
    if (newsCategoriesInflight) return newsCategoriesInflight;

    const promise = Promise.resolve()
      .then(loader)
      .then((categories) => setCachedNewsCategories(categories || [], nowMs))
      .finally(() => {
        if (newsCategoriesInflight === promise) {
          newsCategoriesInflight = null;
        }
      });

    newsCategoriesInflight = promise;
    return promise;
  }

  async function loadNewsFeed(loader, nowMs = Date.now()) {
    const cached = getCachedNewsFeed(nowMs);
    if (cached) return cached;
    if (newsFeedInflight) return newsFeedInflight;

    const promise = Promise.resolve()
      .then(loader)
      .then((posts) => setCachedNewsFeed(posts, Date.now()))
      .finally(() => {
        if (newsFeedInflight === promise) {
          newsFeedInflight = null;
        }
      });

    newsFeedInflight = promise;
    return promise;
  }

  async function runScheduledNewsPublishSweep(loader, now = new Date()) {
    const nowMs = now.getTime();
    if (newsScheduledPublishSweepInflight) return newsScheduledPublishSweepInflight;
    if (
      newsScheduledPublishSweepStartedAt > 0
      && (nowMs - newsScheduledPublishSweepStartedAt) < scheduledPublishSweepIntervalMs
    ) {
      return null;
    }

    newsScheduledPublishSweepStartedAt = nowMs;
    const promise = Promise.resolve()
      .then(loader)
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

  return {
    getCachedNewsCategories,
    setCachedNewsCategories,
    invalidateNewsCategoriesRuntimeState,
    getCachedNewsFeed,
    setCachedNewsFeed,
    updateCachedNewsFeed,
    invalidateNewsFeedRuntimeState,
    resetNewsControllerRuntimeState,
    loadNewsCategories,
    loadNewsFeed,
    runScheduledNewsPublishSweep,
  };
}

module.exports = {
  createNewsRuntimeState,
};
