const { getOrLoadPage, makePageCacheKey, warmPage } = require('../services/pageCacheService');
const { listDocsByModel } = require('../services/documentStore');

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function mapEarningRow(row) {
  const data = row?.data && typeof row.data === 'object' ? row.data : (row || {});
  return {
    _id: String(row?._id || row?.id || ''),
    amount: Number(data.amount) || 0,
    activityType: String(data.activityType || ''),
    meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
    occurredAt: data.occurredAt || row?.createdAt || row?.created_at || null,
  };
}

async function listRadianceEarnings(userId, limit, offset) {
  const data = await listDocsByModel('RadianceEarning', {
    limit,
    offset,
    dataEq: { user: String(userId) },
    orderBy: 'data->>occurredAt',
    ascending: false,
    nullsFirst: false,
  });
  return data.map(mapEarningRow);
}

async function getTotalRadianceEarned(userId) {
  const data = await listDocsByModel('RadianceEarning', {
    limit: 10000,
    dataEq: { user: String(userId) },
  });
  return data.reduce((sum, row) => sum + (Number(row?.amount) || 0), 0);
}

exports.getHistory = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Требуется авторизация' });

    const limit = Math.min(200, Math.max(1, toInt(req.query?.limit, 50)));
    const offset = toInt(req.query?.offset, 0);
    const cacheKey = makePageCacheKey('radiance:history', { userId, limit, offset });
    const { value: items } = await getOrLoadPage(cacheKey, () => listRadianceEarnings(userId, limit, offset));
    if (Array.isArray(items) && items.length === limit) {
      const nextOffset = offset + limit;
      const nextKey = makePageCacheKey('radiance:history', { userId, limit, offset: nextOffset });
      warmPage(nextKey, () => listRadianceEarnings(userId, limit, nextOffset));
    }
    return res.json({ items, limit, offset });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getTotalEarned = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Требуется авторизация' });

    const total = await getTotalRadianceEarned(userId);
    return res.json({ total });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
