const {
  buildSignals,
  normalizeEmailForAntiFarm,
} = require('./signals');

function cleanText(value) {
  return String(value || '').trim();
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

function mergeUniqueStrings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((item) => cleanText(item)).filter(Boolean)));
}

function appendRepairNote(prevNotes, noteTag, nowIso) {
  const safePrev = cleanText(prevNotes);
  if (safePrev.includes(noteTag)) return safePrev;
  const line = `[${nowIso}] ${noteTag}`;
  return safePrev ? `${safePrev}\n${line}` : line;
}

function buildSignalsFromUserState(user) {
  const data = getUserData(user);
  return buildSignals({
    ip: user?.lastIp || data.lastIp || '',
    deviceId: user?.lastDeviceId || data.lastDeviceId || '',
    fingerprint: user?.lastFingerprint || data.lastFingerprint || '',
    weakFingerprint: user?.lastWeakFingerprint || data.lastWeakFingerprint || '',
    profileKey: user?.lastProfileKey || data.lastProfileKey || '',
    clientProfile: user?.lastClientProfile || data.lastClientProfile || null,
    email: user?.email || data.email || '',
    ipIntel: user?.lastIpIntel || data.lastIpIntel || null,
  });
}

function sameStringArray(left = [], right = []) {
  const a = mergeUniqueStrings(left).sort();
  const b = mergeUniqueStrings(right).sort();
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function hasEvidenceType(evidence = [], type = '') {
  return (Array.isArray(evidence) ? evidence : []).some((entry) => cleanText(entry?.type) === cleanText(type));
}

function hasNormalizedEmailMatchInGroup(user, groupUsers = []) {
  const currentEmail = normalizeEmailForAntiFarm(user?.email);
  if (!currentEmail) return false;
  return (Array.isArray(groupUsers) ? groupUsers : []).some((row) => (
    cleanText(row?._id) !== cleanText(user?._id)
    && normalizeEmailForAntiFarm(row?.email) === currentEmail
  ));
}

function sanitizeStoredMultiAccountSignals(signals = [], evidence = [], user = null, groupUsers = []) {
  const safeSignals = mergeUniqueStrings(signals);
  const hasDeviceEvidence = hasEvidenceType(evidence, 'device');
  const hasFingerprintEvidence = hasEvidenceType(evidence, 'fingerprint');
  const hasProfileKeyEvidence = hasEvidenceType(evidence, 'profile_key');
  const hasWeakFingerprintEvidence = hasEvidenceType(evidence, 'weak_fingerprint');
  const hasIpEvidence = hasEvidenceType(evidence, 'ip');
  const hasEmailEvidence = hasEvidenceType(evidence, 'email') || hasNormalizedEmailMatchInGroup(user, groupUsers);

  return safeSignals.filter((signal) => {
    if (!signal) return false;
    if (signal === 'email_normalized_collision') return hasEmailEvidence;
    if (signal === 'shared_device_id' || signal.startsWith('shared_device:')) return hasDeviceEvidence;
    if (signal === 'shared_fingerprint' || signal.startsWith('shared_fingerprint:')) return hasFingerprintEvidence;
    if (signal === 'shared_profile_key') return hasProfileKeyEvidence;
    if (signal === 'shared_weak_fingerprint' || signal.startsWith('shared_weak_fingerprint:')) return hasWeakFingerprintEvidence;
    if (signal === 'shared_ip') return hasIpEvidence;
    return true;
  });
}

module.exports = {
  appendRepairNote,
  buildSignalsFromUserState,
  sameStringArray,
  sanitizeStoredMultiAccountSignals,
};
