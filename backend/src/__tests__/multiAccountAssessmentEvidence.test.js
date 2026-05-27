const test = require('node:test');
const assert = require('node:assert/strict');

const {
  appendAssessmentEvidence,
} = require('../services/multiAccount/assessmentEvidence');
const {
  DETAIL_SCORES,
} = require('../services/multiAccount/evidenceScoring');

test('multi-account assessment evidence maps assessment signals into detailed evidence', () => {
  const evidence = [];
  const result = appendAssessmentEvidence(evidence, [{
    user: { _id: ' user-2 ' },
    history: [
      { createdAt: '2026-05-25T11:00:00.000Z' },
      { createdAt: '2026-05-24T10:00:00.000Z' },
    ],
    evidence: [
      { type: 'fingerprint', count: 2, value: ' fp-1 ' },
      { type: 'device', value: ' device-1 ' },
      { type: 'profile_key', value: ' profile-1 ' },
      { type: 'weak_fingerprint', value: ' weak-1 ' },
      {
        type: 'email',
        count: 3,
        normalizedValue: ' user@gmail.com ',
        currentEmail: ' user.name@gmail.com ',
        matchedEmail: ' username@gmail.com ',
      },
      { type: 'ip', count: 4, value: ' 10.0.0.1 ', anonymousNetwork: true },
    ],
    reasons: ['anonymized_bridge'],
  }]);

  assert.equal(result, evidence);
  assert.deepEqual(evidence.map((entry) => entry.signal), [
    'shared_fingerprint',
    'shared_device_id',
    'shared_profile_key',
    'shared_weak_fingerprint',
    'email_normalized_collision',
    'shared_ip',
    'anonymized_bridge',
  ]);

  evidence.forEach((entry) => {
    assert.equal(entry.firstSeenAt, '2026-05-24T10:00:00.000Z');
    assert.equal(entry.lastSeenAt, '2026-05-25T11:00:00.000Z');
    assert.deepEqual(entry.matchedUserIds, ['user-2']);
  });

  assert.deepEqual(evidence[0], {
    type: 'fingerprint',
    signal: 'shared_fingerprint',
    category: 'technical',
    score: DETAIL_SCORES.shared_fingerprint,
    summary: 'Совпал устойчивый отпечаток устройства',
    count: 2,
    value: 'fp-1',
    firstSeenAt: '2026-05-24T10:00:00.000Z',
    lastSeenAt: '2026-05-25T11:00:00.000Z',
    matchedUserIds: ['user-2'],
    details: { fingerprint: 'fp-1' },
  });

  assert.equal(evidence[1].score, DETAIL_SCORES.shared_device_id);
  assert.deepEqual(evidence[1].details, { deviceId: 'device-1' });
  assert.equal(evidence[2].score, DETAIL_SCORES.shared_profile_key);
  assert.deepEqual(evidence[2].details, { profileKey: 'profile-1' });
  assert.equal(evidence[3].score, DETAIL_SCORES.shared_weak_fingerprint);
  assert.deepEqual(evidence[3].details, { weakFingerprint: 'weak-1' });
  assert.equal(evidence[4].count, 3);
  assert.deepEqual(evidence[4].details, {
    normalizedValue: 'user@gmail.com',
    currentEmail: 'user.name@gmail.com',
    matchedEmail: 'username@gmail.com',
  });
  assert.equal(evidence[5].category, 'network');
  assert.equal(evidence[5].score, DETAIL_SCORES.shared_ip - 2);
  assert.equal(evidence[5].summary, 'Совпал IP в анонимной сети');
  assert.deepEqual(evidence[5].details, {
    ip: '10.0.0.1',
    anonymousNetwork: true,
  });
  assert.equal(evidence[6].signal, 'anonymized_bridge');
  assert.equal(evidence[6].score, DETAIL_SCORES.anonymized_bridge);
});

test('multi-account assessment evidence merges duplicate signal details', () => {
  const evidence = [];
  appendAssessmentEvidence(evidence, [
    {
      user: { id: 'user-1' },
      history: [
        { createdAt: '2026-05-24T12:00:00.000Z' },
      ],
      evidence: [
        { type: 'fingerprint', count: 1, value: 'fp-1' },
      ],
    },
    {
      user: { id: 'user-2' },
      history: [
        { createdAt: '2026-05-24T09:00:00.000Z' },
        { createdAt: '2026-05-24T13:00:00.000Z' },
      ],
      evidence: [
        { type: 'fingerprint', count: 3, value: 'fp-1' },
      ],
    },
  ]);

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].signal, 'shared_fingerprint');
  assert.equal(evidence[0].count, 3);
  assert.equal(evidence[0].firstSeenAt, '2026-05-24T09:00:00.000Z');
  assert.equal(evidence[0].lastSeenAt, '2026-05-24T13:00:00.000Z');
  assert.deepEqual(evidence[0].matchedUserIds, ['user-1', 'user-2']);
});

test('multi-account assessment evidence ignores empty input safely', () => {
  const evidence = [{ signal: 'existing', category: 'technical' }];

  appendAssessmentEvidence(evidence, null);

  assert.deepEqual(evidence, [{ signal: 'existing', category: 'technical' }]);
});
