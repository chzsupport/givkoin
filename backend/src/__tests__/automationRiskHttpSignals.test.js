const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateHttpSignals,
  evaluateSessionRestrictionSignals,
} = require('../services/automationRisk/automationRiskHttpSignals');
const {
  createRiskContext,
} = require('../services/automationRisk/automationRiskScoring');

function makeActionEvents() {
  const offsetsSeconds = [0, 60, 121, 181, 242, 302, 363, 423, 484, 544];
  const baseMs = Date.parse('2026-05-20T10:00:00.000Z');
  return offsetsSeconds.map((offset) => ({
    category: 'http',
    eventType: 'request_action',
    path: '/api/solar/collect?from=test',
    occurredAt: new Date(baseMs + offset * 1000).toISOString(),
  }));
}

test('automation risk http signals detect stable action cadence and request errors', () => {
  const ctx = createRiskContext({ _id: 'u1' }, new Date('2026-05-26T00:00:00.000Z'));
  const actionEvents = makeActionEvents();
  const errorEvents = Array.from({ length: 5 }, (_, index) => ({
    category: 'http',
    eventType: 'request_error',
    path: '/api/solar/collect',
    meta: { statusCode: index === 2 ? 429 : 500 },
    occurredAt: new Date(Date.parse('2026-05-20T11:00:00.000Z') + index * 30000).toISOString(),
  }));

  evaluateHttpSignals(ctx, [...errorEvents, ...actionEvents], new Date('2026-05-26T00:00:00.000Z'));

  assert.equal(ctx.signals.has('request_action_cadence'), true);
  assert.equal(ctx.signals.has('request_error_rhythm'), true);
  const actionEvidence = ctx.evidence.find((row) => row.signal === 'request_action_cadence');
  assert.equal(actionEvidence.meta.topPath, '/api/solar/collect');
  assert.equal(actionEvidence.meta.topPathCount, 10);
});

test('automation risk session restriction signals detect activity after revoke', () => {
  const ctx = createRiskContext({ _id: 'u1' }, new Date('2026-05-26T00:00:00.000Z'));
  const sessions = [
    {
      sessionId: 's1',
      revokedAt: '2026-05-20T10:00:00.000Z',
      revokeReason: 'single_session_enforced',
    },
  ];
  const behaviorEvents = [
    {
      sessionId: 's1',
      category: 'http',
      eventType: 'request_action',
      occurredAt: '2026-05-20T10:00:05.000Z',
    },
    {
      sessionId: 's1',
      category: 'battle',
      eventType: 'battle_click',
      occurredAt: '2026-05-20T10:00:20.000Z',
    },
    {
      sessionId: 'other',
      category: 'http',
      eventType: 'request_action',
      occurredAt: '2026-05-20T10:00:30.000Z',
    },
  ];

  evaluateSessionRestrictionSignals(ctx, sessions, behaviorEvents, new Date('2026-05-26T00:00:00.000Z'));

  assert.equal(ctx.signals.has('activity_after_session_revoke'), true);
  assert.equal(ctx.evidence[0].meta.sessions[0].eventsAfterRevoke, 1);
  assert.deepEqual(ctx.evidence[0].meta.sessions[0].sampleEventTypes, ['battle_click']);
});
