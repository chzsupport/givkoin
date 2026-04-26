const crypto = require('crypto');
const { awardRadianceForActivity } = require('./activityRadianceService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { getDocById, listDocsByModel, toIso, upsertDoc } = require('./documentStore');

const SESSION_MODEL = 'CollectiveMeditationSessionSnapshot';
const QUEUE_MODEL = 'CollectiveMeditationQueueEntry';
const PARTICIPATION_MODEL = 'CollectiveMeditationParticipation';
const INDIVIDUAL_SESSION_MODEL = 'IndividualMeditationSession';
const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

const SETTLEMENT_DELAY_MIN_MS = 60 * 1000;
const SETTLEMENT_DELAY_MAX_MS = 3 * 60 * 1000;
const GROUP_RADIANCE_SECONDS_STEP = 300;
const GROUP_RADIANCE_AMOUNT = 30;
const INDIVIDUAL_DAILY_LIMIT = 100;
const SPIRITUAL_MEDITATION_MIN_SECONDS = 10;
const SPIRITUAL_MEDITATION_COUNT_FIELD = 'spiritualGroupMeditationsCount';
const SPIRITUAL_MEDITATION_ACHIEVEMENTS = Array.from({ length: 25 }, (_, index) => ({
  achievementId: 101 + index,
  requiredMeditations: (index + 1) * 10,
}));

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function safeMs(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function generateId(prefix) {
  if (typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function mapListedDoc(row) {
  if (!row) return null;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return {
    _id: row.id ? String(row.id) : '',
    ...data,
    createdAt: row.createdAt || data.createdAt || null,
    updatedAt: row.updatedAt || data.updatedAt || null,
  };
}

async function listModelDocsRaw(model, { limit = 5000 } = {}) {
  const supabase = getSupabaseClient();
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 5000));
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,model,data,created_at,updated_at')
    .eq('model', String(model))
    .order('created_at', { ascending: false })
    .limit(safeLimit);
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => ({
    id: String(row.id),
    data: row.data && typeof row.data === 'object' ? row.data : {},
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  }));
}

function buildSessionDocId(sessionId) {
  return `collective_meditation_session:${String(sessionId)}`;
}

function buildQueueDocId(sessionId, userId) {
  return `collective_meditation_queue:${String(sessionId)}:${String(userId)}`;
}

function buildParticipationDocId(sessionId, userId) {
  return `collective_meditation_participation:${String(sessionId)}:${String(userId)}`;
}

function buildIndividualSessionDocId(userId, clientSessionId) {
  return `individual_meditation_session:${String(userId)}:${String(clientSessionId)}`;
}

function buildSettlementDueAt(endsAt) {
  const endsAtMs = safeMs(endsAt) || Date.now();
  const spread = SETTLEMENT_DELAY_MAX_MS - SETTLEMENT_DELAY_MIN_MS;
  const delay = SETTLEMENT_DELAY_MIN_MS + Math.floor(Math.random() * (spread + 1));
  return new Date(endsAtMs + delay).toISOString();
}

function normalizeSessionSnapshot(session) {
  if (!session || !session.id) return null;
  const startsAtMs = safeMs(session.startsAt);
  const endsAtMs = safeMs(session.endsAt);
  if (startsAtMs == null || endsAtMs == null) return null;
  return {
    id: String(session.id),
    startsAt: startsAtMs,
    endsAt: endsAtMs,
    durationMs: Math.max(0, endsAtMs - startsAtMs),
    phase1Min: Number(session.phase1Min) || 0,
    phase2Min: Number(session.phase2Min) || 0,
    rounds: Math.max(1, Number(session.rounds) || 1),
    weText: typeof session.weText === 'string' ? session.weText : '',
  };
}

function computeCollectiveRadiance(totalSeconds) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  return safeSeconds >= 0 ? GROUP_RADIANCE_AMOUNT : 0;
}

function computeSessionRadiance(_session) {
  return GROUP_RADIANCE_AMOUNT;
}

function computeEffectiveMeditationSeconds(session, participation) {
  const sessionDurationSeconds = Math.max(0, Math.floor((Number(session?.durationMs) || 0) / 1000));
  const joinedAtMs = safeMs(participation?.joinedAt) ?? safeMs(session?.startsAt) ?? Date.now();
  const finishedAtMs = safeMs(participation?.finishedAt);
  const endsAtMs = safeMs(session?.endsAt) ?? joinedAtMs;
  const effectiveEndMs = finishedAtMs == null ? endsAtMs : Math.min(finishedAtMs, endsAtMs);
  return Math.max(0, Math.min(sessionDurationSeconds, Math.floor((effectiveEndMs - joinedAtMs) / 1000)));
}

function round1(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

function getSpiritualMeditationAchievementIds(previousCount, nextCount) {
  const safePrevious = Math.max(0, Number(previousCount) || 0);
  const safeNext = Math.max(0, Number(nextCount) || 0);
  if (safeNext <= safePrevious) return [];
  return SPIRITUAL_MEDITATION_ACHIEVEMENTS
    .filter((row) => safePrevious < row.requiredMeditations && safeNext >= row.requiredMeditations)
    .map((row) => row.achievementId);
}

async function getUserRowById(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,data')
    .eq('id', String(userId))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function updateUserDataById(userId, patch) {
  if (!userId || !patch || typeof patch !== 'object') return null;
  const row = await getUserRowById(userId);
  if (!row) return null;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const existing = getUserData(row);
  const next = { ...existing, ...patch };
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: nowIso })
    .eq('id', String(userId))
    .select('id,data')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function getUsersMapByIds(userIds = []) {
  const uniqueIds = Array.from(new Set((Array.isArray(userIds) ? userIds : []).map((value) => String(value || '').trim()).filter(Boolean)));
  const userMap = new Map();
  if (!uniqueIds.length) return userMap;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,nickname,email')
    .in('id', uniqueIds);

  if (error || !Array.isArray(data)) return userMap;

  for (const row of data) {
    if (!row?.id) continue;
    userMap.set(String(row.id), {
      nickname: row.nickname || 'Без имени',
      email: row.email || '',
    });
  }

  return userMap;
}

async function getSessionSnapshot(sessionId) {
  return getDocById(buildSessionDocId(sessionId));
}

async function listSessionSnapshots() {
  return listDocsByModel(SESSION_MODEL, { limit: 500 });
}

async function ensureSessionSnapshot(session) {
  const normalized = normalizeSessionSnapshot(session);
  if (!normalized) return null;
  const existing = await getSessionSnapshot(normalized.id);
  if (existing) return existing;
  return upsertDoc({
    id: buildSessionDocId(normalized.id),
    model: SESSION_MODEL,
    data: {
      ...normalized,
      settlementDueAt: buildSettlementDueAt(normalized.endsAt),
      finalizedAt: null,
    },
  });
}

async function listQueueEntries(sessionId) {
  const safeSessionId = String(sessionId || '').trim();
  if (!safeSessionId) return [];
  const rows = await listModelDocsRaw(QUEUE_MODEL, { limit: 5000 });
  return rows
    .map(mapListedDoc)
    .filter(Boolean)
    .filter((row) => String(row.sessionId || '').trim() === safeSessionId)
    .sort((a, b) => (safeMs(a.queuedAt) || 0) - (safeMs(b.queuedAt) || 0));
}

async function getQueueEntry(sessionId, userId) {
  return getDocById(buildQueueDocId(sessionId, userId));
}

async function optInParticipant({ session, userId, now = new Date() }) {
  const snapshot = await ensureSessionSnapshot(session);
  if (!snapshot) throw new Error('collective_session_unavailable');
  if (Date.now() >= Number(snapshot.startsAt || 0)) {
    throw new Error('collective_session_already_started');
  }
  return upsertDoc({
    id: buildQueueDocId(snapshot.id, userId),
    model: QUEUE_MODEL,
    data: {
      user: String(userId),
      sessionId: snapshot.id,
      queuedAt: toIso(now),
      removedAt: null,
    },
    createdAt: now,
    updatedAt: now,
  });
}

async function optOutParticipant({ sessionId, userId, now = new Date() }) {
  const existing = await getQueueEntry(sessionId, userId);
  if (!existing) return null;
  return upsertDoc({
    id: buildQueueDocId(sessionId, userId),
    model: QUEUE_MODEL,
    data: {
      ...existing,
      removedAt: toIso(now),
    },
    createdAt: existing.createdAt || now,
    updatedAt: now,
  });
}

async function getParticipation(sessionId, userId) {
  return getDocById(buildParticipationDocId(sessionId, userId));
}

async function listSessionParticipations(sessionId) {
  const safeSessionId = String(sessionId || '').trim();
  if (!safeSessionId) return [];
  const rows = await listModelDocsRaw(PARTICIPATION_MODEL, { limit: 5000 });
  return rows
    .map(mapListedDoc)
    .filter(Boolean)
    .filter((row) => String(row.sessionId || '').trim() === safeSessionId)
    .sort((a, b) => (safeMs(a.joinedAt) || 0) - (safeMs(b.joinedAt) || 0));
}

async function joinCollectiveSession({ session, userId, now = new Date() }) {
  const snapshot = await ensureSessionSnapshot(session);
  if (!snapshot) throw new Error('collective_session_unavailable');
  const nowMs = now.getTime();
  if (nowMs < Number(snapshot.startsAt || 0)) {
    throw new Error('collective_session_not_started');
  }
  const existing = await getParticipation(snapshot.id, userId);
  if (existing) return existing;
  return upsertDoc({
    id: buildParticipationDocId(snapshot.id, userId),
    model: PARTICIPATION_MODEL,
    data: {
      user: String(userId),
      sessionId: snapshot.id,
      joinedAt: toIso(now),
      finishedAt: null,
      finishReason: null,
      reportedDurationSeconds: null,
      grantedRadiance: 0,
      effectiveDurationSeconds: 0,
      settledAt: null,
      spiritualEligible: true,
      spiritualQualified: false,
      spiritualCounted: false,
      spiritualCountedAt: null,
      spiritualAchievementIdsAwarded: [],
    },
    createdAt: now,
    updatedAt: now,
  });
}

async function recordCollectiveParticipation({
  sessionId,
  userId,
  now = new Date(),
}) {
  const existing = await getParticipation(sessionId, userId);
  if (!existing) throw new Error('collective_not_joined');
  return {
    ok: true,
    compatibility: true,
    sessionId: String(sessionId),
    userId: String(userId),
    lastSeenAt: toIso(now),
  };
}

async function finishCollectiveSession({ sessionId, userId, reason = 'completed', now = new Date() }) {
  const existing = await getParticipation(sessionId, userId);
  if (!existing) throw new Error('collective_not_joined');

  const safeReason = reason === 'left_early' ? 'left_early' : 'completed';

  return upsertDoc({
    id: buildParticipationDocId(sessionId, userId),
    model: PARTICIPATION_MODEL,
    data: {
      ...existing,
      finishedAt: existing.finishedAt || toIso(now),
      finishReason: existing.finishReason || safeReason,
      reportedDurationSeconds: existing.reportedDurationSeconds ?? null,
    },
    createdAt: existing.createdAt || now,
    updatedAt: now,
  });
}

async function getParticipantState(sessionId, userId) {
  const [queueEntry, participation] = await Promise.all([
    getQueueEntry(sessionId, userId),
    getParticipation(sessionId, userId),
  ]);
  return {
    queueEntry,
    participation,
  };
}

async function listQueueParticipants(sessionId) {
  const rows = await listQueueEntries(sessionId);
  return rows.filter((row) => !row.removedAt);
}

async function recordCollectiveHeartbeat({ sessionId, userId }) {
  return {
    ok: true,
    sessionId: String(sessionId),
    userId: String(userId),
    compatibility: true,
  };
}

function getSyncConfig() {
  return {
    slotCount: 0,
    intervalSeconds: 0,
  };
}

async function settleIndividualMeditation({ userId, clientSessionId, completedBreaths, now = new Date() }) {
  const safeSessionId = String(clientSessionId || '').trim();
  if (!safeSessionId) {
    throw new Error('invalid_client_session');
  }

  const safeCompleted = clampInt(completedBreaths, 0, 100000, 0);
  const docId = buildIndividualSessionDocId(userId, safeSessionId);
  const existing = await getDocById(docId);
  const previouslySettled = Math.max(0, Number(existing?.settledBreaths) || 0);
  const countedBreaths = Math.max(0, safeCompleted - previouslySettled);

  let result = { ok: true, granted: 0, remainingDaily: INDIVIDUAL_DAILY_LIMIT };
  if (countedBreaths > 0) {
    result = await awardRadianceForActivity({
      userId,
      activityType: 'meditation_individual',
      units: countedBreaths,
      meta: { clientSessionId: safeSessionId, completedBreaths: safeCompleted },
      dedupeKey: `meditation_individual_session:${String(userId)}:${safeSessionId}:${safeCompleted}`,
    });
  }

  const grantedRadiance = Math.max(0, Number(result?.granted || result?.amount || 0));
  const nextTotalGranted = Math.max(0, Number(existing?.grantedRadiance) || 0) + grantedRadiance;

  await upsertDoc({
    id: docId,
    model: INDIVIDUAL_SESSION_MODEL,
    data: {
      user: String(userId),
      clientSessionId: safeSessionId,
      settledBreaths: safeCompleted,
      grantedRadiance: nextTotalGranted,
      lastSettledAt: toIso(now),
    },
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });

  return {
    countedBreaths,
    grantedRadiance,
    remainingDaily: Math.max(0, INDIVIDUAL_DAILY_LIMIT - nextTotalGranted),
  };
}

async function finalizeDueCollectiveSessions({ now = new Date() } = {}) {
  const rows = await listSessionSnapshots();
  const nowMs = Number(now instanceof Date ? now.getTime() : Date.now());
  let finalizedSessions = 0;
  let settledParticipants = 0;

  for (const session of rows) {
    if (session.finalizedAt) continue;
    const settlementDueAtMs = safeMs(session.settlementDueAt);
    if (settlementDueAtMs == null || nowMs < settlementDueAtMs) continue;

    const participants = await listSessionParticipations(session.id);

    for (const participant of participants) {
      const effectiveDurationSeconds = computeEffectiveMeditationSeconds(session, participant);
      const targetRadiance = computeSessionRadiance(session);
      const alreadyGranted = Math.max(0, Number(participant.grantedRadiance) || 0);
      const remainingRadiance = Math.max(0, targetRadiance - alreadyGranted);
      const spiritualEligible = participant.spiritualEligible === true;
      const spiritualQualified = spiritualEligible && effectiveDurationSeconds >= SPIRITUAL_MEDITATION_MIN_SECONDS;
      const spiritualAlreadyCounted = participant.spiritualCounted === true;

      let grantedRadiance = 0;
      if (remainingRadiance > 0) {
        // eslint-disable-next-line no-await-in-loop
        const award = await awardRadianceForActivity({
          userId: participant.user,
          activityType: 'meditation_group',
          units: 1,
          meta: {
            sessionId: session.id,
            meditations: 1,
            sessionDurationSeconds: Math.floor(Math.max(0, Number(session.durationMs) || 0) / 1000),
            finishReason: participant.finishReason || 'completed',
          },
          dedupeKey: `meditation_group:session:${String(participant.user)}:${String(session.id)}`,
        });
        grantedRadiance = Math.max(0, Number(award?.granted || award?.amount || 0));
      }

      const userRow = await getUserRowById(participant.user);
      let spiritualCountedNow = false;
      let newSpiritualAchievementIds = [];
      let spiritualAchievementIdsAwarded = Array.isArray(participant.spiritualAchievementIdsAwarded)
        ? participant.spiritualAchievementIdsAwarded.map((value) => Number(value)).filter((value) => Number.isFinite(value))
        : [];
      if (userRow) {
        const data = getUserData(userRow);
        const stats = data.achievementStats && typeof data.achievementStats === 'object' ? data.achievementStats : {};
        const nextAchievementStats = {
          ...stats,
          totalGroupMeditations: (Number(stats.totalGroupMeditations) || 0) + 1,
          totalGroupMeditationSeconds: (Number(stats.totalGroupMeditationSeconds) || 0) + effectiveDurationSeconds,
          lastGroupMeditationAt: toIso(now),
        };

        if (spiritualQualified && !spiritualAlreadyCounted) {
          const previousSpiritualCount = Math.max(0, Number(stats[SPIRITUAL_MEDITATION_COUNT_FIELD]) || 0);
          const nextSpiritualCount = previousSpiritualCount + 1;
          nextAchievementStats[SPIRITUAL_MEDITATION_COUNT_FIELD] = nextSpiritualCount;
          spiritualCountedNow = true;
          newSpiritualAchievementIds = getSpiritualMeditationAchievementIds(previousSpiritualCount, nextSpiritualCount);
          spiritualAchievementIdsAwarded = Array.from(new Set([
            ...spiritualAchievementIdsAwarded,
            ...newSpiritualAchievementIds,
          ]));
        }

        await updateUserDataById(participant.user, {
          achievementStats: nextAchievementStats,
        });

        if (spiritualCountedNow && newSpiritualAchievementIds.length > 0) {
          const { grantAchievement } = require('./achievementService');
          for (const achievementId of newSpiritualAchievementIds) {
            // eslint-disable-next-line no-await-in-loop
            await grantAchievement({
              userId: participant.user,
              achievementId,
              meta: {
                source: 'collective_meditation_spiritual',
                sessionId: session.id,
                effectiveDurationSeconds,
              },
              earnedAt: now,
            });
          }
        }
      }

      await upsertDoc({
        id: buildParticipationDocId(session.id, participant.user),
        model: PARTICIPATION_MODEL,
        data: {
          ...participant,
          grantedRadiance: alreadyGranted + grantedRadiance,
          effectiveDurationSeconds,
          settledAt: toIso(now),
          spiritualQualified: participant.spiritualQualified === true || spiritualQualified,
          spiritualCounted: spiritualAlreadyCounted || spiritualCountedNow,
          spiritualCountedAt: participant.spiritualCountedAt || (spiritualCountedNow ? toIso(now) : null),
          spiritualAchievementIdsAwarded,
        },
        createdAt: participant.createdAt || now,
        updatedAt: now,
      });
      settledParticipants += 1;
    }

    await upsertDoc({
      id: buildSessionDocId(session.id),
      model: SESSION_MODEL,
      data: {
        ...session,
        finalizedAt: toIso(now),
      },
      createdAt: session.createdAt || now,
      updatedAt: now,
    });
    finalizedSessions += 1;
  }

  return { finalizedSessions, settledParticipants };
}

async function getCollectiveMeditationAdminStats({ recentLimit = 12, topLimit = 10 } = {}) {
  const [sessionRows, participationRows] = await Promise.all([
    listModelDocsRaw(SESSION_MODEL, { limit: 5000 }),
    listModelDocsRaw(PARTICIPATION_MODEL, { limit: 5000 }),
  ]);

  const sessions = sessionRows
    .map(mapListedDoc)
    .filter(Boolean)
    .sort((left, right) => (safeMs(right.endsAt) || safeMs(right.startsAt) || 0) - (safeMs(left.endsAt) || safeMs(left.startsAt) || 0));

  const participations = participationRows
    .map(mapListedDoc)
    .filter(Boolean)
    .sort((left, right) => (safeMs(right.joinedAt) || 0) - (safeMs(left.joinedAt) || 0));

  const sessionStatsMap = new Map();
  const userStatsMap = new Map();

  for (const participant of participations) {
    const sessionId = String(participant.sessionId || '').trim();
    const userId = String(participant.user || '').trim();
    const grantedRadiance = Math.max(0, Number(participant.grantedRadiance) || 0);
    const joinedAtMs = safeMs(participant.joinedAt) || 0;

    if (sessionId) {
      const currentSession = sessionStatsMap.get(sessionId) || {
        participantsCount: 0,
        rewardedCount: 0,
        totalRadiance: 0,
      };
      currentSession.participantsCount += 1;
      currentSession.totalRadiance += grantedRadiance;
      if (participant.settledAt || grantedRadiance > 0) {
        currentSession.rewardedCount += 1;
      }
      sessionStatsMap.set(sessionId, currentSession);
    }

    if (userId) {
      const currentUser = userStatsMap.get(userId) || {
        meditations: 0,
        radiance: 0,
        lastJoinedAtMs: 0,
      };
      currentUser.meditations += 1;
      currentUser.radiance += grantedRadiance;
      currentUser.lastJoinedAtMs = Math.max(currentUser.lastJoinedAtMs, joinedAtMs);
      userStatsMap.set(userId, currentUser);
    }
  }

  const userMap = await getUsersMapByIds(Array.from(userStatsMap.keys()));
  const completedSessions = sessions.filter((session) => Boolean(session.finalizedAt));
  const totalParticipations = participations.length;
  const totalRadianceGranted = participations.reduce((sum, participant) => sum + Math.max(0, Number(participant.grantedRadiance) || 0), 0);
  const rewardedParticipations = participations.filter((participant) => participant.settledAt || (Number(participant.grantedRadiance) || 0) > 0).length;

  const recentSessions = completedSessions
    .slice(0, Math.max(1, Math.min(50, Number(recentLimit) || 12)))
    .map((session) => {
      const sessionId = String(session.id || '').trim();
      const stats = sessionStatsMap.get(sessionId) || {
        participantsCount: 0,
        rewardedCount: 0,
        totalRadiance: 0,
      };
      return {
        sessionId,
        startsAt: session.startsAt || null,
        endsAt: session.endsAt || null,
        finalizedAt: session.finalizedAt || null,
        durationMinutes: Math.max(0, Math.round((Number(session.durationMs) || 0) / 60000)),
        participantsCount: stats.participantsCount,
        rewardedCount: stats.rewardedCount,
        totalRadiance: stats.totalRadiance,
      };
    });

  const topParticipants = Array.from(userStatsMap.entries())
    .sort((left, right) => {
      if (right[1].meditations !== left[1].meditations) {
        return right[1].meditations - left[1].meditations;
      }
      return right[1].lastJoinedAtMs - left[1].lastJoinedAtMs;
    })
    .slice(0, Math.max(1, Math.min(20, Number(topLimit) || 10)))
    .map(([userId, stats]) => {
      const user = userMap.get(userId) || {};
      return {
        userId,
        nickname: user.nickname || 'Без имени',
        email: user.email || '',
        meditations: stats.meditations,
        radiance: stats.radiance,
        lastJoinedAt: stats.lastJoinedAtMs ? toIso(stats.lastJoinedAtMs) : null,
      };
    });

  return {
    summary: {
      completedSessions: completedSessions.length,
      totalParticipations,
      rewardedParticipations,
      totalRadianceGranted,
      averageParticipantsPerSession: completedSessions.length > 0
        ? round1(totalParticipations / completedSessions.length)
        : 0,
    },
    recentSessions,
    topParticipants,
  };
}

module.exports = {
  GROUP_RADIANCE_AMOUNT,
  GROUP_RADIANCE_SECONDS_STEP,
  INDIVIDUAL_DAILY_LIMIT,
  computeCollectiveRadiance,
  ensureSessionSnapshot,
  finalizeDueCollectiveSessions,
  finishCollectiveSession,
  getCollectiveMeditationAdminStats,
  getParticipantState,
  getParticipation,
  getSessionSnapshot,
  getSyncConfig,
  joinCollectiveSession,
  listQueueEntries,
  listQueueParticipants,
  listSessionParticipations,
  listSessionSnapshots,
  optInParticipant,
  optOutParticipant,
  recordCollectiveParticipation,
  recordCollectiveHeartbeat,
  settleIndividualMeditation,
};
