const { normalizeSitePath } = require('../../utils/sitePath');

function normalizeResolvedAnomalies(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const next = [];

  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const anomalyId = String(row.anomalyId || '').trim();
    if (!anomalyId || seen.has(anomalyId)) continue;
    seen.add(anomalyId);
    const rawPagePath = String(row.pagePath || '').trim();
    next.push({
      anomalyId,
      pagePath: rawPagePath ? normalizeSitePath(rawPagePath) : '',
      clearedAt: row.clearedAt ? String(row.clearedAt) : null,
    });
  }

  return next;
}

function normalizeSuspiciousWindows(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      return {
        index: Math.max(0, Math.floor(Number(row.index) || 0)),
        reason: String(row.reason || '').trim(),
        claimedCount: Math.max(0, Math.floor(Number(row.claimedCount) || 0)),
        acceptedCount: Math.max(0, Math.floor(Number(row.acceptedCount) || 0)),
        invalidCount: Math.max(0, Math.floor(Number(row.invalidCount) || 0)),
        reportedAt: row.reportedAt ? String(row.reportedAt) : null,
        details: Array.isArray(row.details)
          ? row.details
            .map((detail) => (detail && typeof detail === 'object'
              ? {
                anomalyId: String(detail.anomalyId || '').trim(),
                reason: String(detail.reason || '').trim(),
                pagePath: detail.pagePath ? normalizeSitePath(String(detail.pagePath || '').trim()) : '',
              }
              : null))
            .filter(Boolean)
            .slice(0, 20)
          : [],
      };
    })
    .filter(Boolean)
    .slice(-24);
}

function buildPageHitsFromResolved(resolvedRows = []) {
  const next = {};
  for (const row of normalizeResolvedAnomalies(resolvedRows)) {
    const pagePath = row.pagePath ? normalizeSitePath(String(row.pagePath || '').trim()) : '';
    if (!pagePath) continue;
    next[pagePath] = (Number(next[pagePath]) || 0) + 1;
  }
  return next;
}

function normalizePageHits(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const next = {};
  for (const [pagePath, rawCount] of Object.entries(value)) {
    const rawPath = String(pagePath || '').trim();
    if (!rawPath) continue;
    const key = normalizeSitePath(rawPath);
    if (!key) continue;
    const count = Math.max(0, Math.floor(Number(rawCount) || 0));
    if (!count) continue;
    next[key] = count;
  }
  return next;
}

function mergePageHits(left, right) {
  const next = { ...(left && typeof left === 'object' ? left : {}) };
  const rhs = normalizePageHits(right);
  for (const [pagePath, count] of Object.entries(rhs)) {
    next[pagePath] = (Number(next[pagePath]) || 0) + count;
  }
  // Keep the payload bounded: we only need a compact "where user was active" summary.
  const keys = Object.keys(next);
  if (keys.length > 50) {
    keys
      .sort((a, b) => (Number(next[b]) || 0) - (Number(next[a]) || 0))
      .slice(50)
      .forEach((k) => { delete next[k]; });
  }
  return next;
}

function normalizeFinalWindowReports(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const startedAt = row.startedAt ? String(row.startedAt) : '';
      const endedAt = row.endedAt ? String(row.endedAt) : '';
      if (!startedAt || !endedAt) return null;
      return {
        index: Math.max(0, Math.floor(Number(row.index) || 0)),
        startedAt,
        endedAt,
        resolvedAnomalies: normalizeResolvedAnomalies(row.resolvedAnomalies),
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.index - right.index)
    .slice(0, 96);
}

function getTotalAnomaliesFromWindowReports(value) {
  return normalizeFinalWindowReports(value)
    .reduce((sum, row) => sum + (Array.isArray(row.resolvedAnomalies) ? row.resolvedAnomalies.length : 0), 0);
}

function stripWindowReportsFromFinalPayload(finalReport) {
  if (!finalReport || typeof finalReport !== 'object') return finalReport;
  const next = { ...finalReport };
  delete next.windowReports;
  return next;
}

module.exports = {
  buildPageHitsFromResolved,
  getTotalAnomaliesFromWindowReports,
  mergePageHits,
  normalizeFinalWindowReports,
  normalizePageHits,
  normalizeResolvedAnomalies,
  normalizeSuspiciousWindows,
  stripWindowReportsFromFinalPayload,
};
