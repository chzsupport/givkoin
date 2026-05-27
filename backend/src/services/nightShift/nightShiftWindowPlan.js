const crypto = require('crypto');
const { toIso } = require('../documentStore');
const { getSessionHardEndMs, getWindowBounds, safeMs } = require('./nightShiftRuntimeConfig');

const ANOMALY_MIN_INTERVAL_SECONDS = 15;
const ANOMALY_MAX_INTERVAL_SECONDS = 45;
const WINDOW_SECTORS = Object.freeze([
  { id: 'fortune', name: 'Сектор Фортуны', url: '/fortune' },
  { id: 'bridges', name: 'Сектор Мостов', url: '/bridges' },
  { id: 'galaxy', name: 'Сектор Галактики', url: '/galaxy' },
  { id: 'chronicle', name: 'Архивы Хроники', url: '/chronicle' },
  { id: 'news', name: 'Отдел Новостей', url: '/news' },
  { id: 'shop', name: 'Торговый Квартал', url: '/shop' },
]);

function seededUnit(secret, windowIndex, itemIndex, channel = 0) {
  const input = `${String(secret || '')}:${Number(windowIndex) || 0}:${Number(itemIndex) || 0}:${Number(channel) || 0}`;
  const hash = crypto.createHash('sha256').update(input).digest();
  return hash.readUInt32BE(0) / 0xffffffff;
}

function normalizeWindowRuntime(runtime) {
  if (!runtime || typeof runtime !== 'object') return null;
  return {
    ...runtime,
    startedAt: runtime.startedAt || null,
    shiftEndsAt: runtime.shiftEndsAt || null,
    windowSecret: runtime.windowSecret ? String(runtime.windowSecret) : '',
  };
}

function buildWindowPlan(runtime, windowIndex) {
  const normalizedRuntime = normalizeWindowRuntime(runtime);
  if (!normalizedRuntime) return null;

  const startedAtMs = safeMs(normalizedRuntime.startedAt);
  if (startedAtMs == null) return null;

  const bounds = getWindowBounds(startedAtMs, windowIndex);
  const hardEndMs = getSessionHardEndMs(normalizedRuntime);
  if (hardEndMs != null && bounds.startedAt >= hardEndMs) return null;

  const effectiveEndMs = hardEndMs == null
    ? bounds.endedAt
    : Math.min(bounds.endedAt, hardEndMs);

  const anomalies = [];
  let cursorMs = bounds.startedAt;
  let anomalyIndex = 0;

  while (true) {
    const intervalUnit = seededUnit(normalizedRuntime.windowSecret, windowIndex, anomalyIndex, 1);
    const intervalSeconds = ANOMALY_MIN_INTERVAL_SECONDS + Math.floor(intervalUnit * ((ANOMALY_MAX_INTERVAL_SECONDS - ANOMALY_MIN_INTERVAL_SECONDS) + 1));
    cursorMs += intervalSeconds * 1000;
    if (cursorMs >= effectiveEndMs) break;

    const sectorUnit = seededUnit(normalizedRuntime.windowSecret, windowIndex, anomalyIndex, 2);
    const sectorIndex = Math.floor(sectorUnit * WINDOW_SECTORS.length) % WINDOW_SECTORS.length;
    const sector = WINDOW_SECTORS[sectorIndex] || WINDOW_SECTORS[0];
    const anomalyHash = crypto
      .createHash('sha1')
      .update(`${normalizedRuntime.windowSecret}:${windowIndex}:${anomalyIndex}:${sector.id}`)
      .digest('hex')
      .slice(0, 12);

    anomalies.push({
      id: `anomaly_${windowIndex}_${anomalyIndex}_${anomalyHash}`,
      sectorId: sector.id,
      sectorName: sector.name,
      sectorUrl: sector.url,
      spawnAt: toIso(cursorMs),
    });
    anomalyIndex += 1;
  }

  return {
    index: Math.max(0, Math.floor(Number(windowIndex) || 0)),
    startedAt: toIso(bounds.startedAt),
    endedAt: toIso(effectiveEndMs),
    anomalies,
  };
}

module.exports = {
  ANOMALY_MAX_INTERVAL_SECONDS,
  ANOMALY_MIN_INTERVAL_SECONDS,
  WINDOW_SECTORS,
  buildWindowPlan,
};
