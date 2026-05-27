const { getFortuneConfig } = require('../services/fortuneConfigService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { getRequestLanguage } = require('../utils/requestLanguage');
const {
  getDailyLotteryNumbers,
} = require('../services/fortune/lotteryState');
const {
  buildGlobalFortuneStatsPayload,
  buildUserFortuneStatsPayload,
} = require('../services/fortune/fortuneStats');
const {
  findFortuneSpinByUser,
  listFortuneSpins,
  listLotteries,
  listTransactions,
} = require('../services/fortune/fortuneStore');
const { drawDailyLottery } = require('../services/fortune/lotteryDraw');
const {
  drawPersonalLuck,
  resetPersonalLuckDrawRuntimeState,
} = require('../services/fortune/personalLuckDraw');
const {
  buyLotteryTicket,
  getLotteryResults,
  getLotteryStatus,
} = require('../services/fortune/lotteryHandlers');
const {
  getSpinStatus,
  resetRouletteRuntimeState,
  spin,
} = require('../services/fortune/rouletteHandlers');

function normalizeLang(lang) {
  return String(lang || '').toLowerCase() === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
  return normalizeLang(lang) === 'en' ? en : ru;
}

exports.ensureDailyLotteryNumber = async () => {
  await getDailyLotteryNumbers(new Date());
};

exports.__resetFortuneControllerRuntimeState = () => {
  resetRouletteRuntimeState();
  resetPersonalLuckDrawRuntimeState();
};

exports.getConfig = async (_req, res) => {
  try {
    const config = await getFortuneConfig();
    res.json(config);
  } catch (error) {
    const userLang = normalizeLang(_req?.query?.language || 'ru');
    res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
  }
};

exports.getSpinStatus = getSpinStatus;
exports.spin = spin;

exports.getGlobalStats = async (req, res) => {
  try {
    const allSpins = await listFortuneSpins();
    const allLotteries = await listLotteries();

    const [rouletteTransactions, lotteryTransactions] = await Promise.all([
      listTransactions({ type: 'fortune', direction: 'credit' }),
      listTransactions({ type: 'lottery', direction: 'credit' }),
    ]);

    const userIds = new Set([
      ...allSpins.map((s) => String(s.user)),
      ...allLotteries.map((l) => String(l.user)),
    ].filter(Boolean));

    const supabase = getSupabaseClient();
    const { data: usersData } = await supabase
      .from('users')
      .select('id,nickname')
      .in('id', Array.from(userIds));

    const userMap = new Map((usersData || []).map((u) => [String(u.id), u]));

    res.json(buildGlobalFortuneStatsPayload({
      allSpins,
      allLotteries,
      rouletteTransactions,
      lotteryTransactions,
      userMap,
      fallbackSpinPrize: pickLang(normalizeLang(getRequestLanguage(req)), 'Спин', 'Spin'),
    }));
  } catch (error) {
    const userLang = normalizeLang(getRequestLanguage(req));
    res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
  }
};

exports.getUserStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const spinData = await findFortuneSpinByUser(userId);
    const userTx = await listTransactions({ user: String(userId) }, 2000);
    const userLotteries = await listLotteries({ user: String(userId) });

    res.json(buildUserFortuneStatsPayload({
      spinData,
      userTransactions: userTx,
      userLotteries,
    }));
  } catch (error) {
    const userLang = normalizeLang(getRequestLanguage(req));
    res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
  }
};

exports.getLotteryStatus = getLotteryStatus;
exports.buyLotteryTicket = buyLotteryTicket;
exports.getLotteryResults = getLotteryResults;
exports.luckyDraw = drawPersonalLuck;
exports.drawLottery = drawDailyLottery;
