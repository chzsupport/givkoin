const { revokeAllUserSessions, writeAuthEvent } = require('./authTrackingService');
const { evaluateAccessRestriction } = require('./securityService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { lookupIpIntel } = require('./networkIntelService');
const {
  createSignalHistoryEntry,
  findSignalHistoryMatches,
  listSignalHistoryByUserIds,
  summarizeHistoryMatches,
} = require('./signalHistoryService');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

const MULTI_ACCOUNT_RESTRICTION_HOURS = Math.max(
  1,
  Number(process.env.MULTI_ACCOUNT_RESTRICTION_HOURS) || 24
);
const MULTI_ACCOUNT_MAX_ACCOUNTS = Math.max(
  2,
  Number(process.env.MULTI_ACCOUNT_MAX_ACCOUNTS) || 3
);
const MULTI_ACCOUNT_LOCK_REASON = 'multi_account_review';
const MULTI_ACCOUNT_FROZEN_REASON = 'multi_account_group_frozen';
const MULTI_ACCOUNT_FROZEN_STATUS = 'frozen';
const MULTI_ACCOUNT_RISK_SOURCE = 'multi_account';
const MULTI_ACCOUNT_WINDOW_DAYS = 30;
const MULTI_ACCOUNT_MAX_DEVICES_PER_IP = 4;
const MULTI_ACCOUNT_STATUS_WATCH = 'watch';
const MULTI_ACCOUNT_STATUS_HIGH_RISK = 'high_risk';
const MULTI_ACCOUNT_STATUS_FROZEN = 'frozen';
const MULTI_ACCOUNT_STATUS_RESOLVED = 'resolved';

const SCORE_STRONG_FINGERPRINT = 100;
const SCORE_DEVICE = 35;
const SCORE_WEAK_FINGERPRINT = 28;
const SCORE_EMAIL = 40;
const SCORE_DIRECT_IP = 18;
const SCORE_ANON_IP = 6;
const SCORE_ANON_BRIDGE = 25;
const FREEZE_SCORE_THRESHOLD = 100;
const HIGH_RISK_SCORE_THRESHOLD = 70;
const REVIEW_SCORE_THRESHOLD = 45;
const FREEZE_MIN_EVIDENCE_COUNT = 5;
const FREEZE_MIN_CATEGORY_COUNT = 3;
const STRONG_TECHNICAL_SIGNALS = new Set(['shared_fingerprint', 'shared_device_id']);

const DETAIL_SCORES = {
  shared_fingerprint: 48,
  shared_device_id: 40,
  shared_profile_key: 22,
  shared_weak_fingerprint: 18,
  email_normalized_collision: 24,
  shared_ip: 8,
  anonymized_bridge: 14,
  network_risk: 12,
  emulator: 10,
  webdriver: 14,
  emulator_network_combo: 18,
  session_switch: 18,
  session_sync: 16,
  shared_schedule: 10,
  parallel_session_overlap: 14,
  ip_device_crowding: 12,
  parallel_battle: 14,
  battle_pattern: 18,
  battle_signature_cluster: 20,
  economy_funneling: 22,
  serial_battle_farming: 16,
};

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeSignalValue(value) {
  return cleanText(value).toLowerCase();
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

function sortByDate(rows = [], field = 'createdAt') {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const left = new Date(a?.[field] || 0).getTime();
    const right = new Date(b?.[field] || 0).getTime();
    return left - right;
  });
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

function getRiskCaseSource(riskCase) {
  const meta = riskCase?.meta && typeof riskCase.meta === 'object' ? riskCase.meta : {};
  return cleanText(meta.source);
}

function toPlainDate(value) {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d;
}

function isActiveRestriction(until) {
  const date = toPlainDate(until);
  if (!date) return false;
  return date.getTime() > Date.now();
}

function normalizeEmailForAntiFarm(email) {
  const e = normalizeSignalValue(email);
  const at = e.indexOf('@');
  if (at <= 0) return '';

  let local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const plus = local.indexOf('+');
    if (plus > 0) local = local.slice(0, plus);
    local = local.replace(/\./g, '');
  }
  return `${local}@${domain}`;
}

function normalizeClientProfile(raw = null) {
  const value = toPlainObject(raw);
  const screen = toPlainObject(value.screen);
  return {
    platform: cleanText(value.platform).slice(0, 80),
    vendor: cleanText(value.vendor).slice(0, 80),
    language: cleanText(value.language).slice(0, 20),
    languages: uniq((Array.isArray(value.languages) ? value.languages : []).map((item) => cleanText(item).slice(0, 20))).slice(0, 6),
    timezone: cleanText(value.timezone).slice(0, 80),
    hardwareConcurrency: Math.max(0, Math.floor(safeNumber(value.hardwareConcurrency))),
    deviceMemory: Math.max(0, safeNumber(value.deviceMemory)),
    maxTouchPoints: Math.max(0, Math.floor(safeNumber(value.maxTouchPoints))),
    screen: {
      width: Math.max(0, Math.floor(safeNumber(screen.width))),
      height: Math.max(0, Math.floor(safeNumber(screen.height))),
      availWidth: Math.max(0, Math.floor(safeNumber(screen.availWidth))),
      availHeight: Math.max(0, Math.floor(safeNumber(screen.availHeight))),
      colorDepth: Math.max(0, Math.floor(safeNumber(screen.colorDepth))),
      pixelDepth: Math.max(0, Math.floor(safeNumber(screen.pixelDepth))),
      pixelRatio: round(Math.max(0, safeNumber(screen.pixelRatio || 1)), 3),
    },
    coarsePointer: Boolean(value.coarsePointer),
    prefersReducedMotion: Boolean(value.prefersReducedMotion),
    webglVendor: cleanText(value.webglVendor).slice(0, 120),
    webglRenderer: cleanText(value.webglRenderer).slice(0, 200),
    webdriver: Boolean(value.webdriver),
    headless: Boolean(value.headless),
    emulator: Boolean(value.emulator),
  };
}

function buildSignals(input = {}) {
  const ipIntel = input.ipIntel && typeof input.ipIntel === 'object' ? input.ipIntel : null;
  const clientProfile = normalizeClientProfile(input.clientProfile);
  return {
    ip: normalizeSignalValue(input.ip),
    deviceId: normalizeSignalValue(input.deviceId || input.device),
    fingerprint: normalizeSignalValue(input.fingerprint),
    weakFingerprint: normalizeSignalValue(input.weakFingerprint),
    profileKey: normalizeSignalValue(input.profileKey),
    emailRaw: cleanText(input.email),
    emailNormalized: normalizeEmailForAntiFarm(input.emailNormalized || input.email),
    userAgent: cleanText(input.userAgent),
    clientProfile,
    ipIntel,
  };
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

async function listUsersPage({ from = 0, limit = 500 } = {}) {
  const supabase = getSupabaseClient();
  const safeFrom = Math.max(0, Number(from) || 0);
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 500));
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,role,status,email_confirmed,access_restricted_until,access_restriction_reason,last_ip,last_device_id,last_fingerprint,data')
    .range(safeFrom, safeFrom + safeLimit - 1);
  if (error || !Array.isArray(data)) return [];
  return data;
}

async function getUsersByIdsDetailed(ids = []) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map((v) => cleanText(v)).filter(Boolean))];
  if (!list.length) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,role,status,email_confirmed,access_restricted_until,access_restriction_reason,last_ip,last_device_id,last_fingerprint,data')
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

function uniqueUsers(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const id = cleanText(row?._id || row?.id);
    if (!id) continue;
    map.set(id, row);
  }
  return Array.from(map.values());
}

function isAnonymousIntel(intel = null) {
  return Boolean(intel?.isTor || intel?.isVpn || intel?.isProxy || intel?.isHosting);
}

function riskLevelByScore(score) {
  const safeScore = Number(score) || 0;
  if (safeScore >= 90) return 'critical';
  if (safeScore >= 60) return 'high';
  if (safeScore >= 30) return 'medium';
  return 'low';
}

function appendReason(target, reason) {
  if (!reason) return;
  if (!target.includes(reason)) target.push(reason);
}

function appendEvidence(target, entry) {
  if (!entry || typeof entry !== 'object') return;
  const key = JSON.stringify(entry);
  if (target.some((item) => JSON.stringify(item) === key)) return;
  target.push(entry);
}

function getWindowSince(days = MULTI_ACCOUNT_WINDOW_DAYS) {
  return new Date(Date.now() - Math.max(1, Number(days) || MULTI_ACCOUNT_WINDOW_DAYS) * 24 * 60 * 60 * 1000);
}

function coefficientOfVariation(values = []) {
  const safe = (Array.isArray(values) ? values : [])
    .map((item) => safeNumber(item))
    .filter((item) => item > 0);
  if (safe.length < 2) return 0;
  const avg = safe.reduce((sum, item) => sum + item, 0) / safe.length;
  if (!avg) return 0;
  const variance = safe.reduce((sum, item) => sum + ((item - avg) ** 2), 0) / safe.length;
  return Math.sqrt(Math.max(0, variance)) / avg;
}

function coefficientFromMoments(sum, sqSum, count) {
  const safeCount = Math.max(0, Math.floor(safeNumber(count)));
  if (safeCount < 2) return 0;
  const avg = safeNumber(sum) / safeCount;
  if (!avg) return 0;
  const variance = Math.max(0, (safeNumber(sqSum) / safeCount) - (avg ** 2));
  return Math.sqrt(variance) / avg;
}

function buildEvidenceEntry({
  signal,
  category,
  score = 0,
  summary = '',
  count = 1,
  value = '',
  firstSeenAt = null,
  lastSeenAt = null,
  matchedUserIds = [],
  details = {},
  type = '',
}) {
  return {
    type: cleanText(type || signal),
    signal: cleanText(signal),
    category: cleanText(category),
    score: round(score, 3),
    summary: cleanText(summary),
    count: Math.max(1, Math.floor(safeNumber(count, 1))),
    value: typeof value === 'string' ? cleanText(value) : value,
    firstSeenAt: firstSeenAt ? new Date(firstSeenAt).toISOString() : null,
    lastSeenAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
    matchedUserIds: uniq((Array.isArray(matchedUserIds) ? matchedUserIds : []).map((item) => cleanText(item)).filter(Boolean)),
    details: toPlainObject(details),
  };
}

function appendDetailedEvidence(target, entry) {
  if (!entry?.signal || !entry?.category) return;
  const safeTarget = Array.isArray(target) ? target : [];
  const existing = safeTarget.find((item) => (
    cleanText(item?.signal) === cleanText(entry.signal)
    && cleanText(item?.category) === cleanText(entry.category)
    && JSON.stringify(toPlainObject(item?.details)) === JSON.stringify(toPlainObject(entry.details))
  ));
  if (!existing) {
    safeTarget.push(entry);
    return;
  }
  existing.score = round(Math.max(safeNumber(existing.score), safeNumber(entry.score)), 3);
  existing.count = Math.max(Math.floor(safeNumber(existing.count, 1)), Math.floor(safeNumber(entry.count, 1)));
  if (!existing.summary && entry.summary) existing.summary = cleanText(entry.summary);
  if (!existing.value && entry.value) existing.value = entry.value;
  existing.firstSeenAt = [existing.firstSeenAt, entry.firstSeenAt].filter(Boolean).sort()[0] || existing.firstSeenAt || entry.firstSeenAt || null;
  existing.lastSeenAt = [existing.lastSeenAt, entry.lastSeenAt].filter(Boolean).sort().slice(-1)[0] || existing.lastSeenAt || entry.lastSeenAt || null;
  existing.matchedUserIds = uniq([...(existing.matchedUserIds || []), ...(entry.matchedUserIds || [])]);
}

function buildCategoryScores(evidence = []) {
  const scores = {
    technical: 0,
    network: 0,
    sessions: 0,
    battle: 0,
    economy: 0,
  };
  (Array.isArray(evidence) ? evidence : []).forEach((entry) => {
    const category = cleanText(entry?.category);
    if (!Object.prototype.hasOwnProperty.call(scores, category)) return;
    scores[category] += safeNumber(entry?.score);
  });
  return Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, round(value, 3)]));
}

function buildRiskScoreDetailed(evidence = []) {
  return sortByDate(
    (Array.isArray(evidence) ? evidence : []).map((entry) => ({
      type: cleanText(entry?.type),
      signal: cleanText(entry?.signal),
      category: cleanText(entry?.category),
      score: round(entry?.score, 3),
      summary: cleanText(entry?.summary),
      value: typeof entry?.value === 'string' ? cleanText(entry?.value) : entry?.value,
      firstSeenAt: entry?.firstSeenAt || null,
      lastSeenAt: entry?.lastSeenAt || null,
      count: Math.max(1, Math.floor(safeNumber(entry?.count, 1))),
      matchedUserIds: uniq(Array.isArray(entry?.matchedUserIds) ? entry.matchedUserIds : []),
      details: toPlainObject(entry?.details),
    })),
    'lastSeenAt'
  ).reverse();
}

function resolveClusterStatus({ riskScore = 0, shouldFreeze = false, freezeStatus = '' } = {}) {
  if (freezeStatus === 'banned' || freezeStatus === 'unfrozen') return MULTI_ACCOUNT_STATUS_RESOLVED;
  if (freezeStatus === 'watch') return MULTI_ACCOUNT_STATUS_WATCH;
  if (shouldFreeze) return MULTI_ACCOUNT_STATUS_FROZEN;
  if (safeNumber(riskScore) >= HIGH_RISK_SCORE_THRESHOLD) return MULTI_ACCOUNT_STATUS_HIGH_RISK;
  return MULTI_ACCOUNT_STATUS_WATCH;
}

function qualifiesAutomaticFreeze({
  riskScore = 0,
  evidence = [],
}) {
  const safeEvidence = Array.isArray(evidence) ? evidence : [];
  if (safeNumber(riskScore) < FREEZE_SCORE_THRESHOLD) return false;
  if (safeEvidence.length < FREEZE_MIN_EVIDENCE_COUNT) return false;

  const categories = new Set(safeEvidence.map((entry) => cleanText(entry?.category)).filter(Boolean));
  if (categories.size < FREEZE_MIN_CATEGORY_COUNT) return false;

  const hasStrongTechnical = safeEvidence.some((entry) => STRONG_TECHNICAL_SIGNALS.has(cleanText(entry?.signal)));
  const hasSessionSignal = safeEvidence.some((entry) => cleanText(entry?.category) === 'sessions');
  const hasBattleOrEconomy = safeEvidence.some((entry) => {
    const category = cleanText(entry?.category);
    return category === 'battle' || category === 'economy';
  });

  return hasStrongTechnical && hasSessionSignal && hasBattleOrEconomy;
}

function buildAssessmentReasons(signals, matchSummary, currentIpIntel, matchedUser) {
  const reasons = [];
  const evidence = [];
  let score = 0;

  if (signals.emailNormalized && normalizeEmailForAntiFarm(matchedUser?.email) === signals.emailNormalized) {
    score += SCORE_EMAIL;
    appendReason(reasons, 'email_normalized_collision');
    appendEvidence(evidence, {
      type: 'email',
      count: 1,
      currentEmail: cleanText(signals.emailRaw),
      matchedEmail: cleanText(matchedUser?.email),
      normalizedValue: signals.emailNormalized,
    });
  }

  if (Array.isArray(matchSummary.fingerprint) && matchSummary.fingerprint.length) {
    score = Math.max(score, SCORE_STRONG_FINGERPRINT);
    appendReason(reasons, 'shared_fingerprint');
    appendReason(reasons, `shared_fingerprint:${signals.fingerprint}`);
    appendEvidence(evidence, {
      type: 'fingerprint',
      count: matchSummary.fingerprint.length,
      value: signals.fingerprint,
    });
  }

  if (Array.isArray(matchSummary.deviceId) && matchSummary.deviceId.length) {
    score += SCORE_DEVICE;
    appendReason(reasons, 'shared_device_id');
    appendReason(reasons, `shared_device:${signals.deviceId}`);
    appendEvidence(evidence, {
      type: 'device',
      count: matchSummary.deviceId.length,
      value: signals.deviceId,
    });
  }

  if (signals.profileKey && normalizeSignalValue(matchedUser?.lastProfileKey) === signals.profileKey) {
    score += DETAIL_SCORES.shared_profile_key;
    appendReason(reasons, 'shared_profile_key');
    appendEvidence(evidence, {
      type: 'profile_key',
      count: 1,
      value: signals.profileKey,
    });
  }

  if (Array.isArray(matchSummary.weakFingerprint) && matchSummary.weakFingerprint.length) {
    score += SCORE_WEAK_FINGERPRINT;
    appendReason(reasons, 'shared_weak_fingerprint');
    appendReason(reasons, `shared_weak_fingerprint:${signals.weakFingerprint}`);
    appendEvidence(evidence, {
      type: 'weak_fingerprint',
      count: matchSummary.weakFingerprint.length,
      value: signals.weakFingerprint,
    });
  }

  if (Array.isArray(matchSummary.ip) && matchSummary.ip.length) {
    const ipScore = isAnonymousIntel(currentIpIntel) ? SCORE_ANON_IP : SCORE_DIRECT_IP;
    score += ipScore;
    appendReason(reasons, 'shared_ip');
    appendEvidence(evidence, {
      type: 'ip',
      count: matchSummary.ip.length,
      value: signals.ip,
      anonymousNetwork: isAnonymousIntel(currentIpIntel),
    });
  }

  const hasFingerprintBridge = Array.isArray(matchSummary.fingerprint) && matchSummary.fingerprint.some((row) => {
    const rowAnonymous = isAnonymousIntel(row?.ipIntel);
    return rowAnonymous !== isAnonymousIntel(currentIpIntel);
  });
  if (hasFingerprintBridge) {
    score += SCORE_ANON_BRIDGE;
    appendReason(reasons, 'anonymized_bridge');
  }

  if (String(matchedUser?.status || '') === 'banned') {
    appendReason(reasons, 'linked_banned_account');
  }

  const hasStrongFingerprint = reasons.includes('shared_fingerprint');
  const hasDeviceAndWeak = reasons.includes('shared_device_id') && reasons.includes('shared_weak_fingerprint');
  const hasWeakAndDirectIp = reasons.includes('shared_weak_fingerprint') && reasons.includes('shared_ip') && !isAnonymousIntel(currentIpIntel);
  const shouldFreeze = Boolean(hasStrongFingerprint || hasDeviceAndWeak || hasWeakAndDirectIp || score >= FREEZE_SCORE_THRESHOLD);
  const needsReview = Boolean(reasons.length || shouldFreeze || score >= REVIEW_SCORE_THRESHOLD);

  return {
    score,
    reasons,
    evidence,
    shouldFreeze,
    needsReview,
    riskLevel: riskLevelByScore(score),
  };
}

async function evaluateMultiAccountSignals({
  user,
  signals,
}) {
  const prepared = buildSignals(signals);
  const directMatches = await findUsersBySignals(prepared, {
    excludeUserId: user?._id,
    limit: 100,
  });
  const historyRows = await findSignalHistoryMatches(prepared, {
    excludeUserId: user?._id,
    limit: 300,
  });

  const directMap = new Map();
  directMatches.forEach((row) => directMap.set(String(row._id), row));
  const historyUserIds = Array.from(new Set(historyRows.map((row) => cleanText(row.userId)).filter(Boolean)));
  const missingIds = historyUserIds.filter((id) => !directMap.has(id));
  const extraUsers = await getUsersByIdsDetailed(missingIds);
  extraUsers.forEach((row) => directMap.set(String(row._id), row));

  const out = [];
  for (const [userId, matchedUser] of directMap.entries()) {
    const rowsForUser = historyRows.filter((row) => cleanText(row.userId) === userId);
    const matchSummary = summarizeHistoryMatches(rowsForUser, prepared);

    if (prepared.fingerprint && normalizeSignalValue(matchedUser?.lastFingerprint) === prepared.fingerprint) {
      matchSummary.fingerprint.push({
        id: `latest_fp:${userId}`,
        userId,
        fingerprint: prepared.fingerprint,
        ipIntel: null,
      });
    }
    if (prepared.deviceId && normalizeSignalValue(matchedUser?.lastDeviceId) === prepared.deviceId) {
      matchSummary.deviceId.push({
        id: `latest_device:${userId}`,
        userId,
        deviceId: prepared.deviceId,
      });
    }
    if (prepared.weakFingerprint && normalizeSignalValue(matchedUser?.lastWeakFingerprint) === prepared.weakFingerprint) {
      matchSummary.weakFingerprint.push({
        id: `latest_weak:${userId}`,
        userId,
        weakFingerprint: prepared.weakFingerprint,
        ipIntel: matchedUser?.lastIpIntel || null,
      });
    }
    if (prepared.ip && normalizeSignalValue(matchedUser?.lastIp) === prepared.ip) {
      matchSummary.ip.push({
        id: `latest_ip:${userId}`,
        userId,
        ip: prepared.ip,
      });
    }

    const assessment = buildAssessmentReasons(prepared, matchSummary, prepared.ipIntel, matchedUser);
    if (!assessment.needsReview) continue;
    out.push({
      user: matchedUser,
      history: rowsForUser,
      ...assessment,
    });
  }

  out.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  return {
    currentSignals: prepared,
    matches: out,
    shouldFreeze: out.some((row) => row.shouldFreeze),
  };
}

async function listUserSessionsByUserIds(userIds = [], { since = null } = {}) {
  const ids = uniq((Array.isArray(userIds) ? userIds : []).map((item) => cleanText(item)).filter(Boolean));
  if (!ids.length) return [];
  const supabase = getSupabaseClient();
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
  const supabase = getSupabaseClient();
  const out = [];
  let from = 0;
  const pageSize = 500;
  const sinceIso = since ? new Date(since).toISOString() : '';

  while (true) {
    let query = supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', 'Battle')
      .range(from, from + pageSize - 1);
    if (sinceIso) query = query.gte('updated_at', sinceIso);

    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query;
    const rows = !error && Array.isArray(data) ? data : [];
    if (!rows.length) break;
    rows.forEach((row) => {
      const dataRow = toPlainObject(row?.data);
      out.push({
        _id: cleanText(row?.id),
        ...dataRow,
        createdAt: row?.created_at || dataRow.createdAt || null,
        updatedAt: row?.updated_at || dataRow.updatedAt || null,
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
  const supabase = getSupabaseClient();
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
  const supabase = getSupabaseClient();
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
  const supabase = getSupabaseClient();
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

function overlapDurationMs(leftStart, leftEnd, rightStart, rightEnd) {
  const start = Math.max(new Date(leftStart || 0).getTime(), new Date(rightStart || 0).getTime());
  const end = Math.min(new Date(leftEnd || 0).getTime(), new Date(rightEnd || 0).getTime());
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

function buildBattleProfiles(rows = []) {
  const profiles = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const userId = cleanText(row?.userId);
    if (!userId) return;
    if (!profiles.has(userId)) {
      profiles.set(userId, {
        userId,
        shots: 0,
        intervalCount: 0,
        intervalSumMs: 0,
        intervalSqSumMs: 0,
        staticCursorShots: 0,
        hiddenTabShotCount: 0,
        cursorDistancePxTotal: 0,
        screenMinNx: 1,
        screenMaxNx: 0,
        screenMinNy: 1,
        screenMaxNy: 0,
        battleIds: new Set(),
        latestAt: null,
      });
    }
    const profile = profiles.get(userId);
    const telemetry = toPlainObject(row?.automationTelemetry);
    profile.shots += Math.max(0, Math.floor(safeNumber(telemetry.shotTelemetryCount)));
    profile.intervalCount += Math.max(0, Math.floor(safeNumber(telemetry.intervalCount)));
    profile.intervalSumMs += Math.max(0, safeNumber(telemetry.intervalSumMs));
    profile.intervalSqSumMs += Math.max(0, safeNumber(telemetry.intervalSqSumMs));
    profile.staticCursorShots += Math.max(0, Math.floor(safeNumber(telemetry.staticCursorShots)));
    profile.hiddenTabShotCount += Math.max(0, Math.floor(safeNumber(telemetry.hiddenTabShotCount)));
    profile.cursorDistancePxTotal += Math.max(0, safeNumber(telemetry.cursorDistancePxTotal));
    if (Number.isFinite(safeNumber(telemetry.screenMinNx))) profile.screenMinNx = Math.min(profile.screenMinNx, safeNumber(telemetry.screenMinNx));
    if (Number.isFinite(safeNumber(telemetry.screenMaxNx))) profile.screenMaxNx = Math.max(profile.screenMaxNx, safeNumber(telemetry.screenMaxNx));
    if (Number.isFinite(safeNumber(telemetry.screenMinNy))) profile.screenMinNy = Math.min(profile.screenMinNy, safeNumber(telemetry.screenMinNy));
    if (Number.isFinite(safeNumber(telemetry.screenMaxNy))) profile.screenMaxNy = Math.max(profile.screenMaxNy, safeNumber(telemetry.screenMaxNy));
    if (cleanText(row?.battleId)) profile.battleIds.add(cleanText(row.battleId));
    if (!profile.latestAt || new Date(row?.happenedAt || 0).getTime() > new Date(profile.latestAt || 0).getTime()) {
      profile.latestAt = row?.happenedAt || null;
    }
  });

  return new Map(Array.from(profiles.entries()).map(([userId, profile]) => {
    const intervalCv = coefficientFromMoments(profile.intervalSumMs, profile.intervalSqSumMs, profile.intervalCount);
    const staticRatio = profile.shots ? profile.staticCursorShots / profile.shots : 0;
    const hiddenRatio = profile.shots ? profile.hiddenTabShotCount / profile.shots : 0;
    const avgCursorDistancePx = profile.shots ? profile.cursorDistancePxTotal / profile.shots : 0;
    return [userId, {
      ...profile,
      intervalCv: round(intervalCv, 5),
      staticRatio: round(staticRatio, 5),
      hiddenRatio: round(hiddenRatio, 5),
      avgCursorDistancePx: round(avgCursorDistancePx, 3),
      screenWidth: round(Math.max(0, profile.screenMaxNx - profile.screenMinNx), 5),
      screenHeight: round(Math.max(0, profile.screenMaxNy - profile.screenMinNy), 5),
      battleIds: Array.from(profile.battleIds),
    }];
  }));
}

function buildClusterRiskSignals({
  currentSignals = {},
  evidence = [],
  clusterSize = 0,
}) {
  const out = [];
  if (clusterSize > 1) out.push(`multi_account_cluster:${clusterSize}`);
  if (currentSignals.ipIntel?.isTor) out.push('network_tor');
  if (currentSignals.ipIntel?.isVpn) out.push('network_vpn');
  if (currentSignals.ipIntel?.isProxy) out.push('network_proxy');
  if (currentSignals.ipIntel?.isHosting) out.push('network_hosting');

  (Array.isArray(evidence) ? evidence : []).forEach((entry) => {
    const signal = cleanText(entry?.signal);
    if (!signal) return;
    appendReason(out, signal);
    if (signal === 'shared_device_id' && currentSignals.deviceId) appendReason(out, `shared_device:${currentSignals.deviceId}`);
    if (signal === 'shared_fingerprint' && currentSignals.fingerprint) appendReason(out, `shared_fingerprint:${currentSignals.fingerprint}`);
    if (signal === 'shared_weak_fingerprint' && currentSignals.weakFingerprint) appendReason(out, `shared_weak_fingerprint:${currentSignals.weakFingerprint}`);
  });

  return mergeUniqueStrings(out);
}

function collectRewardRollbackBattleIds(evidence = []) {
  const battleIds = new Set();
  (Array.isArray(evidence) ? evidence : []).forEach((entry) => {
    const signal = cleanText(entry?.signal);
    const details = toPlainObject(entry?.details);

    if (signal === 'parallel_battle' || signal === 'serial_battle_farming') {
      const battles = Array.isArray(details?.battles) ? details.battles : [];
      battles.forEach((row) => {
        const battleId = cleanText(row?.battleId);
        if (battleId) battleIds.add(battleId);
      });
      return;
    }

    if (signal === 'battle_pattern') {
      const users = Array.isArray(details?.users) ? details.users : [];
      users.forEach((row) => {
        const rowBattleIds = Array.isArray(row?.battleIds) ? row.battleIds : [];
        rowBattleIds.forEach((battleId) => {
          const safeBattleId = cleanText(battleId);
          if (safeBattleId) battleIds.add(safeBattleId);
        });
      });
      return;
    }

    if (signal === 'battle_signature_cluster') {
      const matches = Array.isArray(details?.matches) ? details.matches : [];
      matches.forEach((row) => {
        const rowBattleIds = Array.isArray(row?.battleIds) ? row.battleIds : [];
        rowBattleIds.forEach((battleId) => {
          const safeBattleId = cleanText(battleId);
          if (safeBattleId) battleIds.add(safeBattleId);
        });
      });
    }
  });

  return battleIds;
}

function sanitizeRewardRollbackEntries(rewardRollback = [], evidence = [], userMap = new Map()) {
  const relevantBattleIds = collectRewardRollbackBattleIds(evidence);
  if (!relevantBattleIds.size) return [];

  const grouped = new Map();
  (Array.isArray(rewardRollback) ? rewardRollback : []).forEach((row) => {
    const battleId = cleanText(row?.battleId);
    const userId = cleanText(row?.userId);
    if (!battleId || !userId || !relevantBattleIds.has(battleId)) return;

    const currency = cleanText(row?.currency || 'K') || 'K';
    const status = cleanText(row?.status || 'pending') || 'pending';
    const key = `${userId}:${battleId}:${currency}:${status}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        transactionIds: [],
        userId,
        battleId,
        currency,
        status,
        amount: 0,
        occurredAt: row?.occurredAt || null,
        rolledBackAmount: 0,
        shortfall: 0,
        rolledBackAt: row?.rolledBackAt || null,
        rolledBackBy: row?.rolledBackBy || null,
        rollbackTransactionIds: [],
      });
    }

    const entry = grouped.get(key);
    const transactionId = cleanText(row?.id);
    const sourceTransactionId = cleanText(row?.transactionId || transactionId);
    if (sourceTransactionId) entry.transactionIds.push(sourceTransactionId);
    entry.amount = round(entry.amount + safeNumber(row?.amount), 3);
    entry.rolledBackAmount = round(entry.rolledBackAmount + safeNumber(row?.rolledBackAmount), 3);
    entry.shortfall = round(entry.shortfall + safeNumber(row?.shortfall), 3);
    const rollbackTransactionId = cleanText(row?.rollbackTransactionId);
    if (rollbackTransactionId) entry.rollbackTransactionIds.push(rollbackTransactionId);
    if (!entry.occurredAt || new Date(row?.occurredAt || 0).getTime() > new Date(entry.occurredAt || 0).getTime()) {
      entry.occurredAt = row?.occurredAt || entry.occurredAt || null;
    }
    if (!entry.rolledBackAt || new Date(row?.rolledBackAt || 0).getTime() > new Date(entry.rolledBackAt || 0).getTime()) {
      entry.rolledBackAt = row?.rolledBackAt || entry.rolledBackAt || null;
    }
  });

  return sortByDate(Array.from(grouped.values()).map((row) => {
    const user = userMap.get(cleanText(row?.userId)) || null;
    return {
      transactionId: cleanText(row?.transactionIds?.[0]),
      transactionIds: Array.isArray(row?.transactionIds) ? row.transactionIds : [],
      transactionCount: Array.isArray(row?.transactionIds) ? row.transactionIds.length : 0,
      userId: cleanText(row?.userId),
      userEmail: cleanText(user?.email),
      userNickname: cleanText(user?.nickname),
      battleId: cleanText(row?.battleId),
      amount: round(row?.amount, 3),
      currency: cleanText(row?.currency || 'K') || 'K',
      occurredAt: row?.occurredAt || null,
      status: cleanText(row?.status || 'pending') || 'pending',
      rolledBackAmount: round(row?.rolledBackAmount, 3),
      shortfall: round(row?.shortfall, 3),
      rolledBackAt: row?.rolledBackAt || null,
      rolledBackBy: row?.rolledBackBy || null,
      rollbackTransactionId: cleanText(row?.rollbackTransactionIds?.[0]),
      rollbackTransactionIds: Array.isArray(row?.rollbackTransactionIds) ? row.rollbackTransactionIds : [],
    };
  }), 'occurredAt').reverse().slice(0, 200);
}

function buildRewardRollbackEntries(rewardRows = [], userMap = new Map(), evidence = []) {
  const preparedRows = (Array.isArray(rewardRows) ? rewardRows : []).map((row) => ({
    transactionId: cleanText(row?.id),
    userId: cleanText(row?.userId),
    battleId: cleanText(row?.battleId),
    amount: round(row?.amount, 3),
    currency: cleanText(row?.currency || 'K') || 'K',
    occurredAt: row?.occurredAt || null,
    status: 'pending',
    rolledBackAmount: 0,
    shortfall: 0,
  }));
  return sanitizeRewardRollbackEntries(preparedRows, evidence, userMap);
}

async function buildClusterAssessment({
  primaryUser = null,
  clusterUsers = [],
  assessments = [],
  currentSignals = {},
}) {
  const safeUsers = uniqueUsers(clusterUsers).filter(Boolean);
  const userIds = safeUsers.map((row) => cleanText(row?._id)).filter(Boolean);
  if (userIds.length < 2) {
    return {
      riskScore: 0,
      categoryScores: buildCategoryScores([]),
      riskScoreDetailed: [],
      evidence: [],
      status: MULTI_ACCOUNT_STATUS_WATCH,
      freezeStatus: 'watch',
      shouldFreeze: false,
      signals: buildClusterRiskSignals({ currentSignals, evidence: [], clusterSize: safeUsers.length }),
      rewardRollback: [],
    };
  }

  const since = getWindowSince();
  const currentUserId = cleanText(primaryUser?._id || primaryUser?.id);
  const [signalHistory, sessions, battleDocs, solarShareRows, battleRewardRows, crowdedIpRows] = await Promise.all([
    listSignalHistoryByUserIds(userIds, { limit: 1000 }),
    listUserSessionsByUserIds(userIds, { since }),
    listBattleDocsSince(since),
    listSolarShareActivitiesByUserIds(userIds, { since }),
    listBattleRewardTransactionsByUserIds(userIds, { since }),
    listSignalHistoryByIps(uniq([
      cleanText(currentSignals.ip),
      ...safeUsers.map((row) => cleanText(row?.lastIp)),
    ].filter(Boolean)), { since }),
  ]);

  const userMap = new Map(safeUsers.map((row) => [cleanText(row?._id), row]));
  const userSignalRows = new Map(userIds.map((userId) => [userId, []]));
  signalHistory.forEach((row) => {
    const userId = cleanText(row?.userId);
    if (!userSignalRows.has(userId)) userSignalRows.set(userId, []);
    userSignalRows.get(userId).push(row);
  });

  const evidence = [];
  const sharedBattleRows = [];
  const sharedBattleIds = new Map();

  (Array.isArray(assessments) ? assessments : []).forEach((assessment) => {
    const matchedUserId = cleanText(assessment?.user?._id || assessment?.user?.id);
    const historyRows = sortByDate(Array.isArray(assessment?.history) ? assessment.history : [], 'createdAt');
    const firstSeenAt = historyRows[0]?.createdAt || null;
    const lastSeenAt = historyRows[historyRows.length - 1]?.createdAt || null;
    const matchedUserIds = matchedUserId ? [matchedUserId] : [];
    (Array.isArray(assessment?.evidence) ? assessment.evidence : []).forEach((entry) => {
      const type = cleanText(entry?.type);
      if (type === 'fingerprint') {
        appendDetailedEvidence(evidence, buildEvidenceEntry({
          signal: 'shared_fingerprint',
          category: 'technical',
          score: DETAIL_SCORES.shared_fingerprint,
          summary: 'Совпал устойчивый отпечаток устройства',
          count: entry?.count || 1,
          value: cleanText(entry?.value),
          firstSeenAt,
          lastSeenAt,
          matchedUserIds,
          details: { fingerprint: cleanText(entry?.value) },
          type,
        }));
      }
      if (type === 'device') {
        appendDetailedEvidence(evidence, buildEvidenceEntry({
          signal: 'shared_device_id',
          category: 'technical',
          score: DETAIL_SCORES.shared_device_id,
          summary: 'Совпала постоянная метка браузера',
          count: entry?.count || 1,
          value: cleanText(entry?.value),
          firstSeenAt,
          lastSeenAt,
          matchedUserIds,
          details: { deviceId: cleanText(entry?.value) },
          type,
        }));
      }
      if (type === 'profile_key') {
        appendDetailedEvidence(evidence, buildEvidenceEntry({
          signal: 'shared_profile_key',
          category: 'technical',
          score: DETAIL_SCORES.shared_profile_key,
          summary: 'Совпал устойчивый технический профиль браузера',
          count: entry?.count || 1,
          value: cleanText(entry?.value),
          firstSeenAt,
          lastSeenAt,
          matchedUserIds,
          details: { profileKey: cleanText(entry?.value) },
          type,
        }));
      }
      if (type === 'weak_fingerprint') {
        appendDetailedEvidence(evidence, buildEvidenceEntry({
          signal: 'shared_weak_fingerprint',
          category: 'technical',
          score: DETAIL_SCORES.shared_weak_fingerprint,
          summary: 'Совпал слабый отпечаток устройства',
          count: entry?.count || 1,
          value: cleanText(entry?.value),
          firstSeenAt,
          lastSeenAt,
          matchedUserIds,
          details: { weakFingerprint: cleanText(entry?.value) },
          type,
        }));
      }
      if (type === 'email') {
        appendDetailedEvidence(evidence, buildEvidenceEntry({
          signal: 'email_normalized_collision',
          category: 'technical',
          score: DETAIL_SCORES.email_normalized_collision,
          summary: 'Почтовые адреса совпали после нормализации',
          count: entry?.count || 1,
          value: cleanText(entry?.normalizedValue),
          firstSeenAt,
          lastSeenAt,
          matchedUserIds,
          details: {
            normalizedValue: cleanText(entry?.normalizedValue),
            currentEmail: cleanText(entry?.currentEmail),
            matchedEmail: cleanText(entry?.matchedEmail),
          },
          type,
        }));
      }
      if (type === 'ip') {
        appendDetailedEvidence(evidence, buildEvidenceEntry({
          signal: 'shared_ip',
          category: 'network',
          score: entry?.anonymousNetwork ? DETAIL_SCORES.shared_ip - 2 : DETAIL_SCORES.shared_ip,
          summary: entry?.anonymousNetwork ? 'Совпал IP в анонимной сети' : 'Совпал IP-адрес',
          count: entry?.count || 1,
          value: cleanText(entry?.value),
          firstSeenAt,
          lastSeenAt,
          matchedUserIds,
          details: {
            ip: cleanText(entry?.value),
            anonymousNetwork: Boolean(entry?.anonymousNetwork),
          },
          type,
        }));
      }
    });

    if ((assessment?.reasons || []).includes('anonymized_bridge')) {
      appendDetailedEvidence(evidence, buildEvidenceEntry({
        signal: 'anonymized_bridge',
        category: 'network',
        score: DETAIL_SCORES.anonymized_bridge,
        summary: 'Один и тот же след замечен и в обычной, и в анонимной сети',
        count: 1,
        firstSeenAt,
        lastSeenAt,
        matchedUserIds,
      }));
    }
  });

  const profileFlagsByUser = new Map(userIds.map((userId) => [userId, {
    emulator: false,
    webdriver: false,
    headless: false,
    flags: new Set(),
    latestAt: null,
    profileSamples: [],
  }]));
  const pushProfile = (userId, profile, happenedAt = null) => {
    const safeUserId = cleanText(userId);
    if (!safeUserId || !profileFlagsByUser.has(safeUserId)) return;
    const safeProfile = normalizeClientProfile(profile);
    if (!safeProfile.platform && !safeProfile.webglRenderer && !safeProfile.webglVendor) return;
    const row = profileFlagsByUser.get(safeUserId);
    row.emulator = row.emulator || Boolean(safeProfile.emulator);
    row.webdriver = row.webdriver || Boolean(safeProfile.webdriver);
    row.headless = row.headless || Boolean(safeProfile.headless);
    if (safeProfile.emulator) row.flags.add('emulator');
    if (safeProfile.webdriver || safeProfile.headless) row.flags.add('webdriver');
    row.profileSamples.push({
      platform: safeProfile.platform,
      vendor: safeProfile.vendor,
      timezone: safeProfile.timezone,
      webglVendor: safeProfile.webglVendor,
      webglRenderer: safeProfile.webglRenderer,
      maxTouchPoints: safeProfile.maxTouchPoints,
      happenedAt: happenedAt ? new Date(happenedAt).toISOString() : null,
    });
    if (!row.latestAt || new Date(happenedAt || 0).getTime() > new Date(row.latestAt || 0).getTime()) {
      row.latestAt = happenedAt || row.latestAt || null;
    }
  };

  safeUsers.forEach((user) => {
    const userId = cleanText(user?._id);
    if (!userId) return;
    pushProfile(userId, user?.lastClientProfile || user?.data?.lastClientProfile, user?.updatedAt || null);
    if (currentUserId && userId === currentUserId) {
      pushProfile(userId, currentSignals.clientProfile, new Date().toISOString());
    }
  });
  signalHistory.forEach((row) => pushProfile(row?.userId, row?.clientProfile || row?.meta?.clientProfile, row?.createdAt));
  sessions.forEach((row) => pushProfile(row?.userId, row?.clientProfile, row?.lastSeenAt || row?.startedAt));

  const emulatorUsers = Array.from(profileFlagsByUser.entries())
    .filter(([, row]) => row.emulator)
    .map(([userId]) => userId);
  if (emulatorUsers.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'emulator',
      category: 'technical',
      score: Math.min(18, DETAIL_SCORES.emulator + emulatorUsers.length * 2),
      summary: 'У части аккаунтов замечены признаки эмулятора',
      count: emulatorUsers.length,
      matchedUserIds: emulatorUsers,
      firstSeenAt: null,
      lastSeenAt: sortByDate(signalHistory.filter((row) => emulatorUsers.includes(cleanText(row?.userId))), 'createdAt').slice(-1)[0]?.createdAt || null,
      details: {
        users: emulatorUsers.map((userId) => ({
          userId,
          samples: profileFlagsByUser.get(userId)?.profileSamples?.slice(0, 5) || [],
        })),
      },
    }));
  }

  const webdriverUsers = Array.from(profileFlagsByUser.entries())
    .filter(([, row]) => row.webdriver || row.headless)
    .map(([userId]) => userId);
  if (webdriverUsers.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'webdriver',
      category: 'technical',
      score: Math.min(20, DETAIL_SCORES.webdriver + webdriverUsers.length * 2),
      summary: 'У части аккаунтов замечены признаки автоматизированного браузера',
      count: webdriverUsers.length,
      matchedUserIds: webdriverUsers,
      details: {
        users: webdriverUsers.map((userId) => ({
          userId,
          samples: profileFlagsByUser.get(userId)?.profileSamples?.slice(0, 5) || [],
        })),
      },
    }));
  }

  const networkRiskDetails = [];
  signalHistory.forEach((row) => {
    const intel = toPlainObject(row?.ipIntel);
    const flags = [
      intel?.isTor ? 'tor' : '',
      intel?.isVpn ? 'vpn' : '',
      intel?.isProxy ? 'proxy' : '',
      intel?.isHosting ? 'hosting' : '',
    ].filter(Boolean);
    if (!flags.length) return;
    networkRiskDetails.push({
      userId: cleanText(row?.userId),
      ip: cleanText(row?.ip),
      flags,
      happenedAt: row?.createdAt || null,
    });
  });
  if (currentSignals.ip && isAnonymousIntel(currentSignals.ipIntel)) {
    networkRiskDetails.push({
      userId: currentUserId,
      ip: cleanText(currentSignals.ip),
      flags: [
        currentSignals.ipIntel?.isTor ? 'tor' : '',
        currentSignals.ipIntel?.isVpn ? 'vpn' : '',
        currentSignals.ipIntel?.isProxy ? 'proxy' : '',
        currentSignals.ipIntel?.isHosting ? 'hosting' : '',
      ].filter(Boolean),
      happenedAt: new Date().toISOString(),
    });
  }
  if (networkRiskDetails.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'network_risk',
      category: 'network',
      score: Math.min(24, DETAIL_SCORES.network_risk + networkRiskDetails.length),
      summary: 'Группа заходила через VPN, TOR, прокси или серверную сеть',
      count: networkRiskDetails.length,
      matchedUserIds: uniq(networkRiskDetails.map((row) => row.userId)),
      firstSeenAt: sortByDate(networkRiskDetails, 'happenedAt')[0]?.happenedAt || null,
      lastSeenAt: sortByDate(networkRiskDetails, 'happenedAt').slice(-1)[0]?.happenedAt || null,
      details: { entries: networkRiskDetails.slice(0, 20) },
    }));
  }

  if (emulatorUsers.length && networkRiskDetails.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'emulator_network_combo',
      category: 'network',
      score: DETAIL_SCORES.emulator_network_combo,
      summary: 'Есть сочетание эмулятора и анонимной сети',
      count: 1,
      matchedUserIds: uniq([...emulatorUsers, ...networkRiskDetails.map((row) => row.userId)]),
    }));
  }

  const tokenMaps = new Map();
  const pushToken = (type, value, row) => {
    const safeValue = cleanText(value);
    if (!safeValue) return;
    const key = `${type}:${safeValue}`;
    if (!tokenMaps.has(key)) tokenMaps.set(key, []);
    tokenMaps.get(key).push(row);
  };
  signalHistory.forEach((row) => {
    pushToken('device', row?.deviceId, row);
    pushToken('fingerprint', row?.fingerprint, row);
    pushToken('profile', row?.profileKey, row);
  });

  const switchTransitions = [];
  tokenMaps.forEach((rows, key) => {
    const sorted = sortByDate(rows, 'createdAt');
    for (let index = 1; index < sorted.length; index += 1) {
      const prev = sorted[index - 1];
      const next = sorted[index];
      if (cleanText(prev?.userId) === cleanText(next?.userId)) continue;
      const diffMs = Math.abs(new Date(next?.createdAt || 0).getTime() - new Date(prev?.createdAt || 0).getTime());
      if (!Number.isFinite(diffMs) || diffMs > 20 * 60 * 1000) continue;
      switchTransitions.push({
        token: key,
        fromUserId: cleanText(prev?.userId),
        toUserId: cleanText(next?.userId),
        diffMinutes: round(diffMs / 60000, 2),
        happenedAt: next?.createdAt || null,
      });
    }
  });
  if (switchTransitions.length >= 2) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'session_switch',
      category: 'sessions',
      score: Math.min(26, DETAIL_SCORES.session_switch + switchTransitions.length),
      summary: 'Аккаунты быстро сменяли друг друга на одном и том же следе устройства',
      count: switchTransitions.length,
      matchedUserIds: uniq(switchTransitions.flatMap((row) => [row.fromUserId, row.toUserId])),
      firstSeenAt: sortByDate(switchTransitions, 'happenedAt')[0]?.happenedAt || null,
      lastSeenAt: sortByDate(switchTransitions, 'happenedAt').slice(-1)[0]?.happenedAt || null,
      details: { transitions: switchTransitions.slice(0, 20) },
    }));
  }

  const syncPairs = [];
  const sessionList = sortByDate(sessions, 'startedAt');
  for (let index = 0; index < sessionList.length; index += 1) {
    for (let inner = index + 1; inner < sessionList.length; inner += 1) {
      const left = sessionList[index];
      const right = sessionList[inner];
      if (cleanText(left?.userId) === cleanText(right?.userId)) continue;
      const startDiffMs = Math.abs(new Date(left?.startedAt || 0).getTime() - new Date(right?.startedAt || 0).getTime());
      const leftEnd = left?.endedAt || left?.lastSeenAt || left?.startedAt;
      const rightEnd = right?.endedAt || right?.lastSeenAt || right?.startedAt;
      const endDiffMs = Math.abs(new Date(leftEnd || 0).getTime() - new Date(rightEnd || 0).getTime());
      const overlapMs = overlapDurationMs(left?.startedAt, leftEnd, right?.startedAt, rightEnd);
      if (startDiffMs <= 5 * 60 * 1000 && endDiffMs <= 10 * 60 * 1000) {
        syncPairs.push({
          type: 'sync',
          userIds: [cleanText(left?.userId), cleanText(right?.userId)],
          startedAt: left?.startedAt || right?.startedAt || null,
          startDiffMinutes: round(startDiffMs / 60000, 2),
          endDiffMinutes: round(endDiffMs / 60000, 2),
        });
      }
      if (overlapMs >= 10 * 60 * 1000) {
        syncPairs.push({
          type: 'parallel',
          userIds: [cleanText(left?.userId), cleanText(right?.userId)],
          startedAt: left?.startedAt || right?.startedAt || null,
          overlapMinutes: round(overlapMs / 60000, 2),
        });
      }
    }
  }

  const sessionSyncRows = syncPairs.filter((row) => row.type === 'sync');
  if (sessionSyncRows.length >= 2) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'session_sync',
      category: 'sessions',
      score: Math.min(24, DETAIL_SCORES.session_sync + sessionSyncRows.length * 2),
      summary: 'Разные аккаунты слишком синхронно входят и выходят',
      count: sessionSyncRows.length,
      matchedUserIds: uniq(sessionSyncRows.flatMap((row) => row.userIds)),
      firstSeenAt: sortByDate(sessionSyncRows, 'startedAt')[0]?.startedAt || null,
      lastSeenAt: sortByDate(sessionSyncRows, 'startedAt').slice(-1)[0]?.startedAt || null,
      details: { entries: sessionSyncRows.slice(0, 20) },
    }));
  }

  const parallelSessionRows = syncPairs.filter((row) => row.type === 'parallel');
  if (parallelSessionRows.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'parallel_session_overlap',
      category: 'sessions',
      score: Math.min(22, DETAIL_SCORES.parallel_session_overlap + parallelSessionRows.length * 2),
      summary: 'У связанных аккаунтов были параллельные сессии',
      count: parallelSessionRows.length,
      matchedUserIds: uniq(parallelSessionRows.flatMap((row) => row.userIds)),
      firstSeenAt: sortByDate(parallelSessionRows, 'startedAt')[0]?.startedAt || null,
      lastSeenAt: sortByDate(parallelSessionRows, 'startedAt').slice(-1)[0]?.startedAt || null,
      details: { entries: parallelSessionRows.slice(0, 20) },
    }));
  }

  const dailyLoginBuckets = new Map();
  signalHistory
    .filter((row) => cleanText(row?.eventType) === 'login')
    .forEach((row) => {
      const at = new Date(row?.createdAt || 0);
      if (Number.isNaN(at.getTime())) return;
      const dateKey = at.toISOString().slice(0, 10);
      if (!dailyLoginBuckets.has(dateKey)) dailyLoginBuckets.set(dateKey, []);
      dailyLoginBuckets.get(dateKey).push({
        userId: cleanText(row?.userId),
        minutes: at.getUTCHours() * 60 + at.getUTCMinutes(),
        happenedAt: row?.createdAt || null,
      });
    });
  const sharedScheduleDays = [];
  dailyLoginBuckets.forEach((rows, dateKey) => {
    const sorted = [...rows].sort((a, b) => a.minutes - b.minutes);
    for (let index = 1; index < sorted.length; index += 1) {
      const prev = sorted[index - 1];
      const next = sorted[index];
      if (prev.userId === next.userId) continue;
      if (Math.abs(prev.minutes - next.minutes) > 15) continue;
      sharedScheduleDays.push({
        dateKey,
        userIds: [prev.userId, next.userId],
        minuteDiff: Math.abs(prev.minutes - next.minutes),
        happenedAt: next.happenedAt,
      });
      break;
    }
  });
  if (sharedScheduleDays.length >= 3) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'shared_schedule',
      category: 'sessions',
      score: Math.min(18, DETAIL_SCORES.shared_schedule + sharedScheduleDays.length),
      summary: 'У аккаунтов повторяется почти одинаковое время входа по дням',
      count: sharedScheduleDays.length,
      matchedUserIds: uniq(sharedScheduleDays.flatMap((row) => row.userIds)),
      firstSeenAt: sortByDate(sharedScheduleDays, 'happenedAt')[0]?.happenedAt || null,
      lastSeenAt: sortByDate(sharedScheduleDays, 'happenedAt').slice(-1)[0]?.happenedAt || null,
      details: { days: sharedScheduleDays.slice(0, 20) },
    }));
  }

  const crowdedIpDetails = [];
  const crowdedIpMap = new Map();
  crowdedIpRows.forEach((row) => {
    const ip = cleanText(row?.ip);
    if (!ip) return;
    if (!crowdedIpMap.has(ip)) crowdedIpMap.set(ip, new Set());
    const token = cleanText(row?.deviceId || row?.fingerprint || row?.weakFingerprint || row?.profileKey);
    if (token) crowdedIpMap.get(ip).add(token);
  });
  crowdedIpMap.forEach((tokens, ip) => {
    if (tokens.size > MULTI_ACCOUNT_MAX_DEVICES_PER_IP) {
      crowdedIpDetails.push({ ip, deviceCount: tokens.size });
    }
  });
  if (crowdedIpDetails.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'ip_device_crowding',
      category: 'sessions',
      score: Math.min(20, DETAIL_SCORES.ip_device_crowding + crowdedIpDetails.length * 2),
      summary: 'На одном IP замечено больше допустимого числа разных устройств',
      count: crowdedIpDetails.length,
      matchedUserIds: userIds,
      details: { ips: crowdedIpDetails.slice(0, 10), limit: MULTI_ACCOUNT_MAX_DEVICES_PER_IP },
    }));
  }

  battleDocs.forEach((battle) => {
    const attendance = Array.isArray(battle?.attendance) ? battle.attendance : [];
    attendance.forEach((entry) => {
      const userId = cleanText(entry?.user?._id || entry?.user);
      if (!userIds.includes(userId)) return;
      const happenedAt = entry?.joinedAt || battle?.endsAt || battle?.updatedAt || battle?.createdAt || null;
      const row = {
        userId,
        battleId: cleanText(battle?._id),
        happenedAt,
        automationTelemetry: entry?.automationTelemetry || {},
      };
      sharedBattleRows.push(row);
      if (!sharedBattleIds.has(row.battleId)) sharedBattleIds.set(row.battleId, new Set());
      sharedBattleIds.get(row.battleId).add(userId);
    });
  });
  const battleProfiles = buildBattleProfiles(sharedBattleRows);
  const suspiciousBattleUsers = [];
  battleProfiles.forEach((profile, userId) => {
    if (
      (profile.shots >= 120 && profile.staticRatio >= 0.72)
      || (profile.intervalCount >= 80 && profile.intervalCv > 0 && profile.intervalCv <= 0.08)
      || profile.hiddenTabShotCount >= 5
    ) {
      suspiciousBattleUsers.push({
        userId,
        shots: profile.shots,
        staticRatio: profile.staticRatio,
        intervalCv: profile.intervalCv,
        hiddenTabShotCount: profile.hiddenTabShotCount,
        avgCursorDistancePx: profile.avgCursorDistancePx,
        battleIds: Array.isArray(profile.battleIds) ? profile.battleIds.slice(0, 50) : [],
      });
    }
  });
  if (suspiciousBattleUsers.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'battle_pattern',
      category: 'battle',
      score: Math.min(30, DETAIL_SCORES.battle_pattern + suspiciousBattleUsers.length * 3),
      summary: 'У группы есть боевые шаблоны, похожие на кликер или автоматизацию',
      count: suspiciousBattleUsers.length,
      matchedUserIds: suspiciousBattleUsers.map((row) => row.userId),
      lastSeenAt: sortByDate(sharedBattleRows, 'happenedAt').slice(-1)[0]?.happenedAt || null,
      details: { users: suspiciousBattleUsers.slice(0, 10) },
    }));
  }

  const parallelBattleDetails = Array.from(sharedBattleIds.entries())
    .filter(([, ids]) => ids.size >= 2)
    .map(([battleId, ids]) => ({
      battleId,
      userIds: Array.from(ids),
    }));
  if (parallelBattleDetails.length && parallelSessionRows.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'parallel_battle',
      category: 'battle',
      score: Math.min(24, DETAIL_SCORES.parallel_battle + parallelBattleDetails.length * 2),
      summary: 'Связанные аккаунты участвовали в боях параллельно',
      count: parallelBattleDetails.length,
      matchedUserIds: uniq(parallelBattleDetails.flatMap((row) => row.userIds)),
      details: { battles: parallelBattleDetails.slice(0, 20) },
    }));
  }

  const battleSignatureMatches = [];
  const battleProfilesList = Array.from(battleProfiles.values());
  for (let index = 0; index < battleProfilesList.length; index += 1) {
    for (let inner = index + 1; inner < battleProfilesList.length; inner += 1) {
      const left = battleProfilesList[index];
      const right = battleProfilesList[inner];
      if (left.shots < 120 || right.shots < 120) continue;
      const closeMetrics = [
        Math.abs(left.staticRatio - right.staticRatio) <= 0.08,
        Math.abs(left.intervalCv - right.intervalCv) <= 0.03,
        Math.abs(left.hiddenRatio - right.hiddenRatio) <= 0.03,
        Math.abs(left.screenWidth - right.screenWidth) <= 0.08,
        Math.abs(left.screenHeight - right.screenHeight) <= 0.08,
        Math.abs(left.avgCursorDistancePx - right.avgCursorDistancePx) <= 20,
      ].filter(Boolean).length;
      if (closeMetrics < 4) continue;
      battleSignatureMatches.push({
        leftUserId: left.userId,
        rightUserId: right.userId,
        closeMetrics,
        staticDiff: round(Math.abs(left.staticRatio - right.staticRatio), 5),
        intervalDiff: round(Math.abs(left.intervalCv - right.intervalCv), 5),
        battleIds: uniq([
          ...(Array.isArray(left.battleIds) ? left.battleIds : []),
          ...(Array.isArray(right.battleIds) ? right.battleIds : []),
        ]).slice(0, 50),
      });
    }
  }
  if (battleSignatureMatches.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'battle_signature_cluster',
      category: 'battle',
      score: Math.min(30, DETAIL_SCORES.battle_signature_cluster + battleSignatureMatches.length * 2),
      summary: 'У связанных аккаунтов слишком похожая боевая сигнатура',
      count: battleSignatureMatches.length,
      matchedUserIds: uniq(battleSignatureMatches.flatMap((row) => [row.leftUserId, row.rightUserId])),
      details: { matches: battleSignatureMatches.slice(0, 20) },
    }));
  }

  const economyByRecipient = new Map();
  solarShareRows.forEach((row) => {
    const recipientId = cleanText(row?.recipientId);
    const senderId = cleanText(row?.userId);
    if (!recipientId || !senderId || senderId === recipientId) return;
    if (!userIds.includes(recipientId)) return;
    if (!economyByRecipient.has(recipientId)) economyByRecipient.set(recipientId, []);
    economyByRecipient.get(recipientId).push(row);
  });
  const funnelingTargets = [];
  economyByRecipient.forEach((rows, recipientId) => {
    const totalLm = rows.reduce((sum, row) => sum + safeNumber(row?.amountLm), 0);
    const uniqueSenders = uniq(rows.map((row) => cleanText(row?.userId)).filter(Boolean));
    if (uniqueSenders.length < 2 || totalLm < 80) return;
    funnelingTargets.push({
      recipientId,
      totalLm: round(totalLm, 3),
      senderCount: uniqueSenders.length,
      transfers: rows.length,
      latestAt: sortByDate(rows, 'createdAt').slice(-1)[0]?.createdAt || null,
    });
  });
  if (funnelingTargets.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'economy_funneling',
      category: 'economy',
      score: Math.min(32, DETAIL_SCORES.economy_funneling + funnelingTargets.length * 3),
      summary: 'Выгода стекается на один связанный аккаунт',
      count: funnelingTargets.length,
      matchedUserIds: uniq(funnelingTargets.map((row) => row.recipientId)),
      firstSeenAt: sortByDate(solarShareRows, 'createdAt')[0]?.createdAt || null,
      lastSeenAt: sortByDate(solarShareRows, 'createdAt').slice(-1)[0]?.createdAt || null,
      details: { targets: funnelingTargets.slice(0, 10) },
    }));
  }

  const rewardByBattle = new Map();
  battleRewardRows.forEach((row) => {
    const battleId = cleanText(row?.battleId);
    if (!battleId) return;
    if (!rewardByBattle.has(battleId)) rewardByBattle.set(battleId, new Set());
    rewardByBattle.get(battleId).add(cleanText(row?.userId));
  });
  const serialBattleFarming = Array.from(rewardByBattle.entries())
    .filter(([, ids]) => ids.size >= 2)
    .map(([battleId, ids]) => ({ battleId, userIds: Array.from(ids) }));
  if (serialBattleFarming.length >= 3 && (parallelBattleDetails.length || switchTransitions.length)) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'serial_battle_farming',
      category: 'economy',
      score: Math.min(24, DETAIL_SCORES.serial_battle_farming + serialBattleFarming.length),
      summary: 'Группа неоднократно фармила награду боя на нескольких аккаунтах',
      count: serialBattleFarming.length,
      matchedUserIds: uniq(serialBattleFarming.flatMap((row) => row.userIds)),
      details: { battles: serialBattleFarming.slice(0, 20) },
    }));
  }

  const riskScore = round((Array.isArray(evidence) ? evidence : []).reduce((sum, entry) => sum + safeNumber(entry?.score), 0), 3);
  const shouldFreeze = qualifiesAutomaticFreeze({ riskScore, evidence });
  const freezeStatus = shouldFreeze ? 'frozen' : (riskScore >= HIGH_RISK_SCORE_THRESHOLD ? 'high_risk' : 'watch');
  const status = resolveClusterStatus({ riskScore, shouldFreeze, freezeStatus: shouldFreeze ? 'frozen' : '' });

  return {
    riskScore,
    categoryScores: buildCategoryScores(evidence),
    riskScoreDetailed: buildRiskScoreDetailed(evidence),
    evidence: buildRiskScoreDetailed(evidence),
    status,
    freezeStatus,
    shouldFreeze,
    signals: buildClusterRiskSignals({
      currentSignals,
      evidence,
      clusterSize: safeUsers.length,
    }),
    rewardRollback: buildRewardRollbackEntries(battleRewardRows, userMap, evidence),
  };
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

function isMultiAccountRiskCaseRecord(riskCase) {
  return getRiskCaseSource(riskCase) === MULTI_ACCOUNT_RISK_SOURCE;
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

async function updateUsersForFreeze(users = [], {
  groupId,
  reason,
  actorId = null,
  note = '',
  action = 'freeze',
} = {}) {
  const supabase = getSupabaseClient();
  const safeUsers = uniqueUsers(users);
  if (!safeUsers.length) return null;

  const nowIso = new Date().toISOString();
  const resolvedGroupId = cleanText(groupId) || buildFreezeGroupId(safeUsers);

  for (const user of safeUsers) {
    const currentData = getUserData(user);
    const currentFreeze = getSecurityFreeze(currentData);
    const update = {
      updated_at: nowIso,
      access_restricted_until: null,
      access_restriction_reason: action === 'freeze' ? MULTI_ACCOUNT_FROZEN_REASON : '',
    };

    if (action === 'freeze') {
      update.status = MULTI_ACCOUNT_FROZEN_STATUS;
      update.data = buildUserDataWithFreeze(user, {
        status: 'frozen',
        groupId: resolvedGroupId,
        reason: cleanText(reason) || MULTI_ACCOUNT_FROZEN_REASON,
        frozenAt: nowIso,
        frozenBy: actorId || null,
        previousStatus: cleanText(currentFreeze.previousStatus || user.status || 'active') || 'active',
        note: cleanText(note),
        decision: 'pending',
      });
    }

    if (action === 'unfreeze') {
      const previousStatus = cleanText(currentFreeze.previousStatus || currentData.previousStatus || '');
      update.status = previousStatus || (user.emailConfirmed ? 'active' : 'pending');
      update.data = buildUserDataWithFreeze(user, {
        status: 'unfrozen',
        groupId: cleanText(currentFreeze.groupId || resolvedGroupId),
        unfrozenAt: nowIso,
        unfrozenBy: actorId || null,
        reason: cleanText(reason) || currentFreeze.reason || MULTI_ACCOUNT_FROZEN_REASON,
        note: cleanText(note),
        decision: 'unfreeze',
      });
    }

    if (action === 'watch') {
      const previousStatus = cleanText(currentFreeze.previousStatus || currentData.previousStatus || '');
      update.status = previousStatus || (user.emailConfirmed ? 'active' : 'pending');
      update.data = buildUserDataWithFreeze(user, {
        status: 'watch',
        groupId: cleanText(currentFreeze.groupId || resolvedGroupId),
        watchAt: nowIso,
        watchBy: actorId || null,
        reason: cleanText(reason) || currentFreeze.reason || MULTI_ACCOUNT_FROZEN_REASON,
        note: cleanText(note),
        decision: 'watch',
      });
    }

    if (action === 'ban') {
      update.status = 'banned';
      update.data = buildUserDataWithFreeze(user, {
        status: 'banned',
        groupId: cleanText(currentFreeze.groupId || resolvedGroupId),
        bannedAt: nowIso,
        bannedBy: actorId || null,
        reason: cleanText(reason) || currentFreeze.reason || MULTI_ACCOUNT_FROZEN_REASON,
        note: cleanText(note),
        decision: 'ban',
      });
    }

    // eslint-disable-next-line no-await-in-loop
    await supabase
      .from('users')
      .update(update)
      .eq('id', String(user._id));

    if (action === 'freeze' || action === 'ban') {
      // eslint-disable-next-line no-await-in-loop
      await revokeAllUserSessions({
        userId: user._id,
        revokedBy: actorId || null,
        reason: action === 'ban' ? 'multi_account_group_banned' : 'multi_account_group_frozen',
      });
    }
  }

  return resolvedGroupId;
}

async function listModelRiskCases() {
  const supabase = getSupabaseClient();
  const out = [];
  let from = 0;
  const pageSize = 1000;
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', 'RiskCase')
      .range(from, from + pageSize - 1);
    if (error || !Array.isArray(data) || data.length === 0) break;
    out.push(...data.map((row) => ({
      _id: row.id,
      ...(row.data && typeof row.data === 'object' ? row.data : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })));
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function pickLatestRiskCase(rows = [], predicate = null) {
  const filtered = (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row || typeof row !== 'object') return false;
    return typeof predicate === 'function' ? predicate(row) : true;
  });
  if (!filtered.length) return null;
  filtered.sort((a, b) => {
    const aTime = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const bTime = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    return bTime - aTime;
  });
  return filtered[0] || null;
}

async function listRiskCasesByUserId(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', 'RiskCase')
    .eq('data->>user', String(userId));
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => ({
    _id: row.id,
    ...(row.data && typeof row.data === 'object' ? row.data : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function getRiskCaseByUserId(userId, { source = '' } = {}) {
  const rows = await listRiskCasesByUserId(userId);
  const safeSource = cleanText(source);
  if (!safeSource) return pickLatestRiskCase(rows);
  return pickLatestRiskCase(rows, (row) => getRiskCaseSource(row) === safeSource);
}

async function updateRiskCaseById(id, patch = {}) {
  if (!id) return null;
  const supabase = getSupabaseClient();
  const { data: existing } = await supabase
    .from(DOC_TABLE)
    .select('id,data')
    .eq('model', 'RiskCase')
    .eq('id', String(id))
    .maybeSingle();
  if (!existing) return null;

  const next = {
    ...(existing.data && typeof existing.data === 'object' ? existing.data : {}),
    ...patch,
  };
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .update({
      data: next,
      updated_at: new Date().toISOString(),
    })
    .eq('id', String(id))
    .eq('model', 'RiskCase')
    .select('id,data,created_at,updated_at')
    .maybeSingle();
  if (error || !data) return null;
  return {
    _id: data.id,
    ...(data.data && typeof data.data === 'object' ? data.data : {}),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

async function createRiskCase(doc = {}) {
  const supabase = getSupabaseClient();
  const id = `rc_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .insert({
      model: 'RiskCase',
      id,
      data: doc,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id,data,created_at,updated_at')
    .maybeSingle();
  if (error || !data) return null;
  return {
    _id: data.id,
    ...(data.data && typeof data.data === 'object' ? data.data : {}),
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

function buildRiskSignals(signals, assessment, clusterSize) {
  if (Array.isArray(assessment?.signals) && assessment.signals.length) {
    return mergeUniqueStrings(assessment.signals);
  }
  return buildClusterRiskSignals({
    currentSignals: signals,
    evidence: Array.isArray(assessment?.evidence) ? assessment.evidence : [],
    clusterSize,
  });
}

async function upsertRiskCasesForAssessment({
  clusterUsers = [],
  assessments = [],
  clusterAssessment = null,
  currentSignals = {},
  eventType = 'login',
  frozen = false,
  groupId = '',
  note = '',
  action = 'observe',
}) {
  const safeUsers = uniqueUsers(clusterUsers);
  if (!safeUsers.length) return [];

  const assessmentMap = new Map();
  (Array.isArray(assessments) ? assessments : []).forEach((entry) => {
    const id = cleanText(entry?.user?._id || entry?.user?.id);
    if (id) assessmentMap.set(id, entry);
  });

  const out = [];
  for (const user of safeUsers) {
    const relatedUsers = safeUsers
      .filter((row) => String(row._id) !== String(user._id))
      .map((row) => String(row._id));
    const assessment = assessmentMap.get(String(user._id)) || {
      score: frozen ? FREEZE_SCORE_THRESHOLD : REVIEW_SCORE_THRESHOLD,
      reasons: [],
      evidence: [],
      riskLevel: frozen ? 'high' : 'medium',
    };
    const effectiveAssessment = clusterAssessment && typeof clusterAssessment === 'object'
      ? clusterAssessment
      : assessment;
    const riskScore = Math.max(
      Number(effectiveAssessment.riskScore || effectiveAssessment.score || 0),
      frozen ? FREEZE_SCORE_THRESHOLD : REVIEW_SCORE_THRESHOLD
    );
    const riskLevel = riskLevelByScore(riskScore);
    const signals = buildRiskSignals(currentSignals, effectiveAssessment, safeUsers.length);
    const nowIso = new Date().toISOString();
    const existing = await getRiskCaseByUserId(user._id, { source: MULTI_ACCOUNT_RISK_SOURCE });
    const nextStatus = cleanText(effectiveAssessment?.status)
      || (frozen ? MULTI_ACCOUNT_STATUS_FROZEN : MULTI_ACCOUNT_STATUS_WATCH);
    const nextFreezeStatus = cleanText(effectiveAssessment?.freezeStatus)
      || (frozen ? 'frozen' : (riskScore >= HIGH_RISK_SCORE_THRESHOLD ? 'high_risk' : 'watch'));
    const nextData = {
      user: user._id,
      relatedUsers,
      riskScore,
      riskLevel,
      signals,
      status: nextStatus,
      notes: (() => {
        const prev = cleanText(existing?.notes);
        const nextNote = cleanText(note);
        if (!nextNote) return prev;
        return prev ? `${prev}\n[${nowIso}] ${nextNote}` : `[${nowIso}] ${nextNote}`;
      })(),
      lastEvaluatedAt: nowIso,
      groupId: cleanText(groupId || existing?.groupId),
      confidence: effectiveAssessment?.shouldFreeze || riskScore >= HIGH_RISK_SCORE_THRESHOLD ? 'high' : 'medium',
      freezeStatus: nextFreezeStatus,
      evidence: Array.isArray(effectiveAssessment?.evidence) ? effectiveAssessment.evidence : [],
      riskScoreDetailed: Array.isArray(effectiveAssessment?.riskScoreDetailed) ? effectiveAssessment.riskScoreDetailed : [],
      categoryScores: effectiveAssessment?.categoryScores && typeof effectiveAssessment.categoryScores === 'object'
        ? effectiveAssessment.categoryScores
        : buildCategoryScores(Array.isArray(effectiveAssessment?.evidence) ? effectiveAssessment.evidence : []),
      rewardRollback: Array.isArray(effectiveAssessment?.rewardRollback) ? effectiveAssessment.rewardRollback : [],
      meta: {
        ...(existing?.meta && typeof existing.meta === 'object' ? existing.meta : {}),
        auto: true,
        source: MULTI_ACCOUNT_RISK_SOURCE,
        eventType,
        action,
        groupId: cleanText(groupId || existing?.groupId),
        currentSignals: {
          ip: cleanText(currentSignals.ip),
          deviceId: cleanText(currentSignals.deviceId),
          fingerprint: cleanText(currentSignals.fingerprint),
          weakFingerprint: cleanText(currentSignals.weakFingerprint),
          profileKey: cleanText(currentSignals.profileKey),
        },
        categoryScores: effectiveAssessment?.categoryScores && typeof effectiveAssessment.categoryScores === 'object'
          ? effectiveAssessment.categoryScores
          : {},
        ipIntel: currentSignals.ipIntel && typeof currentSignals.ipIntel === 'object' ? currentSignals.ipIntel : null,
      },
    };

    // eslint-disable-next-line no-await-in-loop
    const saved = existing
      ? await updateRiskCaseById(existing._id, nextData)
      : await createRiskCase(nextData);
    if (saved) out.push(saved);
  }
  return out;
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

function mergeUniqueStrings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((item) => cleanText(item)).filter(Boolean)));
}

function appendRepairNote(prevNotes, noteTag, nowIso) {
  const safePrev = cleanText(prevNotes);
  if (safePrev.includes(noteTag)) return safePrev;
  const line = `[${nowIso}] ${noteTag}`;
  return safePrev ? `${safePrev}\n${line}` : line;
}

function buildSignalsFromUserState(user) {
  const data = getUserData(user);
  return buildSignals({
    ip: user?.lastIp || data.lastIp || '',
    deviceId: user?.lastDeviceId || data.lastDeviceId || '',
    fingerprint: user?.lastFingerprint || data.lastFingerprint || '',
    weakFingerprint: user?.lastWeakFingerprint || data.lastWeakFingerprint || '',
    profileKey: user?.lastProfileKey || data.lastProfileKey || '',
    clientProfile: user?.lastClientProfile || data.lastClientProfile || null,
    email: user?.email || data.email || '',
    ipIntel: user?.lastIpIntel || data.lastIpIntel || null,
  });
}

function sameStringArray(left = [], right = []) {
  const a = mergeUniqueStrings(left).sort();
  const b = mergeUniqueStrings(right).sort();
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function hasEvidenceType(evidence = [], type = '') {
  return (Array.isArray(evidence) ? evidence : []).some((entry) => cleanText(entry?.type) === cleanText(type));
}

function hasNormalizedEmailMatchInGroup(user, groupUsers = []) {
  const currentEmail = normalizeEmailForAntiFarm(user?.email);
  if (!currentEmail) return false;
  return (Array.isArray(groupUsers) ? groupUsers : []).some((row) => (
    cleanText(row?._id) !== cleanText(user?._id)
    && normalizeEmailForAntiFarm(row?.email) === currentEmail
  ));
}

function sanitizeStoredMultiAccountSignals(signals = [], evidence = [], user = null, groupUsers = []) {
  const safeSignals = mergeUniqueStrings(signals);
  const hasDeviceEvidence = hasEvidenceType(evidence, 'device');
  const hasFingerprintEvidence = hasEvidenceType(evidence, 'fingerprint');
  const hasProfileKeyEvidence = hasEvidenceType(evidence, 'profile_key');
  const hasWeakFingerprintEvidence = hasEvidenceType(evidence, 'weak_fingerprint');
  const hasIpEvidence = hasEvidenceType(evidence, 'ip');
  const hasEmailEvidence = hasEvidenceType(evidence, 'email') || hasNormalizedEmailMatchInGroup(user, groupUsers);

  return safeSignals.filter((signal) => {
    if (!signal) return false;
    if (signal === 'email_normalized_collision') return hasEmailEvidence;
    if (signal === 'shared_device_id' || signal.startsWith('shared_device:')) return hasDeviceEvidence;
    if (signal === 'shared_fingerprint' || signal.startsWith('shared_fingerprint:')) return hasFingerprintEvidence;
    if (signal === 'shared_profile_key') return hasProfileKeyEvidence;
    if (signal === 'shared_weak_fingerprint' || signal.startsWith('shared_weak_fingerprint:')) return hasWeakFingerprintEvidence;
    if (signal === 'shared_ip') return hasIpEvidence;
    return true;
  });
}

async function repairPendingMultiAccountRiskCases() {
  const pendingGroups = new Map();
  const pageSize = 500;
  let from = 0;
  const supabase = getSupabaseClient();

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('users')
      .select('id,email,nickname,role,status,email_confirmed,access_restricted_until,access_restriction_reason,last_ip,last_device_id,last_fingerprint,data')
      .eq('status', MULTI_ACCOUNT_FROZEN_STATUS)
      .range(from, from + pageSize - 1);
    const rows = !error && Array.isArray(data) ? data : [];
    if (!rows.length) break;
    rows
      .map(normalizeUserRow)
      .filter(Boolean)
      .forEach((user) => {
        if (!isPendingFrozenMultiAccountUser(user)) return;
        const groupId = cleanText(getSecurityFreeze(getUserData(user)).groupId);
        if (!groupId) return;
        if (!pendingGroups.has(groupId)) pendingGroups.set(groupId, []);
        pendingGroups.get(groupId).push(user);
      });
    if (rows.length < pageSize) break;
    from += rows.length;
  }

  if (!pendingGroups.size) {
    return {
      groupsFound: 0,
      createdCases: 0,
      updatedCases: 0,
      restoredCases: 0,
    };
  }

  const allRiskCases = await listModelRiskCases();
  const riskCasesByUser = new Map();
  (Array.isArray(allRiskCases) ? allRiskCases : []).forEach((row) => {
    const userId = cleanText(row?.user);
    if (!userId) return;
    if (!riskCasesByUser.has(userId)) riskCasesByUser.set(userId, []);
    riskCasesByUser.get(userId).push(row);
  });

  let createdCases = 0;
  let updatedCases = 0;

  for (const [groupId, groupUsersRaw] of pendingGroups.entries()) {
    const groupUsers = uniqueUsers(groupUsersRaw).filter(Boolean);
    if (groupUsers.length < 2) continue;

    for (const user of groupUsers) {
      const userId = cleanText(user?._id);
      if (!userId) continue;
      const relatedUsers = groupUsers
        .filter((row) => cleanText(row?._id) !== userId)
        .map((row) => cleanText(row?._id));
      if (!relatedUsers.length) continue;

      const userCases = riskCasesByUser.get(userId) || [];
      const existingMultiAccountCase = pickLatestRiskCase(
        userCases,
        (row) => getRiskCaseSource(row) === MULTI_ACCOUNT_RISK_SOURCE
      );
      const fallbackCase = existingMultiAccountCase || pickLatestRiskCase(userCases);
      const currentSignals = buildSignalsFromUserState(user);
      const fallbackEvidence = Array.isArray(fallbackCase?.evidence) ? fallbackCase.evidence : [];
      const fallbackSignals = sanitizeStoredMultiAccountSignals(
        Array.isArray(fallbackCase?.signals) ? fallbackCase.signals : [],
        fallbackEvidence,
        user,
        groupUsers
      );
      const nextSignals = mergeUniqueStrings([
        ...fallbackSignals,
        ...buildRiskSignals(currentSignals, { reasons: [] }, groupUsers.length),
      ]);
      const fallbackScore = Math.max(Number(fallbackCase?.riskScore || 0), FREEZE_SCORE_THRESHOLD);
      const fallbackRiskLevel = riskLevelByScore(fallbackScore);
      const nowIso = new Date().toISOString();
      const repairTag = 'system_restored_pending_multi_account_case';
      const nextNotes = appendRepairNote(fallbackCase?.notes, repairTag, nowIso);
      const nextData = {
        ...(existingMultiAccountCase && typeof existingMultiAccountCase === 'object' ? existingMultiAccountCase : {}),
        user: userId,
        relatedUsers,
        riskScore: fallbackScore,
        riskLevel: fallbackRiskLevel,
        signals: nextSignals,
        status: MULTI_ACCOUNT_STATUS_FROZEN,
        notes: nextNotes,
        lastEvaluatedAt: nowIso,
        groupId,
        confidence: cleanText(existingMultiAccountCase?.confidence || fallbackCase?.confidence || 'high') || 'high',
        freezeStatus: 'frozen',
        evidence: fallbackEvidence,
        meta: {
          ...(fallbackCase?.meta && typeof fallbackCase.meta === 'object' ? fallbackCase.meta : {}),
          auto: true,
          source: MULTI_ACCOUNT_RISK_SOURCE,
          eventType: cleanText(fallbackCase?.meta?.eventType || 'session') || 'session',
          action: 'freeze',
          groupId,
          repairedFromFrozenGroup: true,
          repairedAt: nowIso,
          currentSignals: {
            ip: cleanText(currentSignals.ip),
            deviceId: cleanText(currentSignals.deviceId),
            fingerprint: cleanText(currentSignals.fingerprint),
            weakFingerprint: cleanText(currentSignals.weakFingerprint),
          },
          ipIntel: currentSignals.ipIntel && typeof currentSignals.ipIntel === 'object'
            ? currentSignals.ipIntel
            : (fallbackCase?.meta?.ipIntel && typeof fallbackCase.meta.ipIntel === 'object' ? fallbackCase.meta.ipIntel : null),
        },
      };

      const needsRepair = !existingMultiAccountCase
        || cleanText(existingMultiAccountCase?.freezeStatus) !== 'frozen'
        || cleanText(existingMultiAccountCase?.groupId) !== groupId
        || String(existingMultiAccountCase?.status || '') !== String(nextData.status || '')
        || !sameStringArray(existingMultiAccountCase?.relatedUsers, relatedUsers)
        || !sameStringArray(existingMultiAccountCase?.signals, nextSignals)
        || cleanText(getRiskCaseSource(existingMultiAccountCase)) !== MULTI_ACCOUNT_RISK_SOURCE;

      if (!needsRepair) continue;

      // eslint-disable-next-line no-await-in-loop
      const saved = existingMultiAccountCase
        ? await updateRiskCaseById(existingMultiAccountCase._id, nextData)
        : await createRiskCase(nextData);

      if (!saved) continue;
      if (existingMultiAccountCase) {
        updatedCases += 1;
      } else {
        createdCases += 1;
      }
    }
  }

  return {
    groupsFound: pendingGroups.size,
    createdCases,
    updatedCases,
    restoredCases: createdCases + updatedCases,
  };
}

async function recordSignalHistory({
  userId,
  eventType,
  signals,
  ipIntel,
  meta,
}) {
  if (!userId || !eventType) return null;
  const prepared = buildSignals({
    ...signals,
    ipIntel,
  });
  return createSignalHistoryEntry({
    userId,
    eventType,
    signals: prepared,
    ipIntel,
    meta: {
      ...(meta && typeof meta === 'object' ? meta : {}),
      profileKey: cleanText(prepared.profileKey),
      clientProfile: prepared.clientProfile && typeof prepared.clientProfile === 'object'
        ? prepared.clientProfile
        : null,
    },
  });
}

async function analyzeAndMaybeFreeze({
  user,
  signals,
  req,
  eventType = 'login',
}) {
  if (!user?._id) return { detected: false, frozen: false, groupUsers: [user], riskCases: [] };
  const ipIntel = signals?.ipIntel && typeof signals.ipIntel === 'object'
    ? signals.ipIntel
    : await lookupIpIntel(signals?.ip || user?.lastIp || '');
  const prepared = buildSignals({
    ...signals,
    ipIntel,
  });

  const assessmentResult = await evaluateMultiAccountSignals({
    user,
    signals: prepared,
  });

  const reviewedUsers = uniqueUsers([
    user,
    ...assessmentResult.matches.map((row) => row.user),
  ]);

  if (!assessmentResult.matches.length) {
    return {
      detected: false,
      frozen: false,
      currentSignals: prepared,
      groupUsers: reviewedUsers,
      riskCases: [],
      matches: [],
    };
  }

  const clusterAssessment = await buildClusterAssessment({
    primaryUser: user,
    clusterUsers: reviewedUsers,
    assessments: assessmentResult.matches,
    currentSignals: prepared,
  });

  const noteBase = eventType === 'register'
    ? 'automatic_multi_account_check_after_registration'
    : eventType === 'session'
      ? 'automatic_multi_account_check_during_session'
      : 'automatic_multi_account_check_after_login';

  if (!clusterAssessment.shouldFreeze) {
    const riskCases = await upsertRiskCasesForAssessment({
      clusterUsers: reviewedUsers,
      assessments: assessmentResult.matches,
      clusterAssessment,
      currentSignals: prepared,
      eventType,
      frozen: false,
      note: `${noteBase}:review_only`,
      action: 'watch',
    });

    await writeAuthEvent({
      user: user._id,
      email: user.email,
      eventType: 'multi_account_detected',
      result: 'success',
      reason: 'review_only',
      req,
      meta: {
        eventType,
        groupUsers: reviewedUsers.map((row) => ({
          id: row._id,
          email: row.email,
          nickname: row.nickname,
          status: row.status,
        })),
        currentSignals: {
          ip: prepared.ip,
          fingerprint: prepared.fingerprint,
          weakFingerprint: prepared.weakFingerprint,
          profileKey: prepared.profileKey,
        },
        categoryScores: clusterAssessment.categoryScores,
        riskScore: clusterAssessment.riskScore,
        status: clusterAssessment.status,
      },
    });

    return {
      detected: true,
      frozen: false,
      currentSignals: prepared,
      groupUsers: reviewedUsers,
      riskCases,
      matches: assessmentResult.matches,
    };
  }

  const groupId = await updateUsersForFreeze(reviewedUsers, {
    groupId: buildFreezeGroupId(reviewedUsers),
    reason: MULTI_ACCOUNT_FROZEN_REASON,
    note: `${noteBase}:group_frozen`,
    action: 'freeze',
  });

  const riskCases = await upsertRiskCasesForAssessment({
    clusterUsers: reviewedUsers,
    assessments: assessmentResult.matches,
    clusterAssessment: {
      ...clusterAssessment,
      status: MULTI_ACCOUNT_STATUS_FROZEN,
      freezeStatus: 'frozen',
      shouldFreeze: true,
    },
    currentSignals: prepared,
    eventType,
    frozen: true,
    groupId,
    note: `${noteBase}:group_frozen`,
    action: 'freeze',
  });

  await writeAuthEvent({
    user: user._id,
    email: user.email,
    eventType: 'multi_account_group_frozen',
    result: 'failed',
    reason: `group:${groupId}`,
    req,
    meta: {
      eventType,
      groupId,
      groupUsers: reviewedUsers.map((row) => ({
        id: row._id,
        email: row.email,
        nickname: row.nickname,
        status: row.status,
      })),
      currentSignals: {
        ip: prepared.ip,
        fingerprint: prepared.fingerprint,
        weakFingerprint: prepared.weakFingerprint,
        profileKey: prepared.profileKey,
      },
      categoryScores: clusterAssessment.categoryScores,
      riskScore: clusterAssessment.riskScore,
    },
  });

  return {
    detected: true,
    frozen: true,
    groupId,
    currentSignals: prepared,
    groupUsers: reviewedUsers,
    riskCases,
    matches: assessmentResult.matches,
  };
}

async function checkRegistrationAllowance({ signals }) {
  const prepared = buildSignals(signals);
  return {
    allowed: true,
    maxAllowed: MULTI_ACCOUNT_MAX_ACCOUNTS,
    clusterSize: 0,
    matchedUsers: await findUsersBySignals(prepared, { limit: 20 }),
  };
}

async function handlePostRegistrationMultiAccount({ user, req, signals }) {
  const result = await analyzeAndMaybeFreeze({
    user,
    req,
    signals,
    eventType: 'register',
  });
  return {
    detected: Boolean(result.detected),
    frozen: Boolean(result.frozen),
    groupId: result.groupId || '',
    clusterSize: Array.isArray(result.groupUsers) ? result.groupUsers.length : 1,
    relatedUsers: Array.isArray(result.groupUsers)
      ? result.groupUsers.filter((row) => String(row._id) !== String(user?._id || ''))
      : [],
    riskCases: result.riskCases || [],
  };
}

async function handlePostLoginMultiAccount({ user, req, signals }) {
  return analyzeAndMaybeFreeze({
    user,
    req,
    signals,
    eventType: 'login',
  });
}

async function handleAuthenticatedSessionMultiAccount({ user, req, signals }) {
  return analyzeAndMaybeFreeze({
    user,
    req,
    signals,
    eventType: 'session',
  });
}

function isUserFrozen(user) {
  const safeUser = user && typeof user === 'object' ? user : {};
  const data = getUserData(safeUser);
  const freeze = getSecurityFreeze(data);
  return String(safeUser.status || '') === MULTI_ACCOUNT_FROZEN_STATUS
    || String(freeze.status || '') === 'frozen';
}

async function getRiskCaseGroupUsers(riskCaseId) {
  const all = await listModelRiskCases();
  const riskCase = (Array.isArray(all) ? all : []).find((row) => String(row?._id || '') === String(riskCaseId || '')) || null;
  if (!riskCase) return { riskCase: null, users: [] };
  if (!isMultiAccountRiskCaseRecord(riskCase)) {
    const error = new Error('Эта карточка не относится к мультиаккаунтам');
    error.status = 400;
    throw error;
  }
  const ids = Array.from(new Set([
    cleanText(riskCase.user),
    ...(Array.isArray(riskCase.relatedUsers) ? riskCase.relatedUsers.map((item) => cleanText(item)) : []),
  ].filter(Boolean)));
  const users = await getUsersByIdsDetailed(ids);
  return { riskCase, users };
}

async function updateUserRewardRollbackState(userId, { sc, rewardRollbackDebtSc }) {
  const row = await getUsersByIdsDetailed([userId]);
  const user = Array.isArray(row) ? row[0] : null;
  if (!user) return null;
  const supabase = getSupabaseClient();
  const data = getUserData(user);
  const nowIso = new Date().toISOString();
  const nextData = {
    ...data,
    sc: round(Math.max(0, safeNumber(sc)), 3),
    rewardRollbackDebtSc: round(Math.max(0, safeNumber(rewardRollbackDebtSc)), 3),
  };
  const { data: updated, error } = await supabase
    .from('users')
    .update({
      data: nextData,
      updated_at: nowIso,
    })
    .eq('id', String(userId))
    .select('id,email,nickname,role,status,email_confirmed,access_restricted_until,access_restriction_reason,last_ip,last_device_id,last_fingerprint,data')
    .maybeSingle();
  if (error || !updated) return null;
  return normalizeUserRow(updated);
}

async function createRewardRollbackTransaction({
  userId,
  riskCaseId,
  battleId,
  amount,
  description,
}) {
  const safeAmount = round(Math.max(0, safeNumber(amount)), 3);
  if (!(safeAmount > 0)) return null;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: String(userId),
      type: 'admin',
      direction: 'debit',
      amount: safeAmount,
      currency: 'K',
      description: cleanText(description) || 'Откат спорной награды боя',
      related_entity: String(riskCaseId || battleId || ''),
      status: 'completed',
      occurred_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id')
    .maybeSingle();
  if (error) return null;
  return cleanText(data?.id);
}

async function applyPendingBattleRewardRollback({
  riskCase,
  users = [],
  actorId = null,
}) {
  const userMap = new Map((Array.isArray(users) ? users : []).map((user) => [cleanText(user?._id), user]));
  const originalRewardRollback = Array.isArray(riskCase?.rewardRollback) ? riskCase.rewardRollback : [];
  const rewardRollback = sanitizeRewardRollbackEntries(
    originalRewardRollback,
    Array.isArray(riskCase?.evidence) ? riskCase.evidence : (Array.isArray(riskCase?.riskScoreDetailed) ? riskCase.riskScoreDetailed : []),
    userMap
  );
  if (!rewardRollback.length) {
    return { rewardRollback: [], changed: originalRewardRollback.length > 0 };
  }

  const out = [];
  let changed = originalRewardRollback.length !== rewardRollback.length;

  for (const row of rewardRollback) {
    const safeStatus = cleanText(row?.status || 'pending') || 'pending';
    if (safeStatus !== 'pending') {
      out.push(row);
      continue;
    }

    const userId = cleanText(row?.userId);
    const user = userMap.get(userId);
    if (!user) {
      out.push({
        ...row,
        status: 'missing_user',
      });
      continue;
    }

    const userData = getUserData(user);
    const amount = round(Math.max(0, safeNumber(row?.amount)), 3);
    const currentSc = round(Math.max(0, safeNumber(userData?.sc)), 3);
    const previousDebt = round(Math.max(0, safeNumber(userData?.rewardRollbackDebtSc)), 3);
    const rolledBackAmount = round(Math.min(currentSc, amount), 3);
    const shortfall = round(Math.max(0, amount - rolledBackAmount), 3);
    const nextSc = round(Math.max(0, currentSc - rolledBackAmount), 3);
    const nextDebt = round(previousDebt + shortfall, 3);
    const nowIso = new Date().toISOString();

    if (rolledBackAmount > 0 || shortfall > 0) {
      // eslint-disable-next-line no-await-in-loop
      const updatedUser = await updateUserRewardRollbackState(userId, {
        sc: nextSc,
        rewardRollbackDebtSc: nextDebt,
      });
      if (updatedUser) userMap.set(userId, updatedUser);

      let transactionId = '';
      if (rolledBackAmount > 0) {
        // eslint-disable-next-line no-await-in-loop
        transactionId = await createRewardRollbackTransaction({
          userId,
          riskCaseId: riskCase?._id,
          battleId: row?.battleId,
          amount: rolledBackAmount,
          description: 'Откат спорной награды боя по решению модератора',
        }) || '';
      }

      out.push({
        ...row,
        status: shortfall > 0 ? 'partial_rollback' : 'rolled_back',
        rolledBackAmount,
        shortfall,
        rolledBackAt: nowIso,
        rolledBackBy: actorId || null,
        rollbackTransactionId: transactionId,
      });
      changed = true;
      continue;
    }

    out.push(row);
  }

  return { rewardRollback: out, changed };
}

async function applyRiskCaseGroupDecision({
  riskCaseId,
  actorId = null,
  decision = 'watch',
  note = '',
}) {
  const { riskCase, users } = await getRiskCaseGroupUsers(riskCaseId);
  if (!riskCase) {
    const error = new Error('Риск-кейс не найден');
    error.status = 404;
    throw error;
  }
  if (!users.length) {
    const error = new Error('Связанные пользователи не найдены');
    error.status = 404;
    throw error;
  }

  const groupId = cleanText(riskCase.groupId || getSecurityFreeze(getUserData(users[0])).groupId || buildFreezeGroupId(users));
  const safeDecision = ['unfreeze', 'watch', 'ban'].includes(String(decision)) ? String(decision) : 'watch';
  await updateUsersForFreeze(users, {
    groupId,
    reason: MULTI_ACCOUNT_FROZEN_REASON,
    actorId,
    note,
    action: safeDecision,
  });

  const rollbackResult = safeDecision === 'ban'
    ? await applyPendingBattleRewardRollback({ riskCase, users, actorId })
    : { rewardRollback: Array.isArray(riskCase?.rewardRollback) ? riskCase.rewardRollback : [], changed: false };

  const nowIso = new Date().toISOString();
  const nextStatus = safeDecision === 'ban'
    ? MULTI_ACCOUNT_STATUS_RESOLVED
    : safeDecision === 'unfreeze'
      ? MULTI_ACCOUNT_STATUS_RESOLVED
      : MULTI_ACCOUNT_STATUS_WATCH;
  const nextFreezeStatus = safeDecision === 'ban'
    ? 'banned'
    : safeDecision === 'unfreeze'
      ? 'unfrozen'
      : 'watch';
  const baseNote = `[${nowIso}] admin_group_decision:${safeDecision}${cleanText(note) ? ` note:${cleanText(note)}` : ''}`;

  const relatedIds = Array.isArray(riskCase.relatedUsers) ? riskCase.relatedUsers.map((item) => cleanText(item)).filter(Boolean) : [];
  const userIds = Array.from(new Set([cleanText(riskCase.user), ...relatedIds].filter(Boolean)));
  const relatedCases = (await listModelRiskCases()).filter((row) => {
    if (!isMultiAccountRiskCaseRecord(row)) return false;
    const id = cleanText(row?.user);
    return userIds.includes(id);
  });

  for (const row of relatedCases) {
    const prevNotes = cleanText(row?.notes);
    // eslint-disable-next-line no-await-in-loop
    await updateRiskCaseById(row._id, {
      status: nextStatus,
      freezeStatus: nextFreezeStatus,
      resolvedBy: actorId || null,
      resolvedAt: nowIso,
      resolutionNote: cleanText(note),
      groupId,
      rewardRollback: rollbackResult.changed
        ? rollbackResult.rewardRollback
        : (Array.isArray(row?.rewardRollback) ? row.rewardRollback : rollbackResult.rewardRollback),
      notes: prevNotes ? `${prevNotes}\n${baseNote}` : baseNote,
      meta: {
        ...(row?.meta && typeof row.meta === 'object' ? row.meta : {}),
        moderatorDecision: safeDecision,
        moderatorDecisionAt: nowIso,
        moderatorDecisionBy: actorId || null,
        rewardRollbackUpdatedAt: rollbackResult.changed ? nowIso : (row?.meta?.rewardRollbackUpdatedAt || null),
      },
    });
  }

  return {
    riskCaseId,
    groupId,
    users: users.map((row) => ({
      _id: row._id,
      email: row.email,
      nickname: row.nickname,
      status: row.status,
    })),
    decision: safeDecision,
    rewardRollbackChanged: Boolean(rollbackResult.changed),
  };
}

async function getSignalHistoryForUsers(userIds = [], { limit = 100 } = {}) {
  return listSignalHistoryByUserIds(userIds, { limit });
}

module.exports = {
  MULTI_ACCOUNT_RESTRICTION_HOURS,
  MULTI_ACCOUNT_MAX_ACCOUNTS,
  MULTI_ACCOUNT_LOCK_REASON,
  MULTI_ACCOUNT_FROZEN_REASON,
  MULTI_ACCOUNT_FROZEN_STATUS,
  buildSignals,
  isActiveRestriction,
  isUserFrozen,
  checkRegistrationAllowance,
  handlePostRegistrationMultiAccount,
  handlePostLoginMultiAccount,
  handleAuthenticatedSessionMultiAccount,
  evaluateAccessRestriction,
  recordSignalHistory,
  lookupIpIntel,
  applyRiskCaseGroupDecision,
  getRiskCaseGroupUsers,
  getSignalHistoryForUsers,
  sanitizeRewardRollbackEntries,
  repairPendingMultiAccountRiskCases,
};
