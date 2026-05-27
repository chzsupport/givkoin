function getBattleHistorySortTime(battle) {
    if (battle?.endsAt) return new Date(battle.endsAt).getTime();
    if (battle?.updatedAt) return new Date(battle.updatedAt).getTime();
    return 0;
}

function buildUserBattleHistoryList({ battles, userId, limit = 50 }) {
    const safeUserId = String(userId || '');
    return (Array.isArray(battles) ? battles : [])
        .filter((battle) => {
            if (String(battle?.status || '') !== 'finished') return false;
            const attendance = Array.isArray(battle.attendance) ? battle.attendance : [];
            return attendance.some((row) => String(row?.user || '') === safeUserId);
        })
        .sort((a, b) => getBattleHistorySortTime(b) - getBattleHistorySortTime(a))
        .slice(0, Math.max(0, Number(limit) || 50))
        .map((battle) => {
            const attendance = Array.isArray(battle.attendance) ? battle.attendance : [];
            const entry = attendance.find((row) => String(row?.user || '') === safeUserId);
            const lightDamage = battle.lightDamage || 0;
            const darknessDamage = battle.darknessDamage || 0;
            return {
                battleId: battle._id,
                endedAt: battle.endsAt || battle.updatedAt || battle.createdAt,
                lightDamage,
                darknessDamage,
                attendanceCount: Number.isFinite(Number(battle.attendanceCount)) ? Number(battle.attendanceCount) : 0,
                result: lightDamage === darknessDamage ? 'draw' : lightDamage > darknessDamage ? 'light' : 'dark',
                userDamage: entry?.damage || 0,
            };
        });
}

module.exports = {
    buildUserBattleHistoryList,
    getBattleHistorySortTime,
};
