const { getSupabaseClient } = require('../../lib/supabaseClient');
const { listDocsByModel } = require('../documentStore');
const { normalizeClientProfile } = require('./signals');

function cleanText(value) {
  return String(value || '').trim();
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round(value, digits = 3) {
  const n = safeNumber(value);
  const power = 10 ** digits;
  return Math.round(n * power) / power;
}

function toPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function uniq(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

function createMultiAccountDataQueries(deps = {}) {
  const getClient = deps.getSupabaseClient || getSupabaseClient;
  const listDocs = deps.listDocsByModel || listDocsByModel;

  async function listUserSessionsByUserIds(userIds = [], { since = null } = {}) {
    const ids = uniq((Array.isArray(userIds) ? userIds : []).map((item) => cleanText(item)).filter(Boolean));
    if (!ids.length) return [];
    const supabase = getClient();
    const out = [];
    let from = 0;
    const pageSize = 1000;
    const sinceIso = since ? new Date(since).toISOString() : '';

    while (true) {
      let query = supabase
        .from('user_sessions')
        .select('*')
        .in('user_id', ids)
        .order('started_at', { ascending: true })
        .range(from, from + pageSize - 1);

      if (sinceIso) {
        query = query.or([
          `started_at.gte.${sinceIso}`,
          `last_seen_at.gte.${sinceIso}`,
          `ended_at.gte.${sinceIso}`,
        ].join(','));
      }

      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await query;
      const rows = !error && Array.isArray(data) ? data : [];
      if (!rows.length) break;
      rows.forEach((row) => {
        const meta = toPlainObject(row?.meta);
        out.push({
          userId: cleanText(row?.user_id),
          sessionId: cleanText(row?.session_id),
          ip: cleanText(row?.ip),
          deviceId: cleanText(row?.device_id),
          fingerprint: cleanText(row?.fingerprint),
          weakFingerprint: cleanText(meta.weakFingerprint),
          profileKey: cleanText(meta.profileKey),
          clientProfile: normalizeClientProfile(meta.clientProfile),
          startedAt: row?.started_at || null,
          lastSeenAt: row?.last_seen_at || null,
          endedAt: row?.ended_at || null,
          isActive: Boolean(row?.is_active),
          revokedAt: row?.revoked_at || null,
          revokeReason: cleanText(row?.revoke_reason),
        });
      });
      if (rows.length < pageSize) break;
      from += rows.length;
    }

    return out;
  }

  async function listBattleDocsSince(since = null) {
    const out = [];
    let from = 0;
    const pageSize = 500;
    const sinceIso = since ? new Date(since).toISOString() : '';

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await listDocs('Battle', {
        ...(sinceIso ? { columnGte: { updated_at: sinceIso } } : {}),
        limit: pageSize,
        offset: from,
      });
      if (!rows.length) break;
      rows.forEach((dataRow) => {
        out.push({
          _id: cleanText(dataRow?._id),
          ...dataRow,
          createdAt: dataRow?.createdAt || null,
          updatedAt: dataRow?.updatedAt || null,
        });
      });
      if (rows.length < pageSize) break;
      from += rows.length;
    }

    return out;
  }

  async function listBattleRewardTransactionsByUserIds(userIds = [], { since = null } = {}) {
    const ids = uniq((Array.isArray(userIds) ? userIds : []).map((item) => cleanText(item)).filter(Boolean));
    if (!ids.length) return [];
    const supabase = getClient();
    let query = supabase
      .from('transactions')
      .select('id,user_id,type,direction,amount,currency,status,related_entity,description,occurred_at,created_at')
      .in('user_id', ids)
      .eq('type', 'battle')
      .eq('direction', 'credit')
      .eq('currency', 'K')
      .eq('status', 'completed')
      .order('occurred_at', { ascending: false })
      .limit(5000);

    if (since) query = query.gte('occurred_at', new Date(since).toISOString());

    const { data, error } = await query;
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => ({
      id: cleanText(row?.id),
      userId: cleanText(row?.user_id),
      battleId: cleanText(row?.related_entity),
      amount: round(row?.amount, 3),
      currency: cleanText(row?.currency),
      description: cleanText(row?.description),
      occurredAt: row?.occurred_at || row?.created_at || null,
    }));
  }

  async function listSolarShareActivitiesByUserIds(userIds = [], { since = null } = {}) {
    const ids = uniq((Array.isArray(userIds) ? userIds : []).map((item) => cleanText(item)).filter(Boolean));
    if (!ids.length) return [];
    const supabase = getClient();
    let query = supabase
      .from('activity_logs')
      .select('user_id,type,meta,created_at')
      .eq('type', 'solar_share')
      .in('user_id', ids)
      .order('created_at', { ascending: false })
      .limit(5000);
    if (since) query = query.gte('created_at', new Date(since).toISOString());

    const { data, error } = await query;
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => ({
      userId: cleanText(row?.user_id),
      recipientId: cleanText(row?.meta?.recipientId),
      amountLm: round(row?.meta?.amountLm, 3),
      createdAt: row?.created_at || null,
    }));
  }

  async function listSignalHistoryByIps(ips = [], { since = null } = {}) {
    const safeIps = uniq((Array.isArray(ips) ? ips : []).map((item) => cleanText(item)).filter(Boolean));
    if (!safeIps.length) return [];
    const supabase = getClient();
    let query = supabase
      .from('auth_signal_history')
      .select('*')
      .in('ip', safeIps)
      .order('created_at', { ascending: false })
      .limit(5000);
    if (since) query = query.gte('created_at', new Date(since).toISOString());
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return [];
    return data.map((row) => ({
      id: row.id,
      userId: cleanText(row?.user_id),
      ip: cleanText(row?.ip),
      deviceId: cleanText(row?.device_id),
      fingerprint: cleanText(row?.fingerprint),
      weakFingerprint: cleanText(row?.weak_fingerprint),
      userAgent: cleanText(row?.user_agent),
      ipIntel: toPlainObject(row?.ip_intel),
      meta: toPlainObject(row?.meta),
      profileKey: cleanText(row?.meta?.profileKey),
      clientProfile: normalizeClientProfile(row?.meta?.clientProfile),
      createdAt: row?.created_at || null,
    }));
  }

  return {
    listBattleDocsSince,
    listBattleRewardTransactionsByUserIds,
    listSignalHistoryByIps,
    listSolarShareActivitiesByUserIds,
    listUserSessionsByUserIds,
  };
}

module.exports = {
  ...createMultiAccountDataQueries(),
  createMultiAccountDataQueries,
};
