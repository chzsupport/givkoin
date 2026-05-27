const { getSupabaseClient } = require('../../lib/supabaseClient');
const { adminAudit } = require('../../middleware/adminAudit');
const {
    deleteDocsByModel,
    listDocsByModel,
} = require('../../services/documentStore');

exports.getCrystalStats = async (req, res) => {
    try {
        const crystalCtrl = require('../crystalController');
        const sessionStart = crystalCtrl.getCrystalSessionStart();
        const supabase = getSupabaseClient();
        const progressRows = await listDocsByModel('UserCrystalProgress', { limit: 5000 });

        const stats = (progressRows || [])
            .filter((row) => {
                const lastReset = row.lastResetDate ? new Date(row.lastResetDate) : null;
                return lastReset && lastReset >= sessionStart;
            });

        const userIds = stats.map((s) => s.userId).filter(Boolean);
        const { data: userRows } = await supabase
            .from('users')
            .select('id,nickname')
            .in('id', userIds);

        const userMap = new Map((userRows || []).map((row) => [String(row.id), row.nickname]));

        const users = stats
            .filter(s => s.collectedShards && s.collectedShards.length > 0)
            .map(s => ({
                userId: s.userId,
                nickname: userMap.get(String(s.userId)) || 'Удаленный пользователь',
                collectedCount: s.collectedShards.length,
                isComplete: s.collectedShards.length === 12,
                reviewStatus: s.reviewStatus || 'clean',
                mismatchCount: Math.max(0, Number(s.mismatchCount) || 0),
            }))
            .sort((a, b) => b.collectedCount - a.collectedCount);

        const suspicious = stats
            .filter((s) => String(s.reviewStatus || 'clean') === 'pending' && (Number(s.mismatchCount) || 0) > 0)
            .map((s) => ({
                userId: s.userId,
                nickname: userMap.get(String(s.userId)) || 'Удаленный пользователь',
                collectedCount: Array.isArray(s.collectedShards) ? s.collectedShards.length : 0,
                mismatchCount: Math.max(0, Number(s.mismatchCount) || 0),
                mismatchDetails: Array.isArray(s.mismatchDetails) ? s.mismatchDetails : [],
                reviewQueuedAt: s.reviewQueuedAt || null,
            }))
            .sort((a, b) => b.mismatchCount - a.mismatchCount);

        res.json({ users, suspicious });
    } catch (error) {
        console.error('[Admin] getCrystalStats error:', error);
        res.status(500).json({ message: error.message });
    }
};

exports.getCrystalLocations = async (req, res) => {
    try {
        const crystalCtrl = require('../crystalController');
        const daily = await crystalCtrl.generateDailyShards();
        res.json({ locations: daily ? daily.locations : [] });
    } catch (error) {
        console.error('[Admin] getCrystalLocations error:', error);
        res.status(500).json({ message: error.message });
    }
};

exports.forceGenerateCrystals = async (req, res) => {
    try {
        const crystalCtrl = require('../crystalController');
        const sessionStart = crystalCtrl.getCrystalSessionStart();
        const daily = await crystalCtrl.generateDailyShards(true);
        const progressRows = await listDocsByModel('UserCrystalProgress', { limit: 5000 });

        let deletedCount = 0;
        if (progressRows) {
            const toDelete = progressRows.filter((row) => {
                const lastReset = row.lastResetDate ? new Date(row.lastResetDate) : null;
                return lastReset && lastReset >= sessionStart;
            });
            deletedCount = await deleteDocsByModel('UserCrystalProgress', toDelete.map((row) => row._id));
        }

        await adminAudit('crystal.generate_force', req, {
            date: daily.date,
            shardsCount: daily.locations.length,
            usersReset: deletedCount,
        });

        res.json({
            ok: true,
            locations: daily.locations,
            message: `Кристаллы пересозданы. Прогресс ${deletedCount} пользователей сброшен.`,
        });
    } catch (error) {
        console.error('[Admin] forceGenerateCrystals error:', error);
        res.status(500).json({ message: error.message });
    }
};
