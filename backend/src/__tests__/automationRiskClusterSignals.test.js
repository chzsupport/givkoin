const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateBehaviorClusterSignals,
  evaluateStructuralClusterSignals,
} = require('../services/automationRisk/automationRiskClusterSignals');
const {
  createRiskContext,
} = require('../services/automationRisk/automationRiskScoring');

function makeContexts() {
  const own = createRiskContext({ _id: 'u1' }, new Date('2026-05-26T00:00:00.000Z'));
  const related = createRiskContext({ _id: 'u2' }, new Date('2026-05-26T00:00:00.000Z'));
  own.relatedUsers.add('u2');
  return {
    own,
    related,
    contextsByUserId: new Map([
      ['u1', own],
      ['u2', related],
    ]),
  };
}

test('automation risk cluster signals detect similar progress achievements and battle signatures', () => {
  const { own, contextsByUserId } = makeContexts();
  const progressProfilesByUser = new Map([
    ['u1', {
      structureVector: [10, 2, 1],
      earningsVector: [100, 50, 5],
      scaleVector: [3, 4, 5],
      achievementIds: new Set(['a', 'b', 'c', 'd']),
    }],
    ['u2', {
      structureVector: [10, 2, 1],
      earningsVector: [100, 50, 5],
      scaleVector: [3, 4, 5],
      achievementIds: new Set(['a', 'b', 'c', 'd']),
    }],
  ]);
  const battleProfilesByUser = new Map([
    ['u1', {
      shots: 130,
      staticRatio: 0.76,
      intervalCv: 0.04,
      hiddenRatio: 0.03,
      screenWidth: 0.08,
      screenHeight: 0.07,
      avgCursorDistancePx: 12,
    }],
    ['u2', {
      shots: 140,
      staticRatio: 0.74,
      intervalCv: 0.05,
      hiddenRatio: 0.04,
      screenWidth: 0.1,
      screenHeight: 0.08,
      avgCursorDistancePx: 18,
    }],
  ]);

  evaluateStructuralClusterSignals(contextsByUserId, progressProfilesByUser, battleProfilesByUser);

  assert.equal(own.signals.has('progress_structure_cluster'), true);
  assert.equal(own.signals.has('achievement_structure_cluster'), true);
  assert.equal(own.signals.has('battle_signature_cluster'), true);
});

test('automation risk cluster signals detect shared navigation and profit routine signatures', () => {
  const { own, related, contextsByUserId } = makeContexts();
  own.summary.directNavigationSignature = 'direct:/tree>/solar';
  own.summary.directTargetViews = 8;
  own.summary.profitRoutineSignature = 'solar_collect:8#123';
  own.summary.profitableActions = 8;
  related.summary.directNavigationSignature = 'direct:/tree>/solar';
  related.summary.profitRoutineSignature = 'solar_collect:8#123';

  evaluateBehaviorClusterSignals(contextsByUserId);

  assert.equal(own.signals.has('navigation_pattern_cluster'), true);
  assert.equal(own.signals.has('profit_schedule_cluster'), true);
  assert.equal(own.evidence.some((row) => row.signal === 'navigation_pattern_cluster'), true);
  assert.equal(own.evidence.some((row) => row.signal === 'profit_schedule_cluster'), true);
});
