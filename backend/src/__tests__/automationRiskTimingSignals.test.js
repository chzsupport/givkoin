const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateTimingSignals,
} = require('../services/automationRisk/automationRiskTimingSignals');
const {
  createRiskContext,
} = require('../services/automationRisk/automationRiskScoring');

function makeTimedActivities() {
  const minutes = [0, 1, -1, 0, 1, 0, -1, 1];
  return minutes.map((minuteOffset, index) => {
    const day = String(index + 1).padStart(2, '0');
    const minute = 30 + minuteOffset;
    return {
      type: 'solar_collect',
      createdAt: `2026-05-${day}T12:${String(minute).padStart(2, '0')}:10.000Z`,
    };
  });
}

test('automation risk timing signals detect repeated profitable timing and instant actions', () => {
  const ctx = createRiskContext({ _id: 'u1' }, new Date('2026-05-26T00:00:00.000Z'));
  const profitableActivities = makeTimedActivities();
  const pageViews = profitableActivities.map((activity) => ({
    createdAt: new Date(new Date(activity.createdAt).getTime() - 10000).toISOString(),
  }));

  evaluateTimingSignals(ctx, pageViews, profitableActivities, [], new Date('2026-05-26T00:00:00.000Z'));

  assert.equal(ctx.signals.has('low_interval_variation'), true);
  assert.equal(ctx.signals.has('precise_daily_timing'), true);
  assert.equal(ctx.signals.has('immediate_profit_actions'), true);
  assert.equal(ctx.summary.profitableActions, 8);
  assert.equal(ctx.summary.profitRoutineSignature.startsWith('solar_collect:8#'), true);
});

test('automation risk timing signals detect uniform short sessions and overlap', () => {
  const ctx = createRiskContext({ _id: 'u1' }, new Date('2026-05-26T00:00:00.000Z'));
  const sessions = Array.from({ length: 8 }, (_, index) => {
    const start = new Date(`2026-05-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`);
    const seconds = index % 2 ? 61 : 60;
    return {
      sessionId: `s${index}`,
      startedAt: start.toISOString(),
      endedAt: new Date(start.getTime() + seconds * 1000).toISOString(),
    };
  });
  sessions.push(
    {
      sessionId: 'overlap-a',
      startedAt: '2026-05-20T10:00:00.000Z',
      endedAt: '2026-05-20T10:20:00.000Z',
    },
    {
      sessionId: 'overlap-b',
      startedAt: '2026-05-20T10:02:00.000Z',
      endedAt: '2026-05-20T10:22:00.000Z',
    },
    {
      sessionId: 'overlap-c',
      startedAt: '2026-05-20T10:03:00.000Z',
      endedAt: '2026-05-20T10:23:00.000Z',
    },
  );

  evaluateTimingSignals(ctx, [], [], sessions, new Date('2026-05-26T00:00:00.000Z'));

  assert.equal(ctx.signals.has('short_session_uniformity'), true);
  assert.equal(ctx.signals.has('parallel_session_overlap'), true);
});
