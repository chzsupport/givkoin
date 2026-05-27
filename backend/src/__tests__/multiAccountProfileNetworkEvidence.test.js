const test = require('node:test');
const assert = require('node:assert/strict');

const {
  appendProfileNetworkEvidence,
} = require('../services/multiAccount/profileNetworkEvidence');
const {
  DETAIL_SCORES,
} = require('../services/multiAccount/evidenceScoring');

test('multi-account profile network evidence adds emulator, webdriver, network, and combo rows', () => {
  const evidence = [];

  appendProfileNetworkEvidence(evidence, {
    userIds: ['user-1', 'user-2'],
    safeUsers: [{
      _id: 'user-1',
      lastClientProfile: {
        platform: 'Android',
        vendor: 'Google',
        timezone: 'UTC',
        webglVendor: 'Mesa',
        webglRenderer: 'Android Emulator',
        maxTouchPoints: 5,
        emulator: true,
      },
    }],
    signalHistory: [
      {
        userId: 'user-1',
        ip: '10.0.0.1',
        ipIntel: { isVpn: true },
        clientProfile: {
          platform: 'Android',
          webglVendor: 'Mesa',
          webglRenderer: 'Android Emulator',
          emulator: true,
        },
        createdAt: '2026-05-24T10:00:00.000Z',
      },
      {
        userId: 'user-2',
        ip: '10.0.0.2',
        ipIntel: { isTor: true, isHosting: true },
        createdAt: '2026-05-24T12:00:00.000Z',
      },
    ],
    sessions: [{
      userId: 'user-2',
      clientProfile: {
        platform: 'Win32',
        webglVendor: 'Google',
        webglRenderer: 'SwiftShader',
        webdriver: true,
        headless: true,
      },
      startedAt: '2026-05-24T11:00:00.000Z',
      lastSeenAt: '2026-05-24T11:30:00.000Z',
    }],
  });

  assert.deepEqual(evidence.map((entry) => entry.signal), [
    'emulator',
    'webdriver',
    'network_risk',
    'emulator_network_combo',
  ]);

  assert.equal(evidence[0].category, 'technical');
  assert.equal(evidence[0].score, DETAIL_SCORES.emulator + 2);
  assert.equal(evidence[0].count, 1);
  assert.equal(evidence[0].lastSeenAt, '2026-05-24T10:00:00.000Z');
  assert.deepEqual(evidence[0].matchedUserIds, ['user-1']);
  assert.equal(evidence[0].details.users[0].samples.length, 2);

  assert.equal(evidence[1].category, 'technical');
  assert.equal(evidence[1].score, DETAIL_SCORES.webdriver + 2);
  assert.deepEqual(evidence[1].matchedUserIds, ['user-2']);
  assert.equal(evidence[1].details.users[0].samples[0].happenedAt, '2026-05-24T11:30:00.000Z');

  assert.equal(evidence[2].category, 'network');
  assert.equal(evidence[2].score, DETAIL_SCORES.network_risk + 2);
  assert.equal(evidence[2].count, 2);
  assert.equal(evidence[2].firstSeenAt, '2026-05-24T10:00:00.000Z');
  assert.equal(evidence[2].lastSeenAt, '2026-05-24T12:00:00.000Z');
  assert.deepEqual(evidence[2].matchedUserIds, ['user-1', 'user-2']);
  assert.deepEqual(evidence[2].details.entries.map((entry) => entry.flags), [
    ['vpn'],
    ['tor', 'hosting'],
  ]);

  assert.equal(evidence[3].signal, 'emulator_network_combo');
  assert.equal(evidence[3].score, DETAIL_SCORES.emulator_network_combo);
  assert.deepEqual(evidence[3].matchedUserIds, ['user-1', 'user-2']);
});

test('multi-account profile network evidence includes current anonymous network signal', () => {
  const evidence = [];

  appendProfileNetworkEvidence(evidence, {
    userIds: ['current-user'],
    safeUsers: [],
    currentUserId: 'current-user',
    currentSignals: {
      ip: '10.0.0.3',
      ipIntel: { isProxy: true },
    },
  });

  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].signal, 'network_risk');
  assert.deepEqual(evidence[0].matchedUserIds, ['current-user']);
  assert.deepEqual(evidence[0].details.entries[0].flags, ['proxy']);
});

test('multi-account profile network evidence ignores profiles outside the group', () => {
  const evidence = [];

  appendProfileNetworkEvidence(evidence, {
    userIds: ['user-1'],
    sessions: [{
      userId: 'user-2',
      clientProfile: {
        platform: 'Win32',
        webglVendor: 'Google',
        webglRenderer: 'SwiftShader',
        webdriver: true,
      },
      startedAt: '2026-05-24T11:00:00.000Z',
    }],
  });

  assert.deepEqual(evidence, []);
});
