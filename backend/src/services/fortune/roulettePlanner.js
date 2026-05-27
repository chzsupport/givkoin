const crypto = require('crypto');

function canRouletteWinStar({
  spinData,
  minSpinsSinceStar,
  minDaysSinceStar,
  now,
  virtualSpinsSinceLastStar = null,
  virtualLastStarWinAt = null,
}) {
  const spinsSinceLastStar = Math.max(0, Math.floor(Number(virtualSpinsSinceLastStar ?? spinData?.spinsSinceLastStar) || 0));
  if (spinsSinceLastStar < minSpinsSinceStar) {
    return false;
  }

  const lastStarWinAt = virtualLastStarWinAt || spinData?.lastStarWinAt;
  if (lastStarWinAt) {
    const daysSinceLastStar = (now - new Date(lastStarWinAt)) / (1000 * 60 * 60 * 24);
    if (daysSinceLastStar < minDaysSinceStar) {
      return false;
    }
  }

  return true;
}

function pickRouletteResult(availableSectors = []) {
  const sectors = Array.isArray(availableSectors) ? availableSectors : [];
  const totalWeight = sectors.reduce((sum, s) => sum + Math.max(0, Number(s.weight) || 0), 0);

  if (!sectors.length || totalWeight <= 0) return null;

  let randomValue = Math.random() * totalWeight;
  let result = sectors[sectors.length - 1];

  for (const sector of sectors) {
    const weight = Math.max(0, Number(sector.weight) || 0);
    if (randomValue < weight) {
      result = sector;
      break;
    }

    randomValue -= weight;
  }

  return result;
}

function getRouletteSectorIndex(allSectors = [], result = null) {
  const originalIndex = allSectors.findIndex((s) => (
    s.label === result?.label
    && s.type === result?.type
    && Number(s.value) === Number(result?.value)
  ));

  return originalIndex < 0 ? 0 : originalIndex;
}

function makeRoulettePlanId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function normalizePlannedRouletteSpin(item = {}) {
  const result = item?.result && typeof item.result === 'object' ? item.result : null;
  if (!result) return null;

  return {
    id: String(item.id || makeRoulettePlanId()),
    sectorIndex: Math.max(0, Math.floor(Number(item.sectorIndex) || 0)),
    result: {
      label: String(result.label || ''),
      value: result.type === 'spin' ? 0 : Number(result.value) || 0,
      type: String(result.type || 'k'),
    },
  };
}

function createRoulettePlanItem({ allSectors, availableSectors }) {
  const result = pickRouletteResult(availableSectors);
  if (!result) return null;

  return normalizePlannedRouletteSpin({
    id: makeRoulettePlanId(),
    sectorIndex: getRouletteSectorIndex(allSectors, result),
    result,
  });
}

function ensurePlannedRouletteSpins({ spinData, rouletteConfig, count, now }) {
  const allSectors = Array.isArray(rouletteConfig?.sectors) ? rouletteConfig.sectors : [];
  const minSpinsSinceStar = Math.max(0, Number(rouletteConfig?.minSpinsSinceStar) || 21);
  const minDaysSinceStar = Math.max(0, Number(rouletteConfig?.minDaysSinceStar) || 7);
  const targetCount = Math.max(0, Math.min(30, Math.floor(Number(count) || 0)));
  const existing = Array.isArray(spinData.pendingRouletteSpins)
    ? spinData.pendingRouletteSpins.map(normalizePlannedRouletteSpin).filter(Boolean)
    : [];

  let virtualSpinsSinceLastStar = Math.max(0, Math.floor(Number(spinData.spinsSinceLastStar) || 0));
  let virtualLastStarWinAt = spinData.lastStarWinAt || null;

  existing.forEach((planned) => {
    if (planned.result?.type === 'star') {
      virtualSpinsSinceLastStar = 0;
      virtualLastStarWinAt = now;
    } else {
      virtualSpinsSinceLastStar += 1;
    }
  });

  while (existing.length < targetCount) {
    let availableSectors = allSectors.filter((s) => s && s.enabled !== false);

    if (!canRouletteWinStar({
      spinData,
      minSpinsSinceStar,
      minDaysSinceStar,
      now,
      virtualSpinsSinceLastStar,
      virtualLastStarWinAt,
    })) {
      availableSectors = availableSectors.filter((s) => s.type !== 'star');
    }

    const planned = createRoulettePlanItem({ allSectors, availableSectors });
    if (!planned) break;

    existing.push(planned);

    if (planned.result?.type === 'star') {
      virtualSpinsSinceLastStar = 0;
      virtualLastStarWinAt = now;
    } else {
      virtualSpinsSinceLastStar += 1;
    }
  }

  spinData.pendingRouletteSpins = existing.slice(0, targetCount);
  return spinData.pendingRouletteSpins;
}

module.exports = {
  canRouletteWinStar,
  pickRouletteResult,
  getRouletteSectorIndex,
  normalizePlannedRouletteSpin,
  createRoulettePlanItem,
  ensurePlannedRouletteSpins,
};
