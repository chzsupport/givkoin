const { toIso: defaultToIso } = require('../documentStore');
const { getShiftWindowByKey: defaultGetShiftWindowByKey } = require('./nightShiftSchedule');
const { normalizeShiftSummary } = require('./nightShiftDocuments');
const { normalizeRuntimeSession } = require('./nightShiftRuntimeSession');
const {
  getShiftSummary: defaultGetShiftSummary,
  listRuntimeSessionsByFilters: defaultListRuntimeSessionsByFilters,
  writeShiftSummary: defaultWriteShiftSummary,
} = require('./nightShiftRuntimeStore');

const SHIFT_SLOT_RATIO = 0.5;

function defaultGetActiveUsersCountSnapshot(...args) {
  return require('../battleService').getActiveUsersCountSnapshot(...args);
}

function createEmptySeatSnapshot() {
  return {
    activeUsersCount: 0,
    seatLimit: 0,
    occupiedSeats: 0,
    freeSeats: 0,
    activeServingCount: 0,
    retainedSeats: 0,
    reusedShiftSeat: false,
    reusedRetainedSeat: false,
    reserved: false,
  };
}

function toSeatSnapshot(summary, extra = {}) {
  const activeUsersCount = Math.max(0, Math.floor(Number(summary?.activeUsersCountSnapshot) || 0));
  const seatLimit = Math.max(0, Math.floor(Number(summary?.seatLimit) || 0));
  const occupiedSeats = Math.max(0, Math.floor(Number(summary?.occupiedSeats) || 0));
  return {
    activeUsersCount,
    seatLimit,
    occupiedSeats,
    freeSeats: Math.max(0, seatLimit - occupiedSeats),
    activeServingCount: Math.max(0, Math.floor(Number(summary?.activeServingCount) || 0)),
    retainedSeats: Math.max(0, Math.floor(Number(summary?.retainedSeats) || 0)),
    ...extra,
  };
}

function createNightShiftSeatStore({
  getActiveUsersCountSnapshot = defaultGetActiveUsersCountSnapshot,
  getShiftSummary = defaultGetShiftSummary,
  getShiftWindowByKey = defaultGetShiftWindowByKey,
  listRuntimeSessionsByFilters = defaultListRuntimeSessionsByFilters,
  toIso = defaultToIso,
  writeShiftSummary = defaultWriteShiftSummary,
} = {}) {
  async function rebuildShiftSummaryCounters(summary, { now = new Date() } = {}) {
    const normalizedSummary = normalizeShiftSummary(summary);
    if (!normalizedSummary?.shiftKey) return normalizedSummary;
    const rows = await listRuntimeSessionsByFilters({
      shiftKey: normalizedSummary.shiftKey,
      status: ['active', 'ended'],
      limit: 5000,
    });
    const occupiedUsers = new Set();
    const retainedUsers = new Set();
    const activeUsers = new Set();
    let activeServingCount = 0;

    for (const row of rows) {
      if (!row?.userId) continue;
      const currentUserId = String(row.userId);
      if (row.status === 'active') {
        activeServingCount += 1;
        activeUsers.add(currentUserId);
        occupiedUsers.add(currentUserId);
        continue;
      }
      retainedUsers.add(currentUserId);
      occupiedUsers.add(currentUserId);
    }

    return writeShiftSummary(normalizedSummary.shiftKey, {
      ...normalizedSummary,
      occupiedSeats: occupiedUsers.size,
      activeServingCount,
      retainedSeats: Array.from(retainedUsers).filter((userId) => !activeUsers.has(userId)).length,
    }, { updatedAt: now });
  }

  async function getOrCreateShiftSummary(shiftWindow, now = new Date()) {
    const shiftKey = String(shiftWindow?.key || '').trim();
    if (!shiftKey) return null;

    const existing = await getShiftSummary(shiftKey);
    if (existing) return existing;

    const activeUsersCount = Math.max(0, Number(await getActiveUsersCountSnapshot(now)) || 0);
    const seatLimit = Math.max(0, Math.floor(activeUsersCount * SHIFT_SLOT_RATIO));
    let summary = await writeShiftSummary(shiftKey, {
      shiftKey,
      shiftStartsAt: toIso(shiftWindow?.startAt || now),
      shiftEndsAt: toIso(shiftWindow?.endAt || now),
      activeUsersCountSnapshot: activeUsersCount,
      seatLimit,
      occupiedSeats: 0,
      activeServingCount: 0,
      retainedSeats: 0,
    }, { createdAt: now, updatedAt: now });

    const rows = await listRuntimeSessionsByFilters({
      shiftKey,
      status: ['active', 'ended'],
      limit: 5000,
    });
    if (rows.length) {
      summary = await rebuildShiftSummaryCounters(summary, { now });
    }

    return summary;
  }

  async function patchShiftSummary(shiftKey, patch, { summary = null, now = new Date() } = {}) {
    const baseSummary = normalizeShiftSummary(summary || await getShiftSummary(shiftKey));
    if (!baseSummary) return null;
    return writeShiftSummary(shiftKey, {
      ...baseSummary,
      ...(patch && typeof patch === 'object' ? patch : {}),
    }, { updatedAt: now });
  }

  async function getExistingShiftSeatForUser(shiftKey, userId) {
    const safeShiftKey = String(shiftKey || '').trim();
    const safeUserId = String(userId || '').trim();
    if (!safeShiftKey || !safeUserId) {
      return { exists: false, retained: false };
    }

    const rows = await listRuntimeSessionsByFilters({
      shiftKey: safeShiftKey,
      userId: safeUserId,
      status: 'ended',
      limit: 50,
    });

    return {
      exists: rows.length > 0,
      retained: rows.some((row) => Boolean(row?.seatRetained)),
    };
  }

  async function reserveShiftSeat(shiftWindow, { userId = null, now = new Date() } = {}) {
    const summary = await getOrCreateShiftSummary(shiftWindow, now);
    if (!summary) return createEmptySeatSnapshot();

    const existingSeat = await getExistingShiftSeatForUser(summary.shiftKey, userId);
    if (existingSeat.exists) {
      const nextSummary = await patchShiftSummary(summary.shiftKey, {
        activeServingCount: summary.activeServingCount + 1,
        occupiedSeats: existingSeat.retained ? summary.occupiedSeats : summary.occupiedSeats + 1,
        retainedSeats: existingSeat.retained ? Math.max(0, summary.retainedSeats - 1) : summary.retainedSeats,
      }, { summary, now });

      return toSeatSnapshot(nextSummary, {
        reusedShiftSeat: true,
        reusedRetainedSeat: existingSeat.retained,
        reserved: true,
      });
    }

    if (summary.seatLimit <= 0 || summary.occupiedSeats >= summary.seatLimit) {
      return toSeatSnapshot(summary, {
        reusedShiftSeat: false,
        reusedRetainedSeat: false,
        reserved: false,
      });
    }

    const nextSummary = await patchShiftSummary(summary.shiftKey, {
      occupiedSeats: summary.occupiedSeats + 1,
      activeServingCount: summary.activeServingCount + 1,
    }, { summary, now });

    return toSeatSnapshot(nextSummary, {
      reusedShiftSeat: false,
      reusedRetainedSeat: false,
      reserved: true,
    });
  }

  async function applyShiftSeatRelease(runtime, { seatRetained = false, now = new Date() } = {}) {
    const normalizedRuntime = normalizeRuntimeSession(runtime);
    if (!normalizedRuntime?.shiftKey) return null;

    const summary = await getShiftSummary(normalizedRuntime.shiftKey);
    if (!summary) return null;

    const nextPatch = {
      activeServingCount: Math.max(0, summary.activeServingCount - 1),
    };

    if (seatRetained) {
      nextPatch.occupiedSeats = summary.occupiedSeats;
      nextPatch.retainedSeats = Math.min(summary.seatLimit, summary.retainedSeats + 1);
    } else {
      nextPatch.occupiedSeats = Math.max(0, summary.occupiedSeats - 1);
      nextPatch.retainedSeats = Math.min(summary.retainedSeats, nextPatch.occupiedSeats);
    }

    return patchShiftSummary(summary.shiftKey, nextPatch, { summary, now });
  }

  async function getShiftSeatSnapshot(shiftKey, now = new Date()) {
    const safeShiftKey = String(shiftKey || '').trim();
    if (!safeShiftKey) {
      return {
        activeUsersCount: 0,
        seatLimit: 0,
        occupiedSeats: 0,
        freeSeats: 0,
      };
    }
    const shiftWindow = getShiftWindowByKey(safeShiftKey);
    const summary = await getOrCreateShiftSummary({
      key: safeShiftKey,
      startAt: shiftWindow?.startAt || now,
      endAt: shiftWindow?.endAt || now,
    }, now);
    const snapshot = toSeatSnapshot(summary);
    return {
      activeUsersCount: snapshot.activeUsersCount,
      seatLimit: snapshot.seatLimit,
      occupiedSeats: snapshot.occupiedSeats,
      freeSeats: snapshot.freeSeats,
    };
  }

  return {
    applyShiftSeatRelease,
    getExistingShiftSeatForUser,
    getOrCreateShiftSummary,
    getShiftSeatSnapshot,
    patchShiftSummary,
    rebuildShiftSummaryCounters,
    reserveShiftSeat,
  };
}

const defaultStore = createNightShiftSeatStore();

module.exports = {
  SHIFT_SLOT_RATIO,
  createNightShiftSeatStore,
  ...defaultStore,
};
