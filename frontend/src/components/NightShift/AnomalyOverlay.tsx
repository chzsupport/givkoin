'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { apiGet, apiPost } from '@/utils/api';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Ghost, Shield, Sparkles, Sword } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/context/I18nContext';
import { normalizeSitePath, pathStartsWith } from '@/utils/sitePath';
import {
    clearNightShiftRuntime,
    getCurrentNightShiftAnomaly,
    getHourCheckpointForWindow,
    getNextPendingHeartbeatWindow,
    hydrateRuntimeFromStatus,
    mergeNightShiftWindow,
    markNightShiftWindowSent,
    recordNightShiftAnomaly,
    type NightShiftLocalRuntime,
    readNightShiftRuntime,
    subscribeNightShiftRuntime,
    writeNightShiftRuntime,
} from '@/utils/nightShiftRuntime';

export const AnomalyOverlay = () => {
    const pathname = usePathname();
    const cleanPathname = normalizeSitePath(pathname || '/');
    const toast = useToast();
    const { isAuthenticated } = useAuth();
    const { localePath, t } = useI18n();
    const [runtime, setRuntime] = useState<NightShiftLocalRuntime | null>(null);
    const [mission, setMission] = useState<{ anomalyId: string; targetSector: string; targetUrl: string } | null>(null);
    const [showAnomaly, setShowAnomaly] = useState(false);
    const [cleared, setCleared] = useState(false);
    const [exploding, setExploding] = useState(false);
    const lastHeartbeatErrorAtRef = useRef(0);

    const getCloseReasonMessage = useCallback((reason?: string | null) => {
        switch (reason) {
            case 'empty_windows':
                return t('night_shift.close_reason_empty_windows');
            case 'heartbeat_timeout':
                return t('night_shift.close_reason_heartbeat_timeout');
            case 'low_hour_activity':
                return t('night_shift.close_reason_low_hour_activity');
            case 'shift_window_closed':
                return t('night_shift.close_reason_shift_window_closed');
            default:
                return t('night_shift.shift_ended_auto');
        }
    }, [t]);

    const refreshFromServer = useCallback(async () => {
        if (!isAuthenticated) {
            clearNightShiftRuntime();
            setRuntime(null);
            setMission(null);
            setShowAnomaly(false);
            return;
        }

        try {
            const res = await apiGet<{
                nightShift: {
                    isServing?: boolean;
                    sessionId?: string | null;
                    startTime?: string | null;
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
                }
            }>('/night-shift/status');
            const ns = res.nightShift;
            const hydrated = hydrateRuntimeFromStatus(ns, readNightShiftRuntime());
            if (hydrated) {
                writeNightShiftRuntime(hydrated);
                setRuntime(hydrated);
            } else if (!ns?.isServing) {
                clearNightShiftRuntime();
                setRuntime(null);
            }
        } catch {
            // Silent fail
        }
    }, [isAuthenticated]);

    useEffect(() => {
        if (!isAuthenticated) {
            clearNightShiftRuntime();
            setRuntime(null);
            setMission(null);
            setShowAnomaly(false);
            return;
        }

        const syncRuntime = (nextRuntime: NightShiftLocalRuntime | null) => {
            setRuntime(nextRuntime);
        };

        syncRuntime(readNightShiftRuntime());
        refreshFromServer();
        const unsubscribe = subscribeNightShiftRuntime(syncRuntime);

        return () => {
            unsubscribe();
        };
    }, [isAuthenticated, refreshFromServer]);

    useEffect(() => {
        if (!runtime) {
            setMission(null);
            setShowAnomaly(false);
            return;
        }

        const current = getCurrentNightShiftAnomaly(runtime, Date.now());
        if (current?.isActive && current.anomaly) {
            setMission({
                anomalyId: current.anomaly.id,
                targetSector: current.anomaly.sectorId,
                targetUrl: current.anomaly.sectorUrl,
            });
            if (pathStartsWith(cleanPathname, current.anomaly.sectorUrl) && !cleared) {
                const timeout = setTimeout(() => setShowAnomaly(true), 500);
                return () => clearTimeout(timeout);
            }
            setShowAnomaly(false);
            return;
        }

        setMission(null);
        setShowAnomaly(false);
    }, [cleanPathname, runtime, cleared]);

    useEffect(() => {
        if (!runtime || !isAuthenticated) return;

        let cancelled = false;

        const flushNextWindow = async () => {
            const currentRuntime = readNightShiftRuntime();
            if (!currentRuntime || currentRuntime.shiftSessionId !== runtime.shiftSessionId) return;

            const pendingWindow = getNextPendingHeartbeatWindow(currentRuntime, Date.now());
            if (!pendingWindow) return;

            try {
                const result = await apiPost<{
                    accepted?: boolean;
                    suspicious?: boolean;
                    shouldClose?: boolean;
                    closeReason?: string | null;
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
                    if (!cancelled) {
                        setRuntime(nextRuntime);
                    }
                }

                lastHeartbeatErrorAtRef.current = 0;

                if (result?.shouldClose) {
                    clearNightShiftRuntime();
                    if (!cancelled) {
                        setRuntime(null);
                        setMission(null);
                        setShowAnomaly(false);
                        toast.info(t('night_shift.toast_title'), getCloseReasonMessage(result.closeReason));
                    }
                    await refreshFromServer();
                }
            } catch {
                const now = Date.now();
                if (now - lastHeartbeatErrorAtRef.current > 30 * 1000) {
                    lastHeartbeatErrorAtRef.current = now;
                    toast.error(t('night_shift.toast_title'), t('night_shift.connection_lost_check_internet'));
                }
            }
        };

        void flushNextWindow();
        const interval = window.setInterval(() => {
            void flushNextWindow();
        }, 10 * 1000);

        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [runtime, isAuthenticated, getCloseReasonMessage, refreshFromServer, t, toast]);

    const handleClearAnomaly = async () => {
        try {
            if (!mission || !runtime) return;

            setExploding(true);
            const nextRuntime = recordNightShiftAnomaly(runtime, mission.anomalyId, cleanPathname || mission.targetUrl, Date.now());
            if (nextRuntime) {
                writeNightShiftRuntime(nextRuntime);
                setRuntime(nextRuntime);
            }

            setCleared(true);
            setShowAnomaly(false);

            toast.success(t('night_shift.anomaly_exorcised'));

            // Reset cleared state after a while so new missions can be detected
            setTimeout(() => setCleared(false), 5000);
            setTimeout(() => setExploding(false), 500);
        } catch (error) {
            console.error('Failed to clear anomaly', error);
            setExploding(false);
            toast.error(t('common.error'), t('night_shift.exorcise_failed'));
        }
    };

    const showRadarShortcut = Boolean(mission && cleanPathname !== '/activity/night-shift');
    if (!showAnomaly && !exploding && !showRadarShortcut) return null;

    // Random position
    const top = `${20 + Math.random() * 60}%`;
    const left = `${10 + Math.random() * 80}%`;

    return (
        <>
            {(showAnomaly || exploding) && (
                <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
                    <AnimatePresence>
                        <motion.button
                            initial={{ opacity: 0, scale: 0 }}
                            animate={exploding ? { opacity: 0, scale: 2.2, rotate: 20 } : { opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0 }}
                            whileHover={exploding ? undefined : { scale: 1.2 }}
                            onClick={handleClearAnomaly}
                            style={{ top, left }}
                            className="absolute pointer-events-auto cursor-crosshair group"
                        >
                            <div className="relative">
                                <div
                                    className={`absolute inset-0 blur-xl transition-colors ${exploding
                                        ? 'bg-purple-400 opacity-80'
                                        : 'bg-black opacity-50 animate-pulse group-hover:bg-purple-900'
                                        }`}
                                />
                                <Ghost className={`w-16 h-16 drop-shadow-[0_0_15px_rgba(255,255,255,0.5)] ${exploding ? 'text-purple-200' : 'text-gray-400 group-hover:text-purple-400'}`} />
                                <Sparkles className={`absolute -top-2 -right-2 w-6 h-6 ${exploding ? 'text-white opacity-100' : 'text-purple-300'} animate-spin-slow`} />
                            </div>
                            <span className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-black/80 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                {t('night_shift.exorcise')}
                            </span>
                        </motion.button>
                    </AnimatePresence>
                </div>
            )}

            {showRadarShortcut && (
                <Link
                    href={localePath('/activity/night-shift')}
                    className="fixed left-4 bottom-4 z-[10001] flex items-center gap-2 rounded-2xl border border-cyan-400/30 bg-cyan-500/15 px-3 py-2 text-cyan-100 shadow-[0_0_25px_rgba(34,211,238,0.35)] backdrop-blur-md transition-all hover:bg-cyan-500/25"
                >
                    <span className="relative flex h-8 w-8 items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-500/20">
                        <Shield className="h-4 w-4 text-cyan-100" />
                        <Sword className="absolute -right-1 -bottom-1 h-3 w-3 text-cyan-200" />
                    </span>
                    <span className="text-xs font-bold uppercase tracking-widest">{t('night_shift.radar')}</span>
                </Link>
            )}
        </>
    );
};
