const battleService = require('../../services/battleService');
const battleRuntimeStore = require('../../services/battleRuntimeStore');
const { createEmptyBattleReportedState } = require('./reportPayload');
const { applyAttendancePayloadToRuntimeEntry } = require('./runtimeEntryPayload');

function buildInitialAttendanceRuntimeEntry({
    userId,
    joinedAt = new Date(),
    sync = null,
    lumensAtBattleStart = null,
    kAtBattleStart = null,
    starsAtBattleStart = null,
}) {
    const safeSync = sync && typeof sync === 'object' ? sync : null;
    const syncSlot = Number(safeSync?.syncSlot);
    const syncSlotCount = Number(safeSync?.syncSlotCount);
    const syncIntervalSeconds = Number(safeSync?.syncIntervalSeconds);

    return {
        user: userId?.toString?.() || userId,
        joinedAt: new Date(joinedAt),
        enteredAt: new Date(joinedAt),
        sessionJoinedAt: new Date(joinedAt),
        damage: 0,
        comboHits: 0,
        comboDamage: 0,
        comboMultiplier: 1,
        comboLastHitAt: null,
        nonBaseWeaponHits: 0,
        totalShots: 0,
        totalHits: 0,
        weakZoneHits: 0,
        nonWeakZoneHits: 0,
        weapon2Hits: 0,
        weapon3Hits: 0,
        lastClickAt: null,
        maxClickGapMs: 0,
        lastClientSyncAt: null,
        syncSlot: Number.isFinite(syncSlot) && syncSlot >= 0 ? syncSlot : null,
        syncSlotCount: Number.isFinite(syncSlotCount) && syncSlotCount >= 1 ? syncSlotCount : null,
        syncIntervalSeconds: Number.isFinite(syncIntervalSeconds) && syncIntervalSeconds >= 1 ? syncIntervalSeconds : null,
        voiceLastResolvedBucket: 0,
        voiceShotDetectedBucket: 0,
        lumensSpentWeapon3First2Min: 0,
        lumensSpentOtherFirst2Min: 0,
        crystalsCollected: 0,
        lumensSpentTotal: 0,
        damageAfterZeroLumens: 0,
        voiceCommandsSuccess: 0,
        voiceCommandsSilenceSuccess: 0,
        voiceCommandsAttackSuccess: 0,
        voiceCommandsConsecutive: 0,
        voiceCommandsTotalAttempts: 0,
        voiceCommandsHistory: [],
        automationTelemetry: {},
        exitedAndReturnedWithSolarCharge: false,
        receivedGiftInBattle: false,
        lumensAtBattleStart: lumensAtBattleStart == null ? null : Math.max(0, Number(lumensAtBattleStart) || 0),
        kAtBattleStart: kAtBattleStart == null ? null : Math.max(0, Number(kAtBattleStart) || 0),
        starsAtBattleStart: starsAtBattleStart == null ? null : Math.max(0, Number(starsAtBattleStart) || 0),
        heldComboX2StartAt: null,
        heldComboX2MaxDuration: 0,
        phoenixStage: 0,
        reachedX1_5InFirst30s: false,
        shotOutsideWeakZone: false,
        finalRank: null,
        finalBranchAvgDamageOther: null,
        lastAcceptedReportSequence: 0,
        finalReportAt: null,
        reported: createEmptyBattleReportedState(syncIntervalSeconds),
    };
}

function buildBattleSnapshotAfterAttendanceJoin({ battle, firstJoinBattle = null }) {
    if (!battle) {
        return null;
    }

    return {
        _id: battle._id,
        status: firstJoinBattle?.status || battle.status || 'active',
        startsAt: battle.startsAt || null,
        firstPlayerJoinedAt: firstJoinBattle?.firstPlayerJoinedAt || battle.firstPlayerJoinedAt || null,
        durationSeconds: Number(firstJoinBattle?.durationSeconds ?? battle.durationSeconds) || battleService.BATTLE_BASE_DURATION_SECONDS,
        attendanceCount: Math.max(0, Number(firstJoinBattle?.attendanceCount ?? battle.attendanceCount) || 0),
        endsAt: firstJoinBattle?.endsAt || battle.endsAt || null,
        isShrunken: Boolean(firstJoinBattle?.isShrunken || battle.isShrunken),
        activeUsersCountSnapshot: Math.max(0, Number(battle.activeUsersCountSnapshot) || 0),
        attendance: Array.isArray(battle.attendance) ? battle.attendance : [],
        scenario: battle?.scenario && typeof battle.scenario === 'object' ? battle.scenario : null,
        injuries: Array.isArray(battle.injuries) ? battle.injuries : [],
        injury: battle.injury || null,
    };
}

function createBattleAttendanceRuntime({ getHeartbeatBattleSnapshot, attendanceRuntimeTtlMs }) {
    const ttlMs = Math.max(1000, Number(attendanceRuntimeTtlMs) || (3 * 60 * 60 * 1000));

    async function getAttendanceRuntimeSnapshot({ battleId, userId }) {
        const cached = await battleRuntimeStore.getAttendanceState({ battleId, userId }).catch(() => null);
        if (cached) {
            return cached;
        }

        const snapshot = await getHeartbeatBattleSnapshot(battleId);
        const attendance = Array.isArray(snapshot?.attendance) ? snapshot.attendance : [];
        const entry = attendance.find((row) => String(row?.user || '') === String(userId)) || null;
        if (entry) {
            await battleRuntimeStore.upsertAttendanceState({
                battleId,
                userId,
                state: entry,
                ttlMs,
            }).catch(() => {});
        }
        return entry;
    }

    async function syncAttendanceRuntimeSnapshot({ battleId, userId, payload, baseState = null }) {
        if (!payload || typeof payload !== 'object') {
            return baseState || null;
        }

        let currentState = baseState || await battleRuntimeStore.getAttendanceState({ battleId, userId }).catch(() => null);
        if (!currentState) {
            currentState = await getAttendanceRuntimeSnapshot({ battleId, userId });
        }
        if (!currentState) {
            return null;
        }

        const nextState = applyAttendancePayloadToRuntimeEntry(currentState, payload);
        await battleRuntimeStore.upsertAttendanceState({
            battleId,
            userId,
            state: nextState,
            ttlMs,
        }).catch(() => {});

        return nextState;
    }

    async function ensureAttendanceRuntimeSyncMetadata({ battleId, userId, entry = null, sync = null }) {
        const resolvedSync = sync && typeof sync === 'object' ? sync : null;
        if (!resolvedSync) {
            return entry || null;
        }

        const currentSlot = Number(entry?.syncSlot);
        const currentSlotCount = Number(entry?.syncSlotCount);
        const currentIntervalSeconds = Number(entry?.syncIntervalSeconds);
        const unchanged = Number.isFinite(currentSlot)
            && Number.isFinite(currentSlotCount)
            && Number.isFinite(currentIntervalSeconds)
            && currentSlot === resolvedSync.syncSlot
            && currentSlotCount === resolvedSync.syncSlotCount
            && currentIntervalSeconds === resolvedSync.syncIntervalSeconds;

        if (unchanged) {
            return entry;
        }

        return await syncAttendanceRuntimeSnapshot({
            battleId,
            userId,
            payload: {
                $set: {
                    'attendance.$.syncSlot': resolvedSync.syncSlot,
                    'attendance.$.syncSlotCount': resolvedSync.syncSlotCount,
                    'attendance.$.syncIntervalSeconds': resolvedSync.syncIntervalSeconds,
                },
            },
            baseState: entry,
        }) || entry;
    }

    async function ensureBattleAttendanceReady({
        battleId,
        userId,
        battle = null,
        shouldEnsureFirstJoin = false,
        joinedAt = null,
        resourceSnapshot = null,
    }) {
        let entry = battleRuntimeStore.getCachedAttendanceState({ battleId, userId });
        let joinedAttendance = false;
        let startedByFirstJoin = false;
        let battleSnapshot = battle;

        if (!entry) {
            const safeJoinedAt = joinedAt instanceof Date && Number.isFinite(joinedAt.getTime())
                ? new Date(joinedAt)
                : new Date();
            const safeResources = resourceSnapshot && typeof resourceSnapshot === 'object'
                ? resourceSnapshot
                : {};
            const registration = await battleService.registerAttendance(battleId, userId, {
                joinedAt: safeJoinedAt,
                battle: buildBattleSnapshotAfterAttendanceJoin({ battle }),
            });
            joinedAttendance = Boolean(registration?.joined);
            startedByFirstJoin = Boolean(registration?.startedByFirstJoin);
            if (joinedAttendance) {
                battleSnapshot = registration?.battleSnapshot || battleSnapshot || battle;
                if (!registration?.appliedTimerUpdate) {
                    await battleService.recomputeEndsAtForAttendance(battleId);
                }
                entry = buildInitialAttendanceRuntimeEntry({
                    userId,
                    joinedAt: safeJoinedAt,
                    sync: registration?.sync || null,
                    lumensAtBattleStart: safeResources.lumensAtBattleStart ?? null,
                    kAtBattleStart: safeResources.kAtBattleStart ?? null,
                    starsAtBattleStart: safeResources.starsAtBattleStart ?? null,
                });
                entry = await ensureAttendanceRuntimeSyncMetadata({
                    battleId,
                    userId,
                    entry,
                    sync: registration?.sync || null,
                }) || entry;
                await battleRuntimeStore.upsertAttendanceState({
                    battleId,
                    userId,
                    state: entry,
                    ttlMs,
                }).catch(() => {});
                return { entry, joinedAttendance, startedByFirstJoin, battleSnapshot };
            }
            entry = await getAttendanceRuntimeSnapshot({ battleId, userId });
            entry = await ensureAttendanceRuntimeSyncMetadata({ battleId, userId, entry }) || entry;
            return { entry, joinedAttendance, startedByFirstJoin, battleSnapshot };
        }

        if (shouldEnsureFirstJoin) {
            const firstJoinBattle = await battleService.markFirstPlayerJoinIfNeeded(battleId);
            startedByFirstJoin = Boolean(firstJoinBattle);
            if (firstJoinBattle) {
                battleSnapshot = firstJoinBattle;
            }
        }

        entry = await ensureAttendanceRuntimeSyncMetadata({ battleId, userId, entry }) || entry;

        const safeRejoinAt = joinedAt instanceof Date && Number.isFinite(joinedAt.getTime())
            ? new Date(joinedAt)
            : null;
        const nextJoinedAtMs = safeRejoinAt ? safeRejoinAt.getTime() : NaN;
        const needsJoinAnchorPatch = safeRejoinAt
            && (
                !entry?.sessionJoinedAt
                || !Number.isFinite(nextJoinedAtMs)
                || Math.abs(new Date(entry.sessionJoinedAt).getTime() - nextJoinedAtMs) > 1000
                || !entry?.enteredAt
            );
        if (needsJoinAnchorPatch) {
            entry = await syncAttendanceRuntimeSnapshot({
                battleId,
                userId,
                payload: {
                    $set: {
                        'attendance.$.sessionJoinedAt': safeRejoinAt,
                        'attendance.$.enteredAt': entry?.enteredAt || entry?.joinedAt || safeRejoinAt,
                    },
                },
                baseState: entry,
            }) || entry;
        }

        const safeResources = resourceSnapshot && typeof resourceSnapshot === 'object'
            ? resourceSnapshot
            : {};
        const needsResourcePatch = (
            (entry?.lumensAtBattleStart == null && safeResources.lumensAtBattleStart != null)
            || (entry?.kAtBattleStart == null && safeResources.kAtBattleStart != null)
            || (entry?.starsAtBattleStart == null && safeResources.starsAtBattleStart != null)
        );
        if (needsResourcePatch) {
            entry = await syncAttendanceRuntimeSnapshot({
                battleId,
                userId,
                payload: {
                    $set: {
                        ...(entry?.lumensAtBattleStart == null && safeResources.lumensAtBattleStart != null
                            ? { 'attendance.$.lumensAtBattleStart': Math.max(0, Number(safeResources.lumensAtBattleStart) || 0) }
                            : {}),
                        ...(entry?.kAtBattleStart == null && safeResources.kAtBattleStart != null
                            ? { 'attendance.$.kAtBattleStart': Math.max(0, Number(safeResources.kAtBattleStart) || 0) }
                            : {}),
                        ...(entry?.starsAtBattleStart == null && safeResources.starsAtBattleStart != null
                            ? { 'attendance.$.starsAtBattleStart': Math.max(0, Number(safeResources.starsAtBattleStart) || 0) }
                            : {}),
                    },
                },
                baseState: entry,
            }) || entry;
        }

        return { entry, joinedAttendance, startedByFirstJoin, battleSnapshot };
    }

    return {
        ensureBattleAttendanceReady,
        getAttendanceRuntimeSnapshot,
        syncAttendanceRuntimeSnapshot,
    };
}

module.exports = {
    buildBattleSnapshotAfterAttendanceJoin,
    buildInitialAttendanceRuntimeEntry,
    createBattleAttendanceRuntime,
};
