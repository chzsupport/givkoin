const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createSignalAssessment,
} = require('../services/multiAccount/signalAssessment');

function emptySummary() {
  return {
    fingerprint: [],
    deviceId: [],
    weakFingerprint: [],
    ip: [],
  };
}

test('multi-account signal assessment merges direct and history users', async () => {
  const prepared = {
    fingerprint: 'fp-1',
    deviceId: 'device-1',
    weakFingerprint: 'weak-1',
    ip: '10.0.0.1',
    ipIntel: { isVpn: true },
  };
  const assessmentInputs = [];
  const calls = [];
  const assessment = createSignalAssessment({
    buildSignals: (signals) => {
      calls.push(['buildSignals', signals]);
      return prepared;
    },
    findUsersBySignals: async (signals, options) => {
      calls.push(['direct', signals, options]);
      return [{
        _id: 'user-2',
        lastFingerprint: 'fp-1',
        lastDeviceId: 'device-1',
        lastWeakFingerprint: 'weak-1',
        lastIp: '10.0.0.1',
      }];
    },
    findSignalHistoryMatches: async (signals, options) => {
      calls.push(['history', signals, options]);
      return [
        { id: 'history-1', userId: 'user-2' },
        { id: 'history-2', userId: 'user-3' },
      ];
    },
    getUsersByIdsDetailed: async (ids) => {
      calls.push(['extraUsers', ids]);
      return [{
        _id: 'user-3',
        lastFingerprint: '',
        lastDeviceId: '',
        lastWeakFingerprint: '',
        lastIp: '10.0.0.1',
      }];
    },
    summarizeHistoryMatches: (rows) => {
      calls.push(['summary', rows.map((row) => row.id)]);
      return emptySummary();
    },
    buildAssessmentReasons: (signals, matchSummary, ipIntel, matchedUser) => {
      assessmentInputs.push({ matchSummary, matchedUser, ipIntel, signals });
      return {
        needsReview: true,
        shouldFreeze: matchedUser._id === 'user-3',
        score: matchedUser._id === 'user-3' ? 100 : 70,
        reasons: [`reason:${matchedUser._id}`],
        evidence: [],
      };
    },
  }).evaluateMultiAccountSignals;

  const result = await assessment({
    user: { _id: 'user-1' },
    signals: { raw: true },
  });

  assert.deepEqual(result.currentSignals, prepared);
  assert.equal(result.shouldFreeze, true);
  assert.deepEqual(result.matches.map((row) => row.user._id), ['user-3', 'user-2']);
  assert.deepEqual(calls.find((row) => row[0] === 'direct')[2], {
    excludeUserId: 'user-1',
    limit: 100,
  });
  assert.deepEqual(calls.find((row) => row[0] === 'history')[2], {
    excludeUserId: 'user-1',
    limit: 300,
  });
  assert.deepEqual(calls.find((row) => row[0] === 'extraUsers')[1], ['user-3']);

  const user2Input = assessmentInputs.find((row) => row.matchedUser._id === 'user-2');
  assert.equal(user2Input.matchSummary.fingerprint[0].id, 'latest_fp:user-2');
  assert.equal(user2Input.matchSummary.deviceId[0].id, 'latest_device:user-2');
  assert.equal(user2Input.matchSummary.weakFingerprint[0].id, 'latest_weak:user-2');
  assert.equal(user2Input.matchSummary.ip[0].id, 'latest_ip:user-2');

  const user3Input = assessmentInputs.find((row) => row.matchedUser._id === 'user-3');
  assert.equal(user3Input.matchSummary.ip[0].id, 'latest_ip:user-3');
  assert.equal(user3Input.matchSummary.fingerprint.length, 0);
});

test('multi-account signal assessment skips matches that do not need review', async () => {
  const prepared = { ip: '10.0.0.1' };
  const loadedMissingIds = [];
  const assessment = createSignalAssessment({
    buildSignals: () => prepared,
    findUsersBySignals: async () => [{ _id: 'user-2', lastIp: '10.0.0.1' }],
    findSignalHistoryMatches: async () => [],
    getUsersByIdsDetailed: async (ids) => {
      loadedMissingIds.push(ids);
      return [];
    },
    summarizeHistoryMatches: () => emptySummary(),
    buildAssessmentReasons: () => ({
      needsReview: false,
      shouldFreeze: true,
      score: 100,
      reasons: ['ignored'],
      evidence: [],
    }),
  }).evaluateMultiAccountSignals;

  const result = await assessment({
    user: { _id: 'user-1' },
    signals: {},
  });

  assert.deepEqual(result, {
    currentSignals: prepared,
    matches: [],
    shouldFreeze: false,
  });
  assert.deepEqual(loadedMissingIds, [[]]);
});
