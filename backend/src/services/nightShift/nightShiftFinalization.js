const { toIso: defaultToIso } = require('../documentStore');
const { normalizeNightShiftSalary } = require('./nightShiftRewards');
const { applyShiftSeatRelease: defaultApplyShiftSeatRelease } = require('./nightShiftSeatStore');
const {
  HEARTBEAT_TIMEOUT_MS,
  getSessionHardEndMs: defaultGetSessionHardEndMs,
  getSettlementDelaySeconds: defaultGetSettlementDelaySeconds,
  safeMs: defaultSafeMs,
} = require('./nightShiftRuntimeConfig');
const {
  getTotalAnomaliesFromWindowReports,
  normalizeFinalWindowReports,
  normalizePageHits,
} = require('./nightShiftReports');
const { evaluateCompletedHours } = require('./nightShiftHeartbeat');
const {
  normalizeRuntimeSession,
  sumHourlyAnomalies,
} = require('./nightShiftRuntimeSession');

function defaultGetRuntimeSession(...args) {
  return require('./nightShiftRuntimeStore').getRuntimeSession(...args);
}

function defaultListRuntimeSessionsByFilters(...args) {
  return require('./nightShiftRuntimeStore').listRuntimeSessionsByFilters(...args);
}

function defaultSaveRuntimeSession(...args) {
  return require('./nightShiftRuntimeStore').saveRuntimeSession(...args);
}

function defaultGetUserRowById(...args) {
  return require('./nightShiftUserState').getUserRowById(...args);
}

function defaultGetUserData(...args) {
  return require('./nightShiftUserState').getUserData(...args);
}

function defaultGetNightShiftFromUserData(...args) {
  return require('./nightShiftUserState').getNightShiftFromUserData(...args);
}

function defaultUpdateUserDataById(...args) {
  return require('./nightShiftUserState').updateUserDataById(...args);
}

function calculateEffectiveShiftEnd({ normalizedRuntime, now, safeMs, getSessionHardEndMs }) {
  const startedAtMs = safeMs(normalizedRuntime.startedAt);
  const nowMs = now.getTime();
  const hardEndMs = getSessionHardEndMs(normalizedRuntime);
  const effectiveEndMs = startedAtMs == null
    ? nowMs
    : Math.min(nowMs, hardEndMs == null ? nowMs : hardEndMs);
  return {
    effectiveEndMs,
    startedAtMs,
    totalDurationSeconds: startedAtMs == null ? 0 : Math.max(0, Math.floor((effectiveEndMs - startedAtMs) / 1000)),
  };
}

function buildFinalShiftPayload({
  finalReport = null,
  normalizedRuntime,
  effectiveEndMs,
  totalDurationSeconds,
  toIso = defaultToIso,
} = {}) {
  const finalWindowReports = normalizeFinalWindowReports(finalReport?.windowReports);
  const reportedTotalAnomalies = Math.max(
    0,
    Math.floor(
      Number(finalReport?.totalAnomalies)
      || getTotalAnomaliesFromWindowReports(finalWindowReports)
      || Number(normalizedRuntime.totalReportedAnomalies)
      || sumHourlyAnomalies(normalizedRuntime.hourlyAnomalies)
      || 0
    )
  );
  const reportedPageHits = normalizePageHits(finalReport?.pageHits);
  const finalPayload = {
    startedAt: finalReport?.startedAt || normalizedRuntime.startedAt || null,
    endedAt: finalReport?.endedAt || toIso(effectiveEndMs),
    totalDurationSeconds: Math.max(0, Math.floor(Number(finalReport?.totalDurationSeconds) || totalDurationSeconds)),
    totalAnomalies: reportedTotalAnomalies,
    pageHits: Object.keys(reportedPageHits).length ? reportedPageHits : normalizedRuntime.totalPageHits,
    windowReports: finalWindowReports,
  };
  return {
    finalPayload,
    finalWindowReports,
    reportedTotalAnomalies,
  };
}

function buildFinalShiftReward({ normalizedRuntime, payableHours }) {
  const paidHours = Math.max(0, Math.floor(Number(payableHours) || 0));
  const salaryRates = normalizeNightShiftSalary(normalizedRuntime.salaryRates);
  return {
    k: Math.floor((Number(salaryRates.k) || 0) * paidHours),
    lm: Math.floor((Number(salaryRates.lm) || 0) * paidHours),
    stars: Number(((Number(salaryRates.stars) || 0) * paidHours).toFixed(4)),
  };
}

function buildClosedNightShift({
  closeReason,
  currentNightShift,
  hasReward,
  nextRuntime,
  normalizedRuntime,
  paidHours,
  reward,
  settlementDueAt,
  toIso,
  now,
}) {
  return {
    ...currentNightShift,
    isServing: false,
    sessionId: null,
    startTime: null,
    lastActivityAt: toIso(now),
    pendingSettlement: hasReward ? {
      sessionId: normalizedRuntime.sessionId,
      dueAt: toIso(settlementDueAt),
      reward,
      payableHours: paidHours,
    } : null,
    shiftKey: normalizedRuntime.shiftKey || currentNightShift.shiftKey || null,
    shiftEndsAt: normalizedRuntime.shiftEndsAt || currentNightShift.shiftEndsAt || null,
    seatLimitSnapshot: Math.max(0, Math.floor(Number(nextRuntime.seatLimitSnapshot) || Number(currentNightShift.seatLimitSnapshot) || 0)),
    occupiedSeatsSnapshot: Math.max(0, Math.floor(Number(nextRuntime.occupiedSeatsSnapshot) || Number(currentNightShift.occupiedSeatsSnapshot) || 0)),
    acceptedAnomaliesCurrentSession: 0,
    payableHoursCurrent: 0,
    consecutiveEmptyWindows: 0,
    lastCloseReason: closeReason,
  };
}

async function commitShiftStatsIfNeeded({
  getNightShiftFromUserData,
  getUserData,
  getUserRowById,
  runtime,
  saveRuntimeSession,
  toIso,
  totalAcceptedAnomalies,
  totalDurationSeconds,
  updateUserDataById,
  userId,
  endedAt,
}) {
  if (runtime.statsCommitted) return;
  const userRow = await getUserRowById(userId);
  if (!userRow) return;
  const userData = getUserData(userRow);
  const currentNightShift = getNightShiftFromUserData(userData);
  const nextNightShift = {
    ...currentNightShift,
    stats: {
      totalTimeMs: (Number(currentNightShift.stats?.totalTimeMs) || 0) + (Math.max(0, Number(totalDurationSeconds) || 0) * 1000),
      anomaliesCleared: (Number(currentNightShift.stats?.anomaliesCleared) || 0) + Math.max(0, Number(totalAcceptedAnomalies) || 0),
      totalEarnings: {
        k: Number(currentNightShift.stats?.totalEarnings?.k) || 0,
        lm: Number(currentNightShift.stats?.totalEarnings?.lm) || 0,
        stars: Number(currentNightShift.stats?.totalEarnings?.stars) || 0,
      },
    },
  };

  await updateUserDataById(userRow.id, { nightShift: nextNightShift });
  await saveRuntimeSession(runtime.sessionId, {
    ...runtime,
    statsCommitted: true,
    endedAt: runtime.endedAt || toIso(endedAt),
  }, { updatedAt: endedAt });
}

function createNightShiftFinalization({
  applyShiftSeatRelease = defaultApplyShiftSeatRelease,
  getNightShiftFromUserData = defaultGetNightShiftFromUserData,
  getRuntimeSession = defaultGetRuntimeSession,
  getSessionHardEndMs = defaultGetSessionHardEndMs,
  getUserData = defaultGetUserData,
  getUserRowById = defaultGetUserRowById,
  getSettlementDelaySeconds = defaultGetSettlementDelaySeconds,
  listRuntimeSessionsByFilters = defaultListRuntimeSessionsByFilters,
  safeMs = defaultSafeMs,
  saveRuntimeSession = defaultSaveRuntimeSession,
  toIso = defaultToIso,
  updateUserDataById = defaultUpdateUserDataById,
} = {}) {
  async function finalizeShiftSession({
    runtime,
    userId,
    now = new Date(),
    closeReason = 'manual_exit',
    finalReport = null,
  }) {
    const normalizedRuntime = normalizeRuntimeSession(runtime);
    if (!normalizedRuntime) {
      throw new Error('night_shift_session_not_found');
    }

    const {
      effectiveEndMs,
      totalDurationSeconds,
    } = calculateEffectiveShiftEnd({
      normalizedRuntime,
      now,
      safeMs,
      getSessionHardEndMs,
    });
    const evaluated = evaluateCompletedHours(normalizedRuntime, effectiveEndMs);
    const {
      finalPayload,
      finalWindowReports,
      reportedTotalAnomalies,
    } = buildFinalShiftPayload({
      finalReport,
      normalizedRuntime,
      effectiveEndMs,
      totalDurationSeconds,
      toIso,
    });

    const paidHours = Math.max(0, Math.floor(Number(evaluated.payableHours) || 0));
    const reward = buildFinalShiftReward({ normalizedRuntime, payableHours: paidHours });
    const hasReward = paidHours > 0 && (reward.k > 0 || reward.lm > 0 || reward.stars > 0);
    const delaySeconds = hasReward ? getSettlementDelaySeconds() : 0;
    const settlementDueAt = hasReward ? new Date(now.getTime() + (delaySeconds * 1000)) : null;

    const nextRuntime = {
      ...normalizedRuntime,
      status: 'ended',
      endedAt: toIso(effectiveEndMs),
      closeReason,
      evaluatedHours: evaluated.evaluatedHours,
      payableHours: paidHours,
      totalAcceptedAnomalies: reportedTotalAnomalies,
      totalReportedAnomalies: finalPayload.totalAnomalies,
      finalReport: finalPayload,
      settlementStatus: hasReward ? 'queued' : 'none',
      settlementDueAt: settlementDueAt ? toIso(settlementDueAt) : null,
      reward,
      seatRetained: true,
      finalVerificationStatus: finalWindowReports.length ? 'queued' : 'none',
      finalVerifiedAt: null,
      finalVerificationMismatchCount: 0,
    };

    const shiftSummary = await applyShiftSeatRelease(normalizedRuntime, {
      seatRetained: true,
      now,
    });
    if (shiftSummary) {
      nextRuntime.seatLimitSnapshot = shiftSummary.seatLimit;
      nextRuntime.activeUsersCountSnapshot = shiftSummary.activeUsersCountSnapshot;
      nextRuntime.occupiedSeatsSnapshot = shiftSummary.occupiedSeats;
    }

    await saveRuntimeSession(normalizedRuntime.sessionId, nextRuntime, { updatedAt: now });

    await commitShiftStatsIfNeeded({
      getNightShiftFromUserData,
      getUserData,
      getUserRowById,
      runtime: nextRuntime,
      saveRuntimeSession,
      toIso,
      totalDurationSeconds: finalPayload.totalDurationSeconds,
      totalAcceptedAnomalies: reportedTotalAnomalies,
      updateUserDataById,
      userId,
      endedAt: now,
    });

    const userRow = await getUserRowById(userId);
    if (!userRow) throw new Error('user_not_found');
    const userData = getUserData(userRow);
    const currentNightShift = getNightShiftFromUserData(userData);
    await updateUserDataById(userId, {
      nightShift: buildClosedNightShift({
        closeReason,
        currentNightShift,
        hasReward,
        nextRuntime,
        normalizedRuntime,
        paidHours,
        reward,
        settlementDueAt,
        toIso,
        now,
      }),
    });

    return {
      runtime: nextRuntime,
      reward,
      settlementEtaSeconds: delaySeconds,
      payableHours: paidHours,
      queued: hasReward,
      closeReason,
      totalDurationSeconds: finalPayload.totalDurationSeconds,
      totalAcceptedAnomalies: reportedTotalAnomalies,
    };
  }

  async function endShiftForUser({
    userId,
    shiftSessionId,
    startedAt,
    endedAt,
    totalDurationSeconds,
    totalAnomalies,
    pageHits,
    windowReports,
    now = new Date(),
  }) {
    const runtime = await getRuntimeSession(shiftSessionId);
    if (!runtime || String(runtime.userId) !== String(userId) || runtime.status !== 'active') {
      throw new Error('night_shift_session_not_found');
    }

    return finalizeShiftSession({
      runtime,
      userId,
      now,
      closeReason: 'manual_exit',
      finalReport: {
        startedAt: startedAt || runtime.startedAt,
        endedAt: endedAt || toIso(now),
        totalDurationSeconds,
        totalAnomalies,
        pageHits,
        windowReports,
      },
    });
  }

  async function processStaleNightShiftClosures({ now = new Date() } = {}) {
    const rows = await listRuntimeSessionsByFilters({ status: 'active' });
    const nowMs = now.getTime();
    const results = [];

    for (const row of rows) {
      if (row.status !== 'active') continue;
      const startedAtMs = safeMs(row.startedAt);
      const lastHeartbeatMs = safeMs(row.lastHeartbeatAt) || startedAtMs;
      if (startedAtMs == null || lastHeartbeatMs == null) continue;

      const timedOut = nowMs - lastHeartbeatMs >= HEARTBEAT_TIMEOUT_MS;
      const hardEndMs = getSessionHardEndMs(row);
      const hardEnded = hardEndMs != null && nowMs >= hardEndMs;
      if (!timedOut && !hardEnded) continue;

      const closed = await finalizeShiftSession({
        runtime: row,
        userId: row.userId,
        now,
        closeReason: timedOut ? 'heartbeat_timeout' : 'shift_window_closed',
        finalReport: {
          startedAt: row.startedAt,
          endedAt: toIso(now),
          totalDurationSeconds: Math.max(0, Math.floor((nowMs - startedAtMs) / 1000)),
          totalAnomalies: row.totalAcceptedAnomalies,
          pageHits: row.totalPageHits,
        },
      });
      results.push({
        userId: row.userId,
        sessionId: row.sessionId,
        closeReason: closed.closeReason,
        payableHours: closed.payableHours,
      });
    }

    return results;
  }

  return {
    endShiftForUser,
    finalizeShiftSession,
    processStaleNightShiftClosures,
  };
}

const defaultFinalization = createNightShiftFinalization();

module.exports = {
  buildClosedNightShift,
  buildFinalShiftPayload,
  buildFinalShiftReward,
  calculateEffectiveShiftEnd,
  createNightShiftFinalization,
  endShiftForUser: defaultFinalization.endShiftForUser,
  finalizeShiftSession: defaultFinalization.finalizeShiftSession,
  processStaleNightShiftClosures: defaultFinalization.processStaleNightShiftClosures,
};
