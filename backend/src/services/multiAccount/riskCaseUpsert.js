const {
  buildCategoryScores,
} = require('./evidenceScoring');
const {
  buildClusterRiskSignals,
  mergeUniqueStrings,
} = require('./riskSignals');
const {
  FREEZE_SCORE_THRESHOLD,
  HIGH_RISK_SCORE_THRESHOLD,
  REVIEW_SCORE_THRESHOLD,
  riskLevelByScore,
} = require('./riskDecision');
const {
  uniqueUsers,
} = require('./userRows');

function cleanText(value) {
  return String(value || '').trim();
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

function createRiskCaseUpsert({
  createRiskCase,
  getRiskCaseByUserId,
  updateRiskCaseById,
  now = () => new Date(),
  riskSource = 'multi_account',
  watchStatus = 'watch',
  frozenStatus = 'frozen',
} = {}) {
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
      const nowIso = now().toISOString();
      const existing = await getRiskCaseByUserId(user._id, { source: riskSource });
      const nextStatus = cleanText(effectiveAssessment?.status)
        || (frozen ? frozenStatus : watchStatus);
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
          source: riskSource,
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

  return {
    upsertRiskCasesForAssessment,
  };
}

module.exports = {
  buildRiskSignals,
  createRiskCaseUpsert,
};
