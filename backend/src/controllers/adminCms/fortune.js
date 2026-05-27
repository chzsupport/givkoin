const {
  getFortuneConfig,
  patchRouletteConfig,
  patchLotteryConfig,
} = require('../../services/fortuneConfigService');
const { cleanupOldFortuneWins } = require('../../services/fortuneWinLogService');
const fortuneController = require('../fortuneController');
const {
  countDocsByModel,
  listDocsByModel,
} = require('../../services/documentStore');
const {
  buildOperationId,
  getUsersByIds,
  logCmsAudit,
  mutationResponse,
  parsePagination,
  toCsv,
  toDate,
  toId,
} = require('./shared');

async function getFortuneConfigCms(req, res) {
  try {
    const config = await getFortuneConfig();
    return res.json({ config });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function patchFortuneRoulette(req, res) {
  try {
    const operationId = buildOperationId();
    const before = await getFortuneConfig();
    const patch = req.body && typeof req.body === 'object' ? req.body : {};
    const next = await patchRouletteConfig(patch, req.user?._id || null);

    const auditId = await logCmsAudit(
      req,
      'cms.fortune.roulette.update',
      'Settings',
      'FORTUNE_CONFIG_V1',
      before,
      next,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Конфигурация рулетки обновлена',
      data: { config: next },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function patchFortuneLottery(req, res) {
  try {
    const operationId = buildOperationId();
    const before = await getFortuneConfig();
    const patch = req.body && typeof req.body === 'object' ? req.body : {};
    const next = await patchLotteryConfig(patch, req.user?._id || null);

    const auditId = await logCmsAudit(
      req,
      'cms.fortune.lottery.update',
      'Settings',
      'FORTUNE_CONFIG_V1',
      before,
      next,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Конфигурация лотереи обновлена',
      data: { config: next },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function fortuneStatsCms(req, res) {
  return fortuneController.getGlobalStats(req, res);
}

async function listFortuneWins(req, res) {
  try {
    await cleanupOldFortuneWins(90);

    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 50 });
    const now = new Date();
    const from = toDate(req.query.from) || new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const to = toDate(req.query.to) || now;
    const dataEq = {};
    const dataGte = { occurredAt: from.toISOString() };
    const dataLte = { occurredAt: to.toISOString() };

    if (req.query.gameType && ['roulette', 'lottery'].includes(String(req.query.gameType))) {
      dataEq.gameType = String(req.query.gameType);
    }
    if (req.query.userId) {
      dataEq.user = String(req.query.userId);
    }
    if (req.query.rewardType && ['k', 'star', 'spin', 'other'].includes(String(req.query.rewardType))) {
      dataEq.rewardType = String(req.query.rewardType);
    }

    const [rows, total, summaryRows] = await Promise.all([
      listDocsByModel('FortuneWinLog', {
        dataEq,
        dataGte,
        dataLte,
        orderBy: 'data->>occurredAt',
        ascending: false,
        limit,
        offset: skip,
      }),
      countDocsByModel('FortuneWinLog', { dataEq, dataGte, dataLte }),
      listDocsByModel('FortuneWinLog', {
        dataGte,
        dataLte,
        limit: 10000,
      }),
    ]);

    const summaryMap = { roulette: { count: 0, totalAmount: 0 }, lottery: { count: 0, totalAmount: 0 } };
    for (const row of (summaryRows || [])) {
      const d = row || {};
      const gameType = d.gameType || 'unknown';
      if (summaryMap[gameType]) {
        summaryMap[gameType].count += 1;
        summaryMap[gameType].totalAmount += Number(d.amount) || 0;
      }
    }

    const safeRows = Array.isArray(rows) ? rows : [];
    const userIds = Array.from(new Set(safeRows.map((row) => toId(row?.user)).filter(Boolean)));
    const userMap = await getUsersByIds(userIds);
    const enrichedRows = safeRows.map((row) => {
      const id = toId(row?.user);
      const u = id ? userMap.get(id) : null;
      return { ...row, user: u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : row.user };
    });

    return res.json({
      rows: enrichedRows,
      summary: {
        all: {
          count: summaryMap.roulette.count + summaryMap.lottery.count,
          totalAmount: summaryMap.roulette.totalAmount + summaryMap.lottery.totalAmount,
        },
        roulette: { ...summaryMap.roulette, avgAmount: summaryMap.roulette.count > 0 ? Math.round((summaryMap.roulette.totalAmount / summaryMap.roulette.count) * 100) / 100 : 0 },
        lottery: { ...summaryMap.lottery, avgAmount: summaryMap.lottery.count > 0 ? Math.round((summaryMap.lottery.totalAmount / summaryMap.lottery.count) * 100) / 100 : 0 },
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function exportFortuneWins(req, res) {
  try {
    await cleanupOldFortuneWins(90);

    const now = new Date();
    const from = toDate(req.query.from) || new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const to = toDate(req.query.to) || now;
    const dataEq = {};
    const dataGte = { occurredAt: from.toISOString() };
    const dataLte = { occurredAt: to.toISOString() };

    if (req.query.gameType && ['roulette', 'lottery'].includes(String(req.query.gameType))) {
      dataEq.gameType = String(req.query.gameType);
    }
    if (req.query.userId) {
      dataEq.user = String(req.query.userId);
    }

    const rows = await listDocsByModel('FortuneWinLog', {
      dataEq,
      dataGte,
      dataLte,
      limit: 20000,
    });

    const safeRows = Array.isArray(rows) ? rows : [];
    const userIds = Array.from(new Set(safeRows.map((row) => toId(row?.user)).filter(Boolean)));
    const userMap = await getUsersByIds(userIds);

    const headers = [
      { key: 'occurredAt', label: 'OccurredAt' },
      { key: 'gameType', label: 'GameType' },
      { key: 'rewardType', label: 'RewardType' },
      { key: 'amount', label: 'Amount' },
      { key: 'label', label: 'Label' },
      { key: 'userId', label: 'UserId' },
      { key: 'nickname', label: 'Nickname' },
      { key: 'email', label: 'Email' },
      { key: 'drawDate', label: 'DrawDate' },
    ];

    const csvRows = safeRows.map((row) => {
      const id = toId(row?.user);
      const u = id ? userMap.get(id) : null;
      return {
        occurredAt: row.occurredAt,
        gameType: row.gameType,
        rewardType: row.rewardType,
        amount: row.amount,
        label: row.label,
        userId: u?.id || id || '',
        nickname: u?.nickname || '',
        email: u?.email || '',
        drawDate: row.drawDate || '',
      };
    });

    const csv = toCsv(headers, csvRows);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="fortune-wins-${Date.now()}.csv"`);
    return res.send(csv);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function drawLotteryNowCms(req, res) {
  try {
    const confirmationPhrase = String(req.body?.confirmationPhrase || '').trim();
    if (confirmationPhrase !== 'CONFIRM fortune.lottery.draw_now') {
      return res.status(400).json({ message: 'Неверная фраза подтверждения' });
    }

    const operationId = buildOperationId();
    await fortuneController.drawLottery();

    const auditId = await logCmsAudit(
      req,
      'cms.fortune.lottery.draw_now',
      'Lottery',
      null,
      null,
      { triggeredAt: new Date() },
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Розыгрыш лотереи запущен',
      data: { triggered: true },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

module.exports = {
  drawLotteryNowCms,
  exportFortuneWins,
  fortuneStatsCms,
  getFortuneConfigCms,
  listFortuneWins,
  patchFortuneLottery,
  patchFortuneRoulette,
};
