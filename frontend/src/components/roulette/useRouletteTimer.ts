'use client';

import { useEffect, useState } from 'react';

export function useRouletteTimer(nextResetAt: string | null, isSpinning: boolean) {
    const [timeUntilReset, setTimeUntilReset] = useState('');

    useEffect(() => {
        const updateTimer = () => {
            if (!nextResetAt) return;
            const now = Date.now();
            const reset = new Date(nextResetAt).getTime();
            const diffMs = Math.max(0, reset - now);
            const hours = Math.floor(diffMs / (1000 * 60 * 60));
            const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
            setTimeUntilReset(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        };

        if (isSpinning) return;
        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [nextResetAt, isSpinning]);

    return timeUntilReset;
}
