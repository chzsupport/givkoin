const {
  getShiftScheduleSnapshot,
} = require('./nightShift/nightShiftSchedule');
const {
  buildSessionDocId,
} = require('./nightShift/nightShiftDocuments');
const {
  getActiveRuntimeForUser,
  getRuntimeSession,
} = require('./nightShift/nightShiftRuntimeStore');
const {
  EMPTY_WINDOWS_LIMIT,
  HEARTBEAT_TIMEOUT_MS,
  HEARTBEAT_WINDOW_SECONDS,
  MAX_SHIFT_MS,
  MIN_ANOMALIES_PER_ACTIVE_HOUR,
  MIN_ANOMALIES_PER_PAID_HOUR,
  getSyncConfig,
} = require('./nightShift/nightShiftRuntimeConfig');
const {
  ANOMALY_MAX_INTERVAL_SECONDS,
  ANOMALY_MIN_INTERVAL_SECONDS,
  buildWindowPlan,
} = require('./nightShift/nightShiftWindowPlan');
const { getAdminSnapshot } = require('./nightShift/nightShiftAdminSnapshot');
const {
  processPendingNightShiftFinalReviews,
  reviewSuspiciousShift,
} = require('./nightShift/nightShiftReviews');
const {
  processDueNightShiftSettlements,
} = require('./nightShift/nightShiftSettlements');
const {
  endShiftForUser,
  processStaleNightShiftClosures,
} = require('./nightShift/nightShiftFinalization');
const {
  recordShiftHeartbeat,
} = require('./nightShift/nightShiftRuntimeHeartbeat');
const {
  getSystemSettings,
  startShiftForUser,
} = require('./nightShift/nightShiftStart');
const {
  getNightShiftFromUserData,
  getUserData,
  getUserRowById,
  mergeRuntimeIntoNightShift,
  updateUserDataById,
} = require('./nightShift/nightShiftUserState');

async function getNightShiftStatusForUser(userId) {
  const userRow = await getUserRowById(userId);
  if (!userRow) return null;

  const userData = getUserData(userRow);
  const storedNightShift = getNightShiftFromUserData(userData);
  const shiftWindow = getShiftScheduleSnapshot();
  if (!storedNightShift.isServing || !storedNightShift.sessionId) {
    return {
      ...storedNightShift,
      shiftWindow,
    };
  }

  const runtime = await getRuntimeSession(storedNightShift.sessionId);
  if (!runtime || runtime.status !== 'active' || String(runtime.userId) !== String(userRow.id)) {
    return {
      ...storedNightShift,
      shiftWindow,
    };
  }

  return {
    ...mergeRuntimeIntoNightShift(storedNightShift, runtime),
    shiftWindow,
    currentWindow: buildWindowPlan(runtime, runtime.issuedWindowIndex),
  };
}

module.exports = {
  ANOMALY_MAX_INTERVAL_SECONDS,
  ANOMALY_MIN_INTERVAL_SECONDS,
  EMPTY_WINDOWS_LIMIT,
  HEARTBEAT_TIMEOUT_MS,
  HEARTBEAT_WINDOW_SECONDS,
  MAX_SHIFT_MS,
  MIN_ANOMALIES_PER_ACTIVE_HOUR,
  MIN_ANOMALIES_PER_PAID_HOUR,
  buildSessionDocId,
  endShiftForUser,
  getActiveRuntimeForUser,
  getNightShiftFromUserData,
  getNightShiftStatusForUser,
  getRuntimeSession,
  getSyncConfig,
  getSystemSettings,
  getUserRowById,
  getUserData,
  processDueNightShiftSettlements,
  getAdminSnapshot,
  processPendingNightShiftFinalReviews,
  processStaleNightShiftClosures,
  recordShiftHeartbeat,
  reviewSuspiciousShift,
  startShiftForUser,
  updateUserDataById,
};

