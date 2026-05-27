import { useCallback, useEffect, useState } from 'react';
import {
    NIGHT_SHIFT_END_HOUR,
    NIGHT_SHIFT_START_HOUR,
} from './nightShiftTime';
import type { NightShiftStatus } from './nightShiftTypes';

export function useNightShiftCountdown(status: NightShiftStatus | null) {
    const [shiftCountdownMs, setShiftCountdownMs] = useState(0);

    const getNextShiftStartMs = useCallback((nowMs = Date.now()) => {
        const shiftWindow = status?.shiftWindow;
        if (shiftWindow?.isOpen) return nowMs;

        const serverStartMs = shiftWindow?.startAt ? new Date(shiftWindow.startAt).getTime() : NaN;
        if (Number.isFinite(serverStartMs) && serverStartMs > nowMs) {
            return serverStartMs;
        }

        const now = new Date(nowMs);
        if (now.getHours() >= NIGHT_SHIFT_START_HOUR || now.getHours() < NIGHT_SHIFT_END_HOUR) {
            return nowMs;
        }

        const nextStart = new Date(now);
        nextStart.setHours(NIGHT_SHIFT_START_HOUR, 0, 0, 0);
        if (nextStart.getTime() <= nowMs) {
            nextStart.setDate(nextStart.getDate() + 1);
        }
        return nextStart.getTime();
    }, [status?.shiftWindow]);

    useEffect(() => {
        if (status?.isServing) {
            setShiftCountdownMs(0);
            return;
        }

        const syncCountdown = () => {
            const nowMs = Date.now();
            setShiftCountdownMs(Math.max(0, getNextShiftStartMs(nowMs) - nowMs));
        };

        syncCountdown();
        const interval = setInterval(syncCountdown, 1000);
        return () => clearInterval(interval);
    }, [getNextShiftStartMs, status?.isServing]);

    return shiftCountdownMs;
}
