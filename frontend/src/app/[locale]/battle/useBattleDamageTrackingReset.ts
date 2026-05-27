import {
    useCallback,
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
} from 'react';
import { BATTLE_REPORT_INTERVAL_SECONDS } from './battleConstants';
import { createEmptyBattleMinuteReport } from './battleClientState';
import type {
    BattleMinuteReportAccumulator,
    BattleProgressPersistOverrides,
    PendingBattleReportChunk,
    ShotPreview,
} from './battleTypes';
import type { BattleDisplaySyncMode } from './useBattleDisplayedStats';

type BattleStartResources = {
    lumens: number | null;
    k: number | null;
    stars: number | null;
};

export function useBattleDamageTrackingReset({
    accountedHitKeysRef,
    battleJoinedAtIsoRef,
    actedVoiceIdsRef,
    battleJoinRetryTimerRef,
    battleProgressPersistTimerRef,
    battleStartResourcesRef,
    clearInFlightDamageBatches,
    comboCountRef,
    comboSeriesDamageRef,
    comboUpdatedAtRef,
    comboX2MaxDurationRef,
    comboX2StartedAtRef,
    confirmedUserDamageRef,
    finalReportSentRef,
    finalReportTimerRef,
    finalizedVoiceIdsRef,
    hydratedBattleProgressKeyRef,
    joinRequestedAtRef,
    lastBattleSyncWindowKeyRef,
    lastVoiceCommandRef,
    nextBattleReportSequenceRef,
    pendingBattleProgressOverridesRef,
    pendingBattleReportRef,
    pendingUserDamageRef,
    phoenixStageRef,
    predictedLumensRef,
    processedBaddieWaveIdsRef,
    processedSparkIdsRef,
    reportAccRef,
    setComboCount,
    setUserDamage,
    shotPreviewRef,
    syncDisplayedLumens,
    userLumens,
}: {
    accountedHitKeysRef: MutableRefObject<Map<string, number>>;
    battleJoinedAtIsoRef: MutableRefObject<string | null>;
    actedVoiceIdsRef: MutableRefObject<Set<string>>;
    battleJoinRetryTimerRef: MutableRefObject<number | null>;
    battleProgressPersistTimerRef: MutableRefObject<number | null>;
    battleStartResourcesRef: MutableRefObject<BattleStartResources>;
    clearInFlightDamageBatches: () => void;
    comboCountRef: MutableRefObject<number>;
    comboSeriesDamageRef: MutableRefObject<number>;
    comboUpdatedAtRef: MutableRefObject<number | null>;
    comboX2MaxDurationRef: MutableRefObject<number>;
    comboX2StartedAtRef: MutableRefObject<number | null>;
    confirmedUserDamageRef: MutableRefObject<number>;
    finalReportSentRef: MutableRefObject<boolean>;
    finalReportTimerRef: MutableRefObject<number | null>;
    finalizedVoiceIdsRef: MutableRefObject<Set<string>>;
    hydratedBattleProgressKeyRef: MutableRefObject<string | null>;
    joinRequestedAtRef: MutableRefObject<string | null>;
    lastBattleSyncWindowKeyRef: MutableRefObject<string | null>;
    lastVoiceCommandRef: MutableRefObject<unknown | null>;
    nextBattleReportSequenceRef: MutableRefObject<number>;
    pendingBattleProgressOverridesRef: MutableRefObject<BattleProgressPersistOverrides | null>;
    pendingBattleReportRef: MutableRefObject<PendingBattleReportChunk | null>;
    pendingUserDamageRef: MutableRefObject<number>;
    phoenixStageRef: MutableRefObject<number>;
    predictedLumensRef: MutableRefObject<number>;
    processedBaddieWaveIdsRef: MutableRefObject<Set<string>>;
    processedSparkIdsRef: MutableRefObject<Set<string>>;
    reportAccRef: MutableRefObject<BattleMinuteReportAccumulator>;
    setComboCount: Dispatch<SetStateAction<number>>;
    setUserDamage: Dispatch<SetStateAction<number>>;
    shotPreviewRef: MutableRefObject<Map<string, ShotPreview>>;
    syncDisplayedLumens: (mode?: BattleDisplaySyncMode) => void;
    userLumens?: number | null;
}) {
    return useCallback((nextConfirmedDamage = 0) => {
        if (battleJoinRetryTimerRef.current != null) {
            window.clearTimeout(battleJoinRetryTimerRef.current);
            battleJoinRetryTimerRef.current = null;
        }
        joinRequestedAtRef.current = null;
        clearInFlightDamageBatches();
        shotPreviewRef.current.clear();
        accountedHitKeysRef.current.clear();
        reportAccRef.current = createEmptyBattleMinuteReport(reportAccRef.current.intervalSeconds || BATTLE_REPORT_INTERVAL_SECONDS);
        pendingBattleReportRef.current = null;
        finalReportSentRef.current = false;
        nextBattleReportSequenceRef.current = 1;
        if (finalReportTimerRef.current != null) {
            window.clearTimeout(finalReportTimerRef.current);
            finalReportTimerRef.current = null;
        }
        if (battleProgressPersistTimerRef.current != null) {
            window.clearTimeout(battleProgressPersistTimerRef.current);
            battleProgressPersistTimerRef.current = null;
        }
        pendingBattleProgressOverridesRef.current = null;
        battleJoinedAtIsoRef.current = null;
        hydratedBattleProgressKeyRef.current = null;
        battleStartResourcesRef.current = { lumens: null, k: null, stars: null };
        lastBattleSyncWindowKeyRef.current = null;
        confirmedUserDamageRef.current = Math.max(0, Math.round(nextConfirmedDamage));
        pendingUserDamageRef.current = 0;
        comboCountRef.current = 0;
        comboSeriesDamageRef.current = 0;
        comboUpdatedAtRef.current = null;
        comboX2StartedAtRef.current = null;
        comboX2MaxDurationRef.current = 0;
        phoenixStageRef.current = 0;
        processedSparkIdsRef.current = new Set();
        processedBaddieWaveIdsRef.current = new Set();
        actedVoiceIdsRef.current = new Set();
        finalizedVoiceIdsRef.current = new Set();
        lastVoiceCommandRef.current = null;
        predictedLumensRef.current = Math.max(0, Number(battleStartResourcesRef.current.lumens ?? userLumens ?? 0));
        setComboCount(0);
        setUserDamage(Math.max(0, confirmedUserDamageRef.current));
        syncDisplayedLumens('immediate');
    }, [
        accountedHitKeysRef,
        battleJoinedAtIsoRef,
        actedVoiceIdsRef,
        battleJoinRetryTimerRef,
        battleProgressPersistTimerRef,
        battleStartResourcesRef,
        clearInFlightDamageBatches,
        comboCountRef,
        comboSeriesDamageRef,
        comboUpdatedAtRef,
        comboX2MaxDurationRef,
        comboX2StartedAtRef,
        confirmedUserDamageRef,
        finalReportSentRef,
        finalReportTimerRef,
        finalizedVoiceIdsRef,
        hydratedBattleProgressKeyRef,
        joinRequestedAtRef,
        lastBattleSyncWindowKeyRef,
        lastVoiceCommandRef,
        nextBattleReportSequenceRef,
        pendingBattleProgressOverridesRef,
        pendingBattleReportRef,
        pendingUserDamageRef,
        phoenixStageRef,
        predictedLumensRef,
        processedBaddieWaveIdsRef,
        processedSparkIdsRef,
        reportAccRef,
        setComboCount,
        setUserDamage,
        shotPreviewRef,
        syncDisplayedLumens,
        userLumens,
    ]);
}
