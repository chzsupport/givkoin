const { getSupabaseClient } = require('../lib/supabaseClient');

const DEFAULT_LIMIT = 200;

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeSignalValue(value) {
  return cleanText(value).toLowerCase();
}

function toPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function mapSignalRow(row) {
  if (!row) return null;
  const meta = toPlainObject(row.meta);
  return {
    id: row.id,
    userId: cleanText(row.user_id),
    eventType: cleanText(row.event_type),
    ip: cleanText(row.ip),
    deviceId: cleanText(row.device_id),
    fingerprint: cleanText(row.fingerprint),
    weakFingerprint: cleanText(row.weak_fingerprint),
    userAgent: cleanText(row.user_agent),
    ipIntel: toPlainObject(row.ip_intel),
    profileKey: cleanText(meta.profileKey),
    clientProfile: toPlainObject(meta.clientProfile),
    meta,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createSignalHistoryEntry({
  userId,
  eventType,
  signals = {},
  ipIntel = null,
  meta = null,
}) {
  const safeUserId = cleanText(userId);
  const safeEventType = cleanText(eventType);
  if (!safeUserId || !safeEventType) return null;

  const supabase = getSupabaseClient();
  const payload = {
    user_id: safeUserId,
    event_type: safeEventType,
    ip: cleanText(signals.ip),
    device_id: cleanText(signals.deviceId),
    fingerprint: cleanText(signals.fingerprint),
    weak_fingerprint: cleanText(signals.weakFingerprint),
    user_agent: cleanText(signals.userAgent),
    ip_intel: ipIntel && typeof ipIntel === 'object' ? ipIntel : null,
    meta: meta && typeof meta === 'object' ? meta : null,
  };

  const { data, error } = await supabase
    .from('auth_signal_history')
    .insert(payload)
    .select('*')
    .maybeSingle();
  if (error) return null;
  return mapSignalRow(data);
}

async function listSignalHistoryByUserIds(userIds = [], { limit = 100 } = {}) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map(cleanText).filter(Boolean))];
  if (!ids.length) return [];

  const supabase = getSupabaseClient();
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 100));
  const { data, error } = await supabase
    .from('auth_signal_history')
    .select('*')
    .in('user_id', ids)
    .order('created_at', { ascending: false })
    .limit(safeLimit);
  if (error || !Array.isArray(data)) return [];
  return data.map(mapSignalRow).filter(Boolean);
}

async function queryHistoryByField(field, value, limit) {
  const safeValue = cleanText(value);
  if (!safeValue) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('auth_signal_history')
    .select('*')
    .eq(field, safeValue)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error || !Array.isArray(data)) return [];
  return data.map(mapSignalRow).filter(Boolean);
}

async function findSignalHistoryMatches(signals = {}, { excludeUserId = null, limit = DEFAULT_LIMIT } = {}) {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || DEFAULT_LIMIT));
  const excludeId = cleanText(excludeUserId);
  const [fingerprintRows, weakFingerprintRows, deviceRows, ipRows] = await Promise.all([
    queryHistoryByField('fingerprint', signals.fingerprint, safeLimit),
    queryHistoryByField('weak_fingerprint', signals.weakFingerprint, safeLimit),
    queryHistoryByField('device_id', signals.deviceId, safeLimit),
    queryHistoryByField('ip', signals.ip, safeLimit),
  ]);

  const seen = new Map();
  for (const row of [...fingerprintRows, ...weakFingerprintRows, ...deviceRows, ...ipRows]) {
    if (!row?.id) continue;
    if (excludeId && cleanText(row.userId) === excludeId) continue;
    seen.set(String(row.id), row);
  }
  return Array.from(seen.values());
}

function summarizeHistoryMatches(rows = [], signals = {}) {
  const out = {
    fingerprint: [],
    weakFingerprint: [],
    deviceId: [],
    ip: [],
  };
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    if (signals.fingerprint && normalizeSignalValue(row.fingerprint) === normalizeSignalValue(signals.fingerprint)) {
      out.fingerprint.push(row);
    }
    if (signals.weakFingerprint && normalizeSignalValue(row.weakFingerprint) === normalizeSignalValue(signals.weakFingerprint)) {
      out.weakFingerprint.push(row);
    }
    if (signals.deviceId && normalizeSignalValue(row.deviceId) === normalizeSignalValue(signals.deviceId)) {
      out.deviceId.push(row);
    }
    if (signals.ip && normalizeSignalValue(row.ip) === normalizeSignalValue(signals.ip)) {
      out.ip.push(row);
    }
  }
  return out;
}

module.exports = {
  createSignalHistoryEntry,
  listSignalHistoryByUserIds,
  findSignalHistoryMatches,
  summarizeHistoryMatches,
};
