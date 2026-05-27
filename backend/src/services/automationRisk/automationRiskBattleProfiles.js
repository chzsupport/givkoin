const {
  coefficientFromMoments,
  safeNumber,
} = require('./automationRiskScoring');

function buildBattleProfiles(battleAttendancesByUser = new Map()) {
  const profiles = new Map();

  for (const [userId, telemetryRows] of battleAttendancesByUser.entries()) {
    const aggregate = {
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
      voiceCommandsTotalAttempts: 0,
      voiceCommandsSuccess: 0,
    };

    for (const row of telemetryRows) {
      const telemetry = row?.automationTelemetry || {};
      aggregate.shots += safeNumber(telemetry.shotTelemetryCount);
      aggregate.intervalCount += safeNumber(telemetry.intervalCount);
      aggregate.intervalSumMs += safeNumber(telemetry.intervalSumMs);
      aggregate.intervalSqSumMs += safeNumber(telemetry.intervalSqSumMs);
      aggregate.staticCursorShots += safeNumber(telemetry.staticCursorShots);
      aggregate.hiddenTabShotCount += safeNumber(telemetry.hiddenTabShotCount);
      aggregate.cursorDistancePxTotal += safeNumber(telemetry.cursorDistancePxTotal);
      if (Number.isFinite(Number(telemetry.screenMinNx))) aggregate.screenMinNx = Math.min(aggregate.screenMinNx, Number(telemetry.screenMinNx));
      if (Number.isFinite(Number(telemetry.screenMaxNx))) aggregate.screenMaxNx = Math.max(aggregate.screenMaxNx, Number(telemetry.screenMaxNx));
      if (Number.isFinite(Number(telemetry.screenMinNy))) aggregate.screenMinNy = Math.min(aggregate.screenMinNy, Number(telemetry.screenMinNy));
      if (Number.isFinite(Number(telemetry.screenMaxNy))) aggregate.screenMaxNy = Math.max(aggregate.screenMaxNy, Number(telemetry.screenMaxNy));
      aggregate.voiceCommandsTotalAttempts += safeNumber(row?.voiceCommandsTotalAttempts);
      aggregate.voiceCommandsSuccess += safeNumber(row?.voiceCommandsSuccess);
    }

    const shots = Math.max(0, aggregate.shots);
    const intervalCv = coefficientFromMoments(
      aggregate.intervalSumMs,
      aggregate.intervalSqSumMs,
      aggregate.intervalCount,
    );
    profiles.set(userId, {
      shots,
      staticRatio: shots ? aggregate.staticCursorShots / shots : 0,
      intervalCv,
      hiddenRatio: shots ? aggregate.hiddenTabShotCount / shots : 0,
      screenWidth: Math.max(0, aggregate.screenMaxNx - aggregate.screenMinNx),
      screenHeight: Math.max(0, aggregate.screenMaxNy - aggregate.screenMinNy),
      avgCursorDistancePx: shots ? aggregate.cursorDistancePxTotal / shots : 0,
      voiceSuccessRate: aggregate.voiceCommandsTotalAttempts
        ? aggregate.voiceCommandsSuccess / aggregate.voiceCommandsTotalAttempts
        : 0,
    });
  }

  return profiles;
}

module.exports = {
  buildBattleProfiles,
};
