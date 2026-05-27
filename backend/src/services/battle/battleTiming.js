const {
  BATTLE_BASE_DURATION_SECONDS,
  BATTLE_MIN_DURATION_SECONDS,
  BATTLE_SHRINK_PER_NEW_PLAYER_SECONDS,
} = require('./battleConfig');

function computeBattleDurationSecondsForAttendance(attendanceCount) {
  const attendance = Math.max(0, Number(attendanceCount) || 0);
  const reduced = BATTLE_BASE_DURATION_SECONDS - attendance * BATTLE_SHRINK_PER_NEW_PLAYER_SECONDS;
  return Math.max(BATTLE_MIN_DURATION_SECONDS, Math.round(reduced));
}

function computeBattleDurationSecondsForAttendanceWithBase(attendanceCount, baseDurationSeconds) {
  const base = Math.max(0, Number(baseDurationSeconds) || 0);
  if (!base) return computeBattleDurationSecondsForAttendance(attendanceCount);
  const attendance = Math.max(0, Number(attendanceCount) || 0);
  const reduced = base - attendance * BATTLE_SHRINK_PER_NEW_PLAYER_SECONDS;
  const minDuration = base < BATTLE_MIN_DURATION_SECONDS ? base : BATTLE_MIN_DURATION_SECONDS;
  return Math.max(minDuration, Math.round(reduced));
}

function buildAttendanceTimingUpdate(battle) {
  if (!battle || battle.status !== 'active') return null;
  if (battle.durationLocked) return null;

  const anchor = battle.firstPlayerJoinedAt ? new Date(battle.firstPlayerJoinedAt) : null;
  if (!anchor) return null;

  const baseDurationSeconds = battle.durationSeconds || BATTLE_BASE_DURATION_SECONDS;
  const nextDurationSeconds = computeBattleDurationSecondsForAttendanceWithBase(
    battle.attendanceCount || 0,
    baseDurationSeconds
  );
  const nextEndsAt = new Date(anchor.getTime() + nextDurationSeconds * 1000);
  const currentEndsAtMs = battle.endsAt ? new Date(battle.endsAt).getTime() : NaN;
  const shouldShrink = Number.isFinite(currentEndsAtMs) && nextEndsAt.getTime() < currentEndsAtMs;
  const finalEndsAt = Number.isFinite(currentEndsAtMs)
    ? new Date(Math.min(currentEndsAtMs, nextEndsAt.getTime()))
    : nextEndsAt;

  return {
    durationSeconds: nextDurationSeconds,
    endsAt: finalEndsAt,
    isShrunken: Boolean(battle.isShrunken || shouldShrink),
  };
}

function computeMissingAttendancePercent({ attendanceCount, activeUsersCount }) {
  const active = Math.max(0, Number(activeUsersCount) || 0);
  if (active <= 0) return 0;
  const attendancePct = (Math.max(0, Number(attendanceCount) || 0) / active) * 100;
  // Target = 50% of active users
  return Math.max(0, (50 - attendancePct) * 2);
}

module.exports = {
  buildAttendanceTimingUpdate,
  computeBattleDurationSecondsForAttendance,
  computeBattleDurationSecondsForAttendanceWithBase,
  computeMissingAttendancePercent,
};
