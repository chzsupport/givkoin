const { normalizeSitePath, pathStartsWith } = require('../../utils/sitePath');
const {
  safeMs,
} = require('./nightShiftRuntimeConfig');
const {
  buildPageHitsFromResolved,
  mergePageHits,
  normalizeFinalWindowReports,
  normalizePageHits,
  normalizeResolvedAnomalies,
  normalizeSuspiciousWindows,
} = require('./nightShiftReports');
const {
  buildWindowPlan,
} = require('./nightShiftWindowPlan');
const {
  normalizeRuntimeSession,
} = require('./nightShiftRuntimeSession');

function validateHeartbeatWindow(windowPlan, resolvedRows, claimedCount) {
  const resolved = normalizeResolvedAnomalies(resolvedRows);
  const expectedById = new Map((Array.isArray(windowPlan?.anomalies) ? windowPlan.anomalies : []).map((row) => [String(row.id), row]));
  const accepted = [];
  const invalid = [];

  const windowStartMs = safeMs(windowPlan?.startedAt);
  const windowEndMs = safeMs(windowPlan?.endedAt);

  for (const row of resolved) {
    const expected = expectedById.get(String(row.anomalyId));
    if (!expected) {
      invalid.push({ anomalyId: row.anomalyId, reason: 'unexpected_anomaly', pagePath: row.pagePath });
      continue;
    }

    if (row.pagePath && !pathStartsWith(row.pagePath, String(expected.sectorUrl || ''))) {
      invalid.push({ anomalyId: row.anomalyId, reason: 'wrong_page', pagePath: row.pagePath });
      continue;
    }

    const clearedAtMs = safeMs(row.clearedAt);
    if (clearedAtMs != null && (
      (windowStartMs != null && clearedAtMs < windowStartMs) ||
      (windowEndMs != null && clearedAtMs > windowEndMs)
    )) {
      invalid.push({ anomalyId: row.anomalyId, reason: 'wrong_time', pagePath: row.pagePath });
      continue;
    }

    accepted.push({
      anomalyId: row.anomalyId,
      pagePath: row.pagePath || normalizeSitePath(String(expected.sectorUrl || '')),
      clearedAt: row.clearedAt || expected.spawnAt,
    });
  }

  const claimed = Math.max(Math.floor(Number(claimedCount) || 0), resolved.length);
  return {
    accepted,
    invalid,
    acceptedCount: accepted.length,
    claimedCount: claimed,
    pageHits: buildPageHitsFromResolved(accepted),
    suspicious: invalid.length > 0 || claimed > accepted.length,
  };
}

function shouldSendHourCheckpoint(windowIndex) {
  const safeIndex = Math.max(0, Math.floor(Number(windowIndex) || 0));
  return ((safeIndex + 1) % 12) === 0;
}

function validateFinalShiftReport(runtime, finalReport) {
  const normalizedRuntime = normalizeRuntimeSession(runtime);
  const windowReports = normalizeFinalWindowReports(finalReport?.windowReports);
  if (!normalizedRuntime || !windowReports.length) {
    return {
      windowReports,
      claimedTotal: Math.max(0, Math.floor(Number(finalReport?.totalAnomalies) || 0)),
      acceptedTotal: 0,
      pageHits: normalizePageHits(finalReport?.pageHits),
      suspicious: false,
      suspiciousWindows: [],
    };
  }

  const suspiciousWindows = [];
  let claimedTotal = 0;
  let acceptedTotal = 0;
  let pageHits = {};

  for (const windowReport of windowReports) {
    const expectedWindow = buildWindowPlan(normalizedRuntime, windowReport.index);
    const claimedCount = Array.isArray(windowReport.resolvedAnomalies) ? windowReport.resolvedAnomalies.length : 0;
    claimedTotal += claimedCount;

    if (!expectedWindow) {
      suspiciousWindows.push({
        index: windowReport.index,
        reason: 'unexpected_window',
        claimedCount,
        acceptedCount: 0,
        invalidCount: claimedCount,
        reportedAt: finalReport?.endedAt || normalizedRuntime.endedAt || null,
        details: normalizeResolvedAnomalies(windowReport.resolvedAnomalies)
          .map((row) => ({
            anomalyId: row.anomalyId,
            reason: 'unexpected_window',
            pagePath: row.pagePath,
          }))
          .slice(0, 20),
      });
      continue;
    }

    const validation = validateHeartbeatWindow(expectedWindow, windowReport.resolvedAnomalies, claimedCount);
    acceptedTotal += validation.acceptedCount;
    pageHits = mergePageHits(pageHits, validation.pageHits);

    if (validation.suspicious) {
      suspiciousWindows.push({
        index: windowReport.index,
        reason: 'report_mismatch',
        claimedCount: validation.claimedCount,
        acceptedCount: validation.acceptedCount,
        invalidCount: validation.invalid.length,
        reportedAt: finalReport?.endedAt || normalizedRuntime.endedAt || null,
        details: validation.invalid,
      });
    }
  }

  return {
    windowReports,
    claimedTotal: Math.max(claimedTotal, Math.floor(Number(finalReport?.totalAnomalies) || 0)),
    acceptedTotal,
    pageHits: Object.keys(pageHits).length ? pageHits : normalizePageHits(finalReport?.pageHits),
    suspicious: suspiciousWindows.length > 0,
    suspiciousWindows: normalizeSuspiciousWindows(suspiciousWindows),
  };
}

module.exports = {
  shouldSendHourCheckpoint,
  validateFinalShiftReport,
  validateHeartbeatWindow,
};
