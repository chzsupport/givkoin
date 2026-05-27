const {
  DETAIL_SCORES,
} = require('./evidenceScoring');
const {
  FREEZE_SCORE_THRESHOLD,
  REVIEW_SCORE_THRESHOLD,
  riskLevelByScore,
} = require('./riskDecision');
const {
  normalizeEmailForAntiFarm,
  normalizeSignalValue,
} = require('./signals');

const SCORE_STRONG_FINGERPRINT = 100;
const SCORE_DEVICE = 35;
const SCORE_WEAK_FINGERPRINT = 28;
const SCORE_EMAIL = 40;
const SCORE_DIRECT_IP = 18;
const SCORE_ANON_IP = 6;
const SCORE_ANON_BRIDGE = 25;

function cleanText(value) {
  return String(value || '').trim();
}

function isAnonymousIntel(intel = null) {
  return Boolean(intel?.isTor || intel?.isVpn || intel?.isProxy || intel?.isHosting);
}

function appendReason(target, reason) {
  if (!reason) return;
  if (!target.includes(reason)) target.push(reason);
}

function appendEvidence(target, entry) {
  if (!entry || typeof entry !== 'object') return;
  const key = JSON.stringify(entry);
  if (target.some((item) => JSON.stringify(item) === key)) return;
  target.push(entry);
}

function buildAssessmentReasons(signals, matchSummary, currentIpIntel, matchedUser) {
  const reasons = [];
  const evidence = [];
  let score = 0;

  if (signals.emailNormalized && normalizeEmailForAntiFarm(matchedUser?.email) === signals.emailNormalized) {
    score += SCORE_EMAIL;
    appendReason(reasons, 'email_normalized_collision');
    appendEvidence(evidence, {
      type: 'email',
      count: 1,
      currentEmail: cleanText(signals.emailRaw),
      matchedEmail: cleanText(matchedUser?.email),
      normalizedValue: signals.emailNormalized,
    });
  }

  if (Array.isArray(matchSummary.fingerprint) && matchSummary.fingerprint.length) {
    score = Math.max(score, SCORE_STRONG_FINGERPRINT);
    appendReason(reasons, 'shared_fingerprint');
    appendReason(reasons, `shared_fingerprint:${signals.fingerprint}`);
    appendEvidence(evidence, {
      type: 'fingerprint',
      count: matchSummary.fingerprint.length,
      value: signals.fingerprint,
    });
  }

  if (Array.isArray(matchSummary.deviceId) && matchSummary.deviceId.length) {
    score += SCORE_DEVICE;
    appendReason(reasons, 'shared_device_id');
    appendReason(reasons, `shared_device:${signals.deviceId}`);
    appendEvidence(evidence, {
      type: 'device',
      count: matchSummary.deviceId.length,
      value: signals.deviceId,
    });
  }

  if (signals.profileKey && normalizeSignalValue(matchedUser?.lastProfileKey) === signals.profileKey) {
    score += DETAIL_SCORES.shared_profile_key;
    appendReason(reasons, 'shared_profile_key');
    appendEvidence(evidence, {
      type: 'profile_key',
      count: 1,
      value: signals.profileKey,
    });
  }

  if (Array.isArray(matchSummary.weakFingerprint) && matchSummary.weakFingerprint.length) {
    score += SCORE_WEAK_FINGERPRINT;
    appendReason(reasons, 'shared_weak_fingerprint');
    appendReason(reasons, `shared_weak_fingerprint:${signals.weakFingerprint}`);
    appendEvidence(evidence, {
      type: 'weak_fingerprint',
      count: matchSummary.weakFingerprint.length,
      value: signals.weakFingerprint,
    });
  }

  if (Array.isArray(matchSummary.ip) && matchSummary.ip.length) {
    const ipScore = isAnonymousIntel(currentIpIntel) ? SCORE_ANON_IP : SCORE_DIRECT_IP;
    score += ipScore;
    appendReason(reasons, 'shared_ip');
    appendEvidence(evidence, {
      type: 'ip',
      count: matchSummary.ip.length,
      value: signals.ip,
      anonymousNetwork: isAnonymousIntel(currentIpIntel),
    });
  }

  const hasFingerprintBridge = Array.isArray(matchSummary.fingerprint) && matchSummary.fingerprint.some((row) => {
    const rowAnonymous = isAnonymousIntel(row?.ipIntel);
    return rowAnonymous !== isAnonymousIntel(currentIpIntel);
  });
  if (hasFingerprintBridge) {
    score += SCORE_ANON_BRIDGE;
    appendReason(reasons, 'anonymized_bridge');
  }

  if (String(matchedUser?.status || '') === 'banned') {
    appendReason(reasons, 'linked_banned_account');
  }

  const hasStrongFingerprint = reasons.includes('shared_fingerprint');
  const hasDeviceAndWeak = reasons.includes('shared_device_id') && reasons.includes('shared_weak_fingerprint');
  const hasWeakAndDirectIp = reasons.includes('shared_weak_fingerprint') && reasons.includes('shared_ip') && !isAnonymousIntel(currentIpIntel);
  const shouldFreeze = Boolean(hasStrongFingerprint || hasDeviceAndWeak || hasWeakAndDirectIp || score >= FREEZE_SCORE_THRESHOLD);
  const needsReview = Boolean(reasons.length || shouldFreeze || score >= REVIEW_SCORE_THRESHOLD);

  return {
    score,
    reasons,
    evidence,
    shouldFreeze,
    needsReview,
    riskLevel: riskLevelByScore(score),
  };
}

module.exports = {
  buildAssessmentReasons,
};
