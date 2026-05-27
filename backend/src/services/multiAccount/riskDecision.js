const FREEZE_SCORE_THRESHOLD = 100;
const HIGH_RISK_SCORE_THRESHOLD = 70;
const REVIEW_SCORE_THRESHOLD = 45;
const FREEZE_MIN_EVIDENCE_COUNT = 5;
const FREEZE_MIN_CATEGORY_COUNT = 3;
const STRONG_TECHNICAL_SIGNALS = new Set(['shared_fingerprint', 'shared_device_id']);

function cleanText(value) {
  return String(value || '').trim();
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function riskLevelByScore(score) {
  const safeScore = Number(score) || 0;
  if (safeScore >= 90) return 'critical';
  if (safeScore >= 60) return 'high';
  if (safeScore >= 30) return 'medium';
  return 'low';
}

function resolveClusterStatus({ riskScore = 0, shouldFreeze = false, freezeStatus = '' } = {}) {
  if (freezeStatus === 'banned' || freezeStatus === 'unfrozen') return 'resolved';
  if (freezeStatus === 'watch') return 'watch';
  if (shouldFreeze) return 'frozen';
  if (safeNumber(riskScore) >= HIGH_RISK_SCORE_THRESHOLD) return 'high_risk';
  return 'watch';
}

function qualifiesAutomaticFreeze({
  riskScore = 0,
  evidence = [],
}) {
  const safeEvidence = Array.isArray(evidence) ? evidence : [];
  if (safeNumber(riskScore) < FREEZE_SCORE_THRESHOLD) return false;
  if (safeEvidence.length < FREEZE_MIN_EVIDENCE_COUNT) return false;

  const categories = new Set(safeEvidence.map((entry) => cleanText(entry?.category)).filter(Boolean));
  if (categories.size < FREEZE_MIN_CATEGORY_COUNT) return false;

  const hasStrongTechnical = safeEvidence.some((entry) => STRONG_TECHNICAL_SIGNALS.has(cleanText(entry?.signal)));
  const hasSessionSignal = safeEvidence.some((entry) => cleanText(entry?.category) === 'sessions');
  const hasBattleOrEconomy = safeEvidence.some((entry) => {
    const category = cleanText(entry?.category);
    return category === 'battle' || category === 'economy';
  });

  return hasStrongTechnical && hasSessionSignal && hasBattleOrEconomy;
}

module.exports = {
  FREEZE_SCORE_THRESHOLD,
  HIGH_RISK_SCORE_THRESHOLD,
  REVIEW_SCORE_THRESHOLD,
  qualifiesAutomaticFreeze,
  resolveClusterStatus,
  riskLevelByScore,
};
