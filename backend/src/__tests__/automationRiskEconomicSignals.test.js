const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateEconomicSignals,
} = require('../services/automationRisk/automationRiskEconomicSignals');
const {
  createRiskContext,
} = require('../services/automationRisk/automationRiskScoring');

function makeEmptyGraph() {
  return {
    outbound: new Map(),
    inbound: new Map(),
  };
}

test('automation risk economic signals detect benefit funneling sender', () => {
  const ctx = createRiskContext({ _id: 'u1' }, new Date('2026-05-26T00:00:00.000Z'));
  ctx.relatedUsers.add('u2');
  const transferGraph = makeEmptyGraph();
  transferGraph.outbound.set('u1', {
    totalLm: 100,
    recipients: new Map([
      ['u2', { totalLm: 80, count: 3, lastAt: '2026-05-20T10:00:00.000Z' }],
      ['u9', { totalLm: 20, count: 1, lastAt: '2026-05-20T10:01:00.000Z' }],
    ]),
  });

  evaluateEconomicSignals(ctx, transferGraph, new Date('2026-05-26T00:00:00.000Z'));

  assert.equal(ctx.signals.has('benefit_funneling_sender'), true);
  assert.equal(ctx.evidence[0].meta.dominantRecipientLm, 80);
  assert.equal(ctx.evidence[0].meta.dominantRecipientCount, 3);
});

test('automation risk economic signals detect benefit funneling receiver', () => {
  const ctx = createRiskContext({ _id: 'u1' }, new Date('2026-05-26T00:00:00.000Z'));
  ctx.relatedUsers.add('u2');
  ctx.relatedUsers.add('u3');
  const transferGraph = makeEmptyGraph();
  transferGraph.inbound.set('u1', {
    totalLm: 110,
    senders: new Map([
      ['u2', { totalLm: 50, count: 2, lastAt: '2026-05-20T10:00:00.000Z' }],
      ['u3', { totalLm: 35, count: 2, lastAt: '2026-05-20T10:02:00.000Z' }],
      ['u9', { totalLm: 25, count: 1, lastAt: '2026-05-20T10:03:00.000Z' }],
    ]),
  });

  evaluateEconomicSignals(ctx, transferGraph, new Date('2026-05-26T00:00:00.000Z'));

  assert.equal(ctx.signals.has('benefit_funneling_receiver'), true);
  assert.equal(ctx.evidence[0].meta.totalInboundLm, 110);
  assert.equal(ctx.evidence[0].meta.totalRelatedLm, 85);
});
