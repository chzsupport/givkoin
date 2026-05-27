const DEFAULT_RISK_WINDOW_DAYS = 30;

function normalizeSignalValue(value) {
  return String(value || '').trim().toLowerCase();
}

function riskLevelByScore(score) {
  const value = Number(score) || 0;
  if (value >= 90) return 'critical';
  if (value >= 60) return 'high';
  if (value >= 30) return 'medium';
  return 'low';
}

function toDayKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function round(value, digits = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function mean(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values = []) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length;
  return Math.sqrt(Math.max(0, variance));
}

function coefficientOfVariation(values = []) {
  const avg = mean(values);
  if (!avg) return 0;
  return standardDeviation(values) / avg;
}

function coefficientFromMoments(sum, sqSum, count) {
  if (!count || count < 2) return 0;
  const avg = sum / count;
  if (!avg) return 0;
  const variance = Math.max(0, (sqSum / count) - (avg ** 2));
  return Math.sqrt(variance) / avg;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function uniq(values = []) {
  return Array.from(new Set(values.filter(Boolean)));
}

function sortByDate(rows = [], field = 'createdAt') {
  return [...rows].sort((a, b) => {
    const left = new Date(a?.[field] || 0).getTime();
    const right = new Date(b?.[field] || 0).getTime();
    return left - right;
  });
}

function buildTimelineTemplate(now = new Date(), days = DEFAULT_RISK_WINDOW_DAYS) {
  const rows = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
    rows.push({
      dateKey: toDayKey(date),
      score: 0,
      signalCount: 0,
      evidenceCount: 0,
      signals: [],
    });
  }
  return rows;
}

function createRiskContext(user, now, { riskWindowDays = DEFAULT_RISK_WINDOW_DAYS } = {}) {
  const dailyTimeline = buildTimelineTemplate(now, riskWindowDays);
  const timelineMap = new Map(dailyTimeline.map((row) => [row.dateKey, row]));
  return {
    user,
    score: 0,
    signals: new Set(),
    relatedUsers: new Set(),
    evidence: [],
    scoreBreakdown: new Map(),
    dailyTimeline,
    timelineMap,
    summary: {
      directNavigationSignature: '',
      profitRoutineSignature: '',
      directTargetViews: 0,
      profitableActions: 0,
    },
  };
}

function addSignal(ctx, { signal, score, category, summary, happenedAt, meta = {}, relatedUsers = [] }) {
  const safeSignal = String(signal || '').trim();
  const safeScore = Number(score) || 0;
  if (!safeSignal || safeScore <= 0) return;

  ctx.score += safeScore;
  ctx.signals.add(safeSignal);
  relatedUsers.forEach((userId) => {
    const safeId = String(userId || '').trim();
    if (safeId && safeId !== String(ctx.user?._id || '')) {
      ctx.relatedUsers.add(safeId);
    }
  });

  const breakdown = ctx.scoreBreakdown.get(safeSignal) || {
    signal: safeSignal,
    score: 0,
    count: 0,
  };
  breakdown.score += safeScore;
  breakdown.count += 1;
  ctx.scoreBreakdown.set(safeSignal, breakdown);

  const at = happenedAt ? new Date(happenedAt) : new Date();
  const safeAt = Number.isNaN(at.getTime()) ? new Date() : at;
  ctx.evidence.push({
    happenedAt: safeAt,
    category: String(category || 'system').trim(),
    signal: safeSignal,
    score: safeScore,
    summary: String(summary || '').trim(),
    meta,
  });

  const bucket = ctx.timelineMap.get(toDayKey(safeAt));
  if (bucket) {
    bucket.score += safeScore;
    bucket.signalCount += 1;
    bucket.evidenceCount += 1;
    if (!bucket.signals.includes(safeSignal)) {
      bucket.signals.push(safeSignal);
    }
  }
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeVector(values = []) {
  const safe = values.map((value) => Math.max(0, safeNumber(value)));
  const total = safe.reduce((sum, value) => sum + value, 0);
  if (!total) return safe.map(() => 0);
  return safe.map((value) => value / total);
}

function cosineSimilarity(left = [], right = []) {
  const length = Math.min(left.length, right.length);
  if (!length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < length; index += 1) {
    const a = safeNumber(left[index]);
    const b = safeNumber(right[index]);
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (!leftNorm || !rightNorm) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function jaccardSimilarity(leftSet = new Set(), rightSet = new Set()) {
  if (!leftSet.size || !rightSet.size) return 0;
  let intersection = 0;
  for (const value of leftSet) {
    if (rightSet.has(value)) intersection += 1;
  }
  const union = leftSet.size + rightSet.size - intersection;
  if (!union) return 0;
  return intersection / union;
}

function sanitizeEvidence(evidence = []) {
  return sortByDate(evidence, 'happenedAt')
    .reverse()
    .slice(0, 100)
    .map((row) => ({
      happenedAt: row.happenedAt,
      category: row.category,
      signal: row.signal,
      score: round(row.score, 2),
      summary: row.summary,
      meta: row.meta,
    }));
}

function sanitizeTimeline(rows = []) {
  return rows.map((row) => ({
    dateKey: row.dateKey,
    score: round(row.score, 2),
    signalCount: row.signalCount,
    evidenceCount: row.evidenceCount,
    signals: uniq(row.signals),
  }));
}

module.exports = {
  addSignal,
  buildTimelineTemplate,
  clamp,
  coefficientFromMoments,
  coefficientOfVariation,
  cosineSimilarity,
  createRiskContext,
  jaccardSimilarity,
  mean,
  normalizeSignalValue,
  normalizeVector,
  riskLevelByScore,
  round,
  safeNumber,
  sanitizeEvidence,
  sanitizeTimeline,
  sortByDate,
  standardDeviation,
  toDayKey,
  uniq,
};
