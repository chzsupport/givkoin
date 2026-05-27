const { getSupabaseClient } = require('../../lib/supabaseClient');
const { deleteWishTotally } = require('../../services/adminCleanupService');
const { getUsersByIds } = require('./userLookup');

function mapWishRowToAdminDto(row, usersById) {
    if (!row) return null;
    const author = row.author_id ? usersById.get(String(row.author_id)) : null;
    const executor = row.executor_id ? usersById.get(String(row.executor_id)) : null;
    return {
        _id: row.id,
        author: author ? { _id: author.id, nickname: author.nickname, email: author.email } : (row.author_id ? { _id: row.author_id } : null),
        executor: executor ? { _id: executor.id, nickname: executor.nickname, email: executor.email } : (row.executor_id ? { _id: row.executor_id } : null),
        text: row.text,
        status: row.status,
        supportCount: row.support_count ?? 0,
        supportK: Number(row.support_k ?? 0),
        language: row.language ?? undefined,
        costK: Number(row.cost_k ?? 0),
        executorContact: row.executor_contact ?? undefined,
        takenAt: row.taken_at ? new Date(row.taken_at) : null,
        fulfilledAt: row.fulfilled_at ? new Date(row.fulfilled_at) : null,
        createdAt: row.created_at ? new Date(row.created_at) : null,
        updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    };
}

const getWishes = async (req, res) => {
    try {
        const { status, authorId, page = 1, limit = 50 } = req.query;
        const supabase = getSupabaseClient();
        const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
        const safePage = Math.max(1, Number(page) || 1);
        const from = (safePage - 1) * safeLimit;
        const to = from + safeLimit - 1;

        let base = supabase.from('wishes');
        let listQuery = base.select('*').order('created_at', { ascending: false }).range(from, to);
        let countQuery = base.select('id', { head: true, count: 'exact' });

        if (status) {
            listQuery = listQuery.eq('status', String(status));
            countQuery = countQuery.eq('status', String(status));
        }
        if (authorId) {
            listQuery = listQuery.eq('author_id', String(authorId));
            countQuery = countQuery.eq('author_id', String(authorId));
        }

        const [{ data: wishRows, error: listError }, { count, error: countError }] = await Promise.all([
            listQuery,
            countQuery,
        ]);
        if (listError || countError) {
            return res.status(500).json({ message: 'Не удалось получить желания' });
        }

        const idsToHydrate = [];
        for (const row of (Array.isArray(wishRows) ? wishRows : [])) {
            if (row?.author_id) idsToHydrate.push(row.author_id);
            if (row?.executor_id) idsToHydrate.push(row.executor_id);
        }
        const usersById = await getUsersByIds(idsToHydrate);

        const wishes = (Array.isArray(wishRows) ? wishRows : []).map((row) => mapWishRowToAdminDto(row, usersById));
        const total = Number(count || 0);

        res.json({
            wishes,
            totalPages: Math.ceil(total / safeLimit),
            currentPage: safePage,
            totalWishes: total,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateWish = async (req, res) => {
    try {
        const { id } = req.params;
        const supabase = getSupabaseClient();
        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const patch = {};
        if (Object.prototype.hasOwnProperty.call(body, 'text')) patch.text = String(body.text ?? '');
        if (Object.prototype.hasOwnProperty.call(body, 'status')) patch.status = String(body.status ?? '');
        if (Object.prototype.hasOwnProperty.call(body, 'supportCount')) patch.support_count = Number(body.supportCount) || 0;
        if (Object.prototype.hasOwnProperty.call(body, 'supportK')) patch.support_k = Number(body.supportK) || 0;
        if (Object.prototype.hasOwnProperty.call(body, 'language')) patch.language = body.language ? String(body.language) : null;
        if (Object.prototype.hasOwnProperty.call(body, 'costK')) patch.cost_k = Number(body.costK) || 0;
        if (Object.prototype.hasOwnProperty.call(body, 'executor')) patch.executor_id = body.executor ? String(body.executor) : null;
        if (Object.prototype.hasOwnProperty.call(body, 'executorContact')) patch.executor_contact = body.executorContact ? String(body.executorContact) : null;
        if (Object.prototype.hasOwnProperty.call(body, 'takenAt')) patch.taken_at = body.takenAt ? new Date(body.takenAt).toISOString() : null;
        if (Object.prototype.hasOwnProperty.call(body, 'fulfilledAt')) patch.fulfilled_at = body.fulfilledAt ? new Date(body.fulfilledAt).toISOString() : null;
        patch.updated_at = new Date().toISOString();

        const { data: updatedRow, error } = await supabase
            .from('wishes')
            .update(patch)
            .eq('id', String(id))
            .select('*')
            .maybeSingle();
        if (error || !updatedRow) return res.status(404).json({ message: 'Желание не найдено' });

        const usersById = await getUsersByIds([updatedRow.author_id, updatedRow.executor_id]);
        const wish = mapWishRowToAdminDto(updatedRow, usersById);
        res.json(wish);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteWish = async (req, res) => {
    try {
        await deleteWishTotally(req.params.id);
        res.json({ message: 'Желание удалено' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

module.exports = {
    getWishes,
    updateWish,
    deleteWish,
};
