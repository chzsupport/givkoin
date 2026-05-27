const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateBattleSignals,
} = require('../services/automationRisk/automationRiskBattleSignals');
const {
  createRiskContext,
} = require('../services/automationRisk/automationRiskScoring');

test('automation risk battle signals detect static cursor rhythm hidden tab and modal bursts', () => {
  const ctx = createRiskContext({ _id: 'u1' }, new Date('2026-05-26T00:00:00.000Z'));
  const battleAttendances = [
    {
      happenedAt: '2026-05-20T10:10:00.000Z',
      voiceCommandsTotalAttempts: 10,
      voiceCommandsSuccess: 1,
      automationTelemetry: {
        shotTelemetryCount: 130,
        intervalCount: 100,
        intervalSumMs: 10050,
        intervalSqSumMs: 1010050,
        staticCursorShots: 100,
        hiddenTabShotCount: 6,
        screenMinNx: 0.41,
        screenMaxNx: 0.44,
        screenMinNy: 0.52,
        screenMaxNy: 0.55,
      },
    },
  ];
  const behaviorEvents = [
    {
      category: 'battle',
      eventType: 'battle_result_modal_same_spot_burst',
      occurredAt: '2026-05-20T10:12:00.000Z',
    },
    {
      category: 'battle',
      eventType: 'battle_result_modal_same_spot_burst',
      occurredAt: '2026-05-20T10:12:30.000Z',
    },
  ];

  evaluateBattleSignals(ctx, battleAttendances, behaviorEvents, new Date('2026-05-26T00:00:00.000Z'));

  assert.equal(ctx.signals.has('battle_static_cursor'), true);
  assert.equal(ctx.signals.has('battle_stable_click_rhythm'), true);
  assert.equal(ctx.signals.has('battle_hidden_tab_shots'), true);
  assert.equal(ctx.signals.has('battle_result_modal_same_spot_burst'), true);
  assert.equal(ctx.signals.has('battle_voice_ignore_pattern'), true);
  const staticEvidence = ctx.evidence.find((row) => row.signal === 'battle_static_cursor');
  assert.equal(staticEvidence.meta.shots, 130);
  assert.equal(staticEvidence.meta.staticCursorShots, 100);
});

test('automation risk battle signals keep empty data harmless', () => {
  const ctx = createRiskContext({ _id: 'u1' }, new Date('2026-05-26T00:00:00.000Z'));

  evaluateBattleSignals(ctx, [], [], new Date('2026-05-26T00:00:00.000Z'));

  assert.equal(ctx.score, 0);
  assert.equal(ctx.evidence.length, 0);
});
