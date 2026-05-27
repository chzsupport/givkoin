const { getSupabaseClient } = require('../../lib/supabaseClient');
const {
    countDocsByModel,
    listDocsByModel,
} = require('../../services/documentStore');

function toId(value, depth = 0) {
    if (depth > 3) return '';
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (typeof value === 'object') {
        if (value._id != null) return toId(value._id, depth + 1);
        if (value.id != null) return toId(value.id, depth + 1);
        if (value.value != null) return toId(value.value, depth + 1);
        if (typeof value.toString === 'function') {
            const s = value.toString();
            if (s && s !== '[object Object]') return s;
        }
    }
    return '';
}

async function getUsersByIds(ids) {
    const list = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => toId(id)).filter(Boolean)));
    if (!list.length) return new Map();
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,nickname,email')
        .in('id', list);
    if (error) return new Map();
    return new Map((Array.isArray(data) ? data : []).map((row) => [String(row.id), row]));
}

function getAuditPagination(query) {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query?.limit) || 50));
    return {
        limit,
        page,
        skip: (page - 1) * limit,
    };
}

function getAuditDateFilters(query, dateField) {
    const dataEq = {};
    const dataGte = {};
    const dataLte = {};

    if (query?.userId) {
        dataEq.user = String(query.userId);
    }
    if (query?.from) {
        dataGte[dateField] = String(query.from);
    }
    if (query?.to) {
        dataLte[dateField] = String(query.to);
    }

    return { dataEq, dataGte, dataLte };
}

exports.getPracticeGratitudeAudit = async (req, res) => {
    try {
        const { page, limit, skip } = getAuditPagination(req.query);
        const { dataEq, dataGte, dataLte } = getAuditDateFilters(req.query, 'dayKey');

        const [rows, count] = await Promise.all([
            listDocsByModel('PracticeGratitudeDaily', {
                dataEq,
                dataGte,
                dataLte,
                orderBy: 'data->>dayKey',
                ascending: false,
                limit,
                offset: skip,
            }),
            countDocsByModel('PracticeGratitudeDaily', { dataEq, dataGte, dataLte }),
        ]);
        const userMap = await getUsersByIds(rows.map((row) => row?.user).filter(Boolean));
        const items = rows.map((row) => {
            const uid = toId(row?.user);
            const user = uid ? userMap.get(uid) : null;
            const completedIndexes = Array.isArray(row?.completedIndexes)
                ? row.completedIndexes.map((value) => Number(value)).filter(Number.isInteger).sort((a, b) => a - b)
                : [];
            return {
                _id: row._id,
                user: user ? { _id: user.id, nickname: user.nickname, email: user.email } : (uid ? { _id: uid } : null),
                dayKey: row.dayKey || null,
                completedIndexes,
                completedCount: completedIndexes.length,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
            };
        });

        return res.json({
            rows: items,
            pagination: {
                page,
                limit,
                total: Math.max(0, Number(count) || 0),
            },
        });
    } catch (error) {
        return res.status(500).json({ message: error.message || 'Ошибка сервера' });
    }
};

exports.getAttendanceAudit = async (req, res) => {
    try {
        const { page, limit, skip } = getAuditPagination(req.query);
        const { dataEq, dataGte, dataLte } = getAuditDateFilters(req.query, 'lastSeenServerDay');

        const [rows, count] = await Promise.all([
            listDocsByModel('DailyStreakState', {
                dataEq,
                dataGte,
                dataLte,
                orderBy: 'updated_at',
                ascending: false,
                limit,
                offset: skip,
            }),
            countDocsByModel('DailyStreakState', { dataEq, dataGte, dataLte }),
        ]);
        const userMap = await getUsersByIds(rows.map((row) => row?.user).filter(Boolean));
        const items = rows.map((row) => {
            const uid = toId(row?.user);
            const user = uid ? userMap.get(uid) : null;
            const claimedDays = Array.isArray(row?.claimedDays) ? row.claimedDays.map(Number).filter(Number.isInteger).sort((a, b) => a - b) : [];
            const missedDays = Array.isArray(row?.missedDays) ? row.missedDays.map(Number).filter(Number.isInteger).sort((a, b) => a - b) : [];
            const questDoneDays = Array.isArray(row?.questDoneDays) ? row.questDoneDays.map(Number).filter(Number.isInteger).sort((a, b) => a - b) : [];
            const currentDayIndex = row?.cycleStartDay && row?.lastSeenServerDay
                ? Math.max(1, Math.min(30, Math.floor((new Date(`${row.lastSeenServerDay}T00:00:00.000Z`).getTime() - new Date(`${row.cycleStartDay}T00:00:00.000Z`).getTime()) / (24 * 60 * 60 * 1000)) + 1))
                : 1;
            return {
                _id: row._id,
                user: user ? { _id: user.id, nickname: user.nickname, email: user.email } : (uid ? { _id: uid } : null),
                cycleStartDay: row.cycleStartDay || null,
                lastSeenServerDay: row.lastSeenServerDay || null,
                lastWelcomeShownServerDay: row.lastWelcomeShownServerDay || null,
                claimedDays,
                missedDays,
                questDoneDays,
                currentDayIndex,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
            };
        });

        return res.json({
            rows: items,
            pagination: {
                page,
                limit,
                total: Math.max(0, Number(count) || 0),
            },
        });
    } catch (error) {
        return res.status(500).json({ message: error.message || 'Ошибка сервера' });
    }
};
