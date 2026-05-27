const { toIso: defaultToIso } = require('../documentStore');
const {
  stripWindowReportsFromFinalPayload: defaultStripWindowReportsFromFinalPayload,
} = require('./nightShiftReports');
const {
  validateFinalShiftReport: defaultValidateFinalShiftReport,
} = require('./nightShiftValidation');

function defaultGetRuntimeSession(...args) {
  return require('./nightShiftRuntimeStore').getRuntimeSession(...args);
}

function defaultListRuntimeSessionsByFilters(...args) {
  return require('./nightShiftRuntimeStore').listRuntimeSessionsByFilters(...args);
}

function defaultPatchRuntimeSession(...args) {
  return require('./nightShiftRuntimeStore').patchRuntimeSession(...args);
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

function defaultRecordTransaction(...args) {
  return require('../kService').recordTransaction(...args);
}

function calculateRequestedPenalty(reward = {}) {
  return {
    k: Math.floor((Number(reward.k) || 0) * 0.8),
    lm: Math.floor((Number(reward.lm) || 0) * 0.8),
    stars: Number(((Number(reward.stars) || 0) * 0.8).toFixed(4)),
  };
}

function calculateAppliedPenalty(userData = {}, requestedPenalty = {}) {
  const currentK = Number(userData.k) || 0;
  const currentLm = Number(userData.lumens) || 0;
  const currentStars = Number(userData.stars) || 0;
  return {
    k: Math.min(currentK, Number(requestedPenalty.k) || 0),
    lm: Math.min(currentLm, Number(requestedPenalty.lm) || 0),
    stars: Number(Math.min(currentStars, Number(requestedPenalty.stars) || 0).toFixed(4)),
  };
}

function buildPenalizedNightShift(currentNightShift = {}, appliedPenalty = {}) {
  return {
    ...currentNightShift,
    stats: {
      totalTimeMs: Number(currentNightShift.stats?.totalTimeMs) || 0,
      anomaliesCleared: Number(currentNightShift.stats?.anomaliesCleared) || 0,
      totalEarnings: {
        k: Math.max(0, (Number(currentNightShift.stats?.totalEarnings?.k) || 0) - (Number(appliedPenalty.k) || 0)),
        lm: Math.max(0, (Number(currentNightShift.stats?.totalEarnings?.lm) || 0) - (Number(appliedPenalty.lm) || 0)),
        stars: Number(Math.max(0, (Number(currentNightShift.stats?.totalEarnings?.stars) || 0) - (Number(appliedPenalty.stars) || 0)).toFixed(4)),
      },
    },
  };
}

async function recordPenaltyTransactions({ appliedPenalty, recordTransaction, runtime, userId, now }) {
  if (appliedPenalty.k > 0) {
    await recordTransaction({
      userId,
      type: 'night_shift',
      direction: 'debit',
      amount: appliedPenalty.k,
      currency: 'K',
      description: 'Штраф за Ночную Смену',
      relatedEntity: runtime.sessionId,
      occurredAt: now,
    }).catch(() => null);
  }

  if (appliedPenalty.lm > 0) {
    await recordTransaction({
      userId,
      type: 'night_shift',
      direction: 'debit',
      amount: appliedPenalty.lm,
      currency: 'LM',
      description: 'Штраф за Ночную Смену',
      relatedEntity: runtime.sessionId,
      occurredAt: now,
    }).catch(() => null);
  }

  if (appliedPenalty.stars > 0) {
    await recordTransaction({
      userId,
      type: 'night_shift',
      direction: 'debit',
      amount: appliedPenalty.stars,
      currency: 'STAR',
      description: 'Штраф за Ночную Смену',
      relatedEntity: runtime.sessionId,
      occurredAt: now,
    }).catch(() => null);
  }
}

function createNightShiftReviews({
  getNightShiftFromUserData = defaultGetNightShiftFromUserData,
  getRuntimeSession = defaultGetRuntimeSession,
  getUserData = defaultGetUserData,
  getUserRowById = defaultGetUserRowById,
  listRuntimeSessionsByFilters = defaultListRuntimeSessionsByFilters,
  patchRuntimeSession = defaultPatchRuntimeSession,
  recordTransaction = defaultRecordTransaction,
  stripWindowReportsFromFinalPayload = defaultStripWindowReportsFromFinalPayload,
  toIso = defaultToIso,
  updateUserDataById = defaultUpdateUserDataById,
  validateFinalShiftReport = defaultValidateFinalShiftReport,
} = {}) {
  async function reviewSuspiciousShift({ sessionId, action, adminUserId = null, now = new Date() } = {}) {
    const runtime = await getRuntimeSession(sessionId);
    if (!runtime || runtime.status === 'active') {
      throw new Error('night_shift_review_not_found');
    }

    const safeAction = String(action || '').trim();
    if (safeAction !== 'approve' && safeAction !== 'penalize') {
      throw new Error('night_shift_review_invalid_action');
    }

    if (runtime.reviewStatus === 'approved' || runtime.reviewStatus === 'penalized') {
      throw new Error('night_shift_review_already_handled');
    }

    const basePatch = {
      reviewActionAt: toIso(now),
      reviewActionBy: adminUserId ? String(adminUserId) : null,
    };

    if (safeAction === 'approve') {
      const updated = await patchRuntimeSession(runtime.sessionId, {
        ...basePatch,
        reviewStatus: 'approved',
        reviewPenalty: null,
      }, { runtime, now });
      return {
        runtime: updated,
        penalty: null,
        user: await getUserRowById(updated.userId),
      };
    }

    const userRow = await getUserRowById(runtime.userId);
    if (!userRow) {
      throw new Error('night_shift_review_user_not_found');
    }

    const requestedPenalty = calculateRequestedPenalty(runtime.reward || { k: 0, lm: 0, stars: 0 });
    const userData = getUserData(userRow);
    const currentNightShift = getNightShiftFromUserData(userData);
    const currentK = Number(userData.k) || 0;
    const currentLm = Number(userData.lumens) || 0;
    const currentStars = Number(userData.stars) || 0;
    const appliedPenalty = calculateAppliedPenalty(userData, requestedPenalty);

    await updateUserDataById(userRow.id, {
      k: Math.max(0, currentK - appliedPenalty.k),
      lumens: Math.max(0, currentLm - appliedPenalty.lm),
      stars: Number(Math.max(0, currentStars - appliedPenalty.stars).toFixed(4)),
      nightShift: buildPenalizedNightShift(currentNightShift, appliedPenalty),
    });

    await recordPenaltyTransactions({
      appliedPenalty,
      recordTransaction,
      runtime,
      userId: userRow.id,
      now,
    });

    const updated = await patchRuntimeSession(runtime.sessionId, {
      ...basePatch,
      reviewStatus: 'penalized',
      reviewPenalty: appliedPenalty,
    }, { runtime, now });

    return {
      runtime: updated,
      penalty: appliedPenalty,
      user: userRow,
    };
  }

  async function processPendingNightShiftFinalReviews({ now = new Date(), limit = 50 } = {}) {
    const rows = await listRuntimeSessionsByFilters({
      status: 'ended',
      finalVerificationStatus: 'queued',
      limit: Math.max(1, Math.min(200, Number(limit) || 50)),
    });

    const results = [];

    for (const row of rows) {
      try {
        const verification = validateFinalShiftReport(row, row.finalReport);
        const nextFinalReport = stripWindowReportsFromFinalPayload({
          ...(row.finalReport && typeof row.finalReport === 'object' ? row.finalReport : {}),
          totalAnomalies: verification.claimedTotal,
          verifiedAnomalies: verification.acceptedTotal,
        });

        const updated = await patchRuntimeSession(row.sessionId, {
          totalAcceptedAnomalies: verification.acceptedTotal,
          totalReportedAnomalies: verification.claimedTotal,
          totalPageHits: Object.keys(verification.pageHits).length ? verification.pageHits : row.totalPageHits,
          suspiciousWindows: verification.suspicious ? verification.suspiciousWindows : [],
          reviewStatus: verification.suspicious ? 'pending' : 'clean',
          finalVerificationStatus: 'verified',
          finalVerifiedAt: toIso(now),
          finalVerificationMismatchCount: verification.suspiciousWindows.length,
          finalReport: nextFinalReport,
        }, { runtime: row, now });

        results.push({
          sessionId: updated.sessionId,
          suspicious: verification.suspicious,
          mismatchCount: verification.suspiciousWindows.length,
        });
      } catch (error) {
        await patchRuntimeSession(row.sessionId, {
          finalVerificationStatus: 'error',
        }, { runtime: row, now }).catch(() => null);
      }
    }

    return results;
  }

  return {
    processPendingNightShiftFinalReviews,
    reviewSuspiciousShift,
  };
}

const defaultReviews = createNightShiftReviews();

module.exports = {
  buildPenalizedNightShift,
  calculateAppliedPenalty,
  calculateRequestedPenalty,
  createNightShiftReviews,
  processPendingNightShiftFinalReviews: defaultReviews.processPendingNightShiftFinalReviews,
  reviewSuspiciousShift: defaultReviews.reviewSuspiciousShift,
};
