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
    const left = new Date(a?.[field] || 0).getTime() || 0;
    const right = new Date(b?.[field] || 0).getTime() || 0;
    return left - right;
  });
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

module.exports = {
  DETAIL_SCORES,
  appendDetailedEvidence,
  buildCategoryScores,
  buildEvidenceEntry,
  buildRiskScoreDetailed,
};
