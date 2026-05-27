const { getSupabaseClient } = require('../../lib/supabaseClient');
const { adminAudit } = require('../../middleware/adminAudit');
const { deleteEntityTotally } = require('../../services/adminCleanupService');

function mapEntityRow(row) {
    return {
        _id: row.id,
        user: row.user_id
            ? {
                _id: row.user_id,
                nickname: row?.user?.nickname,
                email: row?.user?.email,
            }
            : null,
        name: row.name,
        stage: row.stage,
        mood: row.mood,
        avatarUrl: row.avatar_url,
        satietyUntil: row.satiety_until,
        history: row.history,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

const getEntities = async (_req, res) => {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from('entities')
            .select('id,user_id,name,stage,mood,avatar_url,satiety_until,created_at,updated_at,history,user:users!entities_user_id_fkey(id,nickname,email)')
            .order('created_at', { ascending: false });
        if (error) {
            return res.status(500).json({ message: error.message });
        }

        const entities = (Array.isArray(data) ? data : []).map((row) => mapEntityRow(row));

        return res.json({ entities });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateEntityAvatar = async (req, res) => {
    try {
        const { id } = req.params;
        const { avatarUrl } = req.body || {};
        if (!avatarUrl) {
            return res.status(400).json({ message: 'avatarUrl is required' });
        }

        const supabase = getSupabaseClient();
        const nowIso = new Date().toISOString();
        const { data: entityRow, error } = await supabase
            .from('entities')
            .update({ avatar_url: avatarUrl.toString().trim(), updated_at: nowIso })
            .eq('id', Number(id))
            .select('id,user_id,name,stage,mood,avatar_url,satiety_until,created_at,updated_at,history,user:users!entities_user_id_fkey(id,nickname,email)')
            .maybeSingle();

        if (error || !entityRow) return res.status(404).json({ message: 'Сущность не найдена' });

        await adminAudit('entity.avatar.update', req, {
            targetId: id,
            userId: entityRow.user_id,
        });

        return res.json({ entity: mapEntityRow(entityRow) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const deleteEntity = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await deleteEntityTotally(id);

        await adminAudit('entity.delete', req, {
            targetId: id,
            userId: result.userId,
        });

        return res.json({ message: 'Сущность удалена' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

module.exports = {
    getEntities,
    updateEntityAvatar,
    deleteEntity,
};
