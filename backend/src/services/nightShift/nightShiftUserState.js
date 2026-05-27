const { getSupabaseClient } = require('../../lib/supabaseClient');
const {
  ANOMALY_MAX_INTERVAL_SECONDS,
  ANOMALY_MIN_INTERVAL_SECONDS,
} = require('./nightShiftWindowPlan');
const {
  normalizeRuntimeSession,
} = require('./nightShiftRuntimeSession');

function toId(value, depth = 0) {
  if (depth > 3) return '';
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'object') {
    if (value._id != null) return toId(value._id, depth + 1);
    if (value.id != null) return toId(value.id, depth + 1);
    if (value.value != null) return toId(value.value, depth + 1);
  }
  return '';
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

function getNightShiftFromUserData(userData) {
  const ns = userData?.nightShift && typeof userData.nightShift === 'object' ? userData.nightShift : {};
  const stats = ns.stats && typeof ns.stats === 'object' ? ns.stats : {};
  const totalEarnings = stats.totalEarnings && typeof stats.totalEarnings === 'object' ? stats.totalEarnings : {};
  return {
    isServing: Boolean(ns.isServing),
    sessionId: ns.sessionId || null,
    startTime: ns.startTime || null,
    lastActivityAt: ns.lastActivityAt || null,
    pendingSettlement: ns.pendingSettlement || null,
    anomalySeed: Number(ns.anomalySeed) || 0,
    anomalyMinIntervalSeconds: Number(ns.anomalyMinIntervalSeconds) || ANOMALY_MIN_INTERVAL_SECONDS,
    anomalyMaxIntervalSeconds: Number(ns.anomalyMaxIntervalSeconds) || ANOMALY_MAX_INTERVAL_SECONDS,
    acceptedAnomaliesCurrentSession: Number(ns.acceptedAnomaliesCurrentSession) || 0,
    payableHoursCurrent: Number(ns.payableHoursCurrent) || 0,
    consecutiveEmptyWindows: Number(ns.consecutiveEmptyWindows) || 0,
    lastCloseReason: ns.lastCloseReason || null,
    lastJoinedShiftKey: ns.lastJoinedShiftKey || null,
    shiftKey: ns.shiftKey || null,
    shiftEndsAt: ns.shiftEndsAt || null,
    seatLimitSnapshot: Math.max(0, Math.floor(Number(ns.seatLimitSnapshot) || 0)),
    occupiedSeatsSnapshot: Math.max(0, Math.floor(Number(ns.occupiedSeatsSnapshot) || 0)),
    stats: {
      totalTimeMs: Number(stats.totalTimeMs) || 0,
      anomaliesCleared: Number(stats.anomaliesCleared) || 0,
      totalEarnings: {
        k: Number(totalEarnings.k) || 0,
        lm: Number(totalEarnings.lm) || 0,
        stars: Number(totalEarnings.stars) || 0,
      },
    },
  };
}

function mergeRuntimeIntoNightShift(baseNightShift, runtime) {
  const base = baseNightShift && typeof baseNightShift === 'object'
    ? baseNightShift
    : getNightShiftFromUserData({});

  const normalizedRuntime = normalizeRuntimeSession(runtime);
  if (!normalizedRuntime || normalizedRuntime.status !== 'active') {
    return base;
  }

  return {
    ...base,
    isServing: true,
    sessionId: normalizedRuntime.sessionId,
    startTime: normalizedRuntime.startedAt || base.startTime || null,
    lastActivityAt: normalizedRuntime.lastSeenAt || normalizedRuntime.lastHeartbeatAt || base.lastActivityAt || null,
    acceptedAnomaliesCurrentSession: normalizedRuntime.totalAcceptedAnomalies,
    payableHoursCurrent: normalizedRuntime.payableHours,
    consecutiveEmptyWindows: normalizedRuntime.consecutiveEmptyWindows,
    shiftKey: normalizedRuntime.shiftKey || base.shiftKey || null,
    shiftEndsAt: normalizedRuntime.shiftEndsAt || base.shiftEndsAt || null,
    seatLimitSnapshot: Math.max(0, Math.floor(Number(normalizedRuntime.seatLimitSnapshot) || 0)),
    occupiedSeatsSnapshot: Math.max(0, Math.floor(Number(normalizedRuntime.occupiedSeatsSnapshot) || 0)),
  };
}

function createNightShiftUserState({
  getSupabaseClient: getClient = getSupabaseClient,
  now = () => new Date(),
} = {}) {
  async function getUserRowById(userId) {
    const id = toId(userId);
    if (!id) return null;
    const supabase = getClient();
    const { data, error } = await supabase
      .from('users')
      .select('id,email,nickname,data')
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
    const existing = getUserData(row);
    const next = { ...existing, ...patch };
    const supabase = getClient();
    const nowIso = now().toISOString();
    const { data, error } = await supabase
      .from('users')
      .update({ data: next, updated_at: nowIso })
      .eq('id', String(id))
      .select('id,email,nickname,data')
      .maybeSingle();
    if (error) return null;
    return data || null;
  }

  return {
    getUserRowById,
    updateUserDataById,
  };
}

const {
  getUserRowById,
  updateUserDataById,
} = createNightShiftUserState();

module.exports = {
  createNightShiftUserState,
  getNightShiftFromUserData,
  getUserData,
  getUserRowById,
  mergeRuntimeIntoNightShift,
  toId,
  updateUserDataById,
};
