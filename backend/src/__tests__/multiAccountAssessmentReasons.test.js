const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildAssessmentReasons,
} = require('../services/multiAccount/assessmentReasons');

test('multi-account assessment reasons detect normalized email collision', () => {
  const assessment = buildAssessmentReasons({
    emailRaw: 'User.Name+bonus@gmail.com',
    emailNormalized: 'username@gmail.com',
  }, {}, null, {
    email: 'username@gmail.com',
  });

  assert.equal(assessment.score, 40);
  assert.equal(assessment.needsReview, true);
  assert.equal(assessment.shouldFreeze, false);
  assert.equal(assessment.riskLevel, 'medium');
  assert.deepEqual(assessment.reasons, ['email_normalized_collision']);
  assert.deepEqual(assessment.evidence, [{
    type: 'email',
    count: 1,
    currentEmail: 'User.Name+bonus@gmail.com',
    matchedEmail: 'username@gmail.com',
    normalizedValue: 'username@gmail.com',
  }]);
});

test('multi-account assessment reasons freeze on strong fingerprint and bridge signal', () => {
  const assessment = buildAssessmentReasons({
    fingerprint: 'fp-1',
  }, {
    fingerprint: [
      { userId: 'user-2', ipIntel: { isVpn: true } },
    ],
  }, {
    isVpn: false,
  }, {});

  assert.equal(assessment.score, 125);
  assert.equal(assessment.shouldFreeze, true);
  assert.equal(assessment.riskLevel, 'critical');
  assert.deepEqual(assessment.reasons, [
    'shared_fingerprint',
    'shared_fingerprint:fp-1',
    'anonymized_bridge',
  ]);
  assert.deepEqual(assessment.evidence, [{
    type: 'fingerprint',
    count: 1,
    value: 'fp-1',
  }]);
});

test('multi-account assessment reasons freeze on device and weak fingerprint combination', () => {
  const assessment = buildAssessmentReasons({
    deviceId: 'device-1',
    weakFingerprint: 'weak-1',
    ip: '10.0.0.1',
  }, {
    deviceId: [{ userId: 'user-2' }],
    weakFingerprint: [{ userId: 'user-2' }],
    ip: [{ userId: 'user-2' }],
  }, null, {
    status: 'banned',
  });

  assert.equal(assessment.score, 81);
  assert.equal(assessment.shouldFreeze, true);
  assert.equal(assessment.riskLevel, 'high');
  assert.deepEqual(assessment.reasons, [
    'shared_device_id',
    'shared_device:device-1',
    'shared_weak_fingerprint',
    'shared_weak_fingerprint:weak-1',
    'shared_ip',
    'linked_banned_account',
  ]);
  assert.deepEqual(assessment.evidence.map((entry) => entry.type), ['device', 'weak_fingerprint', 'ip']);
});
