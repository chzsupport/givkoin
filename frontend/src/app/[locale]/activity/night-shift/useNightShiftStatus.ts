import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/utils/api';
import {
    clearNightShiftRuntime,
    hydrateRuntimeFromStatus,
    type NightShiftLocalRuntime,
    readNightShiftRuntime,
    subscribeNightShiftRuntime,
    writeNightShiftRuntime,
} from '@/utils/nightShiftRuntime';
import type { NightShiftStatus } from './nightShiftTypes';

export function useNightShiftStatus(isAuthenticated: boolean) {
    const [status, setStatus] = useState<NightShiftStatus | null>(null);
    const [runtime, setRuntime] = useState<NightShiftLocalRuntime | null>(null);

    const fetchStatus = useCallback(async () => {
        if (!isAuthenticated) {
            setStatus(null);
            setRuntime(null);
            return;
        }

        try {
            const data = await apiGet<{ nightShift: NightShiftStatus }>('/night-shift/status');
            setStatus(data.nightShift);

            const existingRuntime = readNightShiftRuntime();
            const hydratedRuntime = hydrateRuntimeFromStatus(data.nightShift, existingRuntime);
            if (hydratedRuntime) {
                writeNightShiftRuntime(hydratedRuntime);
                setRuntime(hydratedRuntime);
            } else if (!data.nightShift?.isServing) {
                clearNightShiftRuntime();
                setRuntime(null);
            }
        } catch (error) {
            console.error(error);
        }
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) {
            setStatus(null);
            setRuntime(null);
            return;
        }

        const syncRuntime = (nextRuntime: NightShiftLocalRuntime | null) => {
            setRuntime(nextRuntime);
        };

        syncRuntime(readNightShiftRuntime());
        void fetchStatus();
        const unsubscribe = subscribeNightShiftRuntime(syncRuntime);

        return () => {
            unsubscribe();
        };
    }, [fetchStatus, isAuthenticated]);

    useEffect(() => {
        if (!status?.isServing || runtime) return;
        void fetchStatus();
    }, [fetchStatus, runtime, status?.isServing]);

    return {
        status,
        setStatus,
        runtime,
        setRuntime,
        fetchStatus,
    };
}
