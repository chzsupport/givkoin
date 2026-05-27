const { getSupabaseClient: defaultGetSupabaseClient } = require('../../lib/supabaseClient');
const { safeMs } = require('./nightShiftRuntimeConfig');
const { normalizeSuspiciousWindows } = require('./nightShiftReports');
const {
  listRuntimeSessionsByFilters: defaultListRuntimeSessionsByFilters,
} = require('./nightShiftRuntimeStore');

async function loadUserMap(userIds, getSupabaseClient) {
  const userMap = new Map();
  if (!userIds.length) return userMap;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname')
    .in('id', userIds);
  if (!error && Array.isArray(data)) {
    data.forEach((row) => {
      userMap.set(String(row.id), {
        nickname: row.nickname || 'Unknown',
        email: row.email || 'Unknown',
      });
    });
  }

  return userMap;
}

function createNightShiftAdminSnapshot({
  getSupabaseClient = defaultGetSupabaseClient,
  listRuntimeSessionsByFilters = defaultListRuntimeSessionsByFilters,
} = {}) {
  async function getAdminSnapshot({ recentLimit = 100 } = {}) {
    const [activeRows, recentRows, suspiciousRows] = await Promise.all([
      listRuntimeSessionsByFilters({ status: 'active', limit: 500 }),
      listRuntimeSessionsByFilters({ status: 'ended', limit: Math.max(100, Math.min(500, Number(recentLimit) || 100)) }),
      listRuntimeSessionsByFilters({ reviewStatus: 'pending', limit: 200 }),
    ]);
    const userIds = Array.from(new Set([
      ...activeRows.map((row) => String(row.userId || '')),
      ...recentRows.map((row) => String(row.userId || '')),
      ...suspiciousRows.map((row) => String(row.userId || '')),
    ].filter(Boolean)));
    const userMap = await loadUserMap(userIds, getSupabaseClient);

    const active = activeRows
      .sort((left, right) => (safeMs(right.startedAt) || 0) - (safeMs(left.startedAt) || 0))
      .map((row) => {
        const user = userMap.get(String(row.userId)) || {};
        return {
          userId: String(row.userId),
          nickname: user.nickname || 'Unknown',
          email: user.email || 'Unknown',
          sessionId: row.sessionId,
          startedAt: row.startedAt,
          lastSeenAt: row.lastSeenAt || row.lastHeartbeatAt || null,
          totalAnomalies: Math.max(0, Math.floor(Number(row.totalAcceptedAnomalies) || 0)),
        };
      });

    const recentShifts = recentRows
      .sort((left, right) => (safeMs(right.endedAt || right.finalReport?.endedAt) || 0) - (safeMs(left.endedAt || left.finalReport?.endedAt) || 0))
      .slice(0, Math.max(1, Math.min(500, Number(recentLimit) || 100)))
      .map((row) => {
        const user = userMap.get(String(row.userId)) || {};
        const reward = row.reward || { k: 0, lm: 0, stars: 0 };
        return {
          userId: String(row.userId),
          nickname: user.nickname || 'Unknown',
          email: user.email || 'Unknown',
          sessionId: row.sessionId,
          startedAt: row.startedAt || row.finalReport?.startedAt || null,
          endedAt: row.endedAt || row.finalReport?.endedAt || null,
          totalDurationSeconds: Math.max(0, Math.floor(Number(row.finalReport?.totalDurationSeconds) || 0)),
          anomaliesCleared: Math.max(0, Math.floor(Number(row.totalAcceptedAnomalies) || 0)),
          payableHours: Math.max(0, Math.floor(Number(row.payableHours) || 0)),
          reward,
          settlementStatus: row.settlementStatus || 'none',
          closeReason: row.closeReason || null,
          reviewStatus: row.reviewStatus || 'clean',
        };
      });

    const suspicious = suspiciousRows
      .filter((row) => row.status !== 'active' && row.reviewStatus === 'pending')
      .sort((left, right) => (safeMs(right.endedAt || right.finalReport?.endedAt) || 0) - (safeMs(left.endedAt || left.finalReport?.endedAt) || 0))
      .slice(0, 200)
      .map((row) => {
        const user = userMap.get(String(row.userId)) || {};
        const latestMismatch = Array.isArray(row.suspiciousWindows) && row.suspiciousWindows.length
          ? row.suspiciousWindows[row.suspiciousWindows.length - 1]
          : null;
        return {
          userId: String(row.userId),
          nickname: user.nickname || 'Unknown',
          email: user.email || 'Unknown',
          sessionId: row.sessionId,
          startedAt: row.startedAt || row.finalReport?.startedAt || null,
          endedAt: row.endedAt || row.finalReport?.endedAt || null,
          closeReason: row.closeReason || null,
          reward: row.reward || { k: 0, lm: 0, stars: 0 },
          payableHours: Math.max(0, Math.floor(Number(row.payableHours) || 0)),
          totalDurationSeconds: Math.max(0, Math.floor(Number(row.finalReport?.totalDurationSeconds) || 0)),
          totalAcceptedAnomalies: Math.max(0, Math.floor(Number(row.totalAcceptedAnomalies) || 0)),
          totalReportedAnomalies: Math.max(0, Math.floor(Number(row.totalReportedAnomalies) || 0)),
          mismatchCount: Array.isArray(row.suspiciousWindows) ? row.suspiciousWindows.length : 0,
          latestMismatch,
          suspiciousWindows: normalizeSuspiciousWindows(row.suspiciousWindows),
        };
      });

    return { active, recentShifts, suspicious };
  }

  return {
    getAdminSnapshot,
  };
}

const defaultSnapshot = createNightShiftAdminSnapshot();

module.exports = {
  createNightShiftAdminSnapshot,
  getAdminSnapshot: defaultSnapshot.getAdminSnapshot,
  loadUserMap,
};
