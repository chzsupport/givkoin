const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FREEZE_SCORE_THRESHOLD,
  HIGH_RISK_SCORE_THRESHOLD,
  REVIEW_SCORE_THRESHOLD,
  qualifiesAutomaticFreeze,
  resolveClusterStatus,
  riskLevelByScore,
} = require('../services/multiAccount/riskDecision');

test('multi-account risk decision score thresholds stay stable', () => {
  assert.equal(FREEZE_SCORE_THRESHOLD, 100);
  assert.equal(HIGH_RISK_SCORE_THRESHOLD, 70);
  assert.equal(REVIEW_SCORE_THRESHOLD, 45);
});

test('multi-account risk decision maps score to level', () => {
  assert.equal(riskLevelByScore(0), 'low');
  assert.equal(riskLevelByScore(30), 'medium');
  assert.equal(riskLevelByScore(60), 'high');
  assert.equal(riskLevelByScore(90), 'critical');
});

test('multi-account risk decision resolves cluster status', () => {
  assert.equal(resolveClusterStatus({ freezeStatus: 'banned' }), 'resolved');
  assert.equal(resolveClusterStatus({ freezeStatus: 'unfrozen' }), 'resolved');
  assert.equal(resolveClusterStatus({ freezeStatus: 'watch', riskScore: 100 }), 'watch');
  assert.equal(resolveClusterStatus({ shouldFreeze: true }), 'frozen');
  assert.equal(resolveClusterStatus({ riskScore: 70 }), 'high_risk');
  assert.equal(resolveClusterStatus({ riskScore: 69 }), 'watch');
});

test('multi-account automatic freeze requires score, evidence count, categories, and strong signals', () => {
  const validEvidence = [
    { signal: 'shared_fingerprint', category: 'technical' },
    { signal: 'session_sync', category: 'sessions' },
    { signal: 'parallel_battle', category: 'battle' },
    { signal: 'network_risk', category: 'network' },
    { signal: 'economy_funneling', category: 'economy' },
  ];

  assert.equal(qualifiesAutomaticFreeze({ riskScore: 100, evidence: validEvidence }), true);
  assert.equal(qualifiesAutomaticFreeze({ riskScore: 99, evidence: validEvidence }), false);
  assert.equal(qualifiesAutomaticFreeze({ riskScore: 100, evidence: validEvidence.slice(0, 4) }), false);
  assert.equal(qualifiesAutomaticFreeze({
    riskScore: 100,
    evidence: validEvidence.map((entry) => (
      entry.signal === 'shared_fingerprint' ? { ...entry, signal: 'shared_weak_fingerprint' } : entry
    )),
  }), false);
  assert.equal(qualifiesAutomaticFreeze({
    riskScore: 100,
    evidence: validEvidence.map((entry) => (
      entry.category === 'sessions' ? { ...entry, category: 'network' } : entry
    )),
  }), false);
});
