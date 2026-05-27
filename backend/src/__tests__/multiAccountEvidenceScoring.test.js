const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DETAIL_SCORES,
  appendDetailedEvidence,
  buildCategoryScores,
  buildEvidenceEntry,
  buildRiskScoreDetailed,
} = require('../services/multiAccount/evidenceScoring');

test('multi-account evidence scoring exposes stable detail scores', () => {
  assert.equal(DETAIL_SCORES.shared_fingerprint, 48);
  assert.equal(DETAIL_SCORES.economy_funneling, 22);
  assert.equal(DETAIL_SCORES.serial_battle_farming, 16);
});

test('multi-account evidence entry normalizes fields without changing shape', () => {
  const entry = buildEvidenceEntry({
    signal: ' shared_ip ',
    category: ' network ',
    score: 8.12345,
    summary: ' Shared address ',
    count: 2.9,
    value: ' 10.0.0.1 ',
    firstSeenAt: '2026-05-24T10:00:00.000Z',
    lastSeenAt: '2026-05-24T11:00:00.000Z',
    matchedUserIds: ['user-1', '', 'user-1', 'user-2'],
    details: { ip: '10.0.0.1' },
  });

  assert.deepEqual(entry, {
    type: 'shared_ip',
    signal: 'shared_ip',
    category: 'network',
    score: 8.123,
    summary: 'Shared address',
    count: 2,
    value: '10.0.0.1',
    firstSeenAt: '2026-05-24T10:00:00.000Z',
    lastSeenAt: '2026-05-24T11:00:00.000Z',
    matchedUserIds: ['user-1', 'user-2'],
    details: { ip: '10.0.0.1' },
  });
});

test('multi-account detailed evidence merges matching entries', () => {
  const rows = [];
  appendDetailedEvidence(rows, buildEvidenceEntry({
    signal: 'shared_device_id',
    category: 'technical',
    score: 20,
    count: 1,
    firstSeenAt: '2026-05-24T12:00:00.000Z',
    lastSeenAt: '2026-05-24T12:00:00.000Z',
    matchedUserIds: ['user-1'],
    details: { deviceId: 'device-1' },
  }));
  appendDetailedEvidence(rows, buildEvidenceEntry({
    signal: 'shared_device_id',
    category: 'technical',
    score: 40,
    count: 3,
    firstSeenAt: '2026-05-24T10:00:00.000Z',
    lastSeenAt: '2026-05-24T13:00:00.000Z',
    matchedUserIds: ['user-2', 'user-1'],
    details: { deviceId: 'device-1' },
  }));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].score, 40);
  assert.equal(rows[0].count, 3);
  assert.equal(rows[0].firstSeenAt, '2026-05-24T10:00:00.000Z');
  assert.equal(rows[0].lastSeenAt, '2026-05-24T13:00:00.000Z');
  assert.deepEqual(rows[0].matchedUserIds, ['user-1', 'user-2']);
});

test('multi-account evidence scoring builds category totals and sorted details', () => {
  const evidence = [
    buildEvidenceEntry({
      signal: 'parallel_battle',
      category: 'battle',
      score: 14.1111,
      lastSeenAt: '2026-05-24T09:00:00.000Z',
    }),
    buildEvidenceEntry({
      signal: 'shared_fingerprint',
      category: 'technical',
      score: 48,
      lastSeenAt: '2026-05-24T12:00:00.000Z',
    }),
    buildEvidenceEntry({
      signal: 'network_risk',
      category: 'network',
      score: 12.2222,
      lastSeenAt: '2026-05-24T10:00:00.000Z',
    }),
  ];

  assert.deepEqual(buildCategoryScores(evidence), {
    technical: 48,
    network: 12.222,
    sessions: 0,
    battle: 14.111,
    economy: 0,
  });

  assert.deepEqual(buildRiskScoreDetailed(evidence).map((entry) => entry.signal), [
    'shared_fingerprint',
    'network_risk',
    'parallel_battle',
  ]);
});
