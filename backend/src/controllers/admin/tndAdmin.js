const { getSupabaseClient } = require('../../lib/supabaseClient');
const {
    DAY_ACTIVE_MINUTES,
    DAY_ACTIVE_K_ACTIONS,
    DAY_ACTIVE_PAGES,
    REFERRAL_WINDOW_DAYS,
    REFERRAL_MIN_VISIT_DAYS,
    REFERRAL_MIN_K_DEBITS,
    REFERRAL_MIN_K_CREDITS,
    REFERRAL_MIN_BATTLES,
    REFERRAL_MIN_BIG_BATTLE_REWARDS,
    REFERRAL_MIN_NEWS_VIEWS,
    getPreviousDayRangeUtc,
} = require('../../services/activityQualificationService');
const {
    countDocsByModel,
    listDocsByModel,
} = require('../../services/documentStore');
const { getUsersByIds, toId } = require('./userLookup');

function normalizeTndSummary(summary = {}) {
    const source = summary && typeof summary === 'object' ? summary : {};
    return {
        visitDays: Number(source.visitDays) || 0,
        minutesTotal: Number(source.minutesTotal) || 0,
        pagesVisited: Number(source.pagesVisited) || 0,
        kDebitActions: Number(source.kDebitActions) || 0,
        kCreditActions: Number(source.kCreditActions) || 0,
        kActionCount: Number(source.kActionCount) || 0,
        battleParticipations: Number(source.battleParticipations) || 0,
        bigBattleRewards: Number(source.bigBattleRewards) || 0,
        newsViews: Number(source.newsViews) || 0,
        radianceActions: Number(source.radianceActions) || 0,
        hasEntity: Boolean(source.hasEntity),
    };
}

const getTndStats = async (req, res) => {
    try {
        const supabase = getSupabaseClient();
        const defaultRange = getPreviousDayRangeUtc(new Date());
        const dayKey = String(req.query?.dayKey || defaultRange.key || '').trim();
        const dailyPage = Math.max(1, Number(req.query?.dailyPage) || 1);
        const dailyLimit = Math.max(1, Math.min(100, Number(req.query?.dailyLimit) || 20));
        const referralPage = Math.max(1, Number(req.query?.referralPage) || 1);
        const referralLimit = Math.max(1, Math.min(100, Number(req.query?.referralLimit) || 20));
        const referralStatus = String(req.query?.referralStatus || '').trim();

        const dailyFrom = (dailyPage - 1) * dailyLimit;
        const referralFrom = (referralPage - 1) * referralLimit;

        const [
            dailyRows,
            dailyTotalCount,
            dailyPassedCount,
            dailyFailedCount,
            activeUsersRes,
        ] = await Promise.all([
            listDocsByModel('UserDailyActivityReport', {
                dataEq: { dayKey },
                orderBy: 'updated_at',
                ascending: false,
                limit: dailyLimit,
                offset: dailyFrom,
            }),
            countDocsByModel('UserDailyActivityReport', { dataEq: { dayKey } }),
            countDocsByModel('UserDailyActivityReport', { dataEq: { dayKey, passed: true } }),
            countDocsByModel('UserDailyActivityReport', { dataEq: { dayKey, passed: false } }),
            supabase
                .from('users')
                .select('id', { head: true, count: 'exact' })
                .eq('status', 'active')
                .eq('email_confirmed', true),
        ]);

        const dailyUsers = await getUsersByIds(dailyRows.map((row) => row.userId).filter(Boolean));
        const dailyItems = dailyRows.map((row) => {
            const userId = toId(row.userId);
            const user = userId ? dailyUsers.get(userId) : null;
            return {
                _id: row._id,
                user: user ? { _id: user.id, nickname: user.nickname, email: user.email } : (userId ? { _id: userId } : null),
                dayKey: row.dayKey || dayKey,
                passed: Boolean(row.passed),
                reason: row.reason || '',
                summary: normalizeTndSummary(row.summary || {}),
                updatedAt: row.updatedAt || null,
            };
        });

        let referralQuery = supabase
            .from('referrals')
            .select(
                'id,inviter_id,invitee_id,status,checked_at,check_reason,active_since,activity_summary,created_at,updated_at,inviter:users!referrals_inviter_id_fkey(id,nickname,email),invitee:users!referrals_invitee_id_fkey(id,nickname,email,status,data)',
                { count: 'exact' }
            )
            .order('checked_at', { ascending: false, nullsFirst: false })
            .range(referralFrom, referralFrom + referralLimit - 1);
        if (referralStatus) {
            referralQuery = referralQuery.eq('status', referralStatus);
        }
        const referralRowsRes = await referralQuery;

        const referralRows = (Array.isArray(referralRowsRes.data) ? referralRowsRes.data : []).map((row) => {
            const inviteeData = row?.invitee?.data && typeof row.invitee.data === 'object' ? row.invitee.data : {};
            const summary = normalizeTndSummary(row?.activity_summary || {});
            summary.hasEntity = Boolean(summary.hasEntity || inviteeData?.entity || inviteeData?.entityId);
            return {
                id: row.id,
                inviter: row.inviter,
                invitee: row.invitee,
                status: row.status,
                checkedAt: row.checked_at,
                checkReason: row.check_reason,
                activeSince: row.active_since,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
                activitySummary: summary,
            };
        });

        const buildReferralCount = (statusValue = null) => {
            let query = supabase
                .from('referrals')
                .select('id', { head: true, count: 'exact' });
            if (statusValue) query = query.eq('status', statusValue);
            return query;
        };

        const [refTotalRes, refActiveRes, refPendingRes, refInactiveRes, activeReferralRowsRes] = await Promise.all([
            buildReferralCount(null),
            buildReferralCount('active'),
            buildReferralCount('pending'),
            buildReferralCount('inactive'),
            supabase
                .from('referrals')
                .select('inviter_id')
                .eq('status', 'active')
                .limit(5000),
        ]);

        const inviterCounts = new Map();
        (Array.isArray(activeReferralRowsRes.data) ? activeReferralRowsRes.data : []).forEach((row) => {
            const inviterId = toId(row.inviter_id);
            if (!inviterId) return;
            inviterCounts.set(inviterId, (inviterCounts.get(inviterId) || 0) + 1);
        });
        const topRaw = Array.from(inviterCounts.entries())
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .slice(0, 10);
        const topUsers = await getUsersByIds(topRaw.map(([userId]) => userId));
        const topReferrers = topRaw.map(([userId, count]) => {
            const user = topUsers.get(String(userId));
            return {
                user: user ? { _id: user.id, nickname: user.nickname, email: user.email } : { _id: userId },
                activeReferrals: Number(count) || 0,
            };
        });

        const dailyTotal = Math.max(0, Number(dailyTotalCount) || 0);
        const activeUsersTotal = Math.max(0, Number(activeUsersRes.count) || 0);
        const referralFilteredTotal = Math.max(0, Number(referralRowsRes.count) || 0);

        return res.json({
            rules: {
                daily: {
                    minutes: DAY_ACTIVE_MINUTES,
                    kActions: DAY_ACTIVE_K_ACTIONS,
                    pages: DAY_ACTIVE_PAGES,
                },
                referral: {
                    windowDays: REFERRAL_WINDOW_DAYS,
                    visitDays: REFERRAL_MIN_VISIT_DAYS,
                    kDebits: REFERRAL_MIN_K_DEBITS,
                    kCredits: REFERRAL_MIN_K_CREDITS,
                    battles: REFERRAL_MIN_BATTLES,
                    bigBattleRewards: REFERRAL_MIN_BIG_BATTLE_REWARDS,
                    newsViews: REFERRAL_MIN_NEWS_VIEWS,
                },
            },
            daily: {
                dayKey,
                totalReports: dailyTotal,
                passed: Math.max(0, Number(dailyPassedCount) || 0),
                failed: Math.max(0, Number(dailyFailedCount) || 0),
                activeUsersTotal,
                uncheckedActiveUsers: Math.max(0, activeUsersTotal - dailyTotal),
                rows: dailyItems,
                pagination: {
                    page: dailyPage,
                    limit: dailyLimit,
                    total: dailyTotal,
                    totalPages: Math.max(1, Math.ceil(dailyTotal / dailyLimit)),
                },
            },
            referrals: {
                total: Math.max(0, Number(refTotalRes.count) || 0),
                active: Math.max(0, Number(refActiveRes.count) || 0),
                pending: Math.max(0, Number(refPendingRes.count) || 0),
                inactive: Math.max(0, Number(refInactiveRes.count) || 0),
                rows: referralRows,
                topReferrers,
                pagination: {
                    page: referralPage,
                    limit: referralLimit,
                    total: referralFilteredTotal,
                    totalPages: Math.max(1, Math.ceil(referralFilteredTotal / referralLimit)),
                },
            },
        });
    } catch (error) {
        return res.status(500).json({ message: error.message || 'Ошибка сервера' });
    }
};

module.exports = {
    getTndStats,
};
