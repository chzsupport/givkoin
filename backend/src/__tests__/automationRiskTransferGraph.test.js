const test = require('node:test');
const assert = require('node:assert/strict');

const {
  appendTransferGraphActivity,
  buildTransferGraph,
} = require('../services/automationRisk/automationRiskTransferGraph');

test('automation risk transfer graph aggregates outbound and inbound lumens', () => {
  const graph = buildTransferGraph([
    {
      type: 'solar_share',
      user: 'u1',
      createdAt: '2026-05-01T10:00:00.000Z',
      meta: { recipientId: 'u2', amountLm: 10 },
    },
    {
      type: 'solar_share',
      user: 'u1',
      createdAt: '2026-05-01T11:00:00.000Z',
      meta: { recipientId: 'u2', amountLm: 15 },
    },
    {
      type: 'solar_share',
      user: 'u3',
      createdAt: '2026-05-01T12:00:00.000Z',
      meta: { recipientId: 'u2', amountLm: 7 },
    },
  ]);

  assert.equal(graph.outbound.get('u1').totalLm, 25);
  assert.equal(graph.outbound.get('u1').recipients.get('u2').count, 2);
  assert.equal(graph.outbound.get('u1').recipients.get('u2').lastAt, '2026-05-01T11:00:00.000Z');
  assert.equal(graph.inbound.get('u2').totalLm, 32);
  assert.equal(graph.inbound.get('u2').senders.get('u3').totalLm, 7);
});

test('automation risk transfer graph ignores unrelated or incomplete rows', () => {
  const graph = buildTransferGraph([
    { type: 'chat_message', user: 'u1', meta: { recipientId: 'u2', amountLm: 10 } },
    { type: 'solar_share', user: '', meta: { recipientId: 'u2', amountLm: 10 } },
    { type: 'solar_share', user: 'u1', meta: { recipientId: '', amountLm: 10 } },
    { type: 'solar_share', user: 'u1', meta: { recipientId: 'u2', amountLm: 0 } },
  ]);

  assert.equal(graph.outbound.size, 0);
  assert.equal(graph.inbound.size, 0);
});

test('automation risk transfer graph appends to an existing graph', () => {
  const graph = buildTransferGraph([
    { type: 'solar_share', user: 'u1', createdAt: 'a', meta: { recipientId: 'u2', amountLm: 5 } },
  ]);

  appendTransferGraphActivity(graph, {
    type: 'solar_share',
    user: 'u2',
    createdAt: 'b',
    meta: { recipientId: 'u1', amountLm: 8 },
  });

  assert.equal(graph.outbound.get('u2').totalLm, 8);
  assert.equal(graph.inbound.get('u1').senders.get('u2').lastAt, 'b');
});
