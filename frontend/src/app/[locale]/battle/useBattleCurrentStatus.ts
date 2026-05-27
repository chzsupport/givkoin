import {
    useCallback,
    type Dispatch,
    type MutableRefObject,
    type SetStateAction,
} from 'react';
import { apiGet } from '@/utils/api';
import { clearActiveBattleLock } from '@/utils/activeBattleLock';
import type { BattleSummary } from '@/lib/battleSummary';
import {
    BATTLE_REQUEST_TIMEOUT_MS,
    FINAL_REPORT_RETRY_INTERVAL_MS,
    FINAL_RESULTS_WAIT_MS,
} from './battleConstants';
import {
    normalizeBattlePersonalState,
    parseBattleInjuries,
    parseBattleScenario,
} from './battleClientState';
import type {
    BattleActiveVoiceCommand,
    BattleBaddieState,
    BattleInjury,
    BattlePersonalState,
    BattleScenario,
    BattleSparkState,
    BattleWeakZone,
    StoredBattleProgress,
} from './battleTypes';

export function useBattleCurrentStatus({
    applyBattlePersonalState,
    applyServerNow,
    applyStoredBattleProgress,
    battleFinalReportAcceptSecondsRef,
    battleFinalReportRetryIntervalMsRef,
    battleFinalReportWindowCapacityRef,
    battleJoinedAtIsoRef,
    battleJoinedAtMs,
    battleJoinedRef,
    battleSeenActiveThisVisitRef,
    clearBattleProgress,
    confirmedUserDamageRef,
    joinBattle,
    lastBattleIdRef,
    lastBattleSyncWindowKeyRef,
    loadBattleSummary,
    readBattleProgress,
    redirectToTree,
    resetBattleDamageTracking,
    serverOffsetMsRef,
    setAttendanceCount,
    setBattleEndsAtMs,
    setBattleId,
    setBattleInjuries,
    setBattleJoinedAtMs,
    setBattleScenario,
    setBattleStartsAtMs,
    setBattleSummary,
    setBattleTimeLeftMs,
    setBaddies,
    setIsBattleActive,
    setSpark,
    setSparkRewardLumens,
    setSummaryLoadAtMs,
    setSummaryVisible,
    setVoiceCommand,
    setVoiceProgress,
    setWeakZone,
    summaryRequestedRef,
    summaryVisible,
    userId,
}: {
    applyBattlePersonalState: (snapshot: BattlePersonalState | null, options?: { preferServerValues?: boolean }) => boolean;
    applyServerNow: (serverNowMs: unknown) => void;
    applyStoredBattleProgress: (snapshot: StoredBattleProgress | null) => boolean;
    battleFinalReportAcceptSecondsRef: MutableRefObject<number>;
    battleFinalReportRetryIntervalMsRef: MutableRefObject<number>;
    battleFinalReportWindowCapacityRef: MutableRefObject<number>;
    battleJoinedAtIsoRef: MutableRefObject<string | null>;
    battleJoinedAtMs: number | null;
    battleJoinedRef: MutableRefObject<boolean>;
    battleSeenActiveThisVisitRef: MutableRefObject<boolean>;
    clearBattleProgress: (battleIdOverride?: string | null) => void;
    confirmedUserDamageRef: MutableRefObject<number>;
    joinBattle: () => Promise<void>;
    lastBattleIdRef: MutableRefObject<string | null>;
    lastBattleSyncWindowKeyRef: MutableRefObject<string | null>;
    loadBattleSummary: (id: string, options?: { silent?: boolean }) => Promise<boolean>;
    readBattleProgress: (battleIdOverride?: string | null) => StoredBattleProgress | null;
    redirectToTree: () => void;
    resetBattleDamageTracking: (nextConfirmedDamage?: number) => void;
    serverOffsetMsRef: MutableRefObject<number>;
    setAttendanceCount: Dispatch<SetStateAction<number>>;
    setBattleEndsAtMs: Dispatch<SetStateAction<number | null>>;
    setBattleId: Dispatch<SetStateAction<string | null>>;
    setBattleInjuries: Dispatch<SetStateAction<BattleInjury[]>>;
    setBattleJoinedAtMs: Dispatch<SetStateAction<number | null>>;
    setBattleScenario: Dispatch<SetStateAction<BattleScenario | null>>;
    setBattleStartsAtMs: Dispatch<SetStateAction<number | null>>;
    setBattleSummary: Dispatch<SetStateAction<BattleSummary | null>>;
    setBattleTimeLeftMs: Dispatch<SetStateAction<number>>;
    setBaddies: Dispatch<SetStateAction<BattleBaddieState[]>>;
    setIsBattleActive: Dispatch<SetStateAction<boolean>>;
    setSpark: Dispatch<SetStateAction<BattleSparkState | null>>;
    setSparkRewardLumens: Dispatch<SetStateAction<number>>;
    setSummaryLoadAtMs: Dispatch<SetStateAction<number | null>>;
    setSummaryVisible: Dispatch<SetStateAction<boolean>>;
    setVoiceCommand: Dispatch<SetStateAction<BattleActiveVoiceCommand | null>>;
    setVoiceProgress: Dispatch<SetStateAction<number>>;
    setWeakZone: Dispatch<SetStateAction<BattleWeakZone | null>>;
    summaryRequestedRef: MutableRefObject<string | null>;
    summaryVisible: boolean;
    userId: string;
}) {
    return useCallback(async () => {
        try {
            const data = await apiGet<unknown>('/battles/current', { timeoutMs: BATTLE_REQUEST_TIMEOUT_MS });
            const d = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
            const status = typeof d.status === 'string' ? d.status : '';
            const battle = typeof d.battle === 'object' && d.battle !== null ? (d.battle as Record<string, unknown>) : {};
            const currentUserId = String(userId || '').trim();
            applyServerNow(battle.serverNowMs);
            const battleIdValue = typeof battle._id === 'string' ? battle._id : '';
            const joinedAtIso = typeof battle.joinedAt === 'string' && battle.joinedAt.trim() ? battle.joinedAt : null;
            const nextPersonalState = normalizeBattlePersonalState(battle.personalState);
            if (status === 'active' && battleIdValue) {
                battleSeenActiveThisVisitRef.current = true;
                const previousBattleId = lastBattleIdRef.current;
                const isNewBattle = previousBattleId !== battleIdValue;
                const storedBattleProgress = readBattleProgress(battleIdValue);
                const parsedScenario = parseBattleScenario(battle.scenario);
                const injuries = parseBattleInjuries(battle.injuries);
                setBattleId(battleIdValue);
                lastBattleIdRef.current = battleIdValue;
                setIsBattleActive(true);
                if (parsedScenario) {
                    setBattleScenario(parsedScenario);
                    setSparkRewardLumens(Math.max(0, parsedScenario.sparkRewardLumens || 0));
                }
                setBattleInjuries(injuries);
                const durationMs = Math.max(0, Math.floor(Number(battle.durationSeconds) || 0) * 1000);
                const timeLeftMs = Math.max(0, Math.floor(Number(battle.timeLeftMs) || 0));
                const parsedEndsAt = Date.now() + serverOffsetMsRef.current + timeLeftMs;
                const parsedStartsAt = durationMs > 0 ? parsedEndsAt - durationMs : null;
                if (joinedAtIso && !battleJoinedAtIsoRef.current) {
                    battleJoinedAtIsoRef.current = joinedAtIso;
                }
                if (joinedAtIso && !battleJoinedAtMs) {
                    setBattleJoinedAtMs(new Date(joinedAtIso).getTime() + serverOffsetMsRef.current);
                }
                setBattleEndsAtMs((prev) => {
                    const sameBattle = previousBattleId === battleIdValue;
                    if (!sameBattle || prev == null) return parsedEndsAt;
                    // Countdown must never be extended by periodic polling jitter.
                    if (parsedEndsAt > prev + 2000) return prev;
                    return parsedEndsAt;
                });
                setBattleStartsAtMs(parsedStartsAt ?? null);
                setBattleTimeLeftMs(timeLeftMs);
                setSummaryVisible(false);
                setBattleSummary(null);
                setSummaryLoadAtMs(null);
                summaryRequestedRef.current = null;
                if (isNewBattle) {
                    setSpark(null);
                    setBaddies([]);
                    setWeakZone(null);
                    setVoiceCommand(null);
                    setVoiceProgress(0);
                    setBattleJoinedAtMs(null);
                    lastBattleSyncWindowKeyRef.current = null;
                    if (!storedBattleProgress) {
                        resetBattleDamageTracking(0);
                    }
                    battleJoinedRef.current = false;
                    void joinBattle();
                }
                if (storedBattleProgress) {
                    applyStoredBattleProgress(storedBattleProgress);
                } else if (nextPersonalState) {
                    applyBattlePersonalState(nextPersonalState, {
                        preferServerValues: true,
                    });
                }
                setAttendanceCount(Number(battle.attendanceCount) || 0);
            } else if (status === 'final_window' && battleIdValue) {
                if (currentUserId) {
                    clearActiveBattleLock({ battleId: battleIdValue, userId: currentUserId });
                }
                const canStayOnBattlePage = battleSeenActiveThisVisitRef.current || battleJoinedRef.current || summaryVisible;
                if (!canStayOnBattlePage) {
                    clearBattleProgress(battleIdValue);
                    redirectToTree();
                    return;
                }
                const injuries = parseBattleInjuries(battle.injuries);
                setBattleId(battleIdValue);
                lastBattleIdRef.current = battleIdValue;
                setIsBattleActive(false);
                setBattleInjuries(injuries);
                const finalWindowLeftMs = Math.max(0, Math.floor(Number(battle.finalWindowTimeLeftMs) || FINAL_RESULTS_WAIT_MS));
                const finalWindowSeconds = Math.max(0, Math.floor(Number(battle.finalWindowSeconds) || 60));
                const serverNowMs = Date.now() + serverOffsetMsRef.current;
                const endedAtMs = serverNowMs - Math.max(0, (finalWindowSeconds * 1000) - finalWindowLeftMs);
                setBattleStartsAtMs(null);
                setBattleEndsAtMs(endedAtMs);
                setBattleTimeLeftMs(0);
                battleFinalReportAcceptSecondsRef.current = Math.max(0, Math.floor(Number(battle.finalReportAcceptSeconds) || battleFinalReportAcceptSecondsRef.current || 30));
                battleFinalReportRetryIntervalMsRef.current = Math.max(250, Math.floor(Number(battle.finalReportRetryIntervalMs) || battleFinalReportRetryIntervalMsRef.current || FINAL_REPORT_RETRY_INTERVAL_MS));
                battleFinalReportWindowCapacityRef.current = Math.max(1, Math.floor(Number(battle.finalReportWindowCapacity) || battleFinalReportWindowCapacityRef.current || 500));
                setSummaryVisible(true);
                setSummaryLoadAtMs(Date.now());
                summaryRequestedRef.current = battleIdValue;
                setWeakZone(null);
                setSpark(null);
                setBaddies([]);
                setVoiceCommand(null);
                setVoiceProgress(0);
                setAttendanceCount(Number(battle.attendanceCount) || 0);
                setBattleJoinedAtMs(null);
                void loadBattleSummary(battleIdValue, { silent: true });
            } else {
                if (currentUserId) {
                    clearActiveBattleLock({ userId: currentUserId });
                }
                setIsBattleActive(false);
                setBattleScenario(null);
                setBattleInjuries([]);
                setWeakZone(null);
                setSpark(null);
                setAttendanceCount(0);
                setBaddies([]);
                setVoiceCommand(null);
                setVoiceProgress(0);
                setBattleStartsAtMs(null);
                setBattleEndsAtMs(null);
                setBattleTimeLeftMs(0);
                setBattleJoinedAtMs(null);
                setSummaryLoadAtMs(null);
                lastBattleSyncWindowKeyRef.current = null;
                resetBattleDamageTracking(confirmedUserDamageRef.current);
                const lastId = lastBattleIdRef.current;
                const canStayOnBattlePage = battleSeenActiveThisVisitRef.current || battleJoinedRef.current || summaryVisible;
                if (lastId && summaryRequestedRef.current !== lastId && canStayOnBattlePage) {
                    summaryRequestedRef.current = lastId;
                    setSummaryVisible(true);
                    await loadBattleSummary(lastId);
                    return;
                }
                redirectToTree();
            }
        } catch (e) {
            console.error('Failed to fetch battle:', e);
        }
    }, [
        applyBattlePersonalState,
        applyServerNow,
        applyStoredBattleProgress,
        battleFinalReportAcceptSecondsRef,
        battleFinalReportRetryIntervalMsRef,
        battleFinalReportWindowCapacityRef,
        battleJoinedAtIsoRef,
        battleJoinedAtMs,
        battleJoinedRef,
        battleSeenActiveThisVisitRef,
        clearBattleProgress,
        confirmedUserDamageRef,
        joinBattle,
        lastBattleIdRef,
        lastBattleSyncWindowKeyRef,
        loadBattleSummary,
        readBattleProgress,
        redirectToTree,
        resetBattleDamageTracking,
        serverOffsetMsRef,
        setAttendanceCount,
        setBattleEndsAtMs,
        setBattleId,
        setBattleInjuries,
        setBattleJoinedAtMs,
        setBattleScenario,
        setBattleStartsAtMs,
        setBattleSummary,
        setBattleTimeLeftMs,
        setBaddies,
        setIsBattleActive,
        setSpark,
        setSparkRewardLumens,
        setSummaryLoadAtMs,
        setSummaryVisible,
        setVoiceCommand,
        setVoiceProgress,
        setWeakZone,
        summaryRequestedRef,
        summaryVisible,
        userId,
    ]);
}
