const HEARTBEAT_WINDOW_SECONDS = 5 * 60;
const EMPTY_WINDOWS_LIMIT = 3;
const HEARTBEAT_TIMEOUT_MS = HEARTBEAT_WINDOW_SECONDS * 1000 * EMPTY_WINDOWS_LIMIT;
const MIN_ANOMALIES_PER_ACTIVE_HOUR = 60;
const MIN_ANOMALIES_PER_PAID_HOUR = 60;
const MAX_SHIFT_MS = 8 * 60 * 60 * 1000;
const SETTLEMENT_DELAY_MIN_MS = 2 * 60 * 1000;
const SETTLEMENT_DELAY_MAX_MS = 5 * 60 * 1000;

function safeMs(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.getTime();
}

function getSettlementDelaySeconds() {
  const spread = SETTLEMENT_DELAY_MAX_MS - SETTLEMENT_DELAY_MIN_MS;
  const delayMs = SETTLEMENT_DELAY_MIN_MS + Math.floor(Math.random() * (spread + 1));
  return Math.floor(delayMs / 1000);
}

function getSyncConfig() {
  return {
    heartbeatWindowSeconds: HEARTBEAT_WINDOW_SECONDS,
    emptyWindowsLimit: EMPTY_WINDOWS_LIMIT,
    minAnomaliesPerActiveHour: MIN_ANOMALIES_PER_ACTIVE_HOUR,
    minAnomaliesPerPaidHour: MIN_ANOMALIES_PER_PAID_HOUR,
  };
}

function getWindowBounds(startedAtMs, windowIndex) {
  const startedAt = startedAtMs + (windowIndex * HEARTBEAT_WINDOW_SECONDS * 1000);
  const endedAt = startedAt + (HEARTBEAT_WINDOW_SECONDS * 1000);
  return {
    startedAt,
    endedAt,
  };
}

function getSessionHardEndMs(runtime) {
  const startedAtMs = safeMs(runtime?.startedAt);
  const shiftEndsAtMs = safeMs(runtime?.shiftEndsAt);
  if (startedAtMs == null && shiftEndsAtMs == null) return null;
  const maxShiftEndMs = startedAtMs == null ? null : startedAtMs + MAX_SHIFT_MS;
  if (shiftEndsAtMs == null) return maxShiftEndMs;
  if (maxShiftEndMs == null) return shiftEndsAtMs;
  return Math.min(shiftEndsAtMs, maxShiftEndMs);
}

module.exports = {
  EMPTY_WINDOWS_LIMIT,
  HEARTBEAT_TIMEOUT_MS,
  HEARTBEAT_WINDOW_SECONDS,
  MAX_SHIFT_MS,
  MIN_ANOMALIES_PER_ACTIVE_HOUR,
  MIN_ANOMALIES_PER_PAID_HOUR,
  getSessionHardEndMs,
  getSettlementDelaySeconds,
  getSyncConfig,
  getWindowBounds,
  safeMs,
};
