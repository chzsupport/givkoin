const {
  getUserData,
  getUsersByIds,
} = require('./battleUsers');

function normalizeBattleUserId(value) {
  return value == null ? '' : String(value);
}

function buildFinishedBattleSummaryFromUsers(battle, userRows = []) {
  const attendance = Array.isArray(battle?.attendance) ? battle.attendance : [];
  if (!attendance.length) {
    battle.summaryTopPlayer = null;
    return { usersById: new Map() };
  }

  const usersById = new Map(
    (Array.isArray(userRows) ? userRows : []).map((row) => {
      const data = getUserData(row);
      return [normalizeBattleUserId(row?.id), {
        _id: row?.id,
        email: row?.email || data.email,
        nickname: row?.nickname || data.nickname,
        treeBranch: data.treeBranch || null,
      }];
    })
  );

  const indexed = attendance.map((row, index) => {
    const userId = normalizeBattleUserId(row?.user);
    const userDoc = usersById.get(userId) || null;
    return {
      row,
      index,
      userId,
      damage: Math.max(0, Number(row?.damage) || 0),
      nickname: String(userDoc?.nickname || 'Игрок'),
      treeBranch: userDoc?.treeBranch ? String(userDoc.treeBranch) : null,
    };
  });

  const sorted = [...indexed].sort((left, right) => {
    const diff = right.damage - left.damage;
    if (diff !== 0) return diff;
    return left.index - right.index;
  });

  const rankByUserId = new Map();
  sorted.forEach((item, idx) => {
    if (item.userId && !rankByUserId.has(item.userId)) {
      rankByUserId.set(item.userId, idx + 1);
    }
  });

  const branchStats = new Map();
  for (const item of indexed) {
    if (!item.treeBranch) continue;
    const prev = branchStats.get(item.treeBranch) || { count: 0, damage: 0 };
    prev.count += 1;
    prev.damage += item.damage;
    branchStats.set(item.treeBranch, prev);
  }

  for (const item of indexed) {
    item.row.finalRank = item.userId ? rankByUserId.get(item.userId) || null : null;
    if (item.treeBranch) {
      const branch = branchStats.get(item.treeBranch) || { count: 0, damage: 0 };
      const othersCount = Math.max(0, branch.count - 1);
      item.row.finalBranchAvgDamageOther = othersCount > 0
        ? (branch.damage - item.damage) / othersCount
        : null;
    } else {
      item.row.finalBranchAvgDamageOther = null;
    }
  }

  const top = sorted[0] || null;
  battle.summaryTopPlayer = top
    ? {
      userId: top.userId,
      nickname: top.nickname,
      damage: top.damage,
    }
    : null;

  return { usersById };
}

async function buildFinishedBattleSummary(battle) {
  const attendance = Array.isArray(battle?.attendance) ? battle.attendance : [];
  const attendanceIds = attendance
    .map((row) => normalizeBattleUserId(row?.user))
    .filter(Boolean);

  const userRows = attendanceIds.length
    ? await getUsersByIds(attendanceIds)
    : [];

  return buildFinishedBattleSummaryFromUsers(battle, userRows);
}

module.exports = {
  buildFinishedBattleSummary,
  buildFinishedBattleSummaryFromUsers,
  normalizeBattleUserId,
};
