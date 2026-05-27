import {
    useCallback,
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
} from 'react';
import { BATTLE_PROGRESS_STORAGE_PREFIX } from './battleConstants';
import {
    cloneBattleMinuteReport,
    createEmptyBattleMinuteReport,
    isBattleMinuteReportEmpty,
    normalizeStoredBattleProgress,
} from './battleClientState';
import type {
    BattleMinuteReportAccumulator,
    BattlePersonalState,
    BattleProgressPersistOverrides,
    PendingBattleReportChunk,
    StoredBattleProgress,
} from './battleTypes';

type BattleStartResources = {
    lumens: number | null;
    k: number | null;
    stars: number | null;
};

export function useBattleProgressState({
    actedVoiceIdsRef,
    battleId,
    battleJoinedAtIsoRef,
    battleJoinedAtMs,
    battleProgressPersistTimerRef,
    battleStartResourcesRef,
    comboCountRef,
    comboSeriesDamageRef,
    comboUpdatedAtRef,
    comboX2MaxDurationRef,
    comboX2StartedAtRef,
    confirmedUserDamageRef,
    finalizedVoiceIdsRef,
    lastBattleIdRef,
    nextBattleReportSequenceRef,
    pendingBattleProgressOverridesRef,
    pendingBattleReportRef,
    pendingUserDamageRef,
    phoenixStageRef,
    predictedLumensRef,
    processedBaddieWaveIdsRef,
    processedSparkIdsRef,
    reportAccRef,
    serverOffsetMsRef,
    setBattleJoinedAtMs,
    setComboCount,
    setDisplayedLumens,
    setUserDamage,
    userId,
}: {
    actedVoiceIdsRef: MutableRefObject<Set<string>>;
    battleId: string | null;
    battleJoinedAtIsoRef: MutableRefObject<string | null>;
    battleJoinedAtMs: number | null;
    battleProgressPersistTimerRef: MutableRefObject<number | null>;
    battleStartResourcesRef: MutableRefObject<BattleStartResources>;
    comboCountRef: MutableRefObject<number>;
    comboSeriesDamageRef: MutableRefObject<number>;
    comboUpdatedAtRef: MutableRefObject<number | null>;
    comboX2MaxDurationRef: MutableRefObject<number>;
    comboX2StartedAtRef: MutableRefObject<number | null>;
    confirmedUserDamageRef: MutableRefObject<number>;
    finalizedVoiceIdsRef: MutableRefObject<Set<string>>;
    lastBattleIdRef: MutableRefObject<string | null>;
    nextBattleReportSequenceRef: MutableRefObject<number>;
    pendingBattleProgressOverridesRef: MutableRefObject<BattleProgressPersistOverrides | null>;
    pendingBattleReportRef: MutableRefObject<PendingBattleReportChunk | null>;
    pendingUserDamageRef: MutableRefObject<number>;
    phoenixStageRef: MutableRefObject<number>;
    predictedLumensRef: MutableRefObject<number>;
    processedBaddieWaveIdsRef: MutableRefObject<Set<string>>;
    processedSparkIdsRef: MutableRefObject<Set<string>>;
    reportAccRef: MutableRefObject<BattleMinuteReportAccumulator>;
    serverOffsetMsRef: MutableRefObject<number>;
    setBattleJoinedAtMs: Dispatch<SetStateAction<number | null>>;
    setComboCount: Dispatch<SetStateAction<number>>;
    setDisplayedLumens: Dispatch<SetStateAction<number>>;
    setUserDamage: Dispatch<SetStateAction<number>>;
    userId?: string | null;
}) {
    const getBattleProgressStorageKey = useCallback((battleIdOverride?: string | null) => {
        const safeBattleId = String(battleIdOverride ?? battleId ?? '').trim();
        const safeUserId = String(userId || '').trim();
        if (!safeBattleId || !safeUserId) return null;
        return `${BATTLE_PROGRESS_STORAGE_PREFIX}:${safeUserId}:${safeBattleId}`;
    }, [battleId, userId]);

    const clearBattleProgress = useCallback((battleIdOverride?: string | null) => {
        if (typeof window === 'undefined') return;
        const key = getBattleProgressStorageKey(battleIdOverride);
        if (!key) return;
        window.localStorage.removeItem(key);
    }, [getBattleProgressStorageKey]);

    const getDisplayedUserDamageValue = useCallback((userDamageOverride?: number) => {
        return Math.max(
            0,
            Math.round(
                userDamageOverride
                ?? (confirmedUserDamageRef.current + pendingUserDamageRef.current),
            ),
        );
    }, [confirmedUserDamageRef, pendingUserDamageRef]);

    const readBattleProgress = useCallback((battleIdOverride?: string | null) => {
        if (typeof window === 'undefined') return null;
        const safeBattleId = String(battleIdOverride ?? battleId ?? lastBattleIdRef.current ?? '').trim();
        const safeUserId = String(userId || '').trim();
        const key = getBattleProgressStorageKey(safeBattleId);
        if (!safeBattleId || !safeUserId || !key) return null;

        try {
            const raw = window.localStorage.getItem(key);
            if (!raw) return null;
            return normalizeStoredBattleProgress(JSON.parse(raw), {
                battleId: safeBattleId,
                userId: safeUserId,
            });
        } catch {
            return null;
        }
    }, [battleId, getBattleProgressStorageKey, lastBattleIdRef, userId]);

    const flushBattleProgress = useCallback((overrides?: BattleProgressPersistOverrides | null) => {
        if (typeof window === 'undefined') return;
        const safeBattleId = String(battleId || lastBattleIdRef.current || '').trim();
        const safeUserId = String(userId || '').trim();
        const key = getBattleProgressStorageKey(safeBattleId);
        if (!safeBattleId || !safeUserId || !key) return;

        const merged = overrides || {};
        const pendingReport = merged.pendingReport === undefined
            ? pendingBattleReportRef.current
            : merged.pendingReport;
        const report = merged.report === undefined
            ? reportAccRef.current
            : merged.report;
        const joinedAtIso = merged.joinedAtIso === undefined
            ? battleJoinedAtIsoRef.current
            : merged.joinedAtIso;
        const joinedAtMsToPersist = merged.battleJoinedAtMs === undefined
            ? battleJoinedAtMs
            : merged.battleJoinedAtMs;

        const payload: StoredBattleProgress = {
            version: 1,
            battleId: safeBattleId,
            userId: safeUserId,
            savedAt: Date.now(),
            joinedAtIso: joinedAtIso || null,
            battleJoinedAtMs: joinedAtMsToPersist == null ? null : Math.max(0, Math.floor(Number(joinedAtMsToPersist) || 0)),
            startLumens: merged.startLumens === undefined
                ? battleStartResourcesRef.current.lumens
                : merged.startLumens ?? null,
            startK: merged.startK === undefined
                ? battleStartResourcesRef.current.k
                : merged.startK ?? null,
            startStars: merged.startStars === undefined
                ? battleStartResourcesRef.current.stars
                : merged.startStars ?? null,
            confirmedUserDamage: merged.confirmedUserDamage === undefined
                ? Math.max(0, Math.round(confirmedUserDamageRef.current))
                : Math.max(0, Math.round(Number(merged.confirmedUserDamage) || 0)),
            pendingUserDamage: merged.pendingUserDamage === undefined
                ? Math.max(0, Math.round(pendingUserDamageRef.current))
                : Math.max(0, Math.round(Number(merged.pendingUserDamage) || 0)),
            predictedLumens: merged.predictedLumens === undefined
                ? Math.max(0, Math.round(Number(predictedLumensRef.current) || 0))
                : Math.max(0, Math.round(Number(merged.predictedLumens) || 0)),
            comboCount: merged.comboCount === undefined
                ? Math.max(0, Math.round(comboCountRef.current))
                : Math.max(0, Math.round(Number(merged.comboCount) || 0)),
            comboSeriesDamage: merged.comboSeriesDamage === undefined
                ? Math.max(0, Math.round(comboSeriesDamageRef.current))
                : Math.max(0, Math.round(Number(merged.comboSeriesDamage) || 0)),
            comboUpdatedAt: merged.comboUpdatedAt === undefined
                ? comboUpdatedAtRef.current
                : merged.comboUpdatedAt ?? null,
            comboX2StartedAt: merged.comboX2StartedAt === undefined
                ? comboX2StartedAtRef.current
                : merged.comboX2StartedAt ?? null,
            comboX2MaxDuration: merged.comboX2MaxDuration === undefined
                ? Math.max(0, Math.round(comboX2MaxDurationRef.current))
                : Math.max(0, Math.round(Number(merged.comboX2MaxDuration) || 0)),
            phoenixStage: merged.phoenixStage === undefined
                ? Math.max(0, Math.round(phoenixStageRef.current))
                : Math.max(0, Math.round(Number(merged.phoenixStage) || 0)),
            report: cloneBattleMinuteReport(report || createEmptyBattleMinuteReport()),
            pendingReport: pendingReport
                ? {
                    sequence: Math.max(1, Math.floor(Number(pendingReport.sequence) || 1)),
                    report: cloneBattleMinuteReport(pendingReport.report || createEmptyBattleMinuteReport()),
                }
                : null,
            nextReportSequence: merged.nextReportSequence === undefined
                ? Math.max(1, Math.floor(Number(nextBattleReportSequenceRef.current) || 1))
                : Math.max(1, Math.floor(Number(merged.nextReportSequence) || 1)),
            processedSparkIds: merged.processedSparkIds === undefined
                ? Array.from(processedSparkIdsRef.current)
                : merged.processedSparkIds,
            processedBaddieWaveIds: merged.processedBaddieWaveIds === undefined
                ? Array.from(processedBaddieWaveIdsRef.current)
                : merged.processedBaddieWaveIds,
            actedVoiceIds: merged.actedVoiceIds === undefined
                ? Array.from(actedVoiceIdsRef.current)
                : merged.actedVoiceIds,
            finalizedVoiceIds: merged.finalizedVoiceIds === undefined
                ? Array.from(finalizedVoiceIdsRef.current)
                : merged.finalizedVoiceIds,
        };

        try {
            window.localStorage.setItem(key, JSON.stringify(payload));
        } catch {
        }
    }, [
        actedVoiceIdsRef,
        battleId,
        battleJoinedAtIsoRef,
        battleJoinedAtMs,
        battleStartResourcesRef,
        comboCountRef,
        comboSeriesDamageRef,
        comboUpdatedAtRef,
        comboX2MaxDurationRef,
        comboX2StartedAtRef,
        confirmedUserDamageRef,
        finalizedVoiceIdsRef,
        getBattleProgressStorageKey,
        lastBattleIdRef,
        nextBattleReportSequenceRef,
        pendingBattleReportRef,
        pendingUserDamageRef,
        phoenixStageRef,
        predictedLumensRef,
        processedBaddieWaveIdsRef,
        processedSparkIdsRef,
        reportAccRef,
        userId,
    ]);

    const persistBattleProgress = useCallback((overrides?: BattleProgressPersistOverrides) => {
        const nextOverrides = {
            ...(pendingBattleProgressOverridesRef.current || {}),
            ...(overrides || {}),
        };
        pendingBattleProgressOverridesRef.current = nextOverrides;
        if (battleProgressPersistTimerRef.current != null) {
            return;
        }
        battleProgressPersistTimerRef.current = window.setTimeout(() => {
            battleProgressPersistTimerRef.current = null;
            const pendingOverrides = pendingBattleProgressOverridesRef.current;
            pendingBattleProgressOverridesRef.current = null;
            flushBattleProgress(pendingOverrides);
        }, 120);
    }, [battleProgressPersistTimerRef, flushBattleProgress, pendingBattleProgressOverridesRef]);

    const applyStoredBattleProgress = useCallback((snapshot: StoredBattleProgress | null) => {
        if (!snapshot) return false;
        battleStartResourcesRef.current = {
            lumens: snapshot.startLumens,
            k: snapshot.startK,
            stars: snapshot.startStars,
        };
        confirmedUserDamageRef.current = Math.max(0, snapshot.confirmedUserDamage);
        pendingUserDamageRef.current = Math.max(0, snapshot.pendingUserDamage);
        predictedLumensRef.current = Math.max(0, snapshot.predictedLumens);
        comboCountRef.current = Math.max(0, snapshot.comboCount);
        comboSeriesDamageRef.current = Math.max(0, snapshot.comboSeriesDamage);
        comboUpdatedAtRef.current = snapshot.comboUpdatedAt;
        comboX2StartedAtRef.current = snapshot.comboX2StartedAt;
        comboX2MaxDurationRef.current = Math.max(0, snapshot.comboX2MaxDuration);
        phoenixStageRef.current = Math.max(0, snapshot.phoenixStage);
        reportAccRef.current = cloneBattleMinuteReport(snapshot.report);
        pendingBattleReportRef.current = snapshot.pendingReport
            ? {
                sequence: Math.max(1, Math.floor(Number(snapshot.pendingReport.sequence) || 1)),
                report: cloneBattleMinuteReport(snapshot.pendingReport.report),
            }
            : null;
        nextBattleReportSequenceRef.current = Math.max(
            pendingBattleReportRef.current ? pendingBattleReportRef.current.sequence + 1 : 1,
            Math.max(1, Math.floor(Number(snapshot.nextReportSequence) || 1)),
        );
        processedSparkIdsRef.current = new Set(snapshot.processedSparkIds);
        processedBaddieWaveIdsRef.current = new Set(snapshot.processedBaddieWaveIds);
        actedVoiceIdsRef.current = new Set(snapshot.actedVoiceIds);
        finalizedVoiceIdsRef.current = new Set(snapshot.finalizedVoiceIds);
        battleJoinedAtIsoRef.current = snapshot.joinedAtIso || null;
        if (snapshot.battleJoinedAtMs != null) {
            setBattleJoinedAtMs(snapshot.battleJoinedAtMs);
        }
        setComboCount(Math.max(0, snapshot.comboCount));
        setUserDamage(getDisplayedUserDamageValue(snapshot.confirmedUserDamage + snapshot.pendingUserDamage));
        setDisplayedLumens(Math.max(0, Math.round(Number(snapshot.predictedLumens) || 0)));
        return true;
    }, [
        actedVoiceIdsRef,
        battleJoinedAtIsoRef,
        battleStartResourcesRef,
        comboCountRef,
        comboSeriesDamageRef,
        comboUpdatedAtRef,
        comboX2MaxDurationRef,
        comboX2StartedAtRef,
        confirmedUserDamageRef,
        finalizedVoiceIdsRef,
        getDisplayedUserDamageValue,
        nextBattleReportSequenceRef,
        pendingBattleReportRef,
        pendingUserDamageRef,
        phoenixStageRef,
        predictedLumensRef,
        processedBaddieWaveIdsRef,
        processedSparkIdsRef,
        reportAccRef,
        setBattleJoinedAtMs,
        setComboCount,
        setDisplayedLumens,
        setUserDamage,
    ]);

    const hasMeaningfulBattleProgress = useCallback(() => {
        if (confirmedUserDamageRef.current > 0 || pendingUserDamageRef.current > 0) {
            return true;
        }
        if (!isBattleMinuteReportEmpty(reportAccRef.current)) {
            return true;
        }
        const startLumens = battleStartResourcesRef.current.lumens;
        if (startLumens != null && Math.round(Number(predictedLumensRef.current) || 0) !== Math.round(Number(startLumens) || 0)) {
            return true;
        }
        return false;
    }, [
        battleStartResourcesRef,
        confirmedUserDamageRef,
        pendingUserDamageRef,
        predictedLumensRef,
        reportAccRef,
    ]);

    const applyBattlePersonalState = useCallback((snapshot: BattlePersonalState | null, options?: { preferServerValues?: boolean }) => {
        if (!snapshot) return false;

        if (snapshot.startLumens != null || snapshot.startK != null || snapshot.startStars != null) {
            battleStartResourcesRef.current = {
                lumens: snapshot.startLumens ?? battleStartResourcesRef.current.lumens,
                k: snapshot.startK ?? battleStartResourcesRef.current.k,
                stars: snapshot.startStars ?? battleStartResourcesRef.current.stars,
            };
        }

        if (snapshot.joinedAt && !battleJoinedAtIsoRef.current) {
            battleJoinedAtIsoRef.current = snapshot.joinedAt;
        }
        if (snapshot.joinedAt && battleJoinedAtMs == null) {
            setBattleJoinedAtMs(new Date(snapshot.joinedAt).getTime() + serverOffsetMsRef.current);
        }

        const shouldHydrateFromServer = Boolean(options?.preferServerValues) || !hasMeaningfulBattleProgress();
        if (!shouldHydrateFromServer) {
            persistBattleProgress({
                joinedAtIso: battleJoinedAtIsoRef.current,
                battleJoinedAtMs: battleJoinedAtMs ?? (snapshot.joinedAt ? new Date(snapshot.joinedAt).getTime() + serverOffsetMsRef.current : null),
                startLumens: battleStartResourcesRef.current.lumens,
                startK: battleStartResourcesRef.current.k,
                startStars: battleStartResourcesRef.current.stars,
            });
            return false;
        }

        confirmedUserDamageRef.current = Math.max(0, snapshot.confirmedDamage);
        pendingUserDamageRef.current = 0;
        if (snapshot.confirmedLumens != null) {
            predictedLumensRef.current = Math.max(0, snapshot.confirmedLumens);
            setDisplayedLumens(Math.max(0, snapshot.confirmedLumens));
        } else if (battleStartResourcesRef.current.lumens != null) {
            predictedLumensRef.current = Math.max(0, Number(battleStartResourcesRef.current.lumens) || 0);
            setDisplayedLumens(Math.max(0, Number(battleStartResourcesRef.current.lumens) || 0));
        }
        setUserDamage(Math.max(0, snapshot.confirmedDamage));
        persistBattleProgress({
            joinedAtIso: battleJoinedAtIsoRef.current,
            battleJoinedAtMs: battleJoinedAtMs ?? (snapshot.joinedAt ? new Date(snapshot.joinedAt).getTime() + serverOffsetMsRef.current : null),
            startLumens: battleStartResourcesRef.current.lumens,
            startK: battleStartResourcesRef.current.k,
            startStars: battleStartResourcesRef.current.stars,
            confirmedUserDamage: confirmedUserDamageRef.current,
            pendingUserDamage: 0,
            predictedLumens: snapshot.confirmedLumens ?? predictedLumensRef.current,
        });
        return true;
    }, [
        battleJoinedAtIsoRef,
        battleJoinedAtMs,
        battleStartResourcesRef,
        confirmedUserDamageRef,
        hasMeaningfulBattleProgress,
        pendingUserDamageRef,
        persistBattleProgress,
        predictedLumensRef,
        serverOffsetMsRef,
        setBattleJoinedAtMs,
        setDisplayedLumens,
        setUserDamage,
    ]);

    return {
        applyBattlePersonalState,
        applyStoredBattleProgress,
        clearBattleProgress,
        flushBattleProgress,
        getBattleProgressStorageKey,
        getDisplayedUserDamageValue,
        persistBattleProgress,
        readBattleProgress,
    };
}
