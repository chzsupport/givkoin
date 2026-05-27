const SESSION_MODEL = 'NightShiftRuntimeSession';
const SHIFT_SUMMARY_MODEL = 'NightShiftRuntimeSummary';

function buildSessionDocId(sessionId) {
  return `night_shift_runtime:${String(sessionId)}`;
}

function buildShiftSummaryDocId(shiftKey) {
  return `night_shift_summary:${String(shiftKey || '').trim()}`;
}

function normalizeShiftSummary(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    shiftKey: row.shiftKey ? String(row.shiftKey) : null,
    shiftStartsAt: row.shiftStartsAt || null,
    shiftEndsAt: row.shiftEndsAt || null,
    activeUsersCountSnapshot: Math.max(0, Math.floor(Number(row.activeUsersCountSnapshot) || 0)),
    seatLimit: Math.max(0, Math.floor(Number(row.seatLimit) || 0)),
    occupiedSeats: Math.max(0, Math.floor(Number(row.occupiedSeats) || 0)),
    activeServingCount: Math.max(0, Math.floor(Number(row.activeServingCount) || 0)),
    retainedSeats: Math.max(0, Math.floor(Number(row.retainedSeats) || 0)),
  };
}

module.exports = {
  SESSION_MODEL,
  SHIFT_SUMMARY_MODEL,
  buildSessionDocId,
  buildShiftSummaryDocId,
  normalizeShiftSummary,
};
