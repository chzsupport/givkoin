const LOTTERY_TICKET_LENGTH = 7;
const LOTTERY_MIN_NUMBER = 1;
const LOTTERY_MAX_NUMBER = 49;

function startOfDayLocal(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function nextMidnightLocal(date) {
  const d = startOfDayLocal(date);
  d.setDate(d.getDate() + 1);
  return d;
}

function isSameLocalDay(a, b) {
  if (!a || !b) return false;
  return startOfDayLocal(a).getTime() === startOfDayLocal(b).getTime();
}

function pad2(value) {
  return String(Math.max(0, Math.trunc(Number(value) || 0))).padStart(2, '0');
}

function getDayKey(date) {
  const d = startOfDayLocal(date);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function getDrawAt(date, lotteryConfig = null) {
  const d = startOfDayLocal(date);
  const hour = Number(lotteryConfig?.drawHour);
  const minute = Number(lotteryConfig?.drawMinute);
  d.setHours(
    Number.isFinite(hour) ? hour : 23,
    Number.isFinite(minute) ? minute : 59,
    0,
    0
  );
  return d;
}

function getNextDrawAt(date, lotteryConfig = null) {
  const now = new Date(date);
  const currentDrawAt = getDrawAt(now, lotteryConfig);
  if (now.getTime() < currentDrawAt.getTime()) {
    return currentDrawAt;
  }
  return getDrawAt(nextMidnightLocal(now), lotteryConfig);
}

function formatDrawTimeLabel(lotteryConfig = null) {
  const hour = Number(lotteryConfig?.drawHour);
  const minute = Number(lotteryConfig?.drawMinute);
  return `${pad2(Number.isFinite(hour) ? hour : 23)}:${pad2(Number.isFinite(minute) ? minute : 59)}`;
}

function generateLotteryNumbers() {
  const pool = Array.from({ length: LOTTERY_MAX_NUMBER }, (_, index) => index + LOTTERY_MIN_NUMBER);
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, LOTTERY_TICKET_LENGTH);
}

function formatLotteryNumbers(numbers = []) {
  return numbers.map((n) => n.toString().padStart(2, '0')).join(' ');
}

function parseLotteryNumbers(input) {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input.map((value) => Number(value));
  }

  const raw = String(input);
  const digitsOnly = raw.replace(/\D/g, '');
  if (digitsOnly.length === LOTTERY_TICKET_LENGTH && digitsOnly.length === raw.length) {
    return digitsOnly.split('').map((digit) => Number(digit));
  }

  const matches = raw.match(/\d{1,2}/g) || [];
  return matches.map((value) => Number(value));
}

function normalizeTicketNumbers(input) {
  const numbers = parseLotteryNumbers(input);
  if (numbers.length !== LOTTERY_TICKET_LENGTH) return null;

  const seen = new Set();
  for (const value of numbers) {
    if (!Number.isInteger(value)) return null;
    if (value < LOTTERY_MIN_NUMBER || value > LOTTERY_MAX_NUMBER) return null;
    if (seen.has(value)) return null;
    seen.add(value);
  }
  return numbers;
}

function formatLotteryNumbersForDisplay(numbers = []) {
  const normalized = normalizeTicketNumbers(numbers) || parseLotteryNumbers(numbers);
  if (!normalized.length) return '';
  return normalized.map((value) => String(value)).join(' ');
}

function countTicketMatches(ticketNumbers, winningNumbers) {
  const normalizedTicket = normalizeTicketNumbers(ticketNumbers) || parseLotteryNumbers(ticketNumbers);
  if (!normalizedTicket.length || !winningNumbers || !winningNumbers.length) return 0;
  const winningSet = new Set(winningNumbers);
  return normalizedTicket.reduce((sum, value) => sum + (winningSet.has(value) ? 1 : 0), 0);
}

function getPrizeForMatches(matches, lotteryConfig = null) {
  const payout = lotteryConfig?.payoutByMatches && typeof lotteryConfig.payoutByMatches === 'object'
    ? lotteryConfig.payoutByMatches
    : {};
  const value = Number(payout[matches]);
  if (Number.isFinite(value) && value >= 0) return value;
  return 0;
}

module.exports = {
  LOTTERY_TICKET_LENGTH,
  LOTTERY_MIN_NUMBER,
  LOTTERY_MAX_NUMBER,
  startOfDayLocal,
  nextMidnightLocal,
  isSameLocalDay,
  getDayKey,
  getDrawAt,
  getNextDrawAt,
  formatDrawTimeLabel,
  generateLotteryNumbers,
  formatLotteryNumbers,
  parseLotteryNumbers,
  normalizeTicketNumbers,
  formatLotteryNumbersForDisplay,
  countTicketMatches,
  getPrizeForMatches,
};
