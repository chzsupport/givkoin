const { getSetting, setSetting } = require('../../utils/settings');
const {
  LOTTERY_TICKET_LENGTH,
  formatLotteryNumbers,
  generateLotteryNumbers,
  getDayKey,
  normalizeTicketNumbers,
} = require('./lotteryRules');
const {
  findLotteryByUserAndDate,
  upsertLottery,
} = require('./fortuneStore');

const LOTTERY_DAILY_SETTING_KEY = 'lottery_daily';

async function getDailyLotteryNumbers(date = new Date()) {
  const dayKey = getDayKey(date);
  const stored = await getSetting(LOTTERY_DAILY_SETTING_KEY);

  if (stored && stored.dateKey === dayKey) {
    if (Array.isArray(stored.winningNumbers) && stored.winningNumbers.length === LOTTERY_TICKET_LENGTH) {
      return stored.winningNumbers.slice();
    }

    if (typeof stored.winningNumber === 'string') {
      const parsed = normalizeTicketNumbers(stored.winningNumber);
      if (parsed) return parsed;
    }
  }

  const winningNumbers = generateLotteryNumbers();
  await setSetting(
    LOTTERY_DAILY_SETTING_KEY,
    {
      dateKey: dayKey,
      winningNumbers,
      winningNumber: formatLotteryNumbers(winningNumbers),
    },
    'Daily lottery winning numbers'
  );
  return winningNumbers.slice();
}

async function ensureUserLotteryForDay({ userId, dayStart, winningNumbers, now, drawAt }) {
  let existing = await findLotteryByUserAndDate(userId, dayStart);
  const dayIso = dayStart instanceof Date ? dayStart.toISOString() : dayStart;

  let data;
  if (!existing) {
    data = {
      user: userId,
      tickets: [],
      drawDate: dayIso,
      status: 'open',
      winningNumbers,
      winningNumber: formatLotteryNumbers(winningNumbers),
    };
  } else {
    data = existing.data || {};
  }

  let shouldSave = false;
  if (!Array.isArray(data.winningNumbers) || data.winningNumbers.length !== LOTTERY_TICKET_LENGTH) {
    data.winningNumbers = winningNumbers;
    shouldSave = true;
  }
  if (!data.winningNumber) {
    data.winningNumber = formatLotteryNumbers(data.winningNumbers || winningNumbers);
    shouldSave = true;
  }
  if (now && drawAt && now >= drawAt && data.status === 'open') {
    data.status = 'closed';
    shouldSave = true;
  }
  if (shouldSave || !existing) {
    const id = existing?.id || null;
    return upsertLottery(id, data);
  }

  return { ...data, _id: existing.id };
}

module.exports = {
  LOTTERY_DAILY_SETTING_KEY,
  ensureUserLotteryForDay,
  getDailyLotteryNumbers,
};
