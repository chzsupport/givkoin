function sumAmounts(rows = []) {
  return rows.reduce((sum, row) => sum + (Number(row?.amount) || 0), 0);
}

function getUserFromMap(userMap, userId) {
  if (!userMap || typeof userMap.get !== 'function') return null;
  return userMap.get(String(userId));
}

function buildTopSpinnersPayload(rows = [], userMap) {
  return rows
    .map((row) => {
      const userRow = getUserFromMap(userMap, row?.user);
      const nickname = userRow?.nickname || null;
      if (!nickname) return null;
      return {
        nickname,
        totalSpins: Number(row?.totalSpins) || 0,
      };
    })
    .filter(Boolean);
}

function buildRecentActivityPayload(rows = [], userMap, fallbackPrize = 'Spin') {
  return rows
    .map((row) => {
      const userRow = getUserFromMap(userMap, row?.user);
      const nickname = userRow?.nickname || null;
      if (!nickname) return null;
      return {
        nickname,
        lastSpinAt: row.lastSpinAt,
        prize: row.lastPrize || fallbackPrize,
      };
    })
    .filter(Boolean)
    .slice(0, 8);
}

function buildTopLotteryWinnersPayload(rows = [], userMap) {
  return rows
    .map((row) => {
      const userRow = getUserFromMap(userMap, row?.user);
      const nickname = userRow?.nickname || null;
      if (!nickname) return null;
      return {
        nickname,
        prize: Number(row?.prizeK) || 0,
      };
    })
    .filter(Boolean);
}

function buildGlobalFortuneStatsPayload({
  allSpins = [],
  allLotteries = [],
  rouletteTransactions = [],
  lotteryTransactions = [],
  userMap,
  fallbackSpinPrize = 'Spin',
} = {}) {
  const totalSpins = allSpins.reduce((sum, row) => sum + (Number(row?.totalSpins) || 0), 0);
  const activeUsers = allSpins.length;
  const topSpinners = [...allSpins]
    .sort((a, b) => (Number(b?.totalSpins) || 0) - (Number(a?.totalSpins) || 0))
    .slice(0, 5);

  const totalTickets = allLotteries.reduce((sum, row) => (
    sum + (Array.isArray(row?.tickets) ? row.tickets.length : 0)
  ), 0);
  const lotteryPlayers = allLotteries.length;
  const topLotteryWinners = allLotteries
    .filter((row) => (Number(row?.prizeK) || 0) > 0)
    .sort((a, b) => (Number(b?.prizeK) || 0) - (Number(a?.prizeK) || 0))
    .slice(0, 5);
  const recentSpinners = allSpins
    .filter((row) => row?.lastSpinAt)
    .sort((a, b) => new Date(b.lastSpinAt).getTime() - new Date(a.lastSpinAt).getTime())
    .slice(0, 20);

  const rouletteKIssued = sumAmounts(rouletteTransactions);
  const lotteryKIssued = sumAmounts(lotteryTransactions);
  const fortuneMaxWin = Math.max(0, ...rouletteTransactions.map((row) => Number(row?.amount) || 0));

  return {
    roulette: {
      totalSpins,
      activeUsers,
      totalKIssued: rouletteKIssued,
      topSpinners: buildTopSpinnersPayload(topSpinners, userMap),
      recentActivity: buildRecentActivityPayload(recentSpinners, userMap, fallbackSpinPrize),
    },
    lottery: {
      totalTickets,
      totalPrizesPaid: lotteryKIssued,
      totalDraws: lotteryPlayers,
      topWinners: buildTopLotteryWinnersPayload(topLotteryWinners, userMap),
    },
    world: {
      totalKFromLottery: lotteryKIssued,
      totalFortunePlayers: activeUsers,
      totalLotteryPlayers: lotteryPlayers,
      maxFortuneWin: fortuneMaxWin,
    },
  };
}

function buildUserFortuneStatsPayload({ spinData, userTransactions = [], userLotteries = [] } = {}) {
  const fortuneTx = userTransactions.filter((row) => row?.type === 'fortune');
  const fortuneEarned = sumAmounts(fortuneTx.filter((row) => row?.direction === 'credit'));
  const fortuneSpent = sumAmounts(fortuneTx.filter((row) => row?.direction === 'debit'));

  const lotteryTx = userTransactions.filter((row) => row?.type === 'lottery');
  const lotteryEarned = sumAmounts(lotteryTx.filter((row) => row?.direction === 'credit'));
  const lotterySpent = sumAmounts(lotteryTx.filter((row) => row?.direction === 'debit'));

  const totalTickets = userLotteries.reduce((sum, row) => (
    sum + (Array.isArray(row?.tickets) ? row.tickets.length : 0)
  ), 0);
  const totalPrizeK = userLotteries.reduce((sum, row) => sum + (Number(row?.prizeK) || 0), 0);

  const totalEarned = fortuneEarned + lotteryEarned;
  const totalSpent = fortuneSpent + lotterySpent;

  return {
    roulette: {
      totalSpins: spinData?.data?.totalSpins || 0,
      lastSpinAt: spinData?.data?.lastSpinAt || null,
      kEarned: fortuneEarned,
      kSpent: fortuneSpent,
    },
    lottery: {
      totalTickets,
      totalDraws: userLotteries.length,
      kWon: lotteryEarned,
      kSpent: lotterySpent,
      totalPrizeK,
    },
    total: {
      kEarned: totalEarned,
      kSpent: totalSpent,
      kNet: totalEarned - totalSpent,
    },
  };
}

module.exports = {
  buildGlobalFortuneStatsPayload,
  buildRecentActivityPayload,
  buildTopLotteryWinnersPayload,
  buildTopSpinnersPayload,
  buildUserFortuneStatsPayload,
  sumAmounts,
};
