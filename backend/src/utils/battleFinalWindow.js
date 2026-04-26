function normalizeSafeInt(value, fallback) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveBattleSummaryWaveCount(summaryPrepSeconds) {
  return Math.max(1, normalizeSafeInt(summaryPrepSeconds, 10));
}

function resolveBattleSummaryWaveDelayMs({ summaryPrepSeconds, waveCount }) {
  const safeWaveCount = Math.max(1, normalizeSafeInt(waveCount, resolveBattleSummaryWaveCount(summaryPrepSeconds)));
  const prepMs = Math.max(0, normalizeSafeInt(summaryPrepSeconds, 10) * 1000);
  if (!prepMs) return 0;
  return Math.max(1, Math.floor(prepMs / safeWaveCount));
}

function resolveBattleSummaryWaveIndex({
  syncSlot = 0,
  syncSlotCount = 60,
  waveCount = 10,
} = {}) {
  const safeWaveCount = Math.max(1, normalizeSafeInt(waveCount, 10));
  const safeSyncSlotCount = Math.max(1, normalizeSafeInt(syncSlotCount, 60));
  const safeSyncSlot = Math.max(0, normalizeSafeInt(syncSlot, 0)) % safeSyncSlotCount;
  return Math.min(
    safeWaveCount - 1,
    Math.floor((safeSyncSlot * safeWaveCount) / safeSyncSlotCount),
  );
}

function resolveBattleSummaryReleaseState({
  endsAtMs,
  reportAcceptSeconds = 20,
  summaryPrepSeconds = 10,
  syncSlot = 0,
  syncSlotCount = 60,
} = {}) {
  const waveCount = resolveBattleSummaryWaveCount(summaryPrepSeconds);
  const waveIndex = resolveBattleSummaryWaveIndex({
    syncSlot,
    syncSlotCount,
    waveCount,
  });
  const waveDelayMs = resolveBattleSummaryWaveDelayMs({
    summaryPrepSeconds,
    waveCount,
  });

  if (!Number.isFinite(Number(endsAtMs))) {
    return {
      waveCount,
      waveIndex,
      waveDelayMs,
      releaseAtMs: NaN,
    };
  }

  const releaseWindowStartMs = Number(endsAtMs) + (Math.max(0, normalizeSafeInt(reportAcceptSeconds, 20)) * 1000);
  return {
    waveCount,
    waveIndex,
    waveDelayMs,
    releaseAtMs: releaseWindowStartMs + (waveIndex * waveDelayMs),
  };
}

module.exports = {
  resolveBattleSummaryWaveCount,
  resolveBattleSummaryWaveDelayMs,
  resolveBattleSummaryWaveIndex,
  resolveBattleSummaryReleaseState,
};
