const { getFrontendBaseUrl } = require('../../config/env');
const { createNotification } = require('../../controllers/notificationController');
const { awardFortuneK } = require('../kService');
const { recordFortuneWin } = require('../fortuneWinLogService');
const { getFortuneConfig } = require('../fortuneConfigService');
const {
  countTicketMatches,
  formatLotteryNumbers,
  formatLotteryNumbersForDisplay,
  getDayKey,
  getDrawAt,
  getPrizeForMatches,
  startOfDayLocal,
} = require('./lotteryRules');
const { getDailyLotteryNumbers } = require('./lotteryState');
const { listLotteries, upsertLottery } = require('./fortuneStore');
const {
  extractNicknameOrNull,
  getUsersByIds,
  updateUserDataById,
} = require('./fortuneUsers');

function normalizeLang(lang) {
  return String(lang || '').toLowerCase() === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
  return normalizeLang(lang) === 'en' ? en : ru;
}

function selectLotteriesForDraw(allLotteries, drawDate) {
  const drawDateIso = drawDate instanceof Date ? drawDate.toISOString() : String(drawDate || '');
  return (Array.isArray(allLotteries) ? allLotteries : []).filter((lottery) =>
    lottery?.drawDate === drawDateIso && (lottery.status === 'open' || lottery.status === 'closed')
  );
}

function summarizeLotteryTickets(tickets, winningNumbers, lotteryConfig) {
  return (Array.isArray(tickets) ? tickets : []).reduce((summary, ticket) => {
    const matches = countTicketMatches(ticket?.numbers?.length ? ticket.numbers : ticket?.ticketNumber, winningNumbers);
    const prize = getPrizeForMatches(matches, lotteryConfig);
    return {
      totalPrize: summary.totalPrize + Math.max(0, Number(prize) || 0),
      maxMatches: Math.max(summary.maxMatches, matches),
    };
  }, { totalPrize: 0, maxMatches: 0 });
}

function buildLotteryDrawContext({ now, winningNumbers }) {
  const drawDateStr = getDayKey(now);
  const drawLabel = formatLotteryNumbersForDisplay(winningNumbers) || formatLotteryNumbers(winningNumbers);
  const resultPath = `/fortune/lottery?drawDate=${drawDateStr}`;
  const resultUrl = `${getFrontendBaseUrl()}${resultPath}`;

  return {
    drawDateStr,
    drawLabel,
    resultPath,
    resultUrl,
  };
}

async function awardLotteryAchievements({ userId, userRow, tickets, winningNumbers, lotteryConfig }) {
  for (const ticket of Array.isArray(tickets) ? tickets : []) {
    const matches = countTicketMatches(ticket?.numbers?.length ? ticket.numbers : ticket?.ticketNumber, winningNumbers);

    try {
      const { grantAchievement } = require('../achievementService');

      if (matches === 6) await grantAchievement({ userId, achievementId: 83 });

      if (matches === 7) await grantAchievement({ userId, achievementId: 84 });

      if (matches >= 5) {
        const stats = userRow.data?.achievementStats && typeof userRow.data.achievementStats === 'object'
          ? userRow.data.achievementStats
          : {};
        const nextCount = (Number(stats.lottery5PlusMatchesCount) || 0) + 1;
        await updateUserDataById(userId, { achievementStats: { ...stats, lottery5PlusMatchesCount: nextCount } });
        if (nextCount >= 2) {
          await grantAchievement({ userId, achievementId: 85 });
        }
      }
    } catch (error) {
      console.error('Lottery achievement error:', error);
    }

  }
}

async function payLotteryPrize({
  lottery,
  userId,
  userRow,
  totalPrize,
  maxMatches,
  winningNumbers,
  drawDate,
  now,
  drawDateStr,
  drawLabel,
  resultPath,
  resultUrl,
}) {
  if (!(totalPrize > 0)) return;

  const userLang = normalizeLang(userRow?.language || userRow?.data?.language || 'ru');
  await awardFortuneK({
    userId,
    amount: totalPrize,
    description: pickLang(userLang, 'Выигрыш в лотерею', 'Lottery winnings'),
  });
  await recordFortuneWin({
    userId,
    gameType: 'lottery',
    rewardType: 'k',
    amount: totalPrize,
    label: `Совпадений максимум: ${maxMatches}`,
    drawDate,
    occurredAt: now,
    meta: {
      lotteryId: lottery._id,
      winningNumber: formatLotteryNumbers(winningNumbers),
      winningNumbers,
    },
  });
  await createNotification({
    userId,
    type: 'system',
    eventKey: 'lottery_draw_result',
    title: {
      ru: 'Выигрыш в лотерее',
      en: 'Lottery winnings',
    },
    message: {
      ru: `Ваш выигрыш: ${totalPrize} K. Победившие числа: ${drawLabel}.`,
      en: `Your winnings: ${totalPrize} K. Winning numbers: ${drawLabel}.`,
    },
    link: resultPath,
    io: global.io,
  });

  const emailService = require('../emailService');
  await emailService.sendLotteryWinEmail(
    userRow?.email,
    extractNicknameOrNull(userRow?.nickname),
    {
      prize: totalPrize,
      winningNumber: drawLabel,
      drawDate: drawDateStr,
      matches: maxMatches,
      resultUrl,
    },
    userLang
  ).catch((emailError) => {
    console.error('Lottery win email error:', emailError);
  });
}

async function broadcastLotteryDrawFinished({ drawLabel, resultPath }) {
  const { broadcastNotificationByPresence } = require('../notificationService');

  await broadcastNotificationByPresence({
    online: {
      type: 'system',
      eventKey: 'lottery_draw_result',
      title: {
        ru: 'Розыгрыш лотереи завершён',
        en: 'Lottery draw completed',
      },
      message: {
        ru: `Сегодняшние числа: ${drawLabel}. Проверь результаты.`,
        en: `Today's numbers: ${drawLabel}. Check the results.`,
      },
      link: resultPath,
    },
    offline: {
      type: 'event',
      eventKey: 'lottery_draw_result',
      title: {
        ru: 'Розыгрыш лотереи',
        en: 'Lottery draw',
      },
      message: {
        ru: `Пока тебя не было состоялся розыгрыш лотереи: ${drawLabel}.`,
        en: `While you were away, the lottery draw took place: ${drawLabel}.`,
      },
      link: resultPath,
    },
  });
}

async function drawDailyLottery() {
  try {
    const fortuneConfig = await getFortuneConfig();
    const lotteryConfig = fortuneConfig?.lottery || {};
    const now = new Date();
    const drawDate = startOfDayLocal(now);
    const drawAt = getDrawAt(now, lotteryConfig);

    if (now < drawAt) {
      return;
    }

    const winningNumbers = await getDailyLotteryNumbers(now);
    const drawContext = buildLotteryDrawContext({ now, winningNumbers });

    const allLotteries = await listLotteries();
    const lotteries = selectLotteriesForDraw(allLotteries, drawDate);
    const userIds = Array.from(new Set(lotteries.map((lottery) => String(lottery.user)).filter(Boolean)));
    const userMap = await getUsersByIds(userIds);

    if (lotteries.length === 0) return;

    for (const lottery of lotteries) {
      const userId = String(lottery?.user);
      const userRow = userId ? userMap.get(userId) : null;
      if (!userId || !userRow) {
        continue;
      }

      const tickets = lottery.tickets || [];
      const { totalPrize, maxMatches } = summarizeLotteryTickets(tickets, winningNumbers, lotteryConfig);

      await awardLotteryAchievements({ userId, userRow, tickets, winningNumbers, lotteryConfig });

      const updatedData = {
        ...lottery,
        winningNumbers,
        winningNumber: formatLotteryNumbers(winningNumbers),
        prizeK: totalPrize,
        status: 'paid',
      };
      delete updatedData._id;
      await upsertLottery(lottery._id, updatedData);

      await payLotteryPrize({
        lottery,
        userId,
        userRow,
        totalPrize,
        maxMatches,
        winningNumbers,
        drawDate,
        now,
        ...drawContext,
      });
    }

    await broadcastLotteryDrawFinished(drawContext);

  } catch (error) {
    console.error('Ошибка розыгрыша лотереи:', error);
  }
}

module.exports = {
  buildLotteryDrawContext,
  drawDailyLottery,
  selectLotteriesForDraw,
  summarizeLotteryTickets,
};
