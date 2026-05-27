const {
  normalizeClientProfile,
} = require('./signals');

function cleanText(value) {
  return String(value || '').trim();
}

function toId(value, depth = 0) {
  if (depth > 3) return '';
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'object') {
    if (value._id != null) return toId(value._id, depth + 1);
    if (value.id != null) return toId(value.id, depth + 1);
    if (value.value != null) return toId(value.value, depth + 1);
    if (typeof value.toString === 'function') {
      const s = value.toString();
      if (s && s !== '[object Object]') return s;
    }
  }
  return '';
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

function normalizeUserRow(row) {
  if (!row) return null;
  const data = getUserData(row);
  return {
    _id: String(row.id || row._id || ''),
    id: String(row.id || row._id || ''),
    email: row.email || data.email || '',
    nickname: row.nickname || data.nickname || '',
    role: row.role || data.role || '',
    status: row.status || data.status || '',
    emailConfirmed: Boolean(row.email_confirmed ?? data.emailConfirmed),
    accessRestrictedUntil: row.access_restricted_until || data.accessRestrictedUntil || null,
    accessRestrictionReason: row.access_restriction_reason || data.accessRestrictionReason || '',
    lastIp: row.last_ip || data.lastIp || '',
    lastDeviceId: row.last_device_id || data.lastDeviceId || '',
    lastFingerprint: row.last_fingerprint || data.lastFingerprint || '',
    lastWeakFingerprint: data.lastWeakFingerprint || '',
    lastProfileKey: data.lastProfileKey || '',
    lastClientProfile: normalizeClientProfile(data.lastClientProfile || null),
    lastIpIntel: data.lastIpIntel || null,
    data,
  };
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

module.exports = {
  getUserData,
  normalizeUserRow,
  toId,
  uniqueUsers,
};
