const {
  addSignal,
  clamp,
  coefficientOfVariation,
  mean,
  round,
  sortByDate,
  standardDeviation,
  toDayKey,
} = require('./automationRiskScoring');
const {
  buildProfitRoutineSignature,
} = require('./automationRiskNavigation');

function evaluateTimingSignals(ctx, pageViews = [], profitableActivities = [], sessions = [], now = new Date()) {
  const profitableByType = new Map();
  const sortedProfitable = sortByDate(profitableActivities, 'createdAt');
  for (const row of sortedProfitable) {
    const type = String(row?.type || '').trim();
    if (!type) continue;
    if (!profitableByType.has(type)) profitableByType.set(type, []);
    profitableByType.get(type).push(row);
  }

  const lowVarianceTypes = [];
  const preciseTimeTypes = [];

  for (const [type, rows] of profitableByType.entries()) {
    if (rows.length < 6) continue;
    const intervals = [];
    const minuteOfDay = [];
    for (let i = 1; i < rows.length; i += 1) {
      intervals.push(new Date(rows[i].createdAt).getTime() - new Date(rows[i - 1].createdAt).getTime());
    }
    rows.forEach((row) => {
      const date = new Date(row.createdAt);
      minuteOfDay.push((date.getUTCHours() * 60) + date.getUTCMinutes());
    });

    const intervalCv = coefficientOfVariation(intervals);
    if (intervals.length >= 5 && intervalCv > 0 && intervalCv <= 0.12) {
      lowVarianceTypes.push({ type, cv: intervalCv, count: rows.length, latestAt: rows[rows.length - 1].createdAt });
    }

    const minuteStd = standardDeviation(minuteOfDay);
    const uniqueDays = new Set(rows.map((row) => toDayKey(row.createdAt)));
    if (uniqueDays.size >= 5 && minuteStd <= 3) {
      preciseTimeTypes.push({
        type,
        stdMinutes: minuteStd,
        count: rows.length,
        latestAt: rows[rows.length - 1].createdAt,
      });
    }
  }

  if (lowVarianceTypes.length) {
    const strongest = lowVarianceTypes.sort((a, b) => a.cv - b.cv || b.count - a.count)[0];
    addSignal(ctx, {
      signal: 'low_interval_variation',
      score: clamp(10 + lowVarianceTypes.length * 3, 10, 22),
      category: 'timing',
      summary: `Слишком ровные интервалы у ${lowVarianceTypes.length} прибыльных механик, самая ровная: ${strongest.type}`,
      happenedAt: strongest.latestAt || now,
      meta: {
        types: lowVarianceTypes.map((row) => ({
          type: row.type,
          count: row.count,
          intervalCv: round(row.cv, 4),
        })),
      },
    });
  }

  if (preciseTimeTypes.length) {
    const strongest = preciseTimeTypes.sort((a, b) => a.stdMinutes - b.stdMinutes || b.count - a.count)[0];
    addSignal(ctx, {
      signal: 'precise_daily_timing',
      score: clamp(8 + preciseTimeTypes.length * 2, 8, 18),
      category: 'timing',
      summary: `Повтор входов и сборов почти в одно и то же время суток, пример: ${strongest.type}`,
      happenedAt: strongest.latestAt || now,
      meta: {
        types: preciseTimeTypes.map((row) => ({
          type: row.type,
          count: row.count,
          stdMinutes: round(row.stdMinutes, 3),
        })),
      },
    });
  }

  const sortedPageViews = sortByDate(pageViews, 'createdAt');
  let pageIndex = 0;
  let immediateProfitActions = 0;
  for (const activity of sortedProfitable) {
    const atMs = new Date(activity.createdAt).getTime();
    while (
      pageIndex + 1 < sortedPageViews.length &&
      new Date(sortedPageViews[pageIndex + 1].createdAt).getTime() <= atMs
    ) {
      pageIndex += 1;
    }
    const pageView = sortedPageViews[pageIndex];
    if (!pageView) continue;
    const diff = atMs - new Date(pageView.createdAt).getTime();
    if (diff >= 0 && diff <= 15000) {
      immediateProfitActions += 1;
    }
  }

  if (
    sortedProfitable.length >= 8 &&
    immediateProfitActions >= 6 &&
    immediateProfitActions / sortedProfitable.length >= 0.7
  ) {
    const latest = sortedProfitable[sortedProfitable.length - 1];
    addSignal(ctx, {
      signal: 'immediate_profit_actions',
      score: clamp(8 + Math.round((immediateProfitActions / sortedProfitable.length) * 12), 8, 20),
      category: 'timing',
      summary: `${immediateProfitActions} прибыльных действий выполнены почти мгновенно после открытия страницы`,
      happenedAt: latest?.createdAt || now,
      meta: {
        profitableActions: sortedProfitable.length,
        immediateProfitActions,
      },
    });
  }

  const shortDurations = sessions
    .map((session) => {
      const startedAt = new Date(session?.startedAt || 0).getTime();
      const endedAt = new Date(session?.endedAt || session?.lastSeenAt || session?.startedAt || 0).getTime();
      return Math.max(0, Math.round((endedAt - startedAt) / 1000));
    })
    .filter((seconds) => seconds >= 20 && seconds <= 600);
  const shortSessionCv = coefficientOfVariation(shortDurations);
  if (shortDurations.length >= 8 && shortSessionCv > 0 && shortSessionCv <= 0.25) {
    const latestSession = sortByDate(sessions, 'startedAt').slice(-1)[0];
    addSignal(ctx, {
      signal: 'short_session_uniformity',
      score: clamp(8 + shortDurations.length / 3, 8, 18),
      category: 'sessions',
      summary: `Короткие сессии слишком одинаковой длительности (${shortDurations.length} повторов)`,
      happenedAt: latestSession?.startedAt || now,
      meta: {
        shortSessions: shortDurations.length,
        averageSeconds: round(mean(shortDurations), 1),
        cv: round(shortSessionCv, 4),
      },
    });
  }

  const sortedSessions = sortByDate(sessions, 'startedAt').map((session) => ({
    startedAt: new Date(session?.startedAt || 0).getTime(),
    endedAt: new Date(session?.endedAt || session?.lastSeenAt || session?.startedAt || 0).getTime(),
  }));
  let overlapCount = 0;
  let lastWindowEnd = 0;
  for (const session of sortedSessions) {
    if (session.startedAt < lastWindowEnd - 60000) {
      overlapCount += 1;
    }
    lastWindowEnd = Math.max(lastWindowEnd, session.endedAt);
  }
  if (overlapCount >= 2) {
    addSignal(ctx, {
      signal: 'parallel_session_overlap',
      score: clamp(6 + overlapCount * 3, 6, 18),
      category: 'sessions',
      summary: `Обнаружены параллельные или перекрывающиеся сессии (${overlapCount})`,
      happenedAt: now,
      meta: { overlapCount },
    });
  }

  ctx.summary.profitRoutineSignature = buildProfitRoutineSignature(sortedProfitable);
  ctx.summary.profitableActions = sortedProfitable.length;
}

module.exports = {
  evaluateTimingSignals,
};
