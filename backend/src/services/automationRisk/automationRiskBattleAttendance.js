function getBattleEntryUserId(entry) {
  const userValue = entry?.user;
  return typeof userValue === 'object' && userValue !== null
    ? String(userValue._id || userValue)
    : String(userValue || '');
}

function buildBattleAttendanceEntry(battle, entry) {
  const happenedAt = entry?.joinedAt || battle?.endsAt || battle?.updatedAt || battle?.createdAt;
  const happenedDate = new Date(happenedAt || 0);
  return {
    happenedDate,
    row: {
      battleId: battle._id,
      happenedAt: happenedDate,
      automationTelemetry: entry?.automationTelemetry || {},
      voiceCommandsTotalAttempts: Number(entry?.voiceCommandsTotalAttempts) || 0,
      voiceCommandsSuccess: Number(entry?.voiceCommandsSuccess) || 0,
    },
  };
}

function appendBattleAttendanceByUser(map, battle, since) {
  const entries = Array.isArray(battle?.attendance) ? battle.attendance : [];
  for (const entry of entries) {
    const userId = getBattleEntryUserId(entry);
    if (!userId) continue;
    const { happenedDate, row } = buildBattleAttendanceEntry(battle, entry);
    if (Number.isNaN(happenedDate.getTime()) || happenedDate < since) continue;
    if (!map.has(userId)) map.set(userId, []);
    map.get(userId).push(row);
  }
}

function buildBattleAttendanceByUser(battles = [], since) {
  const map = new Map();
  for (const battle of battles) {
    appendBattleAttendanceByUser(map, battle, since);
  }
  return map;
}

module.exports = {
  appendBattleAttendanceByUser,
  buildBattleAttendanceByUser,
};
