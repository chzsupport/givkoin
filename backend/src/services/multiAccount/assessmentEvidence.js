const {
  DETAIL_SCORES,
  appendDetailedEvidence,
  buildEvidenceEntry,
} = require('./evidenceScoring');

function cleanText(value) {
  return String(value || '').trim();
}

function sortByDate(rows = [], field = 'createdAt') {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const left = new Date(a?.[field] || 0).getTime();
    const right = new Date(b?.[field] || 0).getTime();
    return left - right;
  });
}

function appendAssessmentEvidence(evidence, assessments = []) {
  (Array.isArray(assessments) ? assessments : []).forEach((assessment) => {
    const matchedUserId = cleanText(assessment?.user?._id || assessment?.user?.id);
    const historyRows = sortByDate(Array.isArray(assessment?.history) ? assessment.history : [], 'createdAt');
    const firstSeenAt = historyRows[0]?.createdAt || null;
    const lastSeenAt = historyRows[historyRows.length - 1]?.createdAt || null;
    const matchedUserIds = matchedUserId ? [matchedUserId] : [];
    (Array.isArray(assessment?.evidence) ? assessment.evidence : []).forEach((entry) => {
      const type = cleanText(entry?.type);
      if (type === 'fingerprint') {
        appendDetailedEvidence(evidence, buildEvidenceEntry({
          signal: 'shared_fingerprint',
          category: 'technical',
          score: DETAIL_SCORES.shared_fingerprint,
          summary: 'Совпал устойчивый отпечаток устройства',
          count: entry?.count || 1,
          value: cleanText(entry?.value),
          firstSeenAt,
          lastSeenAt,
          matchedUserIds,
          details: { fingerprint: cleanText(entry?.value) },
          type,
        }));
      }
      if (type === 'device') {
        appendDetailedEvidence(evidence, buildEvidenceEntry({
          signal: 'shared_device_id',
          category: 'technical',
          score: DETAIL_SCORES.shared_device_id,
          summary: 'Совпала постоянная метка браузера',
          count: entry?.count || 1,
          value: cleanText(entry?.value),
          firstSeenAt,
          lastSeenAt,
          matchedUserIds,
          details: { deviceId: cleanText(entry?.value) },
          type,
        }));
      }
      if (type === 'profile_key') {
        appendDetailedEvidence(evidence, buildEvidenceEntry({
          signal: 'shared_profile_key',
          category: 'technical',
          score: DETAIL_SCORES.shared_profile_key,
          summary: 'Совпал устойчивый технический профиль браузера',
          count: entry?.count || 1,
          value: cleanText(entry?.value),
          firstSeenAt,
          lastSeenAt,
          matchedUserIds,
          details: { profileKey: cleanText(entry?.value) },
          type,
        }));
      }
      if (type === 'weak_fingerprint') {
        appendDetailedEvidence(evidence, buildEvidenceEntry({
          signal: 'shared_weak_fingerprint',
          category: 'technical',
          score: DETAIL_SCORES.shared_weak_fingerprint,
          summary: 'Совпал слабый отпечаток устройства',
          count: entry?.count || 1,
          value: cleanText(entry?.value),
          firstSeenAt,
          lastSeenAt,
          matchedUserIds,
          details: { weakFingerprint: cleanText(entry?.value) },
          type,
        }));
      }
      if (type === 'email') {
        appendDetailedEvidence(evidence, buildEvidenceEntry({
          signal: 'email_normalized_collision',
          category: 'technical',
          score: DETAIL_SCORES.email_normalized_collision,
          summary: 'Почтовые адреса совпали после нормализации',
          count: entry?.count || 1,
          value: cleanText(entry?.normalizedValue),
          firstSeenAt,
          lastSeenAt,
          matchedUserIds,
          details: {
            normalizedValue: cleanText(entry?.normalizedValue),
            currentEmail: cleanText(entry?.currentEmail),
            matchedEmail: cleanText(entry?.matchedEmail),
          },
          type,
        }));
      }
      if (type === 'ip') {
        appendDetailedEvidence(evidence, buildEvidenceEntry({
          signal: 'shared_ip',
          category: 'network',
          score: entry?.anonymousNetwork ? DETAIL_SCORES.shared_ip - 2 : DETAIL_SCORES.shared_ip,
          summary: entry?.anonymousNetwork ? 'Совпал IP в анонимной сети' : 'Совпал IP-адрес',
          count: entry?.count || 1,
          value: cleanText(entry?.value),
          firstSeenAt,
          lastSeenAt,
          matchedUserIds,
          details: {
            ip: cleanText(entry?.value),
            anonymousNetwork: Boolean(entry?.anonymousNetwork),
          },
          type,
        }));
      }
    });

    if ((assessment?.reasons || []).includes('anonymized_bridge')) {
      appendDetailedEvidence(evidence, buildEvidenceEntry({
        signal: 'anonymized_bridge',
        category: 'network',
        score: DETAIL_SCORES.anonymized_bridge,
        summary: 'Один и тот же след замечен и в обычной, и в анонимной сети',
        count: 1,
        firstSeenAt,
        lastSeenAt,
        matchedUserIds,
      }));
    }
  });
  return evidence;
}

module.exports = {
  appendAssessmentEvidence,
};
