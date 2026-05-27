function cleanText(value) {
  return String(value || '').trim();
}

function appendReason(target, reason) {
  if (!reason) return;
  if (!target.includes(reason)) target.push(reason);
}

function mergeUniqueStrings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((item) => cleanText(item)).filter(Boolean)));
}

function buildClusterRiskSignals({
  currentSignals = {},
  evidence = [],
  clusterSize = 0,
}) {
  const out = [];
  if (clusterSize > 1) out.push(`multi_account_cluster:${clusterSize}`);
  if (currentSignals.ipIntel?.isTor) out.push('network_tor');
  if (currentSignals.ipIntel?.isVpn) out.push('network_vpn');
  if (currentSignals.ipIntel?.isProxy) out.push('network_proxy');
  if (currentSignals.ipIntel?.isHosting) out.push('network_hosting');

  (Array.isArray(evidence) ? evidence : []).forEach((entry) => {
    const signal = cleanText(entry?.signal);
    if (!signal) return;
    appendReason(out, signal);
    if (signal === 'shared_device_id' && currentSignals.deviceId) appendReason(out, `shared_device:${currentSignals.deviceId}`);
    if (signal === 'shared_fingerprint' && currentSignals.fingerprint) appendReason(out, `shared_fingerprint:${currentSignals.fingerprint}`);
    if (signal === 'shared_weak_fingerprint' && currentSignals.weakFingerprint) appendReason(out, `shared_weak_fingerprint:${currentSignals.weakFingerprint}`);
  });

  return mergeUniqueStrings(out);
}

module.exports = {
  buildClusterRiskSignals,
  mergeUniqueStrings,
};
