const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildClusterRiskSignals,
} = require('../services/multiAccount/riskSignals');

test('multi-account risk signals keep cluster and network flags stable', () => {
  assert.deepEqual(buildClusterRiskSignals({
    currentSignals: {
      ipIntel: {
        isTor: true,
        isVpn: true,
        isProxy: true,
        isHosting: true,
      },
    },
    clusterSize: 3,
  }), [
    'multi_account_cluster:3',
    'network_tor',
    'network_vpn',
    'network_proxy',
    'network_hosting',
  ]);
});

test('multi-account risk signals include detailed shared device and fingerprint values', () => {
  const signals = buildClusterRiskSignals({
    currentSignals: {
      deviceId: 'device-1',
      fingerprint: 'finger-1',
      weakFingerprint: 'weak-1',
    },
    evidence: [
      { signal: 'shared_device_id' },
      { signal: 'shared_fingerprint' },
      { signal: 'shared_weak_fingerprint' },
      { signal: 'shared_device_id' },
      { signal: '' },
    ],
    clusterSize: 2,
  });

  assert.deepEqual(signals, [
    'multi_account_cluster:2',
    'shared_device_id',
    'shared_device:device-1',
    'shared_fingerprint',
    'shared_fingerprint:finger-1',
    'shared_weak_fingerprint',
    'shared_weak_fingerprint:weak-1',
  ]);
});
