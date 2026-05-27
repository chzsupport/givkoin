const { spendK } = require('../kService');
const { awardRadianceForActivity } = require('../activityRadianceService');
const { getFortuneConfig } = require('../fortuneConfigService');
const { getRequestLanguage } = require('../../utils/requestLanguage');
const {
  countTicketMatches,
  formatDrawTimeLabel,
  formatLotteryNumbers,
  getDayKey,
  getDrawAt,
  getNextDrawAt,
  normalizeTicketNumbers,
  parseLotteryNumbers,
  startOfDayLocal,
} = require('./lotteryRules');
const {
  ensureUserLotteryForDay,
  getDailyLotteryNumbers,
} = require('./lotteryState');
const {
  findLotteryByUserAndDate,
  upsertLottery,
} = require('./fortuneStore');
const {
  getUserData,
  getUserRowById,
  updateUserDataById,
} = require('./fortuneUsers');

function normalizeLang(lang) {
  return String(lang || '').toLowerCase() === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
  return normalizeLang(lang) === 'en' ? en : ru;
}

function getFortuneBoosts(userData) {
  return userData?.fortuneBoosts && typeof userData.fortuneBoosts === 'object'
    ? userData.fortuneBoosts
    : {};
}

function buildLotteryStatusPayload({
  lottery,
  tickets,
  maxTicketsPerDay,
  ticketCost,
  nextDrawAt,
  now,
  lotteryConfig,
  winningNumbers,
  freeTickets,
}) {
  const isDrawCompleted = lottery.status === 'paid';

  return {
    ticketsBought: tickets,
    ticketsToday: tickets.length,
    maxTicketsPerDay,
    ticketCost,
    nextDraw: nextDrawAt,
    nextDrawCountdownMs: Math.max(0, nextDrawAt.getTime() - now.getTime()),
    drawTimeLabel: formatDrawTimeLabel(lotteryConfig),
    winningNumber: isDrawCompleted ? (lottery.winningNumber || formatLotteryNumbers(winningNumbers)) : null,
    winningNumbers: isDrawCompleted ? (lottery.winningNumbers || winningNumbers) : [],
    status: lottery.status,
    prize: lottery.prizeK || 0,
    freeTickets,
  };
}

function buildLotteryTicketRadiancePayload({ userId, lotteryId, normalizedNumbers, now }) {
  const ticketId = `${formatLotteryNumbers(normalizedNumbers)}:${now.toISOString()}`;
  return {
    userId,
    amount: 3,
    activityType: 'lottery_ticket_buy',
    meta: { lotteryId, ticketId },
    dedupeKey: `lottery_ticket_buy:${ticketId}:${userId}`,
  };
}

function buildLotteryTicketResponse({
  userLang,
  tickets,
  ticketsToday,
  updatedUserData,
  normalizedNumbers,
  useFreeTicket,
  freeTickets,
  boostOffer,
}) {
  return {
    message: pickLang(userLang, 'Билет куплен!', 'Ticket purchased!'),
    ticketsBought: tickets.length,
    ticketsToday: ticketsToday + 1,
    userK: Number(updatedUserData.k) || 0,
    ticketNumber: formatLotteryNumbers(normalizedNumbers),
    numbers: normalizedNumbers,
    freeTicketUsed: useFreeTicket,
    freeTicketsLeft: useFreeTicket ? Math.max(0, freeTickets - 1) : freeTickets,
    boostOffer,
  };
}

function resolveLotteryWinningNumbers(lotteryData) {
  return (Array.isArray(lotteryData.winningNumbers) && lotteryData.winningNumbers.length)
    ? lotteryData.winningNumbers
    : (normalizeTicketNumbers(lotteryData.winningNumber) || parseLotteryNumbers(lotteryData.winningNumber));
}

function buildLotteryResultsPayload(lotteryData, winningNumbers) {
  return {
    winningNumber: lotteryData.winningNumber,
    winningNumbers,
    userTickets: (lotteryData.tickets || []).map((ticket) => ({
      ticketNumber: ticket.ticketNumber,
      numbers: ticket.numbers,
      matches: countTicketMatches(ticket.numbers?.length ? ticket.numbers : ticket.ticketNumber, winningNumbers),
    })),
    prize: lotteryData.prizeK,
    status: lotteryData.status,
    drawDate: lotteryData.drawDate,
  };
}

async function createLotteryFreeTicketBoostOffer({ userId, now, userLang }) {
  const { createAdBoostOffer } = require('../adBoostService');
  return createAdBoostOffer({
    userId,
    type: 'lottery_free_ticket',
    contextKey: `lottery_free:${userId}:${getDayKey(now)}`,
    page: 'fortune/lottery',
    title: pickLang(userLang, 'Бесплатный билет лотереи', 'Free lottery ticket'),
    description: pickLang(userLang, 'Досмотрите видео, чтобы получить один билет без траты K.', 'Watch the video to get one ticket without spending K.'),
    reward: { kind: 'lottery_free_ticket' },
  });
}

async function getLotteryStatus(req, res) {
  try {
    const fortuneConfig = await getFortuneConfig();
    const lotteryConfig = fortuneConfig?.lottery || {};
    const ticketCost = Math.max(1, Number(lotteryConfig.ticketCost) || 100);
    const maxTicketsPerDay = Math.max(1, Number(lotteryConfig.maxTicketsPerDay) || 10);

    const userId = req.user._id;
    const now = new Date();
    const drawAt = getDrawAt(now, lotteryConfig);
    const nextDrawAt = getNextDrawAt(now, lotteryConfig);
    const dayStart = startOfDayLocal(now);
    const winningNumbers = await getDailyLotteryNumbers(now);
    const lottery = await ensureUserLotteryForDay({ userId, dayStart, winningNumbers, now, drawAt });
    const tickets = Array.isArray(lottery.tickets) ? lottery.tickets : [];
    const userRowForBoost = await getUserRowById(userId);
    const userBoostData = getUserData(userRowForBoost);
    const fortuneBoosts = getFortuneBoosts(userBoostData);
    const freeTickets = Math.max(0, Math.floor(Number(fortuneBoosts.lotteryFreeTickets) || 0));

    res.json(buildLotteryStatusPayload({
      lottery,
      tickets,
      maxTicketsPerDay,
      ticketCost,
      nextDrawAt,
      now,
      lotteryConfig,
      winningNumbers,
      freeTickets,
    }));
  } catch (error) {
    const userLang = normalizeLang(getRequestLanguage(req));
    res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
  }
}

async function buyLotteryTicket(req, res) {
  try {
    const userLang = normalizeLang(getRequestLanguage(req));
    const fortuneConfig = await getFortuneConfig();
    const lotteryConfig = fortuneConfig?.lottery || {};
    const ticketCost = Math.max(1, Number(lotteryConfig.ticketCost) || 100);
    const maxTicketsPerDay = Math.max(1, Number(lotteryConfig.maxTicketsPerDay) || 10);

    const userId = req.user._id;
    const { ticketNumber: rawTicketNumber, numbers: rawNumbers } = req.body;
    const normalizedNumbers = normalizeTicketNumbers(rawNumbers ?? rawTicketNumber);
    if (!normalizedNumbers) {
      return res.status(400).json({
        message: pickLang(userLang, 'Выберите 7 разных чисел от 1 до 49', 'Choose 7 different numbers from 1 to 49'),
      });
    }

    const userRow = await getUserRowById(userId);
    const userData = getUserData(userRow);
    const fortuneBoosts = getFortuneBoosts(userData);
    const freeTickets = Math.max(0, Math.floor(Number(fortuneBoosts.lotteryFreeTickets) || 0));
    const useFreeTicket = freeTickets > 0;
    if (!useFreeTicket && (Number(userData.k) || 0) < ticketCost) {
      return res.status(400).json({
        message: pickLang(userLang, 'Недостаточно K для покупки билета', 'Not enough K to buy a ticket'),
      });
    }

    const now = new Date();
    const drawAt = getDrawAt(now, lotteryConfig);
    if (now >= drawAt) {
      return res.status(400).json({
        message: pickLang(userLang, 'Покупка билетов закрыта до следующего дня', 'Ticket purchase is closed until the next day'),
      });
    }
    const dayStart = startOfDayLocal(now);
    const winningNumbers = await getDailyLotteryNumbers(now);
    const lottery = await ensureUserLotteryForDay({ userId, dayStart, winningNumbers, now, drawAt });

    if (lottery.status !== 'open') {
      return res.status(400).json({
        message: pickLang(userLang, 'Покупка билетов закрыта до следующего дня', 'Ticket purchase is closed until the next day'),
      });
    }

    if (!Array.isArray(lottery.tickets)) {
      lottery.tickets = [];
    }

    const ticketsToday = lottery.tickets.length;
    if (ticketsToday >= maxTicketsPerDay) {
      return res.status(400).json({
        message: pickLang(userLang, 'Лимит билетов на сегодня исчерпан', 'Daily ticket limit reached'),
      });
    }

    if (useFreeTicket) {
      await updateUserDataById(userId, {
        fortuneBoosts: {
          ...fortuneBoosts,
          lotteryFreeTickets: Math.max(0, freeTickets - 1),
        },
      });
    } else {
      await spendK({
        userId,
        amount: ticketCost,
        description: pickLang(userLang, 'Покупка лотерейного билета', 'Lottery ticket purchase'),
        type: 'lottery',
      });
    }

    const tickets = lottery.tickets || [];
    tickets.push({
      numbers: normalizedNumbers,
      ticketNumber: formatLotteryNumbers(normalizedNumbers),
      purchasedAt: now.toISOString(),
    });

    await upsertLottery(lottery._id, { ...lottery, tickets });

    try {
      awardRadianceForActivity(buildLotteryTicketRadiancePayload({
        userId,
        lotteryId: lottery._id,
        normalizedNumbers,
        now,
      })).catch(() => { });
    } catch (error) {
      // ignore
    }

    const updatedUser = await getUserRowById(userId);
    const updatedUserData = getUserData(updatedUser);
    const boostOffer = tickets.length < maxTicketsPerDay
      ? await createLotteryFreeTicketBoostOffer({ userId, now, userLang }).catch(() => null)
      : null;

    res.json(buildLotteryTicketResponse({
      userLang,
      tickets,
      ticketsToday,
      updatedUserData,
      normalizedNumbers,
      useFreeTicket,
      freeTickets,
      boostOffer,
    }));
  } catch (error) {
    const userLang = normalizeLang(getRequestLanguage(req));
    res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
  }
}

async function getLotteryResults(req, res) {
  try {
    const userLang = normalizeLang(getRequestLanguage(req));
    const { date } = req.query;
    const now = new Date();
    const todayStart = startOfDayLocal(now);
    let drawDate = todayStart;
    let lottery = null;

    if (date) {
      const requestedDate = new Date(date);
      if (Number.isNaN(requestedDate.getTime())) {
        return res.status(400).json({
          message: pickLang(userLang, 'Некорректная дата розыгрыша', 'Invalid draw date'),
        });
      }
      drawDate = startOfDayLocal(requestedDate);
      lottery = await findLotteryByUserAndDate(req.user._id, drawDate);
    } else {
      lottery = await findLotteryByUserAndDate(req.user._id, drawDate);
    }

    if (!date && (!lottery || lottery.data.status !== 'paid')) {
      const yesterdayStart = new Date(todayStart);
      yesterdayStart.setDate(yesterdayStart.getDate() - 1);
      lottery = await findLotteryByUserAndDate(req.user._id, yesterdayStart);
    }

    if (!lottery) {
      return res.status(404).json({ message: pickLang(userLang, 'Результаты не найдены', 'Results not found') });
    }
    const lotteryData = lottery.data || lottery;
    if (lotteryData.status !== 'paid') {
      return res.status(409).json({
        message: pickLang(userLang, 'Результаты текущего розыгрыша ещё не готовы', 'Current draw results are not ready yet'),
      });
    }

    const winningNumbers = resolveLotteryWinningNumbers(lotteryData);
    res.json(buildLotteryResultsPayload(lotteryData, winningNumbers));
  } catch (error) {
    const userLang = normalizeLang(getRequestLanguage(req));
    res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });
  }
}

module.exports = {
  buildLotteryResultsPayload,
  buildLotteryStatusPayload,
  buildLotteryTicketRadiancePayload,
  buildLotteryTicketResponse,
  buyLotteryTicket,
  getLotteryResults,
  getLotteryStatus,
  resolveLotteryWinningNumbers,
};
