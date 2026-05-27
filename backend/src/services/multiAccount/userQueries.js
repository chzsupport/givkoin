const { getSupabaseClient } = require('../../lib/supabaseClient');
const {
  normalizeEmailForAntiFarm,
  normalizeSignalValue,
} = require('./signals');
const {
  getUserData,
  normalizeUserRow,
  toId,
} = require('./userRows');

const USER_SELECT = 'id,email,nickname,role,status,email_confirmed,access_restricted_until,access_restriction_reason,last_ip,last_device_id,last_fingerprint,data';

function cleanText(value) {
  return String(value || '').trim();
}

function createMultiAccountUserQueries({
  getSupabaseClient: getClient = getSupabaseClient,
} = {}) {
  async function listUsersPage({ from = 0, limit = 500 } = {}) {
    const supabase = getClient();
    const safeFrom = Math.max(0, Number(from) || 0);
    const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 500));
    const { data, error } = await supabase
      .from('users')
      .select(USER_SELECT)
      .range(safeFrom, safeFrom + safeLimit - 1);
    if (error || !Array.isArray(data)) return [];
    return data;
  }

  async function getUsersByIdsDetailed(ids = []) {
    const list = [...new Set((Array.isArray(ids) ? ids : []).map((v) => cleanText(v)).filter(Boolean))];
    if (!list.length) return [];
    const supabase = getClient();
    const { data, error } = await supabase
      .from('users')
      .select(USER_SELECT)
      .in('id', list);
    if (error || !Array.isArray(data)) return [];
    return data.map(normalizeUserRow).filter(Boolean);
  }

  async function getUserMapByIds(ids = []) {
    const rows = await getUsersByIdsDetailed(ids);
    const map = new Map();
    rows.forEach((row) => map.set(String(row._id), row));
    return map;
  }

  async function findUsersBySignals(
    signals,
    { excludeUserId = null, limit = 200, roles = ['user'] } = {}
  ) {
    const safeLimit = Math.max(1, Number(limit) || 200);
    const excludeId = excludeUserId ? toId(excludeUserId) : '';
    const allowedRoles = Array.isArray(roles) && roles.length ? new Set(roles.map(String)) : null;

    const matchers = [];
    if (signals.ip) matchers.push((row) => normalizeSignalValue(row?.last_ip || getUserData(row).lastIp) === signals.ip);
    if (signals.deviceId) matchers.push((row) => normalizeSignalValue(row?.last_device_id || getUserData(row).lastDeviceId) === signals.deviceId);
    if (signals.fingerprint) matchers.push((row) => normalizeSignalValue(row?.last_fingerprint || getUserData(row).lastFingerprint) === signals.fingerprint);
    if (signals.weakFingerprint) {
      matchers.push((row) => normalizeSignalValue(getUserData(row).lastWeakFingerprint) === signals.weakFingerprint);
    }
    if (signals.profileKey) {
      matchers.push((row) => normalizeSignalValue(getUserData(row).lastProfileKey) === signals.profileKey);
    }
    if (signals.emailNormalized) {
      matchers.push((row) => normalizeEmailForAntiFarm(row?.email || getUserData(row).email) === String(signals.emailNormalized));
    }
    if (!matchers.length) return [];

    const out = [];
    const pageSize = 500;
    let from = 0;
    while (out.length < safeLimit) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await listUsersPage({ from, limit: pageSize });
      if (!rows.length) break;
      for (const row of rows) {
        if (out.length >= safeLimit) break;
        const normalized = normalizeUserRow(row);
        if (!normalized?._id) continue;
        if (excludeId && normalized._id === excludeId) continue;
        if (allowedRoles && !allowedRoles.has(String(normalized.role || ''))) continue;
        const hit = matchers.some((fn) => fn(row));
        if (!hit) continue;
        out.push(normalized);
      }
      if (rows.length < pageSize) break;
      from += rows.length;
    }
    return out;
  }

  return {
    findUsersBySignals,
    getUserMapByIds,
    getUsersByIdsDetailed,
    listUsersPage,
  };
}

const defaultQueries = createMultiAccountUserQueries();

module.exports = {
  createMultiAccountUserQueries,
  findUsersBySignals: defaultQueries.findUsersBySignals,
  getUserMapByIds: defaultQueries.getUserMapByIds,
  getUsersByIdsDetailed: defaultQueries.getUsersByIdsDetailed,
  listUsersPage: defaultQueries.listUsersPage,
};
