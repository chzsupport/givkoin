const {
  countDocsByModel,
  listDocsByModel,
} = require('../../services/documentStore');
const {
  getUsersByIds,
  parsePagination,
  toId,
} = require('./shared');

async function listSystemErrors(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 50 });
    const dataEq = {};
    const dataIlike = {};

    if (req.query.statusCode) {
      dataEq.statusCode = String(Number(req.query.statusCode));
    }
    if (req.query.eventType) {
      dataEq.eventType = String(req.query.eventType);
    }
    if (req.query.path) {
      dataIlike.path = `%${String(req.query.path)}%`;
    }

    const [events, total] = await Promise.all([
      listDocsByModel('SystemErrorEvent', {
        dataEq,
        dataIlike,
        orderBy: 'created_at',
        ascending: false,
        limit,
        offset: skip,
      }),
      countDocsByModel('SystemErrorEvent', { dataEq, dataIlike }),
    ]);

    const safeEvents = Array.isArray(events) ? events : [];
    const userIds = Array.from(new Set(safeEvents.map((row) => toId(row?.user)).filter(Boolean)));
    const userMap = await getUsersByIds(userIds);
    const enrichedEvents = safeEvents.map((row) => {
      const id = toId(row?.user);
      const u = id ? userMap.get(id) : null;
      return {
        ...row,
        user: u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : row.user,
      };
    });

    const topRoutesMap = new Map();
    for (const item of events) {
      const key = `${item.method || ''} ${item.path || ''}`.trim() || '(unknown)';
      topRoutesMap.set(key, (topRoutesMap.get(key) || 0) + 1);
    }
    const topRoutes = Array.from(topRoutesMap.entries())
      .map(([route, count]) => ({ route, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    return res.json({
      events: enrichedEvents,
      topRoutes,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

module.exports = {
  listSystemErrors,
};
