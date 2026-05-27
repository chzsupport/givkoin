const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDirectNavigationSignature,
  buildProfitRoutineSignature,
  getPagePath,
  isNavigationTargetPath,
} = require('../services/automationRisk/automationRiskNavigation');

test('automation risk navigation recognizes target paths without query', () => {
  assert.equal(isNavigationTargetPath('/fortune/roulette?x=1'), true);
  assert.equal(isNavigationTargetPath('/fortune/roulette/details'), true);
  assert.equal(isNavigationTargetPath('/cabinet'), false);
});

test('automation risk navigation reads page path from row meta', () => {
  assert.equal(getPagePath({ meta: { path: '/battle?from=tree' } }), '/battle');
  assert.equal(getPagePath({ meta: {} }), '');
});

test('automation risk navigation builds stable direct signature', () => {
  const signature = buildDirectNavigationSignature([
    { meta: { path: '/battle?x=1' } },
    { meta: { path: '/battle' } },
    { meta: { path: '/bridges' } },
    { meta: { path: '/fortune/roulette' } },
    { meta: { path: '/fortune/roulette' } },
    { meta: { path: '/fortune/roulette' } },
  ]);

  assert.equal(signature, '/fortune/roulette:3|/battle:2|/bridges:1');
});

test('automation risk navigation builds profit routine signature', () => {
  const signature = buildProfitRoutineSignature([
    { type: 'solar_collect', createdAt: '2026-05-01T01:00:00.000Z' },
    { type: 'solar_collect', createdAt: '2026-05-01T07:00:00.000Z' },
    { type: 'roulette_spin', createdAt: '2026-05-01T13:00:00.000Z' },
    { type: 'fruit_collect', createdAt: 'bad-date' },
  ]);

  assert.equal(signature, 'solar_collect:2|fruit_collect:1|roulette_spin:1#1,1,1,0');
});
