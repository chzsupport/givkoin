const {
  DETAIL_SCORES,
  appendDetailedEvidence,
  buildEvidenceEntry,
} = require('./evidenceScoring');
const {
  normalizeClientProfile,
} = require('./signals');

function cleanText(value) {
  return String(value || '').trim();
}

function toPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function uniq(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : []).filter(Boolean)));
}

function sortByDate(rows = [], field = 'createdAt') {
  return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const left = new Date(a?.[field] || 0).getTime();
    const right = new Date(b?.[field] || 0).getTime();
    return left - right;
  });
}

function isAnonymousIntel(intel = null) {
  return Boolean(intel?.isTor || intel?.isVpn || intel?.isProxy || intel?.isHosting);
}

function buildNetworkFlags(intel = null) {
  return [
    intel?.isTor ? 'tor' : '',
    intel?.isVpn ? 'vpn' : '',
    intel?.isProxy ? 'proxy' : '',
    intel?.isHosting ? 'hosting' : '',
  ].filter(Boolean);
}

function appendProfileNetworkEvidence(evidence, {
  userIds = [],
  safeUsers = [],
  currentUserId = '',
  currentSignals = {},
  signalHistory = [],
  sessions = [],
} = {}) {
  const profileFlagsByUser = new Map(userIds.map((userId) => [userId, {
    emulator: false,
    webdriver: false,
    headless: false,
    flags: new Set(),
    latestAt: null,
    profileSamples: [],
  }]));

  const pushProfile = (userId, profile, happenedAt = null) => {
    const safeUserId = cleanText(userId);
    if (!safeUserId || !profileFlagsByUser.has(safeUserId)) return;
    const safeProfile = normalizeClientProfile(profile);
    if (!safeProfile.platform && !safeProfile.webglRenderer && !safeProfile.webglVendor) return;
    const row = profileFlagsByUser.get(safeUserId);
    row.emulator = row.emulator || Boolean(safeProfile.emulator);
    row.webdriver = row.webdriver || Boolean(safeProfile.webdriver);
    row.headless = row.headless || Boolean(safeProfile.headless);
    if (safeProfile.emulator) row.flags.add('emulator');
    if (safeProfile.webdriver || safeProfile.headless) row.flags.add('webdriver');
    row.profileSamples.push({
      platform: safeProfile.platform,
      vendor: safeProfile.vendor,
      timezone: safeProfile.timezone,
      webglVendor: safeProfile.webglVendor,
      webglRenderer: safeProfile.webglRenderer,
      maxTouchPoints: safeProfile.maxTouchPoints,
      happenedAt: happenedAt ? new Date(happenedAt).toISOString() : null,
    });
    if (!row.latestAt || new Date(happenedAt || 0).getTime() > new Date(row.latestAt || 0).getTime()) {
      row.latestAt = happenedAt || row.latestAt || null;
    }
  };

  (Array.isArray(safeUsers) ? safeUsers : []).forEach((user) => {
    const userId = cleanText(user?._id);
    if (!userId) return;
    pushProfile(userId, user?.lastClientProfile || user?.data?.lastClientProfile, user?.updatedAt || null);
    if (currentUserId && userId === currentUserId) {
      pushProfile(userId, currentSignals.clientProfile, new Date().toISOString());
    }
  });
  (Array.isArray(signalHistory) ? signalHistory : [])
    .forEach((row) => pushProfile(row?.userId, row?.clientProfile || row?.meta?.clientProfile, row?.createdAt));
  (Array.isArray(sessions) ? sessions : [])
    .forEach((row) => pushProfile(row?.userId, row?.clientProfile, row?.lastSeenAt || row?.startedAt));

  const emulatorUsers = Array.from(profileFlagsByUser.entries())
    .filter(([, row]) => row.emulator)
    .map(([userId]) => userId);
  if (emulatorUsers.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'emulator',
      category: 'technical',
      score: Math.min(18, DETAIL_SCORES.emulator + emulatorUsers.length * 2),
      summary: 'У части аккаунтов замечены признаки эмулятора',
      count: emulatorUsers.length,
      matchedUserIds: emulatorUsers,
      firstSeenAt: null,
      lastSeenAt: sortByDate(
        (Array.isArray(signalHistory) ? signalHistory : [])
          .filter((row) => emulatorUsers.includes(cleanText(row?.userId))),
        'createdAt'
      ).slice(-1)[0]?.createdAt || null,
      details: {
        users: emulatorUsers.map((userId) => ({
          userId,
          samples: profileFlagsByUser.get(userId)?.profileSamples?.slice(0, 5) || [],
        })),
      },
    }));
  }

  const webdriverUsers = Array.from(profileFlagsByUser.entries())
    .filter(([, row]) => row.webdriver || row.headless)
    .map(([userId]) => userId);
  if (webdriverUsers.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'webdriver',
      category: 'technical',
      score: Math.min(20, DETAIL_SCORES.webdriver + webdriverUsers.length * 2),
      summary: 'У части аккаунтов замечены признаки автоматизированного браузера',
      count: webdriverUsers.length,
      matchedUserIds: webdriverUsers,
      details: {
        users: webdriverUsers.map((userId) => ({
          userId,
          samples: profileFlagsByUser.get(userId)?.profileSamples?.slice(0, 5) || [],
        })),
      },
    }));
  }

  const networkRiskDetails = [];
  (Array.isArray(signalHistory) ? signalHistory : []).forEach((row) => {
    const intel = toPlainObject(row?.ipIntel);
    const flags = buildNetworkFlags(intel);
    if (!flags.length) return;
    networkRiskDetails.push({
      userId: cleanText(row?.userId),
      ip: cleanText(row?.ip),
      flags,
      happenedAt: row?.createdAt || null,
    });
  });
  if (currentSignals.ip && isAnonymousIntel(currentSignals.ipIntel)) {
    networkRiskDetails.push({
      userId: currentUserId,
      ip: cleanText(currentSignals.ip),
      flags: buildNetworkFlags(currentSignals.ipIntel),
      happenedAt: new Date().toISOString(),
    });
  }
  if (networkRiskDetails.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'network_risk',
      category: 'network',
      score: Math.min(24, DETAIL_SCORES.network_risk + networkRiskDetails.length),
      summary: 'Группа заходила через VPN, TOR, прокси или серверную сеть',
      count: networkRiskDetails.length,
      matchedUserIds: uniq(networkRiskDetails.map((row) => row.userId)),
      firstSeenAt: sortByDate(networkRiskDetails, 'happenedAt')[0]?.happenedAt || null,
      lastSeenAt: sortByDate(networkRiskDetails, 'happenedAt').slice(-1)[0]?.happenedAt || null,
      details: { entries: networkRiskDetails.slice(0, 20) },
    }));
  }

  if (emulatorUsers.length && networkRiskDetails.length) {
    appendDetailedEvidence(evidence, buildEvidenceEntry({
      signal: 'emulator_network_combo',
      category: 'network',
      score: DETAIL_SCORES.emulator_network_combo,
      summary: 'Есть сочетание эмулятора и анонимной сети',
      count: 1,
      matchedUserIds: uniq([...emulatorUsers, ...networkRiskDetails.map((row) => row.userId)]),
    }));
  }

  return evidence;
}

module.exports = {
  appendProfileNetworkEvidence,
};
