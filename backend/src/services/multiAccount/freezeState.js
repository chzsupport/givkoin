const MULTI_ACCOUNT_RISK_SOURCE = 'multi_account';
const MULTI_ACCOUNT_FROZEN_REASON = 'multi_account_group_frozen';
const MULTI_ACCOUNT_FROZEN_STATUS = 'frozen';

function cleanText(value) {
  return String(value || '').trim();
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

function uniqueUsers(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const id = cleanText(row?._id || row?.id);
    if (!id) continue;
    map.set(id, row);
  }
  return Array.from(map.values());
}

function getRiskCaseSource(riskCase) {
  const meta = riskCase?.meta && typeof riskCase.meta === 'object' ? riskCase.meta : {};
  return cleanText(meta.source);
}

function buildFreezeGroupId(users = []) {
  const list = uniqueUsers(users)
    .map((row) => cleanText(row?._id || row?.id))
    .filter(Boolean)
    .sort();
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  return `mag_${list.join('_') || 'empty'}_${suffix}`;
}

function getSecurityFreeze(data = {}) {
  const safe = data && typeof data === 'object' ? data : {};
  return safe.securityFreeze && typeof safe.securityFreeze === 'object' ? safe.securityFreeze : {};
}

function buildUserDataWithFreeze(user, patch = {}) {
  const currentData = getUserData(user);
  const currentFreeze = getSecurityFreeze(currentData);
  return {
    ...currentData,
    securityFreeze: {
      ...currentFreeze,
      ...patch,
    },
  };
}

function isPendingFrozenMultiAccountUser(user) {
  if (!user || typeof user !== 'object') return false;
  const freeze = getSecurityFreeze(getUserData(user));
  const groupId = cleanText(freeze.groupId);
  const decision = cleanText(freeze.decision || 'pending') || 'pending';
  const freezeStatus = cleanText(freeze.status);
  const freezeReason = cleanText(freeze.reason || user.accessRestrictionReason);
  if (!groupId) return false;
  if (decision && decision !== 'pending') return false;
  if (freezeStatus === 'frozen') return true;
  if (cleanText(user.status) === MULTI_ACCOUNT_FROZEN_STATUS) return true;
  return freezeReason === MULTI_ACCOUNT_FROZEN_REASON;
}

module.exports = {
  buildFreezeGroupId,
  buildUserDataWithFreeze,
  getRiskCaseSource,
  getSecurityFreeze,
  isPendingFrozenMultiAccountUser,
};
