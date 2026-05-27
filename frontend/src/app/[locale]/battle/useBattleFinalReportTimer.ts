import { useEffect, type MutableRefObject } from 'react';
import { computeBattleFinalInitialDelayMs } from './battleClientState';

type SendFinalReport = () => Promise<void>;

export function useBattleFinalReportTimer({
    attendanceCount,
    battleEndsAtMs,
    battleFinalReportRetryIntervalMsRef,
    battleFinalReportWindowCapacityRef,
    battleId,
    battleJoinedRef,
    finalReportSentRef,
    finalReportTimerRef,
    sendFinalReport,
    summaryVisible,
    userId,
}: {
    attendanceCount: number;
    battleEndsAtMs: number | null;
    battleFinalReportRetryIntervalMsRef: MutableRefObject<number>;
    battleFinalReportWindowCapacityRef: MutableRefObject<number>;
    battleId: string | null;
    battleJoinedRef: MutableRefObject<boolean>;
    finalReportSentRef: MutableRefObject<boolean>;
    finalReportTimerRef: MutableRefObject<number | null>;
    sendFinalReport: SendFinalReport;
    summaryVisible: boolean;
    userId: string | null;
}) {
    useEffect(() => {
        if (finalReportTimerRef.current != null) {
            window.clearTimeout(finalReportTimerRef.current);
            finalReportTimerRef.current = null;
        }
        if (!summaryVisible || !battleId || !battleEndsAtMs || !battleJoinedRef.current) {
            return;
        }
        if (finalReportSentRef.current) return;

        const initialDelayMs = computeBattleFinalInitialDelayMs({
            battleId,
            userId,
            attendanceCount,
            capacity: battleFinalReportWindowCapacityRef.current,
            retryIntervalMs: battleFinalReportRetryIntervalMsRef.current,
        });

        finalReportTimerRef.current = window.setTimeout(() => {
            finalReportTimerRef.current = null;
            void sendFinalReport();
        }, Math.max(50, initialDelayMs));

        return () => {
            if (finalReportTimerRef.current != null) {
                window.clearTimeout(finalReportTimerRef.current);
                finalReportTimerRef.current = null;
            }
        };
    }, [
        attendanceCount,
        battleEndsAtMs,
        battleFinalReportRetryIntervalMsRef,
        battleFinalReportWindowCapacityRef,
        battleId,
        battleJoinedRef,
        finalReportSentRef,
        finalReportTimerRef,
        sendFinalReport,
        summaryVisible,
        userId,
    ]);
}
