const test = require('node:test');
const assert = require('node:assert/strict');

const {
  appendSessionBehaviorEvidence,
} = require('../services/multiAccount/sessionBehaviorEvidence');
const {
  DETAIL_SCORES,
} = require('../services/multiAccount/evidenceScoring');

test('multi-account session behavior evidence detects quick account switches', () => {
  const evidence = [];

  const result = appendSessionBehaviorEvidence(evidence, {
    signalHistory: [
      { userId: 'user-1', deviceId: 'device-1', createdAt: '2026-05-24T10:00:00.000Z' },
      { userId: 'user-2', deviceId: 'device-1', createdAt: '2026-05-24T10:10:00.000Z' },
      { userId: 'user-1', deviceId: 'device-1', createdAt: '2026-05-24T10:20:00.000Z' },
    ],
  });

  assert.equal(result.switchTransitions.length, 2);
  assert.deepEqual(result.parallelSessionRows, []);
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].signal, 'session_switch');
  assert.equal(evidence[0].score, DETAIL_SCORES.session_switch + 2);
  assert.equal(evidence[0].count, 2);
  assert.equal(evidence[0].firstSeenAt, '2026-05-24T10:10:00.000Z');
  assert.equal(evidence[0].lastSeenAt, '2026-05-24T10:20:00.000Z');
  assert.deepEqual(evidence[0].matchedUserIds, ['user-1', 'user-2']);
});

test('multi-account session behavior evidence detects sync and parallel sessions', () => {
  const evidence = [];

  const result = appendSessionBehaviorEvidence(evidence, {
    sessions: [
      {
        userId: 'user-1',
        startedAt: '2026-05-24T10:00:00.000Z',
        endedAt: '2026-05-24T11:00:00.000Z',
      },
      {
        userId: 'user-2',
        startedAt: '2026-05-24T10:03:00.000Z',
        endedAt: '2026-05-24T11:05:00.000Z',
      },
      {
        userId: 'user-3',
        startedAt: '2026-05-24T10:04:00.000Z',
        endedAt: '2026-05-24T11:06:00.000Z',
      },
    ],
  });

  assert.equal(result.parallelSessionRows.length, 3);
  assert.deepEqual(evidence.map((entry) => entry.signal), [
    'session_sync',
    'parallel_session_overlap',
  ]);
  assert.equal(evidence[0].score, DETAIL_SCORES.session_sync + 6);
  assert.equal(evidence[0].count, 3);
  assert.deepEqual(evidence[0].matchedUserIds, ['user-1', 'user-2', 'user-3']);
  assert.equal(evidence[1].score, DETAIL_SCORES.parallel_session_overlap + 6);
  assert.equal(evidence[1].count, 3);
  assert.deepEqual(evidence[1].matchedUserIds, ['user-1', 'user-2', 'user-3']);
});

test('multi-account session behavior evidence detects shared schedule and crowded IP', () => {
  const evidence = [];

  appendSessionBehaviorEvidence(evidence, {
    userIds: ['user-1', 'user-2'],
    signalHistory: [
      { eventType: 'login', userId: 'user-1', createdAt: '2026-05-22T09:00:00.000Z' },
      { eventType: 'login', userId: 'user-2', createdAt: '2026-05-22T09:12:00.000Z' },
      { eventType: 'login', userId: 'user-1', createdAt: '2026-05-23T09:01:00.000Z' },
      { eventType: 'login', userId: 'user-2', createdAt: '2026-05-23T09:10:00.000Z' },
      { eventType: 'login', userId: 'user-1', createdAt: '2026-05-24T09:03:00.000Z' },
      { eventType: 'login', userId: 'user-2', createdAt: '2026-05-24T09:09:00.000Z' },
    ],
    crowdedIpRows: [
      { ip: '10.0.0.1', deviceId: 'device-1' },
      { ip: '10.0.0.1', deviceId: 'device-2' },
      { ip: '10.0.0.1', fingerprint: 'fingerprint-3' },
      { ip: '10.0.0.1', weakFingerprint: 'weak-4' },
      { ip: '10.0.0.1', profileKey: 'profile-5' },
    ],
    maxDevicesPerIp: 4,
  });

  assert.deepEqual(evidence.map((entry) => entry.signal), [
    'shared_schedule',
    'ip_device_crowding',
  ]);
  assert.equal(evidence[0].score, DETAIL_SCORES.shared_schedule + 3);
  assert.equal(evidence[0].count, 3);
  assert.deepEqual(evidence[0].matchedUserIds, ['user-1', 'user-2']);
  assert.equal(evidence[0].details.days.length, 3);
  assert.equal(evidence[1].score, DETAIL_SCORES.ip_device_crowding + 2);
  assert.equal(evidence[1].count, 1);
  assert.deepEqual(evidence[1].matchedUserIds, ['user-1', 'user-2']);
  assert.deepEqual(evidence[1].details, {
    ips: [{ ip: '10.0.0.1', deviceCount: 5 }],
    limit: 4,
  });
});
