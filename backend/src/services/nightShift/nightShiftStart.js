const crypto = require('crypto');
const { listDocsByModel: defaultListDocsByModel, toIso: defaultToIso } = require('../documentStore');
const {
  getShiftScheduleSnapshot,
  getShiftWindow: defaultGetShiftWindow,
  isShiftRestRequired: defaultIsShiftRestRequired,
} = require('./nightShiftSchedule');
const { normalizeNightShiftSalary } = require('./nightShiftRewards');
const { buildWindowPlan } = require('./nightShiftWindowPlan');
const { normalizeRuntimeSession } = require('./nightShiftRuntimeSession');

function defaultGetActiveRuntimeForUser(...args) {
  return require('./nightShiftRuntimeStore').getActiveRuntimeForUser(...args);
}

function defaultSaveRuntimeSession(...args) {
  return require('./nightShiftRuntimeStore').saveRuntimeSession(...args);
}

function defaultPatchShiftSummary(...args) {
  return require('./nightShiftSeatStore').patchShiftSummary(...args);
}

function defaultReserveShiftSeat(...args) {
  return require('./nightShiftSeatStore').reserveShiftSeat(...args);
}

function defaultGetUserRowById(...args) {
  return require('./nightShiftUserState').getUserRowById(...args);
}

function defaultGetUserData(...args) {
  return require('./nightShiftUserState').getUserData(...args);
}

function defaultGetNightShiftFromUserData(...args) {
  return require('./nightShiftUserState').getNightShiftFromUserData(...args);
}

function defaultUpdateUserDataById(...args) {
  return require('./nightShiftUserState').updateUserDataById(...args);
}

function randomId(prefix) {
  if (typeof crypto.randomUUID === 'function') return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function buildShiftStartRuntime({
  createId = randomId,
  now,
  seats,
  sessionId,
  settings,
  shiftWindow,
  toIso = defaultToIso,
  userId,
}) {
  return normalizeRuntimeSession({
    sessionId,
    userId: String(userId),
    status: 'active',
    shiftKey: shiftWindow.key,
    shiftStartsAt: toIso(shiftWindow.startAt),
    shiftEndsAt: toIso(shiftWindow.endAt),
    startedAt: toIso(now),
    lastHeartbeatAt: toIso(now),
    lastSeenAt: toIso(now),
    windowSecret: createId('night_shift_window'),
    issuedWindowIndex: 0,
    consecutiveEmptyWindows: 0,
    totalAcceptedAnomalies: 0,
    totalReportedAnomalies: 0,
    totalPageHits: {},
    hourlyAnomalies: {},
    evaluatedHours: [],
    payableHours: 0,
    seatLimitSnapshot: seats.seatLimit,
    activeUsersCountSnapshot: seats.activeUsersCount,
    occupiedSeatsSnapshot: seats.occupiedSeats,
    seatRetained: false,
    reusedShiftSeat: Boolean(seats.reusedShiftSeat),
    lastAcceptedWindowIndex: -1,
    settlementStatus: null,
    settlementDueAt: null,
    reward: null,
    closeReason: null,
    finalReport: null,
    statsCommitted: false,
    salaryRates: normalizeNightShiftSalary(settings?.nightShiftSalary),
    suspiciousWindows: [],
    reviewStatus: 'clean',
  });
}

function buildStartedNightShift({
  currentNightShift,
  now,
  seats,
  sessionId,
  shiftWindow,
  toIso = defaultToIso,
}) {
  return {
    ...currentNightShift,
    isServing: true,
    sessionId,
    startTime: toIso(now),
    lastActivityAt: toIso(now),
    pendingSettlement: null,
    acceptedAnomaliesCurrentSession: 0,
    payableHoursCurrent: 0,
    consecutiveEmptyWindows: 0,
    lastCloseReason: null,
    lastJoinedShiftKey: shiftWindow.key,
    shiftKey: shiftWindow.key,
    shiftEndsAt: toIso(shiftWindow.endAt),
    seatLimitSnapshot: seats.seatLimit,
    occupiedSeatsSnapshot: seats.occupiedSeats,
  };
}

function buildSeatRollbackPatch(seats = {}) {
  return seats.reusedShiftSeat
    ? {
        occupiedSeats: seats.reusedRetainedSeat
          ? Math.max(0, seats.occupiedSeats)
          : Math.max(0, seats.occupiedSeats - 1),
        activeServingCount: Math.max(0, (seats.activeServingCount || 0) - 1),
        retainedSeats: seats.reusedRetainedSeat
          ? Math.max(0, (seats.retainedSeats || 0) + 1)
          : Math.max(0, seats.retainedSeats || 0),
      }
    : {
        occupiedSeats: Math.max(0, seats.occupiedSeats - 1),
        activeServingCount: Math.max(0, (seats.activeServingCount || 0) - 1),
      };
}

function createNightShiftStart({
  createId = randomId,
  getActiveRuntimeForUser = defaultGetActiveRuntimeForUser,
  getNightShiftFromUserData = defaultGetNightShiftFromUserData,
  getNow = () => new Date(),
  getShiftWindow = defaultGetShiftWindow,
  getUserData = defaultGetUserData,
  getUserRowById = defaultGetUserRowById,
  isShiftRestRequired = defaultIsShiftRestRequired,
  listDocsByModel = defaultListDocsByModel,
  patchShiftSummary = defaultPatchShiftSummary,
  reserveShiftSeat = defaultReserveShiftSeat,
  saveRuntimeSession = defaultSaveRuntimeSession,
  toIso = defaultToIso,
  updateUserDataById = defaultUpdateUserDataById,
} = {}) {
  async function getSystemSettings() {
    const rows = await listDocsByModel('SystemSettings', { limit: 1 });
    const data = rows[0] || null;
    return {
      nightShiftSalary: normalizeNightShiftSalary(data?.nightShiftSalary),
      nightShiftSchedule: data?.nightShiftSchedule || { start: null, end: null },
    };
  }

  async function startShiftForUser(userId) {
    const userRow = await getUserRowById(userId);
    if (!userRow) {
      throw new Error('user_not_found');
    }

    const userData = getUserData(userRow);
    const currentNightShift = getNightShiftFromUserData(userData);
    if (currentNightShift.isServing) {
      throw new Error('shift_already_active');
    }

    const activeRuntime = await getActiveRuntimeForUser(userRow.id);
    if (activeRuntime) {
      throw new Error('shift_already_active');
    }

    const settings = await getSystemSettings();
    const now = getNow();
    const shiftWindow = getShiftWindow(now);
    if (!shiftWindow.isOpen) {
      throw new Error('shift_schedule_closed');
    }

    if (isShiftRestRequired(currentNightShift.lastJoinedShiftKey, shiftWindow.key)) {
      throw new Error('shift_rest_required');
    }

    const seats = await reserveShiftSeat(shiftWindow, { userId: userRow.id, now });
    if (seats.seatLimit <= 0 || !seats.reserved) {
      throw new Error('shift_slots_full');
    }

    const sessionId = createId('night_shift');
    const runtimeDoc = buildShiftStartRuntime({
      createId,
      now,
      seats,
      sessionId,
      settings,
      shiftWindow,
      toIso,
      userId: userRow.id,
    });
    try {
      await saveRuntimeSession(sessionId, runtimeDoc, { createdAt: now, updatedAt: now });

      const nextNightShift = buildStartedNightShift({
        currentNightShift,
        now,
        seats,
        sessionId,
        shiftWindow,
        toIso,
      });

      const updatedUserRow = await updateUserDataById(userRow.id, { nightShift: nextNightShift });
      return {
        runtime: runtimeDoc,
        nightShift: {
          ...getNightShiftFromUserData(getUserData(updatedUserRow || userRow)),
          shiftWindow: getShiftScheduleSnapshot(now),
          currentWindow: buildWindowPlan(runtimeDoc, 0),
        },
      };
    } catch (error) {
      await patchShiftSummary(shiftWindow.key, buildSeatRollbackPatch(seats), { now }).catch(() => null);
      throw error;
    }
  }

  return {
    getSystemSettings,
    startShiftForUser,
  };
}

const defaultStart = createNightShiftStart();

module.exports = {
  buildSeatRollbackPatch,
  buildShiftStartRuntime,
  buildStartedNightShift,
  createNightShiftStart,
  getSystemSettings: defaultStart.getSystemSettings,
  startShiftForUser: defaultStart.startShiftForUser,
};
