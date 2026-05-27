const { getSupabaseClient } = require('../../lib/supabaseClient');
const { adminAudit } = require('../../middleware/adminAudit');
const {
    getDocByModelAndId,
    listAllDocsByModel,
    updateDocByModel,
} = require('../../services/documentStore');
const { updateEntityMoodForUser } = require('../../services/entityMoodService');
const { recordTransaction, awardReferralBlessingExternal } = require('../../services/kService');
const { getNumericSettingValue } = require('../../services/settingsRegistryService');
const { applyPenalty } = require('../../utils/penalties');
const { getUsersByIds, toId } = require('./userLookup');

function stripStoredDocFields(doc) {
    const next = doc && typeof doc === 'object' ? { ...doc } : {};
    delete next._id;
    delete next.id;
    delete next.createdAt;
    delete next.updatedAt;
    return next;
}

async function updateModelDoc(model, id, patch) {
    if (!id || !patch || typeof patch !== 'object') return null;

    const current = await getDocByModelAndId(model, id);
    if (!current) return null;

    const next = { ...stripStoredDocFields(current), ...patch };
    return updateDocByModel(model, id, next).catch(() => null);
}

async function getUserRowById(userId) {
    if (!userId) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,data')
        .eq('id', String(userId))
        .maybeSingle();
    if (error) return null;
    return data || null;
}

async function updateUserDataById(userId, patch) {
    if (!userId || !patch || typeof patch !== 'object') return null;

    const row = await getUserRowById(userId);
    if (!row) return null;

    const existing = row.data && typeof row.data === 'object' ? row.data : {};
    const nextData = { ...existing, ...patch };
    const nowIso = new Date().toISOString();
    const supabase = getSupabaseClient();
    const { data: updated, error } = await supabase
        .from('users')
        .update({ data: nextData, updated_at: nowIso })
        .eq('id', String(userId))
        .select('id,data')
        .maybeSingle();
    if (error) return null;
    return updated || null;
}

const getAppeals = async (req, res) => {
    try {
        const { status } = req.query;
        const statusAlias = {
            inProgress: 'pending',
            confirmed: 'resolved',
            declined: 'rejected',
        };
        const normalizedStatus = statusAlias[String(status || '').trim()] || status;
        const all = await listAllDocsByModel('Appeal', { pageSize: 1000 });
        const filtered = all.filter((row) => {
            if (!normalizedStatus) return true;
            return String(row?.status || '') === String(normalizedStatus);
        });
        filtered.sort((a, b) => {
            const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
            const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
            return bTime - aTime;
        });

        const userIds = Array.from(new Set(
            filtered
                .flatMap((a) => [toId(a?.complainant), toId(a?.againstUser)])
                .filter(Boolean)
        ));
        const usersById = await getUsersByIds(userIds);

        const appeals = filtered.map((row) => {
            const complainantId = toId(row?.complainant);
            const againstId = toId(row?.againstUser);
            const complainant = complainantId ? usersById.get(complainantId) : null;
            const againstUser = againstId ? usersById.get(againstId) : null;
            return {
                ...row,
                complainant: complainant
                    ? { _id: complainant.id, nickname: complainant.nickname, email: complainant.email }
                    : row.complainant,
                againstUser: againstUser
                    ? { _id: againstUser.id, nickname: againstUser.nickname, email: againstUser.email }
                    : row.againstUser,
            };
        });

        res.json(appeals);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const handleAppeal = async (req, res) => {
    try {
        const { id } = req.params;
        const { action } = req.body; // 'confirm' or 'cancel'

        const appeal = await getDocByModelAndId('Appeal', id);
        if (!appeal) return res.status(404).json({ message: 'Апелляция не найдена' });
        if (appeal.status !== 'pending') return res.status(400).json({ message: 'Апелляция уже обработана' });

        if (action === 'confirm') {
            const penalty = await applyPenalty(appeal.againstUser);
            const saved = await updateModelDoc('Appeal', appeal._id, {
                status: 'resolved',
                penaltyApplied: true,
                resolvedAt: new Date(),
            });
            if (!saved) return res.status(500).json({ message: 'Server error' });

            updateEntityMoodForUser(appeal.againstUser).catch(() => { });
            await adminAudit('appeal.handle', req, { appealId: id, action, againstUser: appeal.againstUser });
            return res.json({ ok: true, status: saved.status, penalty });
        }

        if (action === 'cancel' || action === 'decline') {
            const compensationAmount = await getNumericSettingValue('K_APPEAL_COMPENSATION', 100);
            const COMPENSATION_MONTH_LIMIT = 15;
            const monthAgo = new Date(Date.now() - 24 * 30 * 60 * 60 * 1000);

            const userId = String(appeal.againstUser);
            if (userId) {
                const allAppeals = await listAllDocsByModel('Appeal', { pageSize: 1000 });
                const compensationCount = allAppeals.filter((row) => {
                    if (String(row?.againstUser || '') !== String(userId)) return false;
                    if (String(row?.status || '') !== 'rejected') return false;
                    const resolvedAt = row?.resolvedAt ? new Date(row.resolvedAt) : null;
                    if (!resolvedAt || Number.isNaN(resolvedAt.getTime())) return false;
                    return resolvedAt.getTime() >= monthAgo.getTime();
                }).length;
                if (compensationCount < COMPENSATION_MONTH_LIMIT) {
                    const row = await getUserRowById(userId);
                    if (row) {
                        const data = row.data && typeof row.data === 'object' ? row.data : {};
                        const nextK = (Number(data.k) || 0) + compensationAmount;
                        await updateUserDataById(userId, { k: nextK });
                        await recordTransaction({
                            userId,
                            type: 'appeal_compensation',
                            direction: 'credit',
                            amount: compensationAmount,
                            currency: 'K',
                            description: 'Компенсация за ложную жалобу',
                            relatedEntity: id,
                        }).catch(() => null);
                        awardReferralBlessingExternal({
                            receiverUserId: userId,
                            amount: compensationAmount,
                            sourceType: 'appeal_compensation',
                            relatedEntity: id,
                        }).catch(() => null);
                    }
                }
            }

            const saved = await updateModelDoc('Appeal', appeal._id, {
                status: 'rejected',
                resolvedAt: new Date(),
            });
            if (!saved) return res.status(500).json({ message: 'Server error' });

            updateEntityMoodForUser(appeal.againstUser).catch(() => { });
            await adminAudit('appeal.handle', req, { appealId: id, action });
            return res.json({ ok: true, status: saved.status });
        }

        return res.status(400).json({ message: 'action must be confirm|cancel' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getAppeals,
    handleAppeal,
};
