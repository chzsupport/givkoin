const { getSupabaseClient } = require('../../lib/supabaseClient');

const getReferrals = async (req, res) => {
    try {
        const { page = 1, limit = 20, search, status } = req.query;
        const safePage = Math.max(1, Number(page) || 1);
        const safeLimit = Math.max(1, Math.min(200, Number(limit) || 20));

        const supabase = getSupabaseClient();

        let userIdsForSearch = null;
        if (search) {
            const s = String(search || '').trim();
            if (s) {
                const { data: users, error: userError } = await supabase
                    .from('users')
                    .select('id')
                    .or(`nickname.ilike.%${s}%,email.ilike.%${s}%`);
                if (userError) {
                    return res.status(500).json({ message: 'Server error' });
                }
                const ids = (Array.isArray(users) ? users : []).map((u) => String(u?.id || '').trim()).filter(Boolean);
                if (!ids.length) {
                    return res.json({
                        referrals: [],
                        totalPages: 0,
                        currentPage: safePage,
                        totalReferrals: 0,
                        statusCounts: { active: 0, pending: 0, inactive: 0 },
                    });
                }
                userIdsForSearch = ids;
            }
        }

        let baseQuery = supabase
            .from('referrals')
            .select(
                'id,inviter_id,invitee_id,code,invitee_ip,invitee_fingerprint,bonus_granted,confirmed_at,status,checked_at,check_reason,active_since,activity_summary,created_at,updated_at,inviter:users!referrals_inviter_id_fkey(id,nickname,email),invitee:users!referrals_invitee_id_fkey(id,nickname,email,status,data)',
                { count: 'exact' }
            )
            .order('created_at', { ascending: false })
            .range((safePage - 1) * safeLimit, (safePage - 1) * safeLimit + safeLimit - 1);

        if (status) {
            baseQuery = baseQuery.eq('status', String(status));
        }

        if (Array.isArray(userIdsForSearch) && userIdsForSearch.length) {
            const inList = userIdsForSearch.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',');
            baseQuery = baseQuery.or(`inviter_id.in.(${inList}),invitee_id.in.(${inList})`);
        }

        const { data: rows, error, count } = await baseQuery;
        if (error) {
            return res.status(500).json({ message: 'Server error' });
        }

        const referrals = (Array.isArray(rows) ? rows : []).map((row) => {
            const inviteeData = row?.invitee?.data && typeof row.invitee.data === 'object' ? row.invitee.data : {};
            const summary = row?.activity_summary && typeof row.activity_summary === 'object' ? row.activity_summary : {};
            const hasEntity = Boolean(summary?.hasEntity || inviteeData?.entity || inviteeData?.entityId);
            return {
                id: row.id,
                inviter: row.inviter,
                invitee: row.invitee,
                code: row.code,
                inviteeIp: row.invitee_ip,
                inviteeFingerprint: row.invitee_fingerprint,
                bonusGranted: row.bonus_granted,
                confirmedAt: row.confirmed_at,
                status: row.status,
                checkedAt: row.checked_at,
                checkReason: row.check_reason,
                activeSince: row.active_since,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                activitySummary: {
                    visitDays: summary?.visitDays || 0,
                    minutesTotal: summary?.minutesTotal || 0,
                    pagesVisited: summary?.pagesVisited || 0,
                    kDebitActions: summary?.kDebitActions || 0,
                    kCreditActions: summary?.kCreditActions || 0,
                    battleParticipations: summary?.battleParticipations || 0,
                    bigBattleRewards: summary?.bigBattleRewards || 0,
                    newsViews: summary?.newsViews || 0,
                    hasEntity,
                },
            };
        });

        const total = Math.max(0, Number(count) || 0);

        let statusCountsQueryBase = supabase
            .from('referrals')
            .select('id', { head: true, count: 'exact' });
        if (Array.isArray(userIdsForSearch) && userIdsForSearch.length) {
            const inList = userIdsForSearch.map((id) => `"${String(id).replace(/"/g, '')}"`).join(',');
            statusCountsQueryBase = statusCountsQueryBase.or(`inviter_id.in.(${inList}),invitee_id.in.(${inList})`);
        }

        const [activeCountRes, pendingCountRes, inactiveCountRes] = await Promise.all([
            statusCountsQueryBase.eq('status', 'active'),
            statusCountsQueryBase.eq('status', 'pending'),
            statusCountsQueryBase.eq('status', 'inactive'),
        ]);

        const statusCounts = {
            active: Math.max(0, Number(activeCountRes?.count) || 0),
            pending: Math.max(0, Number(pendingCountRes?.count) || 0),
            inactive: Math.max(0, Number(inactiveCountRes?.count) || 0),
        };

        return res.json({
            referrals,
            totalPages: Math.ceil(total / safeLimit),
            currentPage: safePage,
            totalReferrals: total,
            statusCounts,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getReferrals,
};
