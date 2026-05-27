import { useCallback, useMemo } from 'react';
import {
    getCurrentHourAnomalies,
    type NightShiftLocalRuntime,
} from '@/utils/nightShiftRuntime';
import { getSiteLanguage, getSiteLanguageLocale } from '@/i18n/siteLanguage';
import { normalizeSitePath } from '@/utils/sitePath';
import type { NightShiftStatus } from './nightShiftTypes';

const HOURLY_ANOMALY_GOAL = 60;
const EMPTY_EARNINGS = { k: 0, lm: 0, stars: 0 };

type UseNightShiftViewDataParams = {
    status: NightShiftStatus | null;
    runtime: NightShiftLocalRuntime | null;
    radarTarget: string | null;
    radarTargetId: string | null;
    t: (key: string) => string;
};

const getLocalAnomaliesCount = (runtime: NightShiftLocalRuntime | null) => {
    if (!runtime) return 0;
    return Object.values(runtime.windows || {}).reduce((sum, window) => sum + (window.resolvedAnomalies?.length || 0), 0);
};

export function useNightShiftViewData({
    status,
    runtime,
    radarTarget,
    radarTargetId,
    t,
}: UseNightShiftViewDataParams) {
    const formatShortTime = useCallback((value?: string | null) => {
        if (!value) return '—';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return '—';
        return parsed.toLocaleTimeString(getSiteLanguageLocale(getSiteLanguage()), { hour: '2-digit', minute: '2-digit' });
    }, []);

    const formatPageLabel = useCallback((pagePath: string) => {
        const rawPath = String(pagePath || '').trim();
        const normalized = rawPath ? normalizeSitePath(rawPath) : '';
        const labels: Record<string, string> = {
            '/tree': t('night_shift.page_label.tree'),
            '/bridges': t('night_shift.page_label.bridges'),
            '/fortune': t('night_shift.page_label.fortune'),
            '/fortune/roulette': t('night_shift.page_label.fortune_roulette'),
            '/fortune/lottery': t('night_shift.page_label.fortune_lottery'),
            '/galaxy': t('night_shift.page_label.galaxy'),
            '/shop': t('night_shift.page_label.shop'),
            '/practice': t('night_shift.page_label.practice'),
        };
        return labels[normalized] || normalized || t('landing.unknown');
    }, [t]);

    const formatSectorLabel = useCallback((sectorId?: string | null, fallback?: string | null) => {
        const labels: Record<string, string> = {
            fortune: t('night_shift.sector_label.fortune'),
            bridges: t('night_shift.sector_label.bridges'),
            galaxy: t('night_shift.sector_label.galaxy'),
            chronicle: t('night_shift.sector_label.chronicle'),
            news: t('night_shift.sector_label.news'),
            shop: t('night_shift.sector_label.shop'),
        };

        const normalizedId = String(sectorId || '').trim();
        if (labels[normalizedId]) return labels[normalizedId];

        const rawFallback = String(fallback || '').trim();
        return rawFallback || t('night_shift.unknown_sector');
    }, [t]);

    const totalResolvedAnomalies = status?.isServing
        ? getLocalAnomaliesCount(runtime)
        : (status?.stats?.anomaliesCleared || 0);
    const currentHourAnomalies = status?.isServing ? getCurrentHourAnomalies(runtime) : 0;
    const currentHourProgress = Math.min(100, Math.round((currentHourAnomalies / HOURLY_ANOMALY_GOAL) * 100));
    const currentHourRemaining = Math.max(0, HOURLY_ANOMALY_GOAL - currentHourAnomalies);
    const totalEarnings = status?.stats?.totalEarnings || EMPTY_EARNINGS;
    const payableHours = status?.payableHoursCurrent || 0;
    const consecutiveEmptyWindows = status?.consecutiveEmptyWindows || 0;
    const pendingSettlementTime = status?.pendingSettlement?.dueAt ? formatShortTime(status.pendingSettlement.dueAt) : null;
    const hourTempo = currentHourProgress >= 100
        ? { title: t('night_shift.tempo.hour_closed.title'), note: t('night_shift.tempo.hour_closed.note') }
        : currentHourProgress >= 75
            ? { title: t('night_shift.tempo.strong.title'), note: t('night_shift.tempo.strong.note') }
            : currentHourProgress >= 40
                ? { title: t('night_shift.tempo.working.title'), note: t('night_shift.tempo.working.note') }
                : { title: t('night_shift.tempo.weak.title'), note: t('night_shift.tempo.weak.note') };
    const postRisk = consecutiveEmptyWindows >= 3
        ? { title: t('night_shift.risk.high.title'), note: t('night_shift.risk.high.note') }
        : consecutiveEmptyWindows >= 1
            ? { title: t('night_shift.risk.moderate.title'), note: t('night_shift.risk.moderate.note') }
            : { title: t('night_shift.risk.low.title'), note: t('night_shift.risk.low.note') };

    const recentResolved = useMemo(() => {
        if (!runtime) return [];

        return Object.values(runtime.windows || {})
            .flatMap((window) => {
                const anomalyMap = new Map(window.anomalies.map((anomaly) => [anomaly.id, anomaly]));
                return window.resolvedAnomalies.map((resolved) => {
                    const anomaly = anomalyMap.get(resolved.anomalyId);
                    return {
                        anomalyId: resolved.anomalyId,
                        sectorName: formatSectorLabel(anomaly?.sectorId, anomaly?.sectorName),
                        pagePath: resolved.pagePath,
                        clearedAt: resolved.clearedAt,
                        windowIndex: window.index,
                    };
                });
            })
            .sort((left, right) => new Date(right.clearedAt).getTime() - new Date(left.clearedAt).getTime())
            .slice(0, 6);
    }, [formatSectorLabel, runtime]);

    const radarTargetLabel = radarTargetId
        ? formatSectorLabel(radarTargetId, radarTarget)
        : radarTarget;

    return {
        totalResolvedAnomalies,
        currentHourAnomalies,
        hourlyGoal: HOURLY_ANOMALY_GOAL,
        currentHourProgress,
        currentHourRemaining,
        totalEarnings,
        payableHours,
        consecutiveEmptyWindows,
        pendingSettlementTime,
        hourTempo,
        postRisk,
        recentResolved,
        radarTargetLabel,
        formatPageLabel,
        formatShortTime,
    };
}
