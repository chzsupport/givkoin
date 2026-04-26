'use client';

import React, { useEffect, useState } from 'react';
import { Clock, Crosshair } from 'lucide-react';
import { useI18n } from '@/context/I18nContext';

interface ShiftStatsProps {
    startTime: string | null;
    anomaliesCleared: number;
}

export const ShiftStats: React.FC<ShiftStatsProps> = ({ startTime, anomaliesCleared }) => {
    const { t } = useI18n();
    const [elapsed, setElapsed] = useState<string>('00:00:00');

    useEffect(() => {
        if (!startTime) {
            setElapsed('00:00:00');
            return;
        }

        const start = new Date(startTime).getTime();
        const timer = setInterval(() => {
            const now = Date.now();
            const diff = now - start;

            // Cap at 8 hours
            const MAX_DURATION = 8 * 60 * 60 * 1000;
            const displayDiff = Math.min(diff, MAX_DURATION);

            const hours = Math.floor(displayDiff / (1000 * 60 * 60));
            const minutes = Math.floor((displayDiff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((displayDiff % (1000 * 60)) / 1000);

            setElapsed(
                `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
            );
        }, 1000);

        return () => clearInterval(timer);
    }, [startTime]);

    return (
        <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center">
                <Clock className="w-6 h-6 text-blue-400 mb-2" />
                <span className="text-xs text-gray-400 uppercase tracking-widest mb-1">{t('night_shift.time_on_post')}</span>
                <span className="text-2xl font-mono text-white tracking-widest">{elapsed}</span>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center">
                <Crosshair className="w-6 h-6 text-purple-400 mb-2" />
                <span className="text-xs text-gray-400 uppercase tracking-widest mb-1">{t('night_shift.cleared')}</span>
                <span className="text-2xl font-mono text-white tracking-widest">{anomaliesCleared}</span>
            </div>
        </div>
    );
};
