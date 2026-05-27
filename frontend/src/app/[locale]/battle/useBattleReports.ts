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
    cloneBattleMinuteReport,
    createEmptyBattleMinuteReport,
    isBattleMinuteReportEmpty,
    normalizeBattlePersonalState,
} from './battleClientState';
import type {
    BattleMinuteReportAccumulator,
    BattlePersonalState,
    BattleScenarioVoiceCommand,
    PendingBattleReportChunk,
} from './battleTypes';

export function useBattleReports({
    applyBattlePersonalState,
    applyServerNow,
    battleEndsAtMs,
    battleFinalReportAcceptSecondsRef,
    battleFinalReportRetryIntervalMsRef,
    battleId,
    battleJoinedRef,
    finalReportSentRef,
    finalReportTimerRef,
    finalizeComboForReport,
    finalizeVoiceCommandResult,
    heartbeatFailCountRef,
    isBrowserOnline,
    lastVoiceCommandRef,
    nextBattleReportSequenceRef,
    pendingBattleReportRef,
    reportAccRef,
    serverOffsetMsRef,
    setAttendanceCount,
    setBattleEndsAtMs,
    setBattleTimeLeftMs,
    setConnectionLost,
}: {
    applyBattlePersonalState: (snapshot: BattlePersonalState | null, options?: { preferServerValues?: boolean }) => boolean;
    applyServerNow: (serverNowMs: unknown) => void;
    battleEndsAtMs: number | null;
    battleFinalReportAcceptSecondsRef: MutableRefObject<number>;
    battleFinalReportRetryIntervalMsRef: MutableRefObject<number>;
    battleId: string | null;
    battleJoinedRef: MutableRefObject<boolean>;
    finalReportSentRef: MutableRefObject<boolean>;
    finalReportTimerRef: MutableRefObject<number | null>;
    finalizeComboForReport: () => void;
    finalizeVoiceCommandResult: (command: BattleScenarioVoiceCommand | null) => void;
    heartbeatFailCountRef: MutableRefObject<number>;
    isBrowserOnline: boolean;
    lastVoiceCommandRef: MutableRefObject<BattleScenarioVoiceCommand | null>;
    nextBattleReportSequenceRef: MutableRefObject<number>;
    pendingBattleReportRef: MutableRefObject<PendingBattleReportChunk | null>;
    reportAccRef: MutableRefObject<BattleMinuteReportAccumulator>;
    serverOffsetMsRef: MutableRefObject<number>;
    setAttendanceCount: Dispatch<SetStateAction<number>>;
    setBattleEndsAtMs: Dispatch<SetStateAction<number | null>>;
    setBattleTimeLeftMs: Dispatch<SetStateAction<number>>;
    setConnectionLost: Dispatch<SetStateAction<boolean>>;
}) {
    const sealPendingBattleReport = useCallback(() => {
        if (pendingBattleReportRef.current) {
            return pendingBattleReportRef.current;
        }
        if (isBattleMinuteReportEmpty(reportAccRef.current)) {
            return null;
        }
        const chunk: PendingBattleReportChunk = {
            sequence: nextBattleReportSequenceRef.current,
            report: cloneBattleMinuteReport(reportAccRef.current),
        };
        nextBattleReportSequenceRef.current += 1;
        pendingBattleReportRef.current = chunk;
        reportAccRef.current = createEmptyBattleMinuteReport(chunk.report?.intervalSeconds || BATTLE_REPORT_INTERVAL_SECONDS);
        return chunk;
    }, [nextBattleReportSequenceRef, pendingBattleReportRef, reportAccRef]);

    const sendHeartbeat = useCallback(async () => {
        if (!battleId || !battleJoinedRef.current) return;
        if (battleEndsAtMs) {
            const nowByServer = Date.now() + serverOffsetMsRef.current;
            if (nowByServer >= battleEndsAtMs) {
                return;
            }
        }
        try {
            const pendingChunk = sealPendingBattleReport();
            const data = await apiPost<{
                ok: boolean;
                serverNowMs?: number;
                timeLeftMs: number;
                attendanceCount: number;
                acceptedReport?: boolean;
                ignoredReport?: boolean;
                personalState?: BattlePersonalState | null;
            }>(
                '/battles/heartbeat',
                pendingChunk
                    ? {
                        battleId,
                        reportSequence: pendingChunk.sequence,
                        report: pendingChunk.report,
                    }
                    : { battleId },
                { timeoutMs: BATTLE_REQUEST_TIMEOUT_MS },
            );

            if (data.ok) {
                applyServerNow(data.serverNowMs);
                if (pendingChunk && (data.acceptedReport || data.ignoredReport) && pendingBattleReportRef.current?.sequence === pendingChunk.sequence) {
                    pendingBattleReportRef.current = null;
                }
                heartbeatFailCountRef.current = 0;
                setConnectionLost(false);
                const safeTimeLeftMs = Math.max(0, Math.floor(Number(data.timeLeftMs) || 0));
                const localEndsAtMs = Date.now() + serverOffsetMsRef.current + safeTimeLeftMs;
                setBattleEndsAtMs(localEndsAtMs);
                setBattleTimeLeftMs(safeTimeLeftMs);
                setAttendanceCount(data.attendanceCount || 0);
                const nextPersonalState = normalizeBattlePersonalState(data.personalState);
                if (nextPersonalState) {
                    applyBattlePersonalState(nextPersonalState);
                }
            }
        } catch (e) {
            console.error('Heartbeat error:', e);
            heartbeatFailCountRef.current += 1;
            if (heartbeatFailCountRef.current >= 2) {
                setConnectionLost(true);
            }
        }
    }, [
        applyBattlePersonalState,
        applyServerNow,
        battleEndsAtMs,
        battleId,
        battleJoinedRef,
        heartbeatFailCountRef,
        pendingBattleReportRef,
        sealPendingBattleReport,
        serverOffsetMsRef,
        setAttendanceCount,
        setBattleEndsAtMs,
        setBattleTimeLeftMs,
        setConnectionLost,
    ]);

    const sendFinalReport = useCallback(async () => {
        if (!battleId || !battleJoinedRef.current || finalReportSentRef.current) return;
        if (!isBrowserOnline) return;

        const reportWindowEndMs = battleEndsAtMs
            ? battleEndsAtMs + (Math.max(0, Math.floor(Number(battleFinalReportAcceptSecondsRef.current) || 30)) * 1000)
            : null;
        const nowByServer = Date.now() + serverOffsetMsRef.current;
        if (!battleEndsAtMs || nowByServer < battleEndsAtMs) return;
        if (reportWindowEndMs != null && nowByServer > reportWindowEndMs) return;

        if (lastVoiceCommandRef.current) {
            finalizeVoiceCommandResult(lastVoiceCommandRef.current);
            lastVoiceCommandRef.current = null;
        }

        finalizeComboForReport();

        const pendingChunk = sealPendingBattleReport();
        if (!pendingChunk) {
            finalReportSentRef.current = true;
            return;
        }

        try {
            const res = await apiPost<{
                ok?: boolean;
                accepted?: boolean;
                ignored?: boolean;
                limited?: boolean;
                retryAfterMs?: number;
            }>('/battles/damage', {
                battleId,
                action: 'final',
                reportSequence: pendingChunk.sequence,
                report: pendingChunk.report,
            }, { timeoutMs: BATTLE_REQUEST_TIMEOUT_MS });

            if (res?.accepted || res?.ignored) {
                if (pendingBattleReportRef.current?.sequence === pendingChunk.sequence) {
                    pendingBattleReportRef.current = null;
                }
                finalReportSentRef.current = true;
                return;
            }

            const retryDelay = Math.max(
                FINAL_REPORT_RETRY_INTERVAL_MS,
                Math.floor(Number(res?.retryAfterMs) || Number(battleFinalReportRetryIntervalMsRef.current) || FINAL_REPORT_RETRY_INTERVAL_MS),
            );
            if (reportWindowEndMs != null && nowByServer > reportWindowEndMs) return;
            if (finalReportTimerRef.current != null) return;
            finalReportTimerRef.current = window.setTimeout(() => {
                finalReportTimerRef.current = null;
                void sendFinalReport();
            }, retryDelay);
            return;
        } catch (error) {
            void error;
        }

        if (reportWindowEndMs != null && nowByServer > reportWindowEndMs) return;
        if (finalReportTimerRef.current != null) return;

        const retryDelay = Math.max(
            FINAL_REPORT_RETRY_INTERVAL_MS,
            Math.floor(Number(battleFinalReportRetryIntervalMsRef.current) || FINAL_REPORT_RETRY_INTERVAL_MS),
        );
        finalReportTimerRef.current = window.setTimeout(() => {
            finalReportTimerRef.current = null;
            void sendFinalReport();
        }, retryDelay);
    }, [
        battleEndsAtMs,
        battleFinalReportAcceptSecondsRef,
        battleFinalReportRetryIntervalMsRef,
        battleId,
        battleJoinedRef,
        finalReportSentRef,
        finalReportTimerRef,
        finalizeComboForReport,
        finalizeVoiceCommandResult,
        isBrowserOnline,
        lastVoiceCommandRef,
        pendingBattleReportRef,
        sealPendingBattleReport,
        serverOffsetMsRef,
    ]);

    return {
        sendFinalReport,
        sendHeartbeat,
    };
}
