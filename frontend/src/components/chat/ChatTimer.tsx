import React, { useEffect, useState } from 'react';

interface ChatTimerProps {
    startedAt: Date;
    onTimeUpdate?: (seconds: number) => void;
}

export const ChatTimer: React.FC<ChatTimerProps> = ({ startedAt, onTimeUpdate }) => {
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            const now = new Date();
            const diff = Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000);
            setSeconds(diff);
            if (onTimeUpdate) onTimeUpdate(diff);
        }, 1000);

        return () => clearInterval(interval);
    }, [startedAt, onTimeUpdate]);

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
