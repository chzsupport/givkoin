function safeMs(value) {
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

function cloneEvaluatedHours(value) {
  return Array.isArray(value)
    ? Array.from(new Set(value.map((hour) => Math.max(0, Math.floor(Number(hour) || 0))))).sort((a, b) => a - b)
    : [];
}

function getHourIndex(startedAtMs, windowStartedAtMs) {
  return Math.max(0, Math.floor((windowStartedAtMs - startedAtMs) / (60 * 60 * 1000)));
}

function normalizeThreshold(value, fallback) {
  const threshold = Math.floor(Number(value));
  return Number.isFinite(threshold) && threshold >= 0 ? threshold : fallback;
}

function evaluateCompletedHours(runtime, effectiveEndMs, options = {}) {
  const startedAtMs = safeMs(runtime?.startedAt);
  const minAnomaliesPerActiveHour = normalizeThreshold(options.minAnomaliesPerActiveHour, 60);
  const minAnomaliesPerPaidHour = normalizeThreshold(options.minAnomaliesPerPaidHour, 60);

  if (startedAtMs == null) {
    return {
      evaluatedHours: cloneEvaluatedHours(runtime?.evaluatedHours),
      payableHours: Math.max(0, Math.floor(Number(runtime?.payableHours) || 0)),
      shouldClose: false,
      closeReason: null,
      hourAnomalies: 0,
    };
  }

  const completedHours = Math.max(0, Math.floor((effectiveEndMs - startedAtMs) / (60 * 60 * 1000)));
  const evaluatedHours = cloneEvaluatedHours(runtime?.evaluatedHours);
  const evaluatedSet = new Set(evaluatedHours);
  let payableHours = Math.max(0, Math.floor(Number(runtime?.payableHours) || 0));
  let shouldClose = false;
  let closeReason = null;

  for (let hourIndex = 0; hourIndex < completedHours; hourIndex += 1) {
    if (evaluatedSet.has(hourIndex)) continue;
    const anomalies = Math.max(0, Math.floor(Number(runtime?.hourlyAnomalies?.[String(hourIndex)]) || 0));
    evaluatedSet.add(hourIndex);
    evaluatedHours.push(hourIndex);

    if (anomalies >= minAnomaliesPerPaidHour) {
      payableHours += 1;
    }

    if (!shouldClose && anomalies < minAnomaliesPerActiveHour) {
      shouldClose = true;
      closeReason = 'low_hour_activity';
    }
  }

  const currentHourIndex = getHourIndex(startedAtMs, Math.max(startedAtMs, effectiveEndMs - 1));
  const hourAnomalies = Math.max(0, Math.floor(Number(runtime?.hourlyAnomalies?.[String(currentHourIndex)]) || 0));

  return {
    evaluatedHours,
    payableHours,
    shouldClose,
    closeReason,
    hourAnomalies,
  };
}

module.exports = {
  cloneEvaluatedHours,
  evaluateCompletedHours,
  getHourIndex,
};
