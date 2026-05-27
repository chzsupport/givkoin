const { getSupabaseClient } = require('../../lib/supabaseClient');
const {
  getRiskCaseSource,
  getSecurityFreeze,
  isPendingFrozenMultiAccountUser,
} = require('./freezeState');
const {
  appendRepairNote,
  buildSignalsFromUserState,
  sameStringArray,
  sanitizeStoredMultiAccountSignals,
} = require('./repairSignals');
const {
  FREEZE_SCORE_THRESHOLD,
  riskLevelByScore,
} = require('./riskDecision');
const {
  mergeUniqueStrings,
} = require('./riskSignals');
const {
  buildRiskSignals,
} = require('./riskCaseUpsert');
const {
  getUserData,
  normalizeUserRow,
  uniqueUsers,
} = require('./userRows');
const {
  pickLatestRiskCase,
} = require('./riskCaseDocuments');

const USER_SELECT = 'id,email,nickname,role,status,email_confirmed,access_restricted_until,access_restriction_reason,last_ip,last_device_id,last_fingerprint,data';

function cleanText(value) {
  return String(value || '').trim();
}

function createRiskCaseRepair({
  createRiskCase,
  getSupabaseClient: getClient = getSupabaseClient,
  listModelRiskCases,
  updateRiskCaseById,
  now = () => new Date(),
  pageSize = 500,
  riskSource = 'multi_account',
  frozenUserStatus = 'frozen',
  frozenRiskStatus = 'frozen',
} = {}) {
  async function listPendingFrozenGroups() {
    const pendingGroups = new Map();
    const safePageSize = Math.max(1, Math.min(5000, Number(pageSize) || 500));
    let from = 0;
    const supabase = getClient();

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase
        .from('users')
        .select(USER_SELECT)
        .eq('status', frozenUserStatus)
        .range(from, from + safePageSize - 1);
      const rows = !error && Array.isArray(data) ? data : [];
      if (!rows.length) break;

      rows
        .map(normalizeUserRow)
        .filter(Boolean)
        .forEach((user) => {
          if (!isPendingFrozenMultiAccountUser(user)) return;
          const groupId = cleanText(getSecurityFreeze(getUserData(user)).groupId);
          if (!groupId) return;
          if (!pendingGroups.has(groupId)) pendingGroups.set(groupId, []);
          pendingGroups.get(groupId).push(user);
        });

      if (rows.length < safePageSize) break;
      from += rows.length;
    }

    return pendingGroups;
  }

  async function repairPendingMultiAccountRiskCases() {
    const pendingGroups = await listPendingFrozenGroups();

    if (!pendingGroups.size) {
      return {
        groupsFound: 0,
        createdCases: 0,
        updatedCases: 0,
        restoredCases: 0,
      };
    }

    const allRiskCases = await listModelRiskCases();
    const riskCasesByUser = new Map();
    (Array.isArray(allRiskCases) ? allRiskCases : []).forEach((row) => {
      const userId = cleanText(row?.user);
      if (!userId) return;
      if (!riskCasesByUser.has(userId)) riskCasesByUser.set(userId, []);
      riskCasesByUser.get(userId).push(row);
    });

    let createdCases = 0;
    let updatedCases = 0;

    for (const [groupId, groupUsersRaw] of pendingGroups.entries()) {
      const groupUsers = uniqueUsers(groupUsersRaw).filter(Boolean);
      if (groupUsers.length < 2) continue;

      for (const user of groupUsers) {
        const userId = cleanText(user?._id);
        if (!userId) continue;
        const relatedUsers = groupUsers
          .filter((row) => cleanText(row?._id) !== userId)
          .map((row) => cleanText(row?._id));
        if (!relatedUsers.length) continue;

        const userCases = riskCasesByUser.get(userId) || [];
        const existingMultiAccountCase = pickLatestRiskCase(
          userCases,
          (row) => getRiskCaseSource(row) === riskSource
        );
        const fallbackCase = existingMultiAccountCase || pickLatestRiskCase(userCases);
        const currentSignals = buildSignalsFromUserState(user);
        const fallbackEvidence = Array.isArray(fallbackCase?.evidence) ? fallbackCase.evidence : [];
        const fallbackSignals = sanitizeStoredMultiAccountSignals(
          Array.isArray(fallbackCase?.signals) ? fallbackCase.signals : [],
          fallbackEvidence,
          user,
          groupUsers
        );
        const nextSignals = mergeUniqueStrings([
          ...fallbackSignals,
          ...buildRiskSignals(currentSignals, { reasons: [] }, groupUsers.length),
        ]);
        const fallbackScore = Math.max(Number(fallbackCase?.riskScore || 0), FREEZE_SCORE_THRESHOLD);
        const fallbackRiskLevel = riskLevelByScore(fallbackScore);
        const nowIso = now().toISOString();
        const repairTag = 'system_restored_pending_multi_account_case';
        const nextNotes = appendRepairNote(fallbackCase?.notes, repairTag, nowIso);
        const nextData = {
          ...(existingMultiAccountCase && typeof existingMultiAccountCase === 'object' ? existingMultiAccountCase : {}),
          user: userId,
          relatedUsers,
          riskScore: fallbackScore,
          riskLevel: fallbackRiskLevel,
          signals: nextSignals,
          status: frozenRiskStatus,
          notes: nextNotes,
          lastEvaluatedAt: nowIso,
          groupId,
          confidence: cleanText(existingMultiAccountCase?.confidence || fallbackCase?.confidence || 'high') || 'high',
          freezeStatus: 'frozen',
          evidence: fallbackEvidence,
          meta: {
            ...(fallbackCase?.meta && typeof fallbackCase.meta === 'object' ? fallbackCase.meta : {}),
            auto: true,
            source: riskSource,
            eventType: cleanText(fallbackCase?.meta?.eventType || 'session') || 'session',
            action: 'freeze',
            groupId,
            repairedFromFrozenGroup: true,
            repairedAt: nowIso,
            currentSignals: {
              ip: cleanText(currentSignals.ip),
              deviceId: cleanText(currentSignals.deviceId),
              fingerprint: cleanText(currentSignals.fingerprint),
              weakFingerprint: cleanText(currentSignals.weakFingerprint),
            },
            ipIntel: currentSignals.ipIntel && typeof currentSignals.ipIntel === 'object'
              ? currentSignals.ipIntel
              : (fallbackCase?.meta?.ipIntel && typeof fallbackCase.meta.ipIntel === 'object' ? fallbackCase.meta.ipIntel : null),
          },
        };

        const needsRepair = !existingMultiAccountCase
          || cleanText(existingMultiAccountCase?.freezeStatus) !== 'frozen'
          || cleanText(existingMultiAccountCase?.groupId) !== groupId
          || String(existingMultiAccountCase?.status || '') !== String(nextData.status || '')
          || !sameStringArray(existingMultiAccountCase?.relatedUsers, relatedUsers)
          || !sameStringArray(existingMultiAccountCase?.signals, nextSignals)
          || cleanText(getRiskCaseSource(existingMultiAccountCase)) !== riskSource;

        if (!needsRepair) continue;

        // eslint-disable-next-line no-await-in-loop
        const saved = existingMultiAccountCase
          ? await updateRiskCaseById(existingMultiAccountCase._id, nextData)
          : await createRiskCase(nextData);

        if (!saved) continue;
        if (existingMultiAccountCase) {
          updatedCases += 1;
        } else {
          createdCases += 1;
        }
      }
    }

    return {
      groupsFound: pendingGroups.size,
      createdCases,
      updatedCases,
      restoredCases: createdCases + updatedCases,
    };
  }

  return {
    listPendingFrozenGroups,
    repairPendingMultiAccountRiskCases,
  };
}

module.exports = {
  createRiskCaseRepair,
};
