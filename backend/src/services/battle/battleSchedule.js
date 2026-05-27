const {
  getModelDocById,
  insertModelDoc,
  updateModelDoc,
} = require('./battleDocuments');
const battleRuntimeStore = require('../battleRuntimeStore');
const { DEFAULT_DURATION_SECONDS } = require('./battleConfig');

const UPCOMING_BATTLE_POINTER_KIND = 'upcoming';

function buildScheduledBattleDocument({
  startsAt,
  durationSeconds = DEFAULT_DURATION_SECONDS,
  durationLocked = false,
  scheduleSource = 'auto',
  scheduledIntervalHours = null,
} = {}) {
  const starts = startsAt ? new Date(startsAt) : new Date();
  const ends = new Date(starts.getTime() + durationSeconds * 1000);
  return {
    status: 'scheduled',
    startsAt: starts,
    endsAt: ends,
    durationSeconds,
    durationLocked: Boolean(durationLocked),
    scheduleSource,
    scheduledIntervalHours: scheduledIntervalHours == null ? null : Number(scheduledIntervalHours),
    darknessDamage: 0,
    lightDamage: 0,
    activeUsersCountSnapshot: 0,
    attendanceCount: 0,
    maxAttendanceCount: 0,
    uniqueAttendanceCount: 0,
    attendance: [],
    globalDebuffActive: false,
    globalDebuffPercent: 0,
    injuries: [],
    injury: null,
    summaryTopPlayer: null,
    firstPlayerJoinedAt: null,
    isShrunken: false,
    cancellationReason: '',
  };
}

function buildScheduledBattlePatch(battle, {
  startsAt,
  durationSeconds,
  durationLocked,
  scheduleSource,
  scheduledIntervalHours,
} = {}) {
  const nextStartsAt = startsAt ? new Date(startsAt) : new Date(battle.startsAt || Date.now());
  if (Number.isNaN(nextStartsAt.getTime())) {
    throw new Error('Battle start time is invalid');
  }

  const nextDurationSeconds = Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) > 0
    ? Number(durationSeconds)
    : Number(battle.durationSeconds) || DEFAULT_DURATION_SECONDS;

  const patch = {
    startsAt: nextStartsAt,
    durationSeconds: nextDurationSeconds,
    endsAt: new Date(nextStartsAt.getTime() + nextDurationSeconds * 1000),
  };

  if (scheduleSource !== undefined) {
    patch.scheduleSource = scheduleSource;
  }
  if (durationLocked !== undefined) {
    patch.durationLocked = Boolean(durationLocked);
  }
  if (scheduledIntervalHours !== undefined) {
    patch.scheduledIntervalHours = scheduledIntervalHours == null ? null : Number(scheduledIntervalHours);
  }

  return patch;
}

async function scheduleBattle(options = {}) {
  const created = await insertModelDoc('Battle', buildScheduledBattleDocument(options));
  if (!created) throw new Error('Failed to schedule battle');
  await battleRuntimeStore.setBattlePointer(UPCOMING_BATTLE_POINTER_KIND, created._id).catch(() => {});
  return created;
}

async function updateScheduledBattle(battleId, options = {}) {
  const battle = await getModelDocById('Battle', battleId);
  if (!battle) throw new Error('Battle not found');
  if (String(battle.status || '') !== 'scheduled') {
    throw new Error('Only scheduled battle can be updated');
  }

  const saved = await updateModelDoc('Battle', battleId, buildScheduledBattlePatch(battle, options));
  if (!saved) throw new Error('Battle not found');
  await battleRuntimeStore.setBattlePointer(UPCOMING_BATTLE_POINTER_KIND, saved._id).catch(() => {});
  return saved;
}

module.exports = {
  buildScheduledBattleDocument,
  buildScheduledBattlePatch,
  scheduleBattle,
  updateScheduledBattle,
};
