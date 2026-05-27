const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateNavigationSignals,
} = require('../services/automationRisk/automationRiskNavigationSignals');
const {
  createRiskContext,
} = require('../services/automationRisk/automationRiskScoring');

function makePageViews(count, pathForIndex) {
  return Array.from({ length: count }, (_, index) => ({
    createdAt: `2026-05-${String((index % 12) + 1).padStart(2, '0')}T10:00:00.000Z`,
    meta: {
      path: pathForIndex(index),
      navigationSource: 'direct_open',
    },
  }));
}

test('automation risk navigation signals detect direct target bias and narrow exploration', () => {
  const ctx = createRiskContext({
    _id: 'u1',
    createdAt: '2026-05-01T00:00:00.000Z',
  }, new Date('2026-05-26T00:00:00.000Z'));
  const pageViews = makePageViews(25, (index) => (index % 2 ? '/battle' : '/fortune/roulette'));

  evaluateNavigationSignals(ctx, pageViews, [], new Date('2026-05-26T00:00:00.000Z'));

  assert.equal(ctx.signals.has('direct_navigation_bias'), true);
  assert.equal(ctx.signals.has('narrow_page_exploration'), true);
  assert.equal(ctx.summary.directTargetViews, 25);
  assert.equal(ctx.summary.directNavigationSignature, '/fortune/roulette:13|/battle:12');
});

test('automation risk navigation signals detect skipped chain and profit without exploration', () => {
  const ctx = createRiskContext({
    _id: 'u1',
    createdAt: '2026-05-01T00:00:00.000Z',
  }, new Date('2026-05-26T00:00:00.000Z'));
  const pageViews = makePageViews(10, (index) => (index % 2 ? '/battle' : '/bridges')).map((row, index) => ({
    ...row,
    meta: {
      ...row.meta,
      chainExpected: true,
      chainSatisfied: index > 5,
    },
  }));
  const profitableActivities = Array.from({ length: 12 }, (_, index) => ({
    type: 'solar_collect',
    createdAt: `2026-05-${String((index % 12) + 1).padStart(2, '0')}T12:00:00.000Z`,
  }));

  evaluateNavigationSignals(ctx, pageViews, profitableActivities, new Date('2026-05-26T00:00:00.000Z'));

  assert.equal(ctx.signals.has('skipped_navigation_chain'), true);
  assert.equal(ctx.signals.has('profit_without_exploration'), true);
});
