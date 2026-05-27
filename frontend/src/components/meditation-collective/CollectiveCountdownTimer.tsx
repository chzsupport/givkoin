import { memo, useCallback, useEffect, useState } from 'react';
import { useI18n } from '@/context/I18nContext';
import { formatCollectiveMeditationTime } from './time';

type CollectiveCountdownTimerProps = {
    isActive: boolean;
    collectiveStartAt: number;
    serverTimeBaseMs: number | null;
    serverPerfBaseMs: number | null;
};

export const CollectiveCountdownTimer = memo(function CollectiveCountdownTimer({
    isActive,
    collectiveStartAt,
    serverTimeBaseMs,
    serverPerfBaseMs,
}: CollectiveCountdownTimerProps) {
    const { t } = useI18n();
    const getServerNowMs = useCallback(() => {
        if (serverTimeBaseMs == null || serverPerfBaseMs == null) return Date.now();
        return serverTimeBaseMs + (performance.now() - serverPerfBaseMs);
    }, [serverPerfBaseMs, serverTimeBaseMs]);

    const [tick, setTick] = useState(() => getServerNowMs());

    useEffect(() => {
        setTick(getServerNowMs());
    }, [collectiveStartAt, getServerNowMs, isActive]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            setTick(getServerNowMs());
        }, 1000);

        return () => window.clearInterval(interval);
    }, [getServerNowMs]);

    const msUntilStart = Math.max(0, collectiveStartAt - tick);
    const elapsed = Math.max(0, tick - collectiveStartAt);

    return (
        <div className="text-center">
            {!isActive ? (
                <>
                    <div className="text-tiny uppercase tracking-[0.35em] text-white/55">{t('meditation_collective.start_title')}</div>
                    <div className="mt-1 text-2xl sm:text-3xl font-extrabold text-cyan-200 tabular-nums">
                        {formatCollectiveMeditationTime(msUntilStart)}
                    </div>
                </>
            ) : (
                <>
                    <div className="text-tiny uppercase tracking-[0.35em] text-white/55">{t('meditation_collective.started_title')}</div>
                    <div className="mt-1 text-2xl sm:text-3xl font-extrabold text-red-400 tabular-nums">
                        {formatCollectiveMeditationTime(elapsed)}
                    </div>
                </>
            )}
        </div>
    );
});
