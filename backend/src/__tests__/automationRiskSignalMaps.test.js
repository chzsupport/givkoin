const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addUserToSignalMaps,
  appendRowByUser,
  buildSignalMaps,
  collectDuplicates,
  groupRowsByUser,
} = require('../services/automationRisk/automationRiskSignalMaps');

test('automation risk signal maps normalize and index users', () => {
  const maps = buildSignalMaps([
    {
      _id: 'u1',
      lastDeviceId: ' Device-A ',
      lastFingerprint: 'FP',
      emailNormalized: 'TEST@GMAIL.COM',
      nicknameNormalized: 'Hero',
    },
    {
      _id: 'u2',
      lastDeviceId: 'device-a',
      lastFingerprint: '',
      emailNormalized: 'other@gmail.com',
      nicknameNormalized: 'Hero',
    },
  ]);

  assert.deepEqual(maps.device.get('device-a'), ['u1', 'u2']);
  assert.deepEqual(maps.nicknameNormalized.get('hero'), ['u1', 'u2']);
  assert.deepEqual(collectDuplicates(maps.device, 'device-a', 'u1'), ['u2']);
});

test('automation risk signal maps can append one user', () => {
  const maps = buildSignalMaps([]);

  addUserToSignalMaps(maps, { _id: 'u1', lastDeviceId: 'd1' });

  assert.deepEqual(maps.device.get('d1'), ['u1']);
  assert.equal(maps.fingerprint.size, 0);
});

test('automation risk signal maps group rows by nested user id', () => {
  const rows = [
    { user: { _id: 'u1' }, value: 1 },
    { user: 'u1', value: 2 },
    { user: '', value: 3 },
    { actor: { _id: 'u2' }, value: 4 },
  ];

  const userMap = groupRowsByUser(rows);
  const actorMap = groupRowsByUser(rows, 'actor');

  assert.deepEqual(userMap.get('u1').map((row) => row.value), [1, 2]);
  assert.deepEqual(actorMap.get('u2').map((row) => row.value), [4]);
});

test('automation risk signal maps append row into existing map', () => {
  const map = new Map([['u1', [{ value: 1 }]]]);

  appendRowByUser(map, { user: { _id: 'u1' }, value: 2 });
  appendRowByUser(map, { user: { _id: 'u2' }, value: 3 });

  assert.deepEqual(map.get('u1').map((row) => row.value), [1, 2]);
  assert.deepEqual(map.get('u2').map((row) => row.value), [3]);
});
