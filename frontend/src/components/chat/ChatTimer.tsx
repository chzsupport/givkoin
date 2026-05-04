import React, { useEffect, useState } from 'react';

interface ChatTimerProps {
    startedAt: Date;
    elapsedSeconds?: number;
    onTimeUpdate?: (seconds: number) => void;
}

export const ChatTimer: React.FC<ChatTimerProps> = ({ startedAt, elapsedSeconds, onTimeUpdate }) => {
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        if (typeof elapsedSeconds === 'number' && Number.isFinite(elapsedSeconds)) {
            const safeSeconds = Math.max(0, Math.floor(elapsedSeconds));
            setSeconds(safeSeconds);
            if (onTimeUpdate) onTimeUpdate(safeSeconds);
            return;
        }

        const interval = setInterval(() => {
            const now = new Date();
            const diff = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000));
            setSeconds(diff);
            if (onTimeUpdate) onTimeUpdate(diff);
        }, 1000);

        return () => clearInterval(interval);
    }, [startedAt, elapsedSeconds, onTimeUpdate]);

    const formatTime = (totalSeconds: number) => {
        const m = Math.floor(totalSeconds / 60);
        const s = totalSeconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const isSafe = seconds >= 300; // 5 minutes

    return (
        <div className={`px-3 py-1 rounded-full text-sm font-mono ${isSafe ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
            {formatTime(seconds)}
        </div>
    );
};
