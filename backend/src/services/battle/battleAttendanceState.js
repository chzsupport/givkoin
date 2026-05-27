const { getModelDocById, updateModelDoc } = require('./battleDocuments');
const { buildAttendanceSyncState } = require('./battleCombat');
const {
  getVoiceCommandForBucket,
  getVoiceCommandState,
} = require('./battleScenario');

async function persistAttendanceSyncState({ battleId, userId, syncState }) {
  if (!battleId || !userId || !syncState) return syncState || null;

  const battle = await getModelDocById('Battle', battleId);
  if (!battle) return syncState;
  const attendance = Array.isArray(battle.attendance) ? [...battle.attendance] : [];
  const idx = attendance.findIndex((entry) => String(entry?.user || '') === String(userId));
  if (idx < 0) return syncState;
  attendance[idx] = {
    ...(attendance[idx] || {}),
    syncSlot: syncState.syncSlot,
    syncSlotCount: syncState.syncSlotCount,
    syncIntervalSeconds: syncState.syncIntervalSeconds,
  };
  await updateModelDoc('Battle', battleId, { attendance });

  return syncState;
}

async function ensureAttendanceSyncState({ battleId, userId }) {
  if (!battleId || !userId) return null;

  const snapshot = await getModelDocById('Battle', battleId);
  const attendance = Array.isArray(snapshot?.attendance) ? snapshot.attendance : [];
  const targetUserId = String(userId);
  const attendanceIndex = attendance.findIndex((entry) => String(entry?.user || '') === targetUserId);
  if (attendanceIndex < 0) {
    return null;
  }

  const syncState = buildAttendanceSyncState(attendanceIndex);
  const current = attendance[attendanceIndex] || {};
  const needsUpdate = Number(current?.syncSlot) !== syncState.syncSlot
    || Number(current?.syncSlotCount) !== syncState.syncSlotCount
    || Number(current?.syncIntervalSeconds) !== syncState.syncIntervalSeconds;

  if (needsUpdate) {
    await persistAttendanceSyncState({ battleId, userId, syncState });
  }

  return syncState;
}

async function ensureAttendanceInitForUser({ battleId, userId, lumensAtStart, kAtStart = null, starsAtStart = null }) {
  if (!battleId || !userId) return;
  const battle = await getModelDocById('Battle', battleId);
  if (!battle) return;
  const attendance = Array.isArray(battle.attendance) ? [...battle.attendance] : [];
  const idx = attendance.findIndex((entry) => String(entry?.user || '') === String(userId));
  if (idx < 0) return;
  const current = attendance[idx] || {};
  const nextEntry = { ...current };
  let changed = false;
  if (nextEntry.lumensAtBattleStart === null || nextEntry.lumensAtBattleStart === undefined) {
    nextEntry.lumensAtBattleStart = Math.max(0, Number(lumensAtStart) || 0);
    changed = true;
  }
  if ((nextEntry.kAtBattleStart === null || nextEntry.kAtBattleStart === undefined) && kAtStart != null) {
    nextEntry.kAtBattleStart = Math.max(0, Number(kAtStart) || 0);
    changed = true;
  }
  if ((nextEntry.starsAtBattleStart === null || nextEntry.starsAtBattleStart === undefined) && starsAtStart != null) {
    nextEntry.starsAtBattleStart = Math.max(0, Number(starsAtStart) || 0);
    changed = true;
  }
  if (!changed) return;
  attendance[idx] = {
    ...nextEntry,
  };
  await updateModelDoc('Battle', battleId, { attendance });
}

async function markVoiceShotDetected({ battleId, userId, bucketIndex }) {
  const idx = Number(bucketIndex);
  if (!Number.isFinite(idx) || idx < 0) return;
  const stored = idx + 1;
  const battle = await getModelDocById('Battle', battleId);
  if (!battle) return;
  const attendance = Array.isArray(battle.attendance) ? [...battle.attendance] : [];
  const aidx = attendance.findIndex((entry) => String(entry?.user || '') === String(userId));
  if (aidx < 0) return;
  attendance[aidx] = {
    ...(attendance[aidx] || {}),
    voiceShotDetectedBucket: stored,
  };
  await updateModelDoc('Battle', battleId, { attendance });
}

function buildVoiceResolutionUpdate({ battle, attendanceEntry = null, at = new Date(), userId = null }) {
  const entry = attendanceEntry || null;

  if (!battle?.startsAt) {
    return {
      voice: { active: false, command: null, bucketIndex: null },
      update: null,
    };
  }

  const now = new Date(at);
  const state = getVoiceCommandState(battle, now, userId);
  const lastResolvedStored = Math.max(0, Number(entry?.voiceLastResolvedBucket) || 0);
  const shotDetectedStored = Math.max(0, Number(entry?.voiceShotDetectedBucket) || 0);

  let lastResolved = lastResolvedStored;
  let voiceCommandsSuccess = Number(entry?.voiceCommandsSuccess) || 0;
  let voiceCommandsSilenceSuccess = Number(entry?.voiceCommandsSilenceSuccess) || 0;
  let voiceCommandsAttackSuccess = Number(entry?.voiceCommandsAttackSuccess) || 0;
  let voiceCommandsConsecutive = Number(entry?.voiceCommandsConsecutive) || 0;
  let voiceCommandsTotalAttempts = Number(entry?.voiceCommandsTotalAttempts) || 0;
  let voiceCommandsHistory = Array.isArray(entry?.voiceCommandsHistory) ? [...entry.voiceCommandsHistory] : [];

  const nowMs = now.getTime();
  const nextPendingCommand = getVoiceCommandForBucket(battle, lastResolved, userId);

  if (!nextPendingCommand || nowMs < nextPendingCommand.endsAt) {
    return {
      voice: state,
      update: null,
    };
  }

  let changed = false;

  for (;;) {
    const nextBucket = lastResolved;
    const cmd = getVoiceCommandForBucket(battle, nextBucket, userId);
    if (!cmd) break;
    if (nowMs < cmd.endsAt) break;

    const bucketStored = nextBucket + 1;
    const shotDetected = shotDetectedStored === bucketStored;
    const success = cmd.requireShot ? shotDetected : !shotDetected;

    lastResolved = nextBucket + 1;
    voiceCommandsTotalAttempts += 1;

    if (success) {
      voiceCommandsSuccess += 1;
      voiceCommandsConsecutive += 1;
      if (cmd.text === 'СТРЕЛЯЙ') {
        voiceCommandsSilenceSuccess += 1;
      } else if (cmd.text === 'СТОЙ') {
        voiceCommandsAttackSuccess += 1;
      }
    } else {
      voiceCommandsConsecutive = 0;
    }
    voiceCommandsHistory.push(success);

    changed = true;
  }

  if (!changed) {
    return {
      voice: state,
      update: null,
    };
  }

  return {
    voice: state,
    update: {
      $set: {
        'attendance.$.voiceLastResolvedBucket': lastResolved,
        'attendance.$.voiceCommandsSuccess': voiceCommandsSuccess,
        'attendance.$.voiceCommandsSilenceSuccess': voiceCommandsSilenceSuccess,
        'attendance.$.voiceCommandsAttackSuccess': voiceCommandsAttackSuccess,
        'attendance.$.voiceCommandsConsecutive': voiceCommandsConsecutive,
        'attendance.$.voiceCommandsTotalAttempts': voiceCommandsTotalAttempts,
        'attendance.$.voiceCommandsHistory': voiceCommandsHistory,
      },
    },
  };
}

async function applyVoiceResolutionsForUser({ battleId, userId, at = new Date() }) {
  const battle = await getModelDocById('Battle', battleId);
  if (!battle?.startsAt) return null;

  const attendance = Array.isArray(battle.attendance) ? battle.attendance : [];
  const entry = attendance.find((row) => String(row?.user || '') === String(userId)) || null;
  if (!entry) return null;
  const resolution = buildVoiceResolutionUpdate({
    battle,
    attendanceEntry: entry,
    at,
    userId,
  });

  if (resolution?.update) {
    const patch = resolution.update?.$set && typeof resolution.update.$set === 'object' ? resolution.update.$set : {};
    const nextAttendance = [...attendance];
    const idx = nextAttendance.findIndex((row) => String(row?.user || '') === String(userId));
    if (idx >= 0) {
      const current = nextAttendance[idx] || {};
      const mapped = { ...current };
      for (const [key, value] of Object.entries(patch)) {
        if (!key.startsWith('attendance.$.')) continue;
        const field = key.slice('attendance.$.'.length);
        mapped[field] = value;
      }
      nextAttendance[idx] = mapped;
      await updateModelDoc('Battle', battleId, { attendance: nextAttendance });
    }
  }

  return {
    voice: resolution.voice,
  };
}

module.exports = {
  applyVoiceResolutionsForUser,
  buildVoiceResolutionUpdate,
  ensureAttendanceInitForUser,
  ensureAttendanceSyncState,
  markVoiceShotDetected,
  persistAttendanceSyncState,
};
