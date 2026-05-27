const {
  getDocById: defaultGetDocById,
  listDocsByModel: defaultListDocsByModel,
  toIso: defaultToIso,
  updateDocByModel: defaultUpdateDocByModel,
  upsertDoc: defaultUpsertDoc,
} = require('../documentStore');
const {
  SESSION_MODEL,
  SHIFT_SUMMARY_MODEL,
  buildSessionDocId,
  buildShiftSummaryDocId,
  normalizeShiftSummary,
} = require('./nightShiftDocuments');
const {
  normalizeRuntimeSession,
} = require('./nightShiftRuntimeSession');

function normalizeFilterList(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : (value ? [String(value).trim()] : []);
}

function createNightShiftRuntimeStore({
  getDocById = defaultGetDocById,
  listDocsByModel = defaultListDocsByModel,
  toIso = defaultToIso,
  updateDocByModel = defaultUpdateDocByModel,
  upsertDoc = defaultUpsertDoc,
} = {}) {
  async function getRuntimeSession(sessionId) {
    return normalizeRuntimeSession(await getDocById(buildSessionDocId(sessionId)));
  }

  async function getShiftSummary(shiftKey) {
    const safeShiftKey = String(shiftKey || '').trim();
    if (!safeShiftKey) return null;
    return normalizeShiftSummary(await getDocById(buildShiftSummaryDocId(safeShiftKey)));
  }

  async function writeShiftSummary(shiftKey, summary, { createdAt = null, updatedAt = new Date() } = {}) {
    const safeShiftKey = String(shiftKey || '').trim();
    if (!safeShiftKey) return null;
    const normalized = normalizeShiftSummary({
      ...(summary && typeof summary === 'object' ? summary : {}),
      shiftKey: safeShiftKey,
    });
    if (!normalized) return null;
    await upsertDoc({
      id: buildShiftSummaryDocId(safeShiftKey),
      model: SHIFT_SUMMARY_MODEL,
      data: normalized,
      createdAt: createdAt || updatedAt,
      updatedAt,
    });
    return normalized;
  }

  async function listRuntimeSessionsByFilters({
    status = null,
    settlementStatus = null,
    userId = null,
    shiftKey = null,
    reviewStatus = null,
    finalVerificationStatus = null,
    limit = 5000,
  } = {}) {
    const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 5000));
    const statuses = normalizeFilterList(status);
    const dataEq = {};
    const dataIn = {};
    if (statuses.length === 1) dataEq.status = statuses[0];
    if (statuses.length > 1) dataIn.status = statuses;

    const settlement = String(settlementStatus || '').trim();
    if (settlement) dataEq.settlementStatus = settlement;

    const uid = String(userId || '').trim();
    if (uid) dataEq.userId = uid;

    const safeShiftKey = String(shiftKey || '').trim();
    if (safeShiftKey) dataEq.shiftKey = safeShiftKey;

    const safeReviewStatus = String(reviewStatus || '').trim();
    if (safeReviewStatus) dataEq.reviewStatus = safeReviewStatus;

    const safeFinalVerificationStatus = String(finalVerificationStatus || '').trim();
    if (safeFinalVerificationStatus) dataEq.finalVerificationStatus = safeFinalVerificationStatus;

    const data = await listDocsByModel(SESSION_MODEL, {
      dataEq,
      dataIn,
      limit: safeLimit,
    });
    return data.map(normalizeRuntimeSession).filter(Boolean);
  }

  async function saveRuntimeSession(sessionId, runtime, { createdAt = null, updatedAt = new Date() } = {}) {
    const safeSessionId = String(sessionId || runtime?.sessionId || '').trim();
    if (!safeSessionId) return null;
    const normalized = normalizeRuntimeSession({
      ...(runtime && typeof runtime === 'object' ? runtime : {}),
      sessionId: safeSessionId,
    });
    if (!normalized) return null;
    await upsertDoc({
      id: buildSessionDocId(safeSessionId),
      model: SESSION_MODEL,
      data: normalized,
      createdAt: createdAt || updatedAt,
      updatedAt,
    });
    return normalized;
  }

  async function updateRuntimeSessionFast(sessionId, nextRuntime, { updatedAt = new Date() } = {}) {
    const nowIso = toIso(updatedAt);
    const payload = {
      ...nextRuntime,
      updatedAt: nowIso,
    };

    await updateDocByModel(SESSION_MODEL, buildSessionDocId(sessionId), payload, { updatedAt: nowIso });

    return normalizeRuntimeSession(payload);
  }

  async function patchRuntimeSession(sessionId, patch, { runtime = null, now = new Date() } = {}) {
    const baseRuntime = normalizeRuntimeSession(runtime || await getRuntimeSession(sessionId));
    if (!baseRuntime) return null;
    const nextRuntime = normalizeRuntimeSession({
      ...baseRuntime,
      ...(patch && typeof patch === 'object' ? patch : {}),
    });
    if (!nextRuntime) return null;
    return updateRuntimeSessionFast(sessionId, nextRuntime, { updatedAt: now });
  }

  async function getActiveRuntimeForUser(userId) {
    const uid = String(userId || '');
    if (!uid) return null;
    const rows = await listRuntimeSessionsByFilters({
      status: 'active',
      userId: uid,
      limit: 1,
    });
    return rows[0] || null;
  }

  return {
    getActiveRuntimeForUser,
    getRuntimeSession,
    getShiftSummary,
    listRuntimeSessionsByFilters,
    patchRuntimeSession,
    saveRuntimeSession,
    updateRuntimeSessionFast,
    writeShiftSummary,
  };
}

const defaultStore = createNightShiftRuntimeStore();

module.exports = {
  createNightShiftRuntimeStore,
  ...defaultStore,
};
