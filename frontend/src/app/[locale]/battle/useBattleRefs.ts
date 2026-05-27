import { useRef } from 'react';
import type { EnemyLayerHandle } from './EnemyLayer';
import { BATTLE_REPORT_INTERVAL_SECONDS, FINAL_REPORT_RETRY_INTERVAL_MS } from './battleConstants';
import { createEmptyBattleMinuteReport } from './battleClientState';
import type {
    BattleBaddieState,
    BattleMinuteReportAccumulator,
    BattleProgressPersistOverrides,
    BattleScenarioVoiceCommand,
    InFlightDamageBatch,
    PendingBattleReportChunk,
    ShotPreview,
} from './battleTypes';

export function useBattleRefs() {
    const enemyLayerRef = useRef<EnemyLayerHandle>(null);
    const hitIdRef = useRef(0);
    const comboResetTimeoutRef = useRef<number | null>(null);
    const battleSyncTimerRef = useRef<number | null>(null);
    const battleJoinRetryTimerRef = useRef<number | null>(null);
    const finalReportTimerRef = useRef<number | null>(null);
    const finalReportSentRef = useRef(false);
    const pendingBattleReportRef = useRef<PendingBattleReportChunk | null>(null);
    const nextBattleReportSequenceRef = useRef(1);
    const lastBattleIdRef = useRef<string | null>(null);
    const lastBattleSyncWindowKeyRef = useRef<string | null>(null);
    const summaryRequestedRef = useRef<string | null>(null);
    const sparkCollectingRef = useRef(false);
    const baddieIdRef = useRef(0);
    const baddiesRef = useRef<BattleBaddieState[]>([]);
    const processedSparkIdsRef = useRef<Set<string>>(new Set());
    const processedBaddieWaveIdsRef = useRef<Set<string>>(new Set());
    const actedVoiceIdsRef = useRef<Set<string>>(new Set());
    const finalizedVoiceIdsRef = useRef<Set<string>>(new Set());
    const lastVoiceCommandRef = useRef<BattleScenarioVoiceCommand | null>(null);
    const serverOffsetMsRef = useRef<number>(0);
    const battleStartResourcesRef = useRef<{ lumens: number | null; k: number | null; stars: number | null }>({
        lumens: null,
        k: null,
        stars: null,
    });
    const battleSyncSlotRef = useRef(0);
    const battleSyncSlotCountRef = useRef(60);
    const battleSyncIntervalSecondsRef = useRef(BATTLE_REPORT_INTERVAL_SECONDS);
    const battleFinalReportAcceptSecondsRef = useRef(30);
    const battleFinalReportRetryIntervalMsRef = useRef(FINAL_REPORT_RETRY_INTERVAL_MS);
    const battleFinalReportWindowCapacityRef = useRef(500);
    const summaryLoadTimerRef = useRef<number | null>(null);
    const lastShotTelemetryRef = useRef<{ at: number; screenX: number; screenY: number } | null>(null);
    const confirmedUserDamageRef = useRef(0);
    const pendingUserDamageRef = useRef(0);
    const accountedHitKeysRef = useRef<Map<string, number>>(new Map());
    const predictedLumensRef = useRef(0);
    const comboCountRef = useRef(0);
    const comboSeriesDamageRef = useRef(0);
    const comboUpdatedAtRef = useRef<number | null>(null);
    const comboX2StartedAtRef = useRef<number | null>(null);
    const comboX2MaxDurationRef = useRef(0);
    const phoenixStageRef = useRef(0);
    const reportAccRef = useRef<BattleMinuteReportAccumulator>(createEmptyBattleMinuteReport());
    const damageHudTimerRef = useRef<number | null>(null);
    const lumensHudTimerRef = useRef<number | null>(null);
    const inFlightDamageBatchesRef = useRef<InFlightDamageBatch[]>([]);
    const shotPreviewRef = useRef<Map<string, ShotPreview>>(new Map());
    const battleJoinedRef = useRef(false);
    const battleSeenActiveThisVisitRef = useRef(false);
    const joinRequestedAtRef = useRef<string | null>(null);
    const battleJoinedAtIsoRef = useRef<string | null>(null);
    const heartbeatFailCountRef = useRef(0);
    const battleProgressPersistTimerRef = useRef<number | null>(null);
    const pendingBattleProgressOverridesRef = useRef<BattleProgressPersistOverrides | null>(null);
    const hydratedBattleProgressKeyRef = useRef<string | null>(null);

    return {
        accountedHitKeysRef,
        actedVoiceIdsRef,
        battleFinalReportAcceptSecondsRef,
        battleFinalReportRetryIntervalMsRef,
        battleFinalReportWindowCapacityRef,
        battleJoinedAtIsoRef,
        battleJoinedRef,
        battleJoinRetryTimerRef,
        battleProgressPersistTimerRef,
        battleSeenActiveThisVisitRef,
        battleStartResourcesRef,
        battleSyncIntervalSecondsRef,
        battleSyncSlotCountRef,
        battleSyncSlotRef,
        battleSyncTimerRef,
        baddieIdRef,
        baddiesRef,
        comboCountRef,
        comboResetTimeoutRef,
        comboSeriesDamageRef,
        comboUpdatedAtRef,
        comboX2MaxDurationRef,
        comboX2StartedAtRef,
        confirmedUserDamageRef,
        damageHudTimerRef,
        enemyLayerRef,
        finalReportSentRef,
        finalReportTimerRef,
        finalizedVoiceIdsRef,
        heartbeatFailCountRef,
        hitIdRef,
        hydratedBattleProgressKeyRef,
        inFlightDamageBatchesRef,
        joinRequestedAtRef,
        lastBattleIdRef,
        lastBattleSyncWindowKeyRef,
        lastShotTelemetryRef,
        lastVoiceCommandRef,
        lumensHudTimerRef,
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
        shotPreviewRef,
        sparkCollectingRef,
        summaryLoadTimerRef,
        summaryRequestedRef,
    };
}
