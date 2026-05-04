const friendService = require('./friendService');
const scService = require('./scService');
const { recordActivity } = require('./activityService');
const { grantAchievement } = require('./achievementService');
const { getSupabaseClient } = require('../lib/supabaseClient');

function toId(value, depth = 0) {
  if (depth > 3) return '';
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'object') {
    if (value._id != null) return toId(value._id, depth + 1);
    if (value.id != null) return toId(value.id, depth + 1);
    if (value.value != null) return toId(value.value, depth + 1);
    if (typeof value.toString === 'function') {
      const s = value.toString();
      if (s && s !== '[object Object]') return s;
    }
  }
  return '';
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

function mapChatRow(row) {
  if (!row) return null;
  return {
    _id: row.id,
    participants: Array.isArray(row.participants) ? row.participants : [],
    status: row.status,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    endedAt: row.ended_at ? new Date(row.ended_at) : null,
    duration: Number(row.duration || 0),
  };
}

async function getChatById(chatId) {
  const id = toId(chatId);
  if (!id) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('id', String(id))
    .maybeSingle();
  if (error) return null;
  return mapChatRow(data);
}

async function getUserRowById(userId) {
  const id = toId(userId);
  if (!id) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,language,data')
    .eq('id', String(id))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function updateUserDataById(userId, patch) {
  const id = toId(userId);
  if (!id || !patch || typeof patch !== 'object') return null;
  const row = await getUserRowById(id);
  if (!row) return null;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const existing = getUserData(row);
  const next = { ...existing, ...patch };
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: nowIso })
    .eq('id', String(id))
    .select('id,data,email,nickname,language')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function computeDurationSeconds({ startedAt, endedAt = new Date(), reportedTotalDurationSeconds = null }) {
  const startedAtMs = new Date(startedAt || Date.now()).getTime();
  const endedAtMs = new Date(endedAt || Date.now()).getTime();
  const maxSeconds = Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000));
  const reported = Number(reportedTotalDurationSeconds);
  if (!Number.isFinite(reported) || reported < 0) {
    return maxSeconds;
  }
  return Math.min(Math.max(0, Math.floor(reported)), maxSeconds + 5);
}

function computeChatDurationSeconds({
  startedAt,
  endedAt = new Date(),
  reportedTotalDurationSeconds = null,
  waitingSince = null,
}) {
  const rawStartedAtMs = new Date(startedAt || Date.now()).getTime();
  const rawEndedAtMs = new Date(endedAt || Date.now()).getTime();
  const startedAtMs = Number.isFinite(rawStartedAtMs) ? rawStartedAtMs : Date.now();
  const endedAtMs = Number.isFinite(rawEndedAtMs) ? rawEndedAtMs : Date.now();
  const waitingSinceMs = waitingSince ? new Date(waitingSince).getTime() : 0;
  const effectiveEndedAtMs = Number.isFinite(waitingSinceMs) && waitingSinceMs > startedAtMs
    ? Math.min(endedAtMs, waitingSinceMs)
    : endedAtMs;
  const maxSeconds = Math.max(0, Math.floor((effectiveEndedAtMs - startedAtMs) / 1000));
  const reported = Number(reportedTotalDurationSeconds);
  if (!Number.isFinite(reported) || reported < 0) {
    return maxSeconds;
  }
  return Math.min(Math.max(0, Math.floor(reported)), maxSeconds);
}

async function processChatAchievements(uid, pid, mins) {
  try {
    const row = await getUserRowById(uid);
    if (!row) return;
    const data = getUserData(row);
    const stats = data.achievementStats && typeof data.achievementStats === 'object' ? data.achievementStats : {};
    const newTotalMin = (Number(stats.totalChatMinutes) || 0) + mins;
    const nextStats = { ...stats, totalChatMinutes: newTotalMin };

    const chatHistory = Array.isArray(data.chatHistory) ? data.chatHistory : [];
    const pidStr = String(pid);
    const nextChatHistory = [...chatHistory];
    const idx = nextChatHistory.findIndex((entry) => String(entry?.partnerId) === pidStr);
    const nowIso = new Date().toISOString();
    if (idx >= 0) {
      const prev = nextChatHistory[idx] || {};
      nextChatHistory[idx] = {
        ...prev,
        partnerId: prev.partnerId ?? pidStr,
        lastChatAt: nowIso,
        totalTimeMinutes: (Number(prev.totalTimeMinutes) || 0) + mins,
      };
    } else {
      nextChatHistory.push({ partnerId: pidStr, lastChatAt: nowIso, totalTimeMinutes: mins });
    }
    const histEntry = idx >= 0 ? nextChatHistory[idx] : nextChatHistory[nextChatHistory.length - 1];

    await updateUserDataById(uid, { achievementStats: nextStats, chatHistory: nextChatHistory });

    if (newTotalMin >= 3000) {
      await grantAchievement({ userId: uid, achievementId: 11 });
    }
    if (newTotalMin >= 6000) {
      await grantAchievement({ userId: uid, achievementId: 41 });
    }
    if ((Number(histEntry?.totalTimeMinutes) || 0) >= 600) {
      await grantAchievement({ userId: uid, achievementId: 78 });
    }
    if (newTotalMin >= 600 && (Number(nextStats.totalBattlesParticipated) || 0) >= 2 && (Number(nextStats.totalBridgeStones) || 0) >= 20) {
      await grantAchievement({ userId: uid, achievementId: 92 });
    }
  } catch (error) {
    console.error('Chat achievement processing error:', error);
  }
}

async function applyChatCompletionEffects({ chatId, durationSeconds, leftEarlyUserId = null, isFriendsSnapshot = null }) {
  const chat = await getChatById(chatId);
  if (!chat || !Array.isArray(chat.participants) || chat.participants.length < 2) {
    return { participants: [], isFriends: false, durationMinutes: 0 };
  }

  const [a, b] = chat.participants.map((value) => String(value));
  const isFriends = typeof isFriendsSnapshot === 'boolean'
    ? isFriendsSnapshot
    : await friendService.areUsersFriends(a, b).catch(() => false);

  try {
    await scService.awardChatRewardsForChat(chatId);
  } catch (error) {
    console.error('Error awarding chat K:', error);
  }

  const durationMinutes = Math.max(1, Math.round((Number(durationSeconds) || 0) / 60));

  await Promise.all([
    processChatAchievements(a, b, durationMinutes),
    processChatAchievements(b, a, durationMinutes),
  ]);

  Promise.all([
    recordActivity({
      userId: a,
      type: 'chat_session',
      minutes: durationMinutes,
      meta: { chatId, durationSeconds, leftEarly: Number(durationSeconds) < 300 },
    }).catch(() => { }),
    recordActivity({
      userId: b,
      type: 'chat_session',
      minutes: durationMinutes,
      meta: { chatId, durationSeconds, leftEarly: Number(durationSeconds) < 300 },
    }).catch(() => { }),
  ]).catch(() => { });

  if (leftEarlyUserId && Number(durationSeconds) < 300 && !isFriends) {
    recordActivity({
      userId: String(leftEarlyUserId),
      type: 'chat_left_early',
      minutes: 1,
      meta: { chatId, durationSeconds },
    }).catch(() => { });
  }

  return {
    participants: [a, b],
    isFriends,
    durationMinutes,
  };
}

module.exports = {
  applyChatCompletionEffects,
  computeChatDurationSeconds,
  computeDurationSeconds,
};

