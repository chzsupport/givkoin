const { getSetting, setSetting } = require('../utils/settings');

const FORTUNE_CONFIG_KEY = 'FORTUNE_CONFIG_V1';

const DEFAULT_CONFIG = {
  roulette: {
    dailyFreeSpins: 3,
    minSpinsSinceStar: 21,
    minDaysSinceStar: 7,
    sectors: [
      { label: '1', value: 1, type: 'k', weight: 200, enabled: true },
      { label: '5', value: 5, type: 'k', weight: 150, enabled: true },
      { label: '10', value: 10, type: 'k', weight: 120, enabled: true },
      { label: '15', value: 15, type: 'k', weight: 100, enabled: true },
      { label: '20', value: 20, type: 'k', weight: 80, enabled: true },
      { label: '30', value: 30, type: 'k', weight: 60, enabled: true },
      { label: '40', value: 40, type: 'k', weight: 40, enabled: true },
      { label: '50', value: 50, type: 'k', weight: 30, enabled: true },
      { label: '60', value: 60, type: 'k', weight: 20, enabled: true },
      { label: '70', value: 70, type: 'k', weight: 15, enabled: true },
      { label: '80', value: 80, type: 'k', weight: 10, enabled: true },
      { label: '90', value: 90, type: 'k', weight: 5, enabled: true },
      { label: '100', value: 100, type: 'k', weight: 2, enabled: true },
      { label: '+1', value: 0, type: 'spin', weight: 50, enabled: true },
      { label: '0.5⭐', value: 0.5, type: 'star', weight: 1, enabled: true },
    ],
  },
  lottery: {
    ticketCost: 100,
    maxTicketsPerDay: 10,
    drawHour: 23,
    drawMinute: 59,
    payoutByMatches: {
      3: 150,
      4: 300,
      5: 600,
      6: 900,
      7: 1000,
    },
  },
};

function validationError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(value, min, max, fallback) {
  const n = toNumber(value, fallback);
  if (!Number.isFinite(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function normalizeSector(value, fallback, idx) {
  const source = value && typeof value === 'object' ? value : {};
  const base = fallback || DEFAULT_CONFIG.roulette.sectors[idx] || DEFAULT_CONFIG.roulette.sectors[0];
  const type = ['k', 'star', 'spin'].includes(String(source.type || base.type)) ? String(source.type || base.type) : base.type;
  const amountRaw = source.value !== undefined ? source.value : base.value;
  const amount = type === 'spin' ? 0 : Math.max(0, toNumber(amountRaw, toNumber(base.value, 0)));

  return {
    label: String(source.label || base.label || '').trim() || base.label,
    type,
    value: amount,
    weight: Math.max(1, clamp(source.weight, 1, 100000, base.weight || 1)),
    enabled: source.enabled === undefined ? Boolean(base.enabled) : Boolean(source.enabled),
  };
}

function normalizeRoulette(rawRoulette) {
  const base = DEFAULT_CONFIG.roulette;
  const source = rawRoulette && typeof rawRoulette === 'object' ? rawRoulette : {};

  const inputSectors = Array.isArray(source.sectors) ? source.sectors : base.sectors;
  const sectors = base.sectors.map((fallback, idx) => normalizeSector(inputSectors[idx], fallback, idx));

  return {
    dailyFreeSpins: Math.round(clamp(source.dailyFreeSpins, 1, 30, base.dailyFreeSpins)),
    minSpinsSinceStar: Math.round(clamp(source.minSpinsSinceStar, 0, 500, base.minSpinsSinceStar)),
    minDaysSinceStar: Math.round(clamp(source.minDaysSinceStar, 0, 365, base.minDaysSinceStar)),
    sectors,
  };
}

function normalizeLottery(rawLottery) {
  const base = DEFAULT_CONFIG.lottery;
  const source = rawLottery && typeof rawLottery === 'object' ? rawLottery : {};
  const payout = source.payoutByMatches && typeof source.payoutByMatches === 'object'
    ? source.payoutByMatches
    : {};

  return {
    ticketCost: Math.round(clamp(source.ticketCost, 1, 1000000, base.ticketCost)),
    maxTicketsPerDay: Math.round(clamp(source.maxTicketsPerDay, 1, 1000, base.maxTicketsPerDay)),
    drawHour: Math.round(clamp(source.drawHour, 0, 23, base.drawHour)),
    drawMinute: Math.round(clamp(source.drawMinute, 0, 59, base.drawMinute)),
    payoutByMatches: {
      3: Math.round(clamp(payout[3], 0, 10000000, base.payoutByMatches[3])),
      4: Math.round(clamp(payout[4], 0, 10000000, base.payoutByMatches[4])),
      5: Math.round(clamp(payout[5], 0, 10000000, base.payoutByMatches[5])),
      6: Math.round(clamp(payout[6], 0, 10000000, base.payoutByMatches[6])),
      7: Math.round(clamp(payout[7], 0, 10000000, base.payoutByMatches[7])),
    },
  };
}

function normalizeFortuneConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    roulette: normalizeRoulette(source.roulette),
    lottery: normalizeLottery(source.lottery),
  };
}

async function getFortuneConfig() {
  const stored = await getSetting(FORTUNE_CONFIG_KEY, DEFAULT_CONFIG);
  const normalized = normalizeFortuneConfig(stored);
  return normalized;
}

async function saveFortuneConfig(config, userId = null, description = 'Updated fortune config') {
  const normalized = normalizeFortuneConfig(config);
  await setSetting(FORTUNE_CONFIG_KEY, normalized, description, userId || null);
  return normalized;
}

async function patchRouletteConfig(patch = {}, userId = null) {
  const current = await getFortuneConfig();
  const roulette = normalizeRoulette({
    ...current.roulette,
    ...(patch && typeof patch === 'object' ? patch : {}),
  });
  const activeSectors = Array.isArray(roulette.sectors)
    ? roulette.sectors.filter((row) => row && row.enabled !== false)
    : [];
  if (activeSectors.length < 1) {
    throw validationError('Нужно оставить минимум один активный сектор рулетки');
  }

  const next = {
    ...current,
    roulette,
  };
  return saveFortuneConfig(next, userId, 'Updated roulette config');
}

async function patchLotteryConfig(patch = {}, userId = null) {
  const current = await getFortuneConfig();
  const next = {
    ...current,
    lottery: normalizeLottery({
      ...current.lottery,
      ...(patch && typeof patch === 'object' ? patch : {}),
    }),
  };
  return saveFortuneConfig(next, userId, 'Updated lottery config');
}

module.exports = {
  FORTUNE_CONFIG_KEY,
  DEFAULT_CONFIG,
  getFortuneConfig,
  saveFortuneConfig,
  patchRouletteConfig,
  patchLotteryConfig,
  normalizeFortuneConfig,
};

