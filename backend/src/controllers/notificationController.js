const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

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

function applyNotificationFilters(query, userId, filters = {}, { unreadOnly = false } = {}) {
    let next = query
        .eq('model', 'Notification')
        .eq('data->>userId', String(userId));

    const types = Array.isArray(filters.type) ? filters.type.filter(Boolean) : [];
    if (types.length === 1) {
        next = next.eq('data->>type', types[0]);
    } else if (types.length > 1) {
        next = next.in('data->>type', types);
    }

    const eventKeys = Array.isArray(filters.eventKey) ? filters.eventKey.filter(Boolean) : [];
    if (eventKeys.length === 1) {
        next = next.eq('data->>eventKey', eventKeys[0]);
    } else if (eventKeys.length > 1) {
        next = next.in('data->>eventKey', eventKeys);
    }

    if (unreadOnly) {
        next = next.eq('data->>isRead', 'false');
    }

    return next;
}

function mapNotificationRow(row) {
    return {
        _id: row.id,
        ...(row.data || {}),
        createdAt: row.created_at,
    };
}

async function listNotifications(userId, filters, page, limit) {
    const supabase = getSupabaseClient();
    const offset = (page - 1) * limit;

    const listQuery = applyNotificationFilters(
        supabase
            .from(DOC_TABLE)
            .select('id,data,created_at'),
        userId,
        filters
    )
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    const totalQuery = applyNotificationFilters(
        supabase
            .from(DOC_TABLE)
            .select('id', { head: true, count: 'exact' }),
        userId,
        filters
    );

    const unreadQuery = applyNotificationFilters(
        supabase
            .from(DOC_TABLE)
            .select('id', { head: true, count: 'exact' }),
        userId,
        filters,
        { unreadOnly: true }
    );

    const [
        { data, error },
        { count: totalCount, error: totalError },
        { count: unreadCountValue, error: unreadError },
    ] = await Promise.all([listQuery, totalQuery, unreadQuery]);

    if (error || totalError || unreadError || !Array.isArray(data)) {
        return { notifications: [], total: 0, unreadCount: 0 };
    }

    return {
        notifications: data.map(mapNotificationRow),
        total: Math.max(0, Number(totalCount) || 0),
        unreadCount: Math.max(0, Number(unreadCountValue) || 0),
    };
}

async function countUnreadNotifications(userId, filters) {
    const supabase = getSupabaseClient();
    const { count, error } = await applyNotificationFilters(
        supabase
            .from(DOC_TABLE)
            .select('id', { head: true, count: 'exact' }),
        userId,
        filters,
        { unreadOnly: true }
    );

    if (error) {
        return 0;
    }

    return Math.max(0, Number(count) || 0);
}

async function loadNotificationsToMarkRead(userId, filters) {
    const supabase = getSupabaseClient();
    const ids = Array.isArray(filters.ids)
        ? Array.from(new Set(filters.ids.map((value) => String(value || '').trim()).filter(Boolean)))
        : [];
    const scopedFilters = ids.length > 0
        ? {}
        : filters;
    const rows = [];
    const pageSize = 200;
    let from = 0;

    while (true) {
        let query = applyNotificationFilters(
            supabase
                .from(DOC_TABLE)
                .select('id,data,created_at'),
            userId,
            scopedFilters,
            { unreadOnly: true }
        );

        if (ids.length === 1) {
            query = query.eq('id', ids[0]);
        } else if (ids.length > 1) {
            query = query.in('id', ids);
        }

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .range(from, from + pageSize - 1);

        if (error || !Array.isArray(data) || data.length === 0) {
            break;
        }

        rows.push(...data);
        if (data.length < pageSize) {
            break;
        }
        from += pageSize;
    }

    return rows;
}

async function markNotificationsRead(userId, filters) {
    const supabase = getSupabaseClient();
    const rows = await loadNotificationsToMarkRead(userId, filters);
    if (!rows.length) return;

    const nowIso = new Date().toISOString();

    for (let index = 0; index < rows.length; index += 25) {
        const chunk = rows.slice(index, index + 25);
        const results = await Promise.all(
            chunk.map((row) => supabase
                .from(DOC_TABLE)
                .update({ data: { ...(row.data || {}), isRead: true }, updated_at: nowIso })
                .eq('id', row.id))
        );

        const failed = results.find((result) => result?.error);
        if (failed?.error) {
            throw new Error(failed.error.message);
        }
    }
}

async function insertNotification(doc) {
    const supabase = getSupabaseClient();
    const id = `notif_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    await supabase.from(DOC_TABLE).insert({
        model: 'Notification',
        id,
        data: doc,
        created_at: nowIso,
        updated_at: nowIso,
    });
    return { ...doc, _id: id, createdAt: nowIso };
}

exports.getNotifications = async (req, res, next) => {
    try {
        const userId = req.user._id;
        const page = parsePositiveInt(req.query.page, 1);
        const limit = parsePositiveInt(req.query.limit, 20);

        const type = parseMultiValueFilter(req.query.type);
        const eventKey = parseMultiValueFilter(req.query.eventKey);

        const { notifications, total, unreadCount } = await listNotifications(userId, { type, eventKey }, page, limit);

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
