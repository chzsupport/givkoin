import {
    useCallback,
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
} from 'react';
import { apiPost } from '@/utils/api';
import {
    BATTLE_REPORT_INTERVAL_SECONDS,
    BATTLE_REQUEST_TIMEOUT_MS,
    FINAL_REPORT_RETRY_INTERVAL_MS,
} from './battleConstants';
import {
    getScenarioPastEventState,
    normalizeBattlePersonalState,
    parseBattleScenario,
} from './battleClientState';
import type {
    BattleBaddieState,
    BattleMinuteReportAccumulator,
    BattlePersonalState,
    BattleProgressPersistOverrides,
    BattleScenario,
    BattleScenarioVoiceCommand,
    BattleSparkState,
    StoredBattleProgress,
} from './battleTypes';

type PersistBattleProgress = (overrides?: BattleProgressPersistOverrides) => void;

export function useBattleJoin({
    actedVoiceIdsRef,
    applyBattlePersonalState,
    applyServerNow,
    battleFinalReportAcceptSecondsRef,
    battleFinalReportRetryIntervalMsRef,
    battleFinalReportWindowCapacityRef,
    battleId,
    battleJoinedAtIsoRef,
    battleJoinedRef,
    battleJoinRetryTimerRef,
    battleSeenActiveThisVisitRef,
    battleSyncIntervalSecondsRef,
    battleSyncSlotCountRef,
    battleSyncSlotRef,
    finalizedVoiceIdsRef,
    joinRequestedAtRef,
    lastVoiceCommandRef,
    persistBattleProgress,
    processedBaddieWaveIdsRef,
    processedSparkIdsRef,
    readBattleProgress,
    reportAccRef,
    serverOffsetMsRef,
    setAttendanceCount,
    setBattleEndsAtMs,
    setBattleJoinedAtMs,
    setBattleScenario,
    setBattleStartsAtMs,
    setBattleTimeLeftMs,
    setBaddies,
    setSpark,
    setSparkRewardLumens,
    setSummaryLoadAtMs,
}: {
    actedVoiceIdsRef: MutableRefObject<Set<string>>;
    applyBattlePersonalState: (snapshot: BattlePersonalState | null, options?: { preferServerValues?: boolean }) => boolean;
    applyServerNow: (serverNowMs: unknown) => void;
    battleFinalReportAcceptSecondsRef: MutableRefObject<number>;
    battleFinalReportRetryIntervalMsRef: MutableRefObject<number>;
    battleFinalReportWindowCapacityRef: MutableRefObject<number>;
    battleId: string | null;
    battleJoinedAtIsoRef: MutableRefObject<string | null>;
    battleJoinedRef: MutableRefObject<boolean>;
    battleJoinRetryTimerRef: MutableRefObject<number | null>;
    battleSeenActiveThisVisitRef: MutableRefObject<boolean>;
    battleSyncIntervalSecondsRef: MutableRefObject<number>;
    battleSyncSlotCountRef: MutableRefObject<number>;
    battleSyncSlotRef: MutableRefObject<number>;
    finalizedVoiceIdsRef: MutableRefObject<Set<string>>;
    joinRequestedAtRef: MutableRefObject<string | null>;
    lastVoiceCommandRef: MutableRefObject<BattleScenarioVoiceCommand | null>;
    persistBattleProgress: PersistBattleProgress;
    processedBaddieWaveIdsRef: MutableRefObject<Set<string>>;
    processedSparkIdsRef: MutableRefObject<Set<string>>;
    readBattleProgress: (battleIdOverride?: string | null) => StoredBattleProgress | null;
    reportAccRef: MutableRefObject<BattleMinuteReportAccumulator>;
    serverOffsetMsRef: MutableRefObject<number>;
    setAttendanceCount: Dispatch<SetStateAction<number>>;
    setBattleEndsAtMs: Dispatch<SetStateAction<number | null>>;
    setBattleJoinedAtMs: Dispatch<SetStateAction<number | null>>;
    setBattleScenario: Dispatch<SetStateAction<BattleScenario | null>>;
    setBattleStartsAtMs: Dispatch<SetStateAction<number | null>>;
    setBattleTimeLeftMs: Dispatch<SetStateAction<number>>;
    setBaddies: Dispatch<SetStateAction<BattleBaddieState[]>>;
    setSpark: Dispatch<SetStateAction<BattleSparkState | null>>;
    setSparkRewardLumens: Dispatch<SetStateAction<number>>;
    setSummaryLoadAtMs: Dispatch<SetStateAction<number | null>>;
}) {
    const joinBattle = useCallback(async () => {
        try {
            if (!joinRequestedAtRef.current) {
                joinRequestedAtRef.current = new Date().toISOString();
            }
            const data = await apiPost<{
                ok: boolean;
                queued?: boolean;
                retryAfterMs?: number;
                battleId: string;
                serverNowMs?: number;
                battleStartsAtMs?: number | null;
                joinedAt?: string | null;
                personalState?: BattlePersonalState | null;
                durationSeconds: number;
                timeLeftMs?: number;
                attendanceCount: number;
                syncSlot?: number;
                syncSlotCount?: number;
                syncIntervalSeconds?: number;
                finalReportAcceptSeconds?: number;
                finalReportRetryIntervalMs?: number;
                finalReportWindowCapacity?: number;
                scenario?: BattleScenario | null;
            }>(
                '/battles/join',
                { joinedAt: joinRequestedAtRef.current },
                { timeoutMs: BATTLE_REQUEST_TIMEOUT_MS },
            );

            if (data.queued) {
                if (battleJoinRetryTimerRef.current != null) {
                    window.clearTimeout(battleJoinRetryTimerRef.current);
                    battleJoinRetryTimerRef.current = null;
                }
                const retryAfterMs = Math.max(250, Math.floor(Number(data.retryAfterMs) || 2000));
                battleJoinRetryTimerRef.current = window.setTimeout(() => {
                    battleJoinRetryTimerRef.current = null;
                    void joinBattle();
                }, retryAfterMs);
                return;
            }

            applyServerNow(data.serverNowMs);
            const nextPersonalState = normalizeBattlePersonalState(data.personalState);

            if (data.ok) {
                battleSeenActiveThisVisitRef.current = true;
                const joinedAtIso = joinRequestedAtRef.current;
                joinRequestedAtRef.current = null;
                battleJoinedAtIsoRef.current = typeof data.joinedAt === 'string' && data.joinedAt
                    ? data.joinedAt
                    : joinedAtIso;
                if (battleJoinRetryTimerRef.current != null) {
                    window.clearTimeout(battleJoinRetryTimerRef.current);
                    battleJoinRetryTimerRef.current = null;
                }
                battleJoinedRef.current = true;
                const joinedAtMs = battleJoinedAtIsoRef.current
                    ? new Date(battleJoinedAtIsoRef.current).getTime() + serverOffsetMsRef.current
                    : Date.now() + serverOffsetMsRef.current;
                setBattleJoinedAtMs(joinedAtMs);
                battleSyncSlotRef.current = Math.max(0, Math.floor(Number(data.syncSlot) || 0));
                battleSyncSlotCountRef.current = Math.max(1, Math.floor(Number(data.syncSlotCount) || 60));
                battleSyncIntervalSecondsRef.current = Math.max(1, Math.floor(Number(data.syncIntervalSeconds) || BATTLE_REPORT_INTERVAL_SECONDS));
                battleFinalReportAcceptSecondsRef.current = Math.max(0, Math.floor(Number(data.finalReportAcceptSeconds) || 30));
                battleFinalReportRetryIntervalMsRef.current = Math.max(250, Math.floor(Number(data.finalReportRetryIntervalMs) || FINAL_REPORT_RETRY_INTERVAL_MS));
                battleFinalReportWindowCapacityRef.current = Math.max(1, Math.floor(Number(data.finalReportWindowCapacity) || 500));
                const durationMs = Math.max(0, Math.floor(Number(data.durationSeconds) || 0) * 1000);
                const safeTimeLeftMs = Math.max(0, Math.floor(Number(data.timeLeftMs) || 0));
                const nextBattleStartsAtMs = Number.isFinite(Number(data.battleStartsAtMs))
                    ? Math.max(0, Math.floor(Number(data.battleStartsAtMs) || 0))
                    : (durationMs > 0
                        ? Math.max(0, Math.floor((Date.now() + serverOffsetMsRef.current + safeTimeLeftMs) - durationMs))
                        : null);
                const nextBattleEndsAtMs = durationMs > 0
                    ? Math.max(
                        Date.now() + serverOffsetMsRef.current,
                        Math.floor((nextBattleStartsAtMs ?? 0) + durationMs),
                    )
                    : null;
                if (nextBattleStartsAtMs != null) {
                    setBattleStartsAtMs(nextBattleStartsAtMs);
                }
                if (nextBattleEndsAtMs != null) {
                    setBattleEndsAtMs(nextBattleEndsAtMs);
                    setBattleTimeLeftMs(Math.max(0, nextBattleEndsAtMs - (Date.now() + serverOffsetMsRef.current)));
                }
                const parsedScenario = parseBattleScenario(data.scenario);
                setBattleScenario(parsedScenario);
                const elapsedAtJoinMs = nextBattleStartsAtMs == null
                    ? 0
                    : Math.max(0, Math.round(joinedAtMs - nextBattleStartsAtMs));
                const pastScenarioState = getScenarioPastEventState(parsedScenario, elapsedAtJoinMs);
                processedSparkIdsRef.current = new Set([
                    ...pastScenarioState.pastSparkIds,
                    ...reportAccRef.current.sparkIds,
                ]);
                processedBaddieWaveIdsRef.current = new Set(pastScenarioState.pastBaddieWaveIds);
                actedVoiceIdsRef.current = new Set();
                finalizedVoiceIdsRef.current = new Set((reportAccRef.current.voiceResults || []).map((item) => item.id));
                lastVoiceCommandRef.current = null;
                setSpark(null);
                setBaddies([]);
                if (parsedScenario) {
                    setSparkRewardLumens(Math.max(0, parsedScenario.sparkRewardLumens || 0));
                }
                const nextAttendanceCount = Math.max(0, Number(data.attendanceCount) || 0);
                setAttendanceCount(nextAttendanceCount);
                setSummaryLoadAtMs(null);
                if (nextPersonalState) {
                    applyBattlePersonalState(nextPersonalState, {
                        preferServerValues: !Boolean(readBattleProgress(data.battleId || battleId)),
                    });
                }
                persistBattleProgress({
                    joinedAtIso: battleJoinedAtIsoRef.current,
                    battleJoinedAtMs: joinedAtMs,
                });
            }
        } catch (e) {
            console.error('Join battle error:', e);
        }
    }, [
        actedVoiceIdsRef,
        applyBattlePersonalState,
        applyServerNow,
        battleFinalReportAcceptSecondsRef,
        battleFinalReportRetryIntervalMsRef,
        battleFinalReportWindowCapacityRef,
        battleId,
        battleJoinedAtIsoRef,
        battleJoinedRef,
        battleJoinRetryTimerRef,
        battleSeenActiveThisVisitRef,
        battleSyncIntervalSecondsRef,
        battleSyncSlotCountRef,
        battleSyncSlotRef,
        finalizedVoiceIdsRef,
        joinRequestedAtRef,
        lastVoiceCommandRef,
        persistBattleProgress,
        processedBaddieWaveIdsRef,
        processedSparkIdsRef,
        readBattleProgress,
        reportAccRef,
        serverOffsetMsRef,
        setAttendanceCount,
        setBattleEndsAtMs,
        setBattleJoinedAtMs,
        setBattleScenario,
        setBattleStartsAtMs,
        setBattleTimeLeftMs,
        setBaddies,
        setSpark,
        setSparkRewardLumens,
        setSummaryLoadAtMs,
    ]);

    return joinBattle;
}
