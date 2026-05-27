function cleanText(value) {
  return String(value || '').trim();
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 3) {
  const n = safeNumber(value);
  const power = 10 ** digits;
  return Math.round(n * power) / power;
}

function toPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function coefficientFromMoments(sum, sqSum, count) {
  const safeCount = Math.max(0, Math.floor(safeNumber(count)));
  if (safeCount < 2) return 0;
  const avg = safeNumber(sum) / safeCount;
  if (!avg) return 0;
  const variance = Math.max(0, (safeNumber(sqSum) / safeCount) - (avg ** 2));
  return Math.sqrt(variance) / avg;
}

function overlapDurationMs(leftStart, leftEnd, rightStart, rightEnd) {
  const start = Math.max(new Date(leftStart || 0).getTime(), new Date(rightStart || 0).getTime());
  const end = Math.min(new Date(leftEnd || 0).getTime(), new Date(rightEnd || 0).getTime());
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

function buildBattleProfiles(rows = []) {
  const profiles = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const userId = cleanText(row?.userId);
    if (!userId) return;
    if (!profiles.has(userId)) {
      profiles.set(userId, {
        userId,
        shots: 0,
        intervalCount: 0,
        intervalSumMs: 0,
        intervalSqSumMs: 0,
        staticCursorShots: 0,
        hiddenTabShotCount: 0,
        cursorDistancePxTotal: 0,
        screenMinNx: 1,
        screenMaxNx: 0,
        screenMinNy: 1,
        screenMaxNy: 0,
        battleIds: new Set(),
        latestAt: null,
      });
    }
    const profile = profiles.get(userId);
    const telemetry = toPlainObject(row?.automationTelemetry);
    profile.shots += Math.max(0, Math.floor(safeNumber(telemetry.shotTelemetryCount)));
    profile.intervalCount += Math.max(0, Math.floor(safeNumber(telemetry.intervalCount)));
    profile.intervalSumMs += Math.max(0, safeNumber(telemetry.intervalSumMs));
    profile.intervalSqSumMs += Math.max(0, safeNumber(telemetry.intervalSqSumMs));
    profile.staticCursorShots += Math.max(0, Math.floor(safeNumber(telemetry.staticCursorShots)));
    profile.hiddenTabShotCount += Math.max(0, Math.floor(safeNumber(telemetry.hiddenTabShotCount)));
    profile.cursorDistancePxTotal += Math.max(0, safeNumber(telemetry.cursorDistancePxTotal));
    if (Number.isFinite(safeNumber(telemetry.screenMinNx))) profile.screenMinNx = Math.min(profile.screenMinNx, safeNumber(telemetry.screenMinNx));
    if (Number.isFinite(safeNumber(telemetry.screenMaxNx))) profile.screenMaxNx = Math.max(profile.screenMaxNx, safeNumber(telemetry.screenMaxNx));
    if (Number.isFinite(safeNumber(telemetry.screenMinNy))) profile.screenMinNy = Math.min(profile.screenMinNy, safeNumber(telemetry.screenMinNy));
    if (Number.isFinite(safeNumber(telemetry.screenMaxNy))) profile.screenMaxNy = Math.max(profile.screenMaxNy, safeNumber(telemetry.screenMaxNy));
    if (cleanText(row?.battleId)) profile.battleIds.add(cleanText(row.battleId));
    if (!profile.latestAt || new Date(row?.happenedAt || 0).getTime() > new Date(profile.latestAt || 0).getTime()) {
      profile.latestAt = row?.happenedAt || null;
    }
  });

  return new Map(Array.from(profiles.entries()).map(([userId, profile]) => {
    const intervalCv = coefficientFromMoments(profile.intervalSumMs, profile.intervalSqSumMs, profile.intervalCount);
    const staticRatio = profile.shots ? profile.staticCursorShots / profile.shots : 0;
    const hiddenRatio = profile.shots ? profile.hiddenTabShotCount / profile.shots : 0;
    const avgCursorDistancePx = profile.shots ? profile.cursorDistancePxTotal / profile.shots : 0;
    return [userId, {
      ...profile,
      intervalCv: round(intervalCv, 5),
      staticRatio: round(staticRatio, 5),
      hiddenRatio: round(hiddenRatio, 5),
      avgCursorDistancePx: round(avgCursorDistancePx, 3),
      screenWidth: round(Math.max(0, profile.screenMaxNx - profile.screenMinNx), 5),
      screenHeight: round(Math.max(0, profile.screenMaxNy - profile.screenMinNy), 5),
      battleIds: Array.from(profile.battleIds),
    }];
  }));
}

module.exports = {
  buildBattleProfiles,
  overlapDurationMs,
};
