'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Clock, Radar, Ghost, AlertTriangle, CheckCircle, Zap, Coins, Star, History } from 'lucide-react';
import { apiGet, apiPost } from '@/utils/api';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { PageTitle } from '@/components/PageTitle';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { useI18n } from '@/context/I18nContext';
import { useBoost } from '@/context/BoostContext';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import {
    clearNightShiftRuntime,
    getNightShiftSummary,
    getHourCheckpointForWindow,
    getNextPendingHeartbeatWindow,
    getCurrentNightShiftAnomaly,
    markNightShiftWindowSent,
    mergeNightShiftWindow,
    hydrateRuntimeFromStatus,
    getCurrentHourAnomalies,
    type NightShiftLocalRuntime,
    readNightShiftRuntime,
    subscribeNightShiftRuntime,
    writeNightShiftRuntime,
} from '@/utils/nightShiftRuntime';
import { getSiteLanguage, getSiteLanguageLocale } from '@/i18n/siteLanguage';

interface ShiftStats {
    totalTimeMs: number;
    anomaliesCleared: number;
    totalEarnings: {
        sc: number;
        lm: number;
        stars: number;
    };
}

interface NightShiftStatus {
    isServing: boolean;
    sessionId?: string | null;
    startTime: string | null;
    pendingSettlement?: { dueAt?: string } | null;
    acceptedAnomaliesCurrentSession?: number;
    payableHoursCurrent?: number;
    consecutiveEmptyWindows?: number;
    currentWindow?: {
        index: number;
        startedAt: string;
        endedAt: string;
        anomalies: Array<{
            id: string;
            sectorId: string;
            sectorName: string;
            sectorUrl: string;
            spawnAt: string;
        }>;
    } | null;
    stats: ShiftStats;
}

interface EndShiftResult {
    message: string;
    settlementEtaSeconds?: number;
    queued?: boolean;
    payableHours?: number;
    closeReason?: string | null;
}

export default function NightShiftPage() {
    const { isAuthenticated } = useAuth();
    const toast = useToast();
    const { t, localePath } = useI18n();
    const boost = useBoost();
    const [status, setStatus] = useState<NightShiftStatus | null>(null);
    const [runtime, setRuntime] = useState<NightShiftLocalRuntime | null>(null);
    const [radarTarget, setRadarTarget] = useState<string | null>(null);
    const [radarTargetId, setRadarTargetId] = useState<string | null>(null);
    const [radarTargetUrl, setRadarTargetUrl] = useState<string | null>(null);
    const [elapsedTime, setElapsedTime] = useState(0);

    const [endShiftData, setEndShiftData] = useState<EndShiftResult | null>(null);
    const [windowWidth, setWindowWidth] = useState(0);
    const sideAdSlot = getResponsiveSideAdSlot(windowWidth, typeof window !== 'undefined' ? window.innerHeight : 0);
    const isDesktop = Boolean(sideAdSlot);
    const lastAlertSectorRef = useRef<string | null>(null);
    const anomalyAudioBusyRef = useRef(false);

    const playAnomalyAlert = useCallback(async () => {
        if (anomalyAudioBusyRef.current) return;
        anomalyAudioBusyRef.current = true;

        try {
            const wait = (ms: number) => new Promise<void>((resolve) => {
                window.setTimeout(resolve, ms);
            });

            for (let i = 0; i < 3; i += 1) {
                const audio = new Audio('/anomaly.mp3');
                await audio.play().catch(() => { });
                await new Promise<void>((resolve) => {
                    const timeout = window.setTimeout(resolve, 1500);
                    audio.onended = () => {
                        window.clearTimeout(timeout);
                        resolve();
                    };
                });
                if (i < 2) {
                    await wait(1000);
                }
            }
        } finally {
            anomalyAudioBusyRef.current = false;
        }
    }, []);

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
        fetchStatus();
        const unsubscribe = subscribeNightShiftRuntime(syncRuntime);

        const updateLayout = () => {
            const w = window.innerWidth;
            setWindowWidth(w);
        };

        updateLayout();
        window.addEventListener('resize', updateLayout);
        return () => {
            unsubscribe();
            window.removeEventListener('resize', updateLayout);
        };
    }, [fetchStatus, isAuthenticated]);

    useEffect(() => {
        if (!status?.isServing || runtime) return;
        void fetchStatus();
    }, [status?.isServing, runtime, fetchStatus]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (status?.isServing && runtime?.startTime) {
            const start = new Date(runtime.startTime).getTime();
            const syncFromRuntime = () => {
                setElapsedTime(Date.now() - start);
                const current = getCurrentNightShiftAnomaly(runtime, Date.now());
                if (current?.isActive && current.anomaly) {
                    setRadarTarget(current.anomaly.sectorName);
                    setRadarTargetId(current.anomaly.sectorId);
                    setRadarTargetUrl(current.anomaly.sectorUrl);
                } else {
                    setRadarTarget(null);
                    setRadarTargetId(null);
                    setRadarTargetUrl(null);
                }
            };

            syncFromRuntime();
            interval = setInterval(() => {
                syncFromRuntime();
            }, 1000);
        } else {
            setElapsedTime(0);
            setRadarTarget(null);
            setRadarTargetId(null);
            setRadarTargetUrl(null);
        }
        return () => clearInterval(interval);
    }, [status?.isServing, runtime]);

    useEffect(() => {
        if (!status?.isServing || !radarTargetId) {
            lastAlertSectorRef.current = null;
            return;
        }

        if (lastAlertSectorRef.current === radarTargetId) return;
        lastAlertSectorRef.current = radarTargetId;
        void playAnomalyAlert();
    }, [playAnomalyAlert, status?.isServing, radarTargetId]);


    const handleStartShift = async () => {
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
    };

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
    }, [fetchStatus, t]);

    const handleEndShift = async () => {
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

            // Boost: double shift reward if at least 1 full hour
            if (data?.payableHours && data.payableHours >= 1) {
                const shiftEarnings = status?.stats?.totalEarnings || { sc: 0, lm: 0, stars: 0 };
                boost.offerBoost({
                    type: 'night_shift_double',
                    label: t('boost.night_shift_double.label'),
                    description: t('boost.night_shift_double.description'),
                    rewardText: t('boost.night_shift_double.reward').replace('{sc}', String(shiftEarnings.sc)).replace('{lm}', String(shiftEarnings.lm)),
                    onReward: () => {
                        apiPost('/boost/claim', { type: 'night_shift_double' }).then((res: unknown) => {
                            const data = res as { ok?: boolean } | null;
                            if (data?.ok) fetchStatus();
                        }).catch(() => {});
                        toast.success(t('boost.toast_title'), t('boost.night_shift_double.toast'));
                    },
                });
            }
        } catch (error) {
            alert(t('night_shift.end_failed'));
        }
    };

    const formatTime = (ms: number) => {
        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / (1000 * 60)) % 60);
        const hours = Math.floor((ms / (1000 * 60 * 60)));
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    };

    const getLocalAnomaliesCount = (currentRuntime: NightShiftLocalRuntime | null) => {
        if (!currentRuntime) return 0;
        return Object.values(currentRuntime.windows || {}).reduce((sum, window) => sum + (window.resolvedAnomalies?.length || 0), 0);
    };

    const formatShortTime = (value?: string | null) => {
        if (!value) return '—';
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) return '—';
        return parsed.toLocaleTimeString(getSiteLanguageLocale(getSiteLanguage()), { hour: '2-digit', minute: '2-digit' });
    };

    const formatPageLabel = (pagePath: string) => {
        const normalized = String(pagePath || '').trim();
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
    };

    const totalResolvedAnomalies = status?.isServing ? getLocalAnomaliesCount(runtime) : (status?.stats?.anomaliesCleared || 0);
    const currentHourAnomalies = status?.isServing ? getCurrentHourAnomalies(runtime) : 0;
    const hourlyGoal = 60;
    const currentHourProgress = Math.min(100, Math.round((currentHourAnomalies / hourlyGoal) * 100));
    const currentHourRemaining = Math.max(0, hourlyGoal - currentHourAnomalies);
    const totalEarnings = status?.stats?.totalEarnings || { sc: 0, lm: 0, stars: 0 };
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
                        sectorName: anomaly?.sectorName || t('night_shift.unknown_sector'),
                        pagePath: resolved.pagePath,
                        clearedAt: resolved.clearedAt,
                        windowIndex: window.index,
                    };
                });
            })
            .sort((left, right) => new Date(right.clearedAt).getTime() - new Date(left.clearedAt).getTime())
            .slice(0, 6);
    }, [runtime, t]);

    return (
        <div className={`flex-1 flex flex-col min-h-0 ${windowWidth >= 768 ? 'overflow-hidden' : 'overflow-y-auto'} bg-[#050510] text-slate-200 font-sans selection:bg-purple-500/30`}>
            {/* Фоновые эффекты */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-900/20 via-[#050510] to-[#050510]" />
                <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-purple-600/10 rounded-full blur-3xl animate-pulse" />
            </div>

            <div className="relative z-10 flex flex-1 min-h-0">
                {/* Левый рекламный блок (как в Фортуне) */}
                <StickySideAdRail adSlot={sideAdSlot} page="night_shift" placement="night_shift_sidebar_left" />

                {/* Центральный контент */}
                <div className="flex-1 flex flex-col min-w-0 px-3 lg:px-4 py-2 lg:py-3 min-h-0">
                    {/* MOBILE AD BLOCK */}
                    <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
                        <AdaptiveAdWrapper
                            page="night_shift"
                            placement="night_shift_header"
                            strategy="mobile_tablet_adaptive"
                        />
                    </div>

                    {/* Header with Back Button and Title */}
                    <header className="flex flex-col items-center gap-4 mb-8 relative">
                        {/* Back Button - Absolute positioned or flex depending on design preference, here using flex row for header area if space allows, but recreating specific layout requested. 
                            The user wants it like achievements page: Back button on left, Title center.
                         */}
                        <div className="w-full flex items-center justify-between mb-4">
                            <Link
                                href={localePath('/cabinet/activity')}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
                            >
                                <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('gen.s0')}
                            </Link>
                            <div className="flex-1" /> {/* Spacer */}
                        </div>

                        <PageTitle
                            title={t('night_shift.title')}
                            Icon={Shield}
                            gradientClassName="from-purple-200 via-purple-400 to-pink-400"
                            iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-purple-300"
                            className="w-fit mx-auto"
                        />

                        {/* Buttons */}
                        <div className="inline-flex gap-3">
                            <button
                                onClick={!status?.isServing ? handleStartShift : undefined}
                                className={`
                                    px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border
                                    ${status?.isServing
                                        ? 'bg-purple-500/25 text-purple-100 border-purple-400/30 shadow-[0_0_15px_rgba(168,85,247,0.35)] translate-y-[2px]'
                                        : 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white/85 active:translate-y-[2px]'}
                                    ${status?.isServing ? 'cursor-default' : 'cursor-pointer'}
                                `}
                            >
                                {t('night_shift.post_taken')}
                            </button>

                            <button
                                onClick={status?.isServing ? handleEndShift : undefined}
                                className={`
                                    px-6 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border
                                    ${status?.isServing
                                        ? 'bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white/85 active:translate-y-[2px]'
                                        : 'bg-white/5 text-white/35 border-white/10 opacity-60 cursor-not-allowed'}
                                `}
                            >
                                {t('night_shift.post_handed_over')}
                            </button>
                        </div>

                        {status?.isServing && (
                            <div className="font-mono text-xl text-purple-300 animate-pulse">
                                {formatTime(elapsedTime)}
                            </div>
                        )}
                    </header>

                    <div className="page-content-wide space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
                        {/* Radar */}
                        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 relative overflow-hidden group">
                            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="flex justify-between items-start mb-4">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Radar className="w-5 h-5 text-green-500" />
                                    {t('night_shift.radar')}
                                </h3>
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                                    <div className={`w-2 h-2 rounded-full ${status?.isServing ? 'bg-green-500 animate-ping' : 'bg-slate-500'}`} />
                                    <span className="text-xs font-medium text-green-400">
                                        {status?.isServing ? t('night_shift.active') : t('night_shift.disabled')}
                                    </span>
                                </div>
                            </div>

                            <div className="h-32 flex items-center justify-center rounded-xl bg-black/50 border border-white/5 relative">
                                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px]" />
                                {status?.isServing && (
                                    <div className="absolute inset-0 border-t-2 border-green-500/30 animate-[scan_2s_linear_infinite] bg-gradient-to-b from-green-500/10 to-transparent h-1/2" />
                                )}

                                <div className="relative z-10 text-center">
                                    {status?.isServing ? (
                                        radarTarget ? (
                                            <>
                                                <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2 animate-bounce" />
                                                <div className="text-red-400 font-bold tracking-wider">{t('night_shift.detected')}</div>
                                                <div className="text-sm mt-1">
                                                    {radarTargetUrl ? (
                                                        <Link href={radarTargetUrl} className="text-cyan-300 hover:text-cyan-200 underline underline-offset-4">
                                                            {radarTarget}
                                                        </Link>
                                                    ) : (
                                                        <span className="text-white">{radarTarget}</span>
                                                    )}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-green-500/50 font-mono text-sm tracking-widest animate-pulse">
                                                {t('night_shift.scanning')}
                                            </div>
                                        )
                                    ) : (
                                        <div className="text-slate-600 font-mono text-sm">{t('night_shift.system_not_active')}</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Stats */}
                        <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
                                <Zap className="w-5 h-5 text-yellow-500" />
                                {t('night_shift.shift_report')}
                            </h3>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                                    <div className="flex items-center gap-3">
                                        <Clock className="w-5 h-5 text-slate-400" />
                                        <span className="text-slate-300">{t('night_shift.time_on_post')}</span>
                                    </div>
                                    <span className="font-mono text-white">
                                        {status?.isServing ? formatTime(elapsedTime) : (status?.stats?.totalTimeMs ? formatTime(status.stats.totalTimeMs) : '00:00:00')}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                                    <div className="flex items-center gap-3">
                                        <Ghost className="w-5 h-5 text-purple-400" />
                                        <span className="text-slate-300">{t('night_shift.anomalies')}</span>
                                    </div>
                                    <span className="font-bold text-white">
                                        {totalResolvedAnomalies}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                                    <div className="flex items-center gap-3">
                                        <Zap className="w-5 h-5 text-cyan-400" />
                                        <span className="text-slate-300">{t('night_shift.anomalies_current_hour')}</span>
                                    </div>
                                    <span className="font-bold text-white">
                                        {currentHourAnomalies}
                                    </span>
                                </div>

                                <div className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                                    <div className="flex items-center gap-3">
                                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                                        <span className="text-slate-300">{t('night_shift.accepted_by_system')}</span>
                                    </div>
                                    <span className="font-bold text-white">
                                        {status?.acceptedAnomaliesCurrentSession ?? totalResolvedAnomalies}
                                    </span>
                                </div>

                                <div className="mt-4 pt-4 border-t border-white/10">
                                    <p className="text-xs text-center text-slate-500 uppercase tracking-widest">
                                        {t('night_shift.payment_rule')}
                                    </p>
                                </div>
                            </div>
                        </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                                <div className="text-tiny uppercase tracking-[0.35em] text-purple-200/80">{t('night_shift.hour_payment')}</div>
                                <div className="mt-3 flex items-end justify-between gap-3">
                                    <div className="text-3xl font-black text-white">{currentHourProgress}%</div>
                                    <div className="text-right text-tiny text-white/55">
                                        <div>{currentHourAnomalies}/{hourlyGoal}</div>
                                        <div>{t('night_shift.remaining')} {currentHourRemaining}</div>
                                    </div>
                                </div>
                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                                    <div className="h-full rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-400 to-pink-300" style={{ width: `${currentHourProgress}%` }} />
                                </div>
                                <div className="mt-3 text-sm text-white/65">
                                    {t('night_shift.full_hour_paid_after')}
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                                <div className="text-tiny uppercase tracking-[0.35em] text-emerald-200/80">{t('night_shift.shift_income')}</div>
                                <div className="mt-4 space-y-3">
                                    <div className="flex items-center justify-between gap-3 text-sm text-white/70">
                                        <span className="flex items-center gap-2"><Coins className="w-4 h-4 text-amber-300" /> K</span>
                                        <span className="font-bold text-white">{totalEarnings.sc}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 text-sm text-white/70">
                                        <span className="flex items-center gap-2"><Zap className="w-4 h-4 text-cyan-300" /> {t('night_shift.lumens')}</span>
                                        <span className="font-bold text-white">{totalEarnings.lm}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3 text-sm text-white/70">
                                        <span className="flex items-center gap-2"><Star className="w-4 h-4 text-blue-300" /> {t('night_shift.stars')}</span>
                                        <span className="font-bold text-white">{totalEarnings.stars}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                                <div className="text-tiny uppercase tracking-[0.35em] text-amber-200/80">{t('night_shift.post_stability')}</div>
                                <div className="mt-3 text-3xl font-black text-white">{consecutiveEmptyWindows}</div>
                                <div className="mt-2 text-sm text-white/65">
                                    {t('night_shift.empty_windows_in_row_prefix')} {consecutiveEmptyWindows}. {t('night_shift.empty_windows_in_row_suffix')}
                                </div>
                                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-tiny text-white/60">
                                    {t('night_shift.counted_hours')}: <span className="font-bold text-white">{payableHours}</span>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                                <div className="text-tiny uppercase tracking-[0.35em] text-cyan-200/80">{t('night_shift.after_handover')}</div>
                                <div className="mt-3 text-xl font-bold text-white">
                                    {pendingSettlementTime ? `${t('night_shift.wait_until')} ${pendingSettlementTime}` : t('night_shift.no_settlement_expected')}
                                </div>
                                <div className="mt-2 text-sm text-white/65">
                                    {pendingSettlementTime
                                        ? t('night_shift.settlement_wait_desc')
                                        : t('night_shift.no_settlement_desc')}
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                                <div className="text-tiny uppercase tracking-[0.35em] text-fuchsia-200/80">{t('night_shift.hour_assessment')}</div>
                                <div className="mt-3 text-2xl font-black text-white">{hourTempo.title}</div>
                                <div className="mt-2 text-sm text-white/65">{hourTempo.note}</div>
                                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-tiny text-white/60">
                                    {t('night_shift.to_norm')}: <span className="font-bold text-white">{currentHourRemaining}</span>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                                <div className="text-tiny uppercase tracking-[0.35em] text-amber-200/80">{t('night_shift.shift_risk')}</div>
                                <div className="mt-3 text-2xl font-black text-white">{postRisk.title}</div>
                                <div className="mt-2 text-sm text-white/65">{postRisk.note}</div>
                                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-tiny text-white/60">
                                    {t('night_shift.empty_windows_short')}: <span className="font-bold text-white">{consecutiveEmptyWindows}</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                                    <History className="w-5 h-5 text-amber-300" />
                                    {t('night_shift.clearance_log')}
                                </h3>

                                <div className="space-y-3">
                                    {recentResolved.length ? recentResolved.map((entry) => (
                                        <div key={`${entry.anomalyId}-${entry.clearedAt}`} className="rounded-xl border border-white/10 bg-black/20 p-4">
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="font-semibold text-white">{entry.sectorName}</div>
                                                <div className="text-tiny text-white/45">{formatShortTime(entry.clearedAt)}</div>
                                            </div>
                                            <div className="mt-2 text-sm text-white/60">
                                                {t('night_shift.found_via')} {formatPageLabel(entry.pagePath)}
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
                                            {t('night_shift.no_anomalies_for_log')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Правый рекламный блок */}
                <StickySideAdRail adSlot={sideAdSlot} page="night_shift" placement="night_shift_sidebar_right" />
            </div>

            {/* End Shift Modal */}
            <AnimatePresence>
                {endShiftData && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                        onClick={() => setEndShiftData(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            className="bg-[#1a1a2e] border border-purple-500/30 p-8 rounded-3xl max-w-sm w-full text-center relative overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="absolute inset-0 bg-gradient-to-b from-purple-500/10 to-transparent pointer-events-none" />

                            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                            <h2 className="text-2xl font-bold text-white mb-2">{t('night_shift.shift_finished')}</h2>
                            <p className="text-slate-300 mb-6 leading-relaxed">{endShiftData.message}</p>
                            {typeof endShiftData.settlementEtaSeconds === 'number' && (
                                <div className="mb-8 rounded-lg border border-purple-500/20 bg-white/5 p-4 text-sm text-slate-300">
                                    {t('night_shift.settlement_eta_prefix')} {Math.max(1, Math.ceil(endShiftData.settlementEtaSeconds / 60))} {t('night_shift.minutes_short')}
                                </div>
                            )}

                            <button
                                onClick={() => setEndShiftData(null)}
                                className="w-full py-3 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl transition-colors"
                            >
                                {t('night_shift.accept')}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <style jsx>{`
                @keyframes scan {
                    0% { top: 0; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
            `}</style>
        </div>
    );
}

