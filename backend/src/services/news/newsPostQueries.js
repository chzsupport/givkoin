const { toId } = require('./newsCommon');
const {
  getNewsPostSortTimestamp,
  normalizePostStats,
} = require('./newsPostFormatting');

function createNewsPostQueries({ listModelDocs, listDocsByModel, feedLimit } = {}) {
  async function listNewsPosts({ status = 'published', limit = feedLimit } = {}) {
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
    const data = await listDocsByModel('NewsPost', {
      ids,
      dataEq: { status: 'published' },
      limit: ids.length,
    });
    return (Array.isArray(data) ? data : []).filter(Boolean).map(normalizePostStats);
  }

  async function loadPostsWithStats(query) {
    const statusFilter = query && typeof query === 'object' && query.status ? String(query.status) : 'all';
    return listNewsPosts({ status: statusFilter });
  }

  return {
    listNewsPosts,
    findPublishedPostsByIds,
    loadPostsWithStats,
  };
}

module.exports = {
  createNewsPostQueries,
};
