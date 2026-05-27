const {
    clearPageCacheByPrefix,
    getOrLoadPage,
    makePageCacheKey,
    warmPage,
} = require('../services/pageCacheService');
const {
    countDocsByModel,
    insertDoc,
    listDocsByModel,
    updateDocByModel,
} = require('../services/documentStore');

function parsePositiveInt(value, fallback) {
    const parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}

function parseMultiValueFilter(value) {
    if (value == null) {
        return null;
    }
    const values = String(value)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    if (values.length === 0) return null;
    return values;
}

function buildNotificationDocFilters(userId, filters = {}, { unreadOnly = false } = {}) {
    const dataEq = { userId: String(userId) };
    const dataIn = {};

    const types = Array.isArray(filters.type) ? filters.type.filter(Boolean) : [];
    if (types.length === 1) {
        dataEq.type = types[0];
    } else if (types.length > 1) {
        dataIn.type = types;
    }

    const eventKeys = Array.isArray(filters.eventKey) ? filters.eventKey.filter(Boolean) : [];
    if (eventKeys.length === 1) {
        dataEq.eventKey = eventKeys[0];
    } else if (eventKeys.length > 1) {
        dataIn.eventKey = eventKeys;
    }

    if (unreadOnly) {
        dataEq.isRead = false;
    }

    return { dataEq, dataIn };
}

function mapNotificationRow(row) {
    const { _id, createdAt, updatedAt, ...data } = row || {};
    return {
        _id,
        ...data,
        createdAt,
    };
}

async function listNotifications(userId, filters, page, limit) {
    const offset = (page - 1) * limit;
    const listFilters = buildNotificationDocFilters(userId, filters);
    const unreadFilters = buildNotificationDocFilters(userId, filters, { unreadOnly: true });

    const [
        data,
        totalCount,
        unreadCountValue,
    ] = await Promise.all([
        listDocsByModel('Notification', {
            ...listFilters,
            limit,
            offset,
            orderBy: 'created_at',
            ascending: false,
        }),
        countDocsByModel('Notification', listFilters),
        countDocsByModel('Notification', unreadFilters),
    ]);

    return {
        notifications: data.map(mapNotificationRow),
        total: Math.max(0, Number(totalCount) || 0),
        unreadCount: Math.max(0, Number(unreadCountValue) || 0),
    };
}

async function countUnreadNotifications(userId, filters) {
    return countDocsByModel('Notification', buildNotificationDocFilters(userId, filters, { unreadOnly: true }));
}

async function loadNotificationsToMarkRead(userId, filters) {
    const ids = Array.isArray(filters.ids)
        ? Array.from(new Set(filters.ids.map((value) => String(value || '').trim()).filter(Boolean)))
        : [];
    const idSet = new Set(ids);
    const scopedFilters = ids.length > 0
        ? {}
        : filters;
    const docFilters = buildNotificationDocFilters(userId, scopedFilters, { unreadOnly: true });
    const rows = [];
    const pageSize = 200;
    let from = 0;

    while (true) {
        const data = await listDocsByModel('Notification', {
            ...docFilters,
            limit: pageSize,
            offset: from,
            orderBy: 'created_at',
            ascending: false,
        });

        if (!Array.isArray(data) || data.length === 0) {
            break;
        }

        rows.push(...(idSet.size ? data.filter((row) => idSet.has(String(row?._id || ''))) : data));
        if (data.length < pageSize) {
            break;
        }
        from += pageSize;
    }

    return rows;
}

async function markNotificationsRead(userId, filters) {
    const rows = await loadNotificationsToMarkRead(userId, filters);
    if (!rows.length) return;

    for (let index = 0; index < rows.length; index += 25) {
        const chunk = rows.slice(index, index + 25);
        await Promise.all(chunk.map((row) => {
            const next = { ...(row || {}), isRead: true };
            delete next._id;
            delete next.createdAt;
            delete next.updatedAt;
            return updateDocByModel('Notification', row._id, next);
        }));
    }
}

async function insertNotification(doc) {
    const id = `notif_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const inserted = await insertDoc({ model: 'Notification', id, data: doc });
    clearPageCacheByPrefix('notifications:list:');
    return { ...doc, _id: inserted?._id || id, createdAt: inserted?.createdAt || new Date().toISOString() };
}

exports.getNotifications = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const page = parsePositiveInt(req.query.page, 1);
        const limit = parsePositiveInt(req.query.limit, 20);

        const type = parseMultiValueFilter(req.query.type);
        const eventKey = parseMultiValueFilter(req.query.eventKey);

        const filters = { type, eventKey };
        const loadPage = (pageNumber = page) => listNotifications(userId, filters, pageNumber, limit);
        const cacheKey = makePageCacheKey('notifications:list', { userId, type, eventKey, page, limit });
        const { value: pageData } = await getOrLoadPage(cacheKey, () => loadPage(page));
        const notifications = Array.isArray(pageData?.notifications) ? pageData.notifications : [];
        const total = Math.max(0, Number(pageData?.total) || 0);
        const unreadCount = Math.max(0, Number(pageData?.unreadCount) || 0);
        if (page * limit < total) {
            const nextPage = page + 1;
            const nextKey = makePageCacheKey('notifications:list', { userId, type, eventKey, page: nextPage, limit });
            warmPage(nextKey, () => loadPage(nextPage));
        }

        res.json({
            notifications,
            total,
            unreadCount,
            page,
            pages: Math.ceil(total / limit)
        });
    } catch (error) {
        next(error);
    }
};

exports.getNotificationSummary = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const type = parseMultiValueFilter(req.query.type);
        const eventKey = parseMultiValueFilter(req.query.eventKey);

        const unreadCount = await countUnreadNotifications(userId, { type, eventKey });

        res.json({ unreadCount });
    } catch (error) {
        next(error);
    }
};

exports.markAsRead = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const { notificationIds, type, eventKey } = req.body;

        const parsedType = parseMultiValueFilter(type);
        const parsedEventKey = parseMultiValueFilter(eventKey);

        await markNotificationsRead(userId, {
            ids: notificationIds,
            type: parsedType,
            eventKey: parsedEventKey,
        });
        clearPageCacheByPrefix('notifications:list:');

        res.json({ success: true });
    } catch (error) {
        next(error);
    }
};

// Internal helper to create notification
exports.createNotification = async ({ userId, type, title, message, link, eventKey, translations, io }) => {
    try {
        const notification = await insertNotification({
            userId,
            type,
            eventKey,
            title,
            message,
            link,
            translations: translations && typeof translations === 'object' ? translations : undefined,
            isRead: false,
        });

        if (io) {
            io.to(`user-${userId}`).emit('new_notification', notification);
        }

        return notification;
    } catch (error) {
        console.error('Error creating notification:', error);
    }
};
