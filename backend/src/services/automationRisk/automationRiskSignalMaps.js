const {
  normalizeSignalValue,
} = require('./automationRiskScoring');

function buildSignalMaps(users = []) {
  const maps = {
    device: new Map(),
    fingerprint: new Map(),
    emailNormalized: new Map(),
    nicknameNormalized: new Map(),
  };

  for (const user of users) {
    addUserToSignalMaps(maps, user);
  }

  return maps;
}

function addUserToSignalMaps(maps, user) {
  if (!maps || !user) return;
  const userId = String(user?._id || '');
  if (!userId) return;
  const values = {
    device: normalizeSignalValue(user.lastDeviceId),
    fingerprint: normalizeSignalValue(user.lastFingerprint),
    emailNormalized: normalizeSignalValue(user.emailNormalized),
    nicknameNormalized: normalizeSignalValue(user.nicknameNormalized),
  };
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue;
    if (!maps[key].has(value)) maps[key].set(value, []);
    maps[key].get(value).push(userId);
  }
}

function collectDuplicates(map, value, selfId) {
  if (!value) return [];
  return (map.get(value) || []).filter((id) => String(id) !== String(selfId));
}

function readRowUserId(row, userField = 'user') {
  const userValue = row?.[userField];
  return typeof userValue === 'object' && userValue !== null
    ? String(userValue._id || userValue)
    : String(userValue || '');
}

function groupRowsByUser(rows = [], userField = 'user') {
  const map = new Map();
  for (const row of rows) {
    appendRowByUser(map, row, userField);
  }
  return map;
}

function appendRowByUser(map, row, userField = 'user') {
  const userId = readRowUserId(row, userField);
  if (!userId) return;
  if (!map.has(userId)) map.set(userId, []);
  map.get(userId).push(row);
}

module.exports = {
  addUserToSignalMaps,
  appendRowByUser,
  buildSignalMaps,
  collectDuplicates,
  groupRowsByUser,
};
