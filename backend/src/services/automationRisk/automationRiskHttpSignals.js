const {
  addSignal,
  clamp,
  coefficientOfVariation,
  round,
  sortByDate,
  uniq,
} = require('./automationRiskScoring');

function evaluateHttpSignals(ctx, behaviorEvents = [], now = new Date()) {
  const requestActions = sortByDate(
    behaviorEvents.filter((row) => row?.category === 'http' && row?.eventType === 'request_action'),
    'occurredAt'
  );
  const requestErrors = sortByDate(
    behaviorEvents.filter((row) => row?.category === 'http' && row?.eventType === 'request_error'),
    'occurredAt'
  );

  if (requestActions.length >= 10) {
    const actionIntervals = [];
    const pathCounts = new Map();
    requestActions.forEach((row, index) => {
      const path = String(row?.path || '').split('?')[0].trim();
      if (path) pathCounts.set(path, (pathCounts.get(path) || 0) + 1);
      if (index > 0) {
        actionIntervals.push(
          new Date(row.occurredAt).getTime() - new Date(requestActions[index - 1].occurredAt).getTime()
        );
      }
    });
    const actionIntervalCv = coefficientOfVariation(actionIntervals);
    const topPath = Array.from(pathCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    if (actionIntervals.length >= 8 && actionIntervalCv > 0 && actionIntervalCv <= 0.12 && topPath?.[1] >= 5) {
      const latest = requestActions[requestActions.length - 1];
      addSignal(ctx, {
        signal: 'request_action_cadence',
        score: clamp(8 + topPath[1] + Math.round((0.15 - actionIntervalCv) * 30), 8, 22),
        category: 'http',
        summary: `Успешные action-запросы идут слишком ровным машинным ритмом по ${topPath[0]}`,
        happenedAt: latest?.occurredAt || now,
        meta: {
          requestActions: requestActions.length,
          intervalCv: round(actionIntervalCv, 4),
          topPath: topPath[0],
          topPathCount: topPath[1],
        },
      });
    }
  }

  if (requestErrors.length < 5) return;

  const intervals = [];
  let hasRateLimit = false;
  requestErrors.forEach((row, index) => {
    if (index > 0) {
      intervals.push(new Date(row.occurredAt).getTime() - new Date(requestErrors[index - 1].occurredAt).getTime());
    }
    if (Number(row?.meta?.statusCode) === 429) hasRateLimit = true;
  });

  const intervalCv = coefficientOfVariation(intervals);
  if (hasRateLimit || (intervals.length >= 4 && intervalCv > 0 && intervalCv <= 0.25)) {
    const latest = requestErrors[requestErrors.length - 1];
    addSignal(ctx, {
      signal: 'request_error_rhythm',
      score: clamp(8 + requestErrors.length, 8, 20),
      category: 'http',
      summary: `${requestErrors.length} аномальных HTTP-ошибок по прибыльным endpoint'ам`,
      happenedAt: latest?.occurredAt || now,
      meta: {
        requestErrors: requestErrors.length,
        intervalCv: round(intervalCv, 4),
        hasRateLimit,
      },
    });
  }
}

function evaluateSessionRestrictionSignals(ctx, sessions = [], behaviorEvents = [], now = new Date()) {
  const revokedSessions = (Array.isArray(sessions) ? sessions : [])
    .filter((session) => session?.revokedAt && session?.sessionId);
  if (!revokedSessions.length || !Array.isArray(behaviorEvents) || !behaviorEvents.length) return;

  let matchedCount = 0;
  const evidence = [];
  for (const session of revokedSessions) {
    const revokedAtMs = new Date(session.revokedAt).getTime();
    if (!Number.isFinite(revokedAtMs)) continue;
    const afterEvents = behaviorEvents.filter((row) => {
      if (String(row?.sessionId || '') !== String(session.sessionId || '')) return false;
      const occurredAtMs = new Date(row?.occurredAt || 0).getTime();
      return Number.isFinite(occurredAtMs) && occurredAtMs >= revokedAtMs + 10000;
    });
    if (!afterEvents.length) continue;
    matchedCount += afterEvents.length;
    evidence.push({
      sessionId: session.sessionId,
      revokedAt: session.revokedAt,
      revokeReason: session.revokeReason || '',
      eventsAfterRevoke: afterEvents.length,
      sampleEventTypes: uniq(afterEvents.slice(0, 5).map((row) => row?.eventType || '')),
    });
  }

  if (!matchedCount) return;
  addSignal(ctx, {
    signal: 'activity_after_session_revoke',
    score: clamp(10 + matchedCount * 2, 10, 24),
    category: 'sessions',
    summary: `После ревока сессии продолжилась активность (${matchedCount} событий)`,
    happenedAt: now,
    meta: { sessions: evidence },
  });
}

module.exports = {
  evaluateHttpSignals,
  evaluateSessionRestrictionSignals,
};
