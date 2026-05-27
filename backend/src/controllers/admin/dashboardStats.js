const { getSupabaseClient } = require('../../lib/supabaseClient');
const { listAllDocsByModel } = require('../../services/documentStore');
const { forEachUserBatch } = require('../../services/userBatchService');

const getStats = async (_req, res) => {
    try {
        const supabase = getSupabaseClient();
        const { count: totalUsers } = await supabase
            .from('users')
            .select('id', { head: true, count: 'exact' });

        const dayStart = new Date(new Date().setHours(0, 0, 0, 0));
        const { count: newUsersToday } = await supabase
            .from('users')
            .select('id', { head: true, count: 'exact' })
            .gte('created_at', dayStart.toISOString());
        const appeals = await listAllDocsByModel('Appeal', { pageSize: 1000 });
        const activeAppeals = appeals.filter((row) => String(row?.status || '') === 'pending').length;

        let totalKValue = 0;
        await forEachUserBatch({
            pageSize: 500,
            map: (user) => Number(user?.k) || 0,
            handler: async (batch) => {
                for (const k of batch) {
                    totalKValue += k;
                }
            },
        });

        const last7Days = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);

            const { count } = await supabase
                .from('users')
                .select('id', { head: true, count: 'exact' })
                .gte('created_at', date.toISOString())
                .lt('created_at', nextDate.toISOString());
            last7Days.push({
                name: date.toLocaleDateString('ru-RU', { weekday: 'short' }),
                users: count,
                date: date.toISOString().split('T')[0]
            });
        }

        res.json({
            totalUsers,
            newUsersToday,
            activeAppeals,
            totalK: totalKValue,
            activityChart: last7Days
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getStats,
};
