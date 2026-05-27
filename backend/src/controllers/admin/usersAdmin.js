const bcrypt = require('bcryptjs');
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { adminAudit } = require('../../middleware/adminAudit');
const { deleteUserTotally } = require('../../services/adminCleanupService');
const { revokeAllUserSessions } = require('../../services/authTrackingService');

const getUsers = async (req, res) => {
    try {
        const {
            search,
            role,
            status,
            minLives,
            minStars,
            page = 1,
            limit = 20,
        } = req.query;
        const safePage = Math.max(1, Number(page) || 1);
        const safeLimit = Math.max(1, Math.min(200, Number(limit) || 20));

        const supabase = getSupabaseClient();
        let baseQuery = supabase
            .from('users')
            .select('id,email,nickname,role,status,email_confirmed,created_at,updated_at,data', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range((safePage - 1) * safeLimit, (safePage - 1) * safeLimit + safeLimit - 1);

        if (role) baseQuery = baseQuery.eq('role', String(role));
        if (status) baseQuery = baseQuery.eq('status', String(status));
        if (search) {
            const s = String(search || '').trim();
            if (s) {
                baseQuery = baseQuery.or(`nickname.ilike.%${s}%,email.ilike.%${s}%`);
            }
        }

        const { data: rows, error, count } = await baseQuery;
        if (error) return res.status(500).json({ message: error.message });

        const livesThreshold = minLives !== undefined && minLives !== '' ? Number(minLives) : null;
        const starsThreshold = minStars !== undefined && minStars !== '' ? Number(minStars) : null;
        const filtered = (Array.isArray(rows) ? rows : []).filter((row) => {
            const d = row?.data && typeof row.data === 'object' ? row.data : {};
            const lives = Number(d.lives) || 0;
            const stars = Number(d.stars) || 0;
            if (Number.isFinite(livesThreshold) && lives < livesThreshold) return false;
            if (Number.isFinite(starsThreshold) && stars < starsThreshold) return false;
            return true;
        });

        const users = filtered.map((row) => ({
            _id: row.id,
            email: row.email,
            nickname: row.nickname,
            role: row.role,
            status: row.status,
            emailConfirmed: Boolean(row.email_confirmed),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            ...(row?.data && typeof row.data === 'object' ? row.data : {}),
        }));

        const total = Math.max(0, Number(count) || 0);

        res.json({
            users,
            totalPages: Math.ceil(total / safeLimit),
            currentPage: safePage,
            totalUsers: total,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getUserById = async (req, res) => {
    try {
        const supabase = getSupabaseClient();
        const { data: row, error } = await supabase
            .from('users')
            .select('id,email,nickname,role,status,email_confirmed,created_at,updated_at,data')
            .eq('id', String(req.params.id))
            .maybeSingle();
        if (error || !row) return res.status(404).json({ message: 'Пользователь не найден' });

        const data = row?.data && typeof row.data === 'object' ? row.data : {};
        res.json({
            _id: row.id,
            email: row.email,
            nickname: row.nickname,
            role: row.role,
            status: row.status,
            emailConfirmed: Boolean(row.email_confirmed),
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            ...data,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateUser = async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const supabase = getSupabaseClient();
        const { data: current, error: currentError } = await supabase
            .from('users')
            .select('id,email,nickname,role,status,email_confirmed,created_at,updated_at,data')
            .eq('id', String(id))
            .maybeSingle();
        if (currentError || !current) return res.status(404).json({ message: 'Пользователь не найден' });

        const body = updates && typeof updates === 'object' ? updates : {};
        const nextData = { ...(current.data && typeof current.data === 'object' ? current.data : {}) };

        const columnUpdates = {};
        if (Object.prototype.hasOwnProperty.call(body, 'email')) columnUpdates.email = String(body.email || '').trim().toLowerCase();
        if (Object.prototype.hasOwnProperty.call(body, 'nickname')) columnUpdates.nickname = String(body.nickname || '').trim();
        if (Object.prototype.hasOwnProperty.call(body, 'role')) columnUpdates.role = String(body.role || '').trim();
        if (Object.prototype.hasOwnProperty.call(body, 'status')) columnUpdates.status = String(body.status || '').trim();
        if (Object.prototype.hasOwnProperty.call(body, 'emailConfirmed')) columnUpdates.email_confirmed = Boolean(body.emailConfirmed);
        if (Object.prototype.hasOwnProperty.call(body, 'email_confirmed')) columnUpdates.email_confirmed = Boolean(body.email_confirmed);

        for (const [key, value] of Object.entries(body)) {
            if (['email', 'nickname', 'role', 'status', 'emailConfirmed', 'email_confirmed'].includes(key)) continue;
            nextData[key] = value;
        }

        const nowIso = new Date().toISOString();
        const { data: updated, error } = await supabase
            .from('users')
            .update({
                ...columnUpdates,
                data: nextData,
                updated_at: nowIso,
            })
            .eq('id', String(id))
            .select('id,email,nickname,role,status,email_confirmed,created_at,updated_at,data')
            .maybeSingle();
        if (error || !updated) return res.status(500).json({ message: 'Server error' });

        if (
            Object.prototype.hasOwnProperty.call(columnUpdates, 'status')
            && String(columnUpdates.status || '').trim() === 'banned'
            && String(current.status || '') !== 'banned'
        ) {
            await revokeAllUserSessions({
                userId: id,
                revokedBy: req.user?._id || null,
                reason: 'admin_user_banned',
            });
        }

        await adminAudit('user.update', req, {
            targetId: id,
            nickname: updated.nickname,
            updates: Object.keys(body)
        });

        const outData = updated.data && typeof updated.data === 'object' ? updated.data : {};
        res.json({
            _id: updated.id,
            email: updated.email,
            nickname: updated.nickname,
            role: updated.role,
            status: updated.status,
            emailConfirmed: Boolean(updated.email_confirmed),
            createdAt: updated.created_at,
            updatedAt: updated.updated_at,
            ...outData,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteUser = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await deleteUserTotally(id);

        await adminAudit('user.delete', req, { targetId: id, nickname: result.nickname });

        res.json({ message: 'Пользователь удален' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

const resetUserPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;
        if (!newPassword) return res.status(400).json({ message: 'Новый пароль обязателен' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        const supabase = getSupabaseClient();
        const nowIso = new Date().toISOString();
        const { data: updated, error } = await supabase
            .from('users')
            .update({ password_hash: hashedPassword, updated_at: nowIso })
            .eq('id', String(id))
            .select('id,nickname')
            .maybeSingle();
        if (error || !updated) return res.status(404).json({ message: 'Пользователь не найден' });

        await adminAudit('user.password_reset', req, { targetId: id, nickname: updated.nickname });

        res.json({ message: 'Пароль успешно сброшен' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getUsers,
    getUserById,
    updateUser,
    deleteUser,
    resetUserPassword,
};
