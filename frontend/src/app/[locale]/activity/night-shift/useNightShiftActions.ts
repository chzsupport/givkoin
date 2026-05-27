import { useCallback, type Dispatch, type SetStateAction } from 'react';
import { apiPost } from '@/utils/api';
import {
    clearNightShiftRuntime,
    getHourCheckpointForWindow,
    getNextPendingHeartbeatWindow,
    getNightShiftSummary,
    hydrateRuntimeFromStatus,
    markNightShiftWindowSent,
    mergeNightShiftWindow,
    type NightShiftLocalRuntime,
    readNightShiftRuntime,
    writeNightShiftRuntime,
} from '@/utils/nightShiftRuntime';
import type { EndShiftResult, NightShiftStatus } from './nightShiftTypes';

type UseNightShiftActionsParams = {
    runtime: NightShiftLocalRuntime | null;
    setRuntime: Dispatch<SetStateAction<NightShiftLocalRuntime | null>>;
    setStatus: Dispatch<SetStateAction<NightShiftStatus | null>>;
    fetchStatus: () => Promise<void>;
    setEndShiftData: Dispatch<SetStateAction<EndShiftResult | null>>;
    t: (key: string) => string;
};

export function useNightShiftActions({
    runtime,
    setRuntime,
    setStatus,
    fetchStatus,
    setEndShiftData,
    t,
}: UseNightShiftActionsParams) {
    const handleStartShift = useCallback(async () => {
        try {
            const data = await apiPost<{
                shiftSessionId: string;
                nightShift: NightShiftStatus;
            }>('/night-shift/start', {});
            const nextRuntime = hydrateRuntimeFromStatus(data.nightShift, null);
            if (nextRuntime) {
                writeNightShiftRuntime(nextRuntime);
                setRuntime(nextRuntime);
            }
            setStatus(data.nightShift);
        } catch (error) {
            alert(error instanceof Error ? error.message : t('night_shift.start_failed'));
        }
    }, [setRuntime, setStatus, t]);

    const flushPendingHeartbeatWindows = useCallback(async () => {
        while (true) {
            const currentRuntime = readNightShiftRuntime();
            if (!currentRuntime || !currentRuntime.shiftSessionId) {
                return { closed: false };
            }

            const pendingWindow = getNextPendingHeartbeatWindow(currentRuntime, Date.now());
            if (!pendingWindow) {
                return { closed: false };
            }

            const result = await apiPost<{
                accepted?: boolean;
                suspicious?: boolean;
                shouldClose?: boolean;
                closeReason?: string | null;
                currentWindow?: NightShiftStatus['currentWindow'];
            }>('/night-shift/heartbeat', {
                shiftSessionId: currentRuntime.shiftSessionId,
                windowStartedAt: pendingWindow.startedAt,
                windowEndedAt: pendingWindow.endedAt,
                ...(getHourCheckpointForWindow(currentRuntime, pendingWindow.index) || {}),
            });

            let nextRuntime = markNightShiftWindowSent(currentRuntime, pendingWindow.index);
            if (nextRuntime && result?.currentWindow) {
                nextRuntime = mergeNightShiftWindow(nextRuntime, result.currentWindow) || nextRuntime;
            }
            if (nextRuntime) {
                writeNightShiftRuntime(nextRuntime);
                setRuntime(nextRuntime);
            }

            if (result?.shouldClose) {
                clearNightShiftRuntime();
                setRuntime(null);
                await fetchStatus();
                setEndShiftData({
                    message: t('night_shift.shift_ended_auto'),
                    closeReason: result.closeReason || null,
                });
                return { closed: true };
            }
        }
    }, [fetchStatus, setEndShiftData, setRuntime, t]);

    const handleEndShift = useCallback(async () => {
        try {
            if (!runtime) {
                alert(t('night_shift.no_active_shift'));
                return;
            }
            const flushResult = await flushPendingHeartbeatWindows();
            if (flushResult.closed) {
                return;
            }
            const currentRuntime = readNightShiftRuntime() || runtime;
            const summary = getNightShiftSummary(currentRuntime, Date.now());
            if (!summary) {
                alert(t('night_shift.prepare_report_failed'));
                return;
            }
            const data = await apiPost<EndShiftResult>('/night-shift/end', {
                shiftSessionId: currentRuntime.shiftSessionId,
                startedAt: summary.startedAt,
                endedAt: summary.endedAt,
                totalDurationSeconds: summary.totalDurationSeconds,
                totalAnomalies: summary.totalAnomalies,
                pageHits: summary.pageHits,
                windowReports: summary.windowReports,
            });
            clearNightShiftRuntime();
            setRuntime(null);
            setStatus(prev => prev ? {
                ...prev,
                isServing: false,
                sessionId: null,
                pendingSettlement: data.queued && data.settlementEtaSeconds
                    ? { dueAt: new Date(Date.now() + (data.settlementEtaSeconds * 1000)).toISOString() }
                    : null,
            } : null);
            setEndShiftData(data);
        } catch (error) {
            alert(t('night_shift.end_failed'));
        }
    }, [flushPendingHeartbeatWindows, runtime, setEndShiftData, setRuntime, setStatus, t]);

    return {
        handleStartShift,
        handleEndShift,
    };
}
