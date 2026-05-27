const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBattleProfiles,
} = require('../services/automationRisk/automationRiskBattleProfiles');

test('automation risk battle profiles aggregate telemetry rows', () => {
  const profiles = buildBattleProfiles(new Map([[
    'u1',
    [
      {
        automationTelemetry: {
          shotTelemetryCount: 10,
          intervalCount: 2,
          intervalSumMs: 200,
          intervalSqSumMs: 20000,
          staticCursorShots: 4,
          hiddenTabShotCount: 1,
          cursorDistancePxTotal: 500,
          screenMinNx: 0.2,
          screenMaxNx: 0.5,
          screenMinNy: 0.1,
          screenMaxNy: 0.4,
        },
        voiceCommandsTotalAttempts: 3,
        voiceCommandsSuccess: 2,
      },
      {
        automationTelemetry: {
          shotTelemetryCount: 5,
          intervalCount: 1,
          intervalSumMs: 100,
          intervalSqSumMs: 10000,
          staticCursorShots: 1,
          hiddenTabShotCount: 2,
          cursorDistancePxTotal: 250,
          screenMinNx: 0.1,
          screenMaxNx: 0.9,
          screenMinNy: 0.2,
          screenMaxNy: 0.7,
        },
        voiceCommandsTotalAttempts: 1,
        voiceCommandsSuccess: 1,
      },
    ],
  ]]));

  const profile = profiles.get('u1');

  assert.equal(profile.shots, 15);
  assert.equal(profile.staticRatio, 5 / 15);
  assert.equal(profile.hiddenRatio, 3 / 15);
  assert.equal(profile.screenWidth, 0.8);
  assert.equal(profile.screenHeight, 0.6);
  assert.equal(profile.avgCursorDistancePx, 50);
  assert.equal(profile.voiceSuccessRate, 3 / 4);
});

test('automation risk battle profiles keep safe defaults for empty telemetry', () => {
  const profiles = buildBattleProfiles(new Map([['u1', [{ automationTelemetry: {} }]]]));
  const profile = profiles.get('u1');

  assert.equal(profile.shots, 0);
  assert.equal(profile.staticRatio, 0);
  assert.equal(profile.hiddenRatio, 0);
  assert.equal(profile.avgCursorDistancePx, 0);
  assert.equal(profile.voiceSuccessRate, 0);
});
