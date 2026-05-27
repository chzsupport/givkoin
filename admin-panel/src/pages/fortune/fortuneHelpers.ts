import type { FortuneApiError, LotteryConfig, RouletteConfig, RouletteSector } from './fortuneTypes';

export function createDefaultRouletteConfig(): RouletteConfig {
  return {
    dailyFreeSpins: 3,
    minSpinsSinceStar: 21,
    minDaysSinceStar: 7,
    sectors: [],
  };
}

export function createDefaultLotteryConfig(): LotteryConfig {
  return {
    ticketCost: 100,
    maxTicketsPerDay: 10,
    drawHour: 23,
    drawMinute: 59,
    payoutByMatches: { 3: 150, 4: 300, 5: 600, 6: 900, 7: 1000 },
  };
}

export function toNum(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function formatDrawTime(hour: unknown, minute: unknown) {
  const h = String(Math.max(0, Math.min(23, Math.round(toNum(hour, 23))))).padStart(2, '0');
  const m = String(Math.max(0, Math.min(59, Math.round(toNum(minute, 59))))).padStart(2, '0');
  return `${h}:${m}`;
}

export function parseDrawTime(input: string) {
  const [h, m] = String(input || '').split(':');
  return {
    hour: Math.max(0, Math.min(23, Math.round(toNum(h, 23)))),
    minute: Math.max(0, Math.min(59, Math.round(toNum(m, 59)))),
  };
}

export function getSectorReadableName(row: RouletteSector) {
  if (row?.type === 'k') return `${toNum(row?.value, 0)} K`;
  if (row?.type === 'star') return `${toNum(row?.value, 0)} ⭐`;
  if (row?.type === 'spin') return '+1 бесплатный спин';
  return String(row?.label || 'Приз');
}

export function getFortuneApiErrorMessage(error: unknown, fallback: string) {
  const apiError = error as FortuneApiError;
  return apiError?.response?.data?.message || apiError?.message || fallback;
}
