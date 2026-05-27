const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addSignal,
  buildTimelineTemplate,
  coefficientFromMoments,
  coefficientOfVariation,
  cosineSimilarity,
  createRiskContext,
  jaccardSimilarity,
  normalizeSignalValue,
  normalizeVector,
  riskLevelByScore,
  round,
  safeNumber,
  sanitizeEvidence,
  sanitizeTimeline,
  sortByDate,
  standardDeviation,
  toDayKey,
  uniq,
} = require('../services/automationRisk/automationRiskScoring');

test('automation risk scoring normalizes values and score levels', () => {
  assert.equal(normalizeSignalValue(' Device-1 '), 'device-1');
  assert.equal(riskLevelByScore(29.99), 'low');
  assert.equal(riskLevelByScore(30), 'medium');
  assert.equal(riskLevelByScore(60), 'high');
  assert.equal(riskLevelByScore(90), 'critical');
});

test('automation risk scoring keeps day keys and timeline stable', () => {
  const now = new Date('2026-05-26T12:00:00.000Z');
  assert.equal(toDayKey(now), '2026-05-26');
  assert.equal(toDayKey('bad-date'), '');
  assert.deepEqual(buildTimelineTemplate(now, 3).map((row) => row.dateKey), [
    '2026-05-24',
    '2026-05-25',
    '2026-05-26',
  ]);
});

test('automation risk scoring adds signal to score, evidence and timeline', () => {
  const now = new Date('2026-05-26T12:00:00.000Z');
  const ctx = createRiskContext({ _id: 'u1' }, now, { riskWindowDays: 2 });

  addSignal(ctx, {
    signal: 'same_device',
    score: 7.5,
    category: 'identity',
    summary: 'Одинаковое устройство',
    happenedAt: now,
    relatedUsers: ['u1', 'u2'],
    meta: { device: 'd1' },
  });

  assert.equal(ctx.score, 7.5);
  assert.deepEqual(Array.from(ctx.signals), ['same_device']);
  assert.deepEqual(Array.from(ctx.relatedUsers), ['u2']);
  assert.equal(ctx.evidence.length, 1);
  assert.equal(ctx.timelineMap.get('2026-05-26').score, 7.5);
  assert.deepEqual(ctx.timelineMap.get('2026-05-26').signals, ['same_device']);
});

test('automation risk scoring math helpers stay stable', () => {
  assert.equal(round(1.2345, 2), 1.23);
  assert.equal(safeNumber('bad', 4), 4);
  assert.deepEqual(normalizeVector([1, 1, 2]), [0.25, 0.25, 0.5]);
  assert.equal(standardDeviation([1, 1, 1]), 0);
  assert.equal(coefficientOfVariation([2, 2, 2]), 0);
  assert.equal(coefficientFromMoments(6, 14, 3) > 0, true);
  assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
  assert.equal(jaccardSimilarity(new Set([1, 2]), new Set([2, 3])), 1 / 3);
});

test('automation risk scoring sanitizes and sorts rows', () => {
  const rows = [
    { createdAt: '2026-05-26T02:00:00.000Z', id: 2 },
    { createdAt: '2026-05-26T01:00:00.000Z', id: 1 },
  ];
  assert.deepEqual(sortByDate(rows).map((row) => row.id), [1, 2]);
  assert.deepEqual(uniq(['a', '', 'a', 'b']), ['a', 'b']);

  const evidence = sanitizeEvidence([
    {
      happenedAt: new Date('2026-05-26T01:00:00.000Z'),
      category: 'system',
      signal: 'old',
      score: 1.234,
      summary: 'old',
      meta: {},
    },
    {
      happenedAt: new Date('2026-05-26T02:00:00.000Z'),
      category: 'system',
      signal: 'new',
      score: 2.345,
      summary: 'new',
      meta: {},
    },
  ]);
  assert.deepEqual(evidence.map((row) => row.signal), ['new', 'old']);
  assert.equal(evidence[0].score, 2.35);

  assert.deepEqual(sanitizeTimeline([
    { dateKey: 'd', score: 1.234, signalCount: 2, evidenceCount: 3, signals: ['a', 'a', 'b'] },
  ]), [
    { dateKey: 'd', score: 1.23, signalCount: 2, evidenceCount: 3, signals: ['a', 'b'] },
  ]);
});
