'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import type { CollectiveMeditationPhase } from '@/components/meditation/MeditationPlanetScene';
import { useAuth } from '@/context/AuthContext';
import { apiGet, apiPost } from '@/utils/api';
import { PageTitle } from '@/components/PageTitle';
import { Sparkles } from 'lucide-react';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { useI18n } from '@/context/I18nContext';
import { getLocalizedField } from '@/i18n/localizedContent';

const MeditationPlanetScene = dynamic(
    () => import('@/components/meditation/MeditationPlanetScene').then((m) => m.MeditationPlanetScene),
    {
        ssr: false
    }
);

const MemoMeditationPlanetScene = memo(MeditationPlanetScene);

const formatCountdown = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
};

const formatElapsedTime = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const ss = String(totalSeconds % 60).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
};

type CountdownTimerProps = {
    isActive: boolean;
    collectiveStartAt: number;
    serverTimeBaseMs: number | null;
    serverPerfBaseMs: number | null;
};

type CollectiveSessionData = {
    id?: string | number;
    startsAt?: string | number;
    phase1Min?: string | number;
    phase2Min?: string | number;
    rounds?: string | number;
    weText?: string;
    endsAt?: string | number;
    translations?: {
        en?: {
            weText?: string;
        };
    };
};

type CollectiveParticipationState = {
    sessionId?: string;
    joinedAt?: string | number | null;
    finishedAt?: string | number | null;
    finishReason?: string | null;
    activeGivePhaseMsTotal?: number | null;
};

const CountdownTimer = memo(function CountdownTimer({ isActive, collectiveStartAt, serverTimeBaseMs, serverPerfBaseMs }: CountdownTimerProps) {
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
                        {formatCountdown(msUntilStart)}
                    </div>
                </>
            ) : (
                <>
                    <div className="text-tiny uppercase tracking-[0.35em] text-white/55">{t('meditation_collective.started_title')}</div>
                    <div className="mt-1 text-2xl sm:text-3xl font-extrabold text-red-400 tabular-nums">
                        {formatElapsedTime(elapsed)}
                    </div>
                </>
            )}
        </div>
    );
});

export default function MeditationWePage() {
    const { user } = useAuth();
    const { language, localePath, t } = useI18n();
    const [windowWidth, setWindowWidth] = useState(0);
    const [windowHeight, setWindowHeight] = useState(0);
    const [isLandscape, setIsLandscape] = useState(false);
    const sideAdSlot = getResponsiveSideAdSlot(windowWidth, windowHeight);
    const isDesktop = Boolean(sideAdSlot);
    const [phaseNow, setPhaseNow] = useState(() => Date.now());
    const [serverTimeBaseMs, setServerTimeBaseMs] = useState<number | null>(null);
    const [serverPerfBaseMs, setServerPerfBaseMs] = useState<number | null>(null);
    const [activeSession, setActiveSession] = useState<CollectiveSessionData | null>(null);
    const [nextSession, setNextSession] = useState<CollectiveSessionData | null>(null);
    const [isCollectiveOverlayOpen, setIsCollectiveOverlayOpen] = useState(false);
    const [collectiveHold, setCollectiveHold] = useState(false);
    const [participants, setParticipants] = useState<{ id: string; name: string }[]>([]);
    const [selfQueued, setSelfQueued] = useState(false);
    const [queuedSessionIdLocal, setQueuedSessionIdLocal] = useState<string | null>(null);
    const [selfJoined, setSelfJoined] = useState(false);
    const [selfParticipation, setSelfParticipation] = useState<CollectiveParticipationState | null>(null);
    const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
    const [runSession, setRunSession] = useState<CollectiveSessionData | null>(null);
    const [beamOriginScreenY, setBeamOriginScreenY] = useState<number | null>(null);
    const phaseTitleRef = useRef<HTMLDivElement | null>(null);
    const finishRequestedRef = useRef(false);
    const joinInFlightRef = useRef(false);
    const participantsRequestRef = useRef(0);

    useEffect(() => {
        const updateLayout = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            setWindowWidth(w);
            setWindowHeight(h);
            setIsLandscape(w > h);
        };

        updateLayout();
        window.addEventListener('resize', updateLayout);
        return () => window.removeEventListener('resize', updateLayout);
    }, []);

    const localScheduledSessionStarted = Boolean(
        !activeSession?.startsAt
        && nextSession?.startsAt
        && phaseNow >= Number(nextSession.startsAt)
    );
    const resolvedActiveSession = activeSession || (localScheduledSessionStarted ? nextSession : null);
    const resolvedNextSession = activeSession ? nextSession : (localScheduledSessionStarted ? null : nextSession);
    const session = resolvedActiveSession || resolvedNextSession;
    const effectiveSession = runSession || session;
    const phase1Min = typeof effectiveSession?.phase1Min === 'number' || typeof effectiveSession?.phase1Min === 'string' ? Number(effectiveSession.phase1Min) : 1;
    const phase2Min = typeof effectiveSession?.phase2Min === 'number' || typeof effectiveSession?.phase2Min === 'string' ? Number(effectiveSession.phase2Min) : 1;
    const rounds = Math.max(1, typeof effectiveSession?.rounds === 'number' || typeof effectiveSession?.rounds === 'string' ? Number(effectiveSession.rounds) : 3);
    const phase1Ms = Math.round((Number.isFinite(phase1Min) ? phase1Min : 1) * 60 * 1000);
    const phase2Ms = Math.round((Number.isFinite(phase2Min) ? phase2Min : 1) * 60 * 1000);
    const COLLECTIVE_SESSION_MS = (phase1Ms + phase2Ms) * rounds;
    const activeSessionId = resolvedActiveSession?.id ? String(resolvedActiveSession.id) : 'none';
    const nextSessionId = resolvedNextSession?.id ? String(resolvedNextSession.id) : 'none';
    const sessionId = activeSessionId !== 'none' ? activeSessionId : nextSessionId;
    const selfId = user?._id ? String(user._id) : '';
    const selfName = typeof user?.nickname === 'string' ? user.nickname.trim() : '';
    const [collectiveStartAt, setCollectiveStartAt] = useState<number>(() => Date.now());

    const getServerNowMs = useCallback(() => {
        if (serverTimeBaseMs == null || serverPerfBaseMs == null) return Date.now();
        return serverTimeBaseMs + (performance.now() - serverPerfBaseMs);
    }, [serverPerfBaseMs, serverTimeBaseMs]);
    const effectiveSelfQueued = Boolean(
        selfQueued
        || (queuedSessionIdLocal && queuedSessionIdLocal === sessionId)
        || (queuedSessionIdLocal && queuedSessionIdLocal === activeSessionId)
    );

    const loadParticipants = useCallback(async (targetSessionId: string) => {
        if (!targetSessionId || targetSessionId === 'none') {
            participantsRequestRef.current += 1;
            setParticipants([]);
            setSelfQueued(false);
            setQueuedSessionIdLocal(null);
            setSelfJoined(false);
            setSelfParticipation(null);
            setRunStartedAt(null);
            setRunSession(null);
            return;
        }

        const requestId = participantsRequestRef.current + 1;
        participantsRequestRef.current = requestId;

        try {
            const res = await apiGet<{
                participants?: Array<{ id: string; name: string }>;
                selfQueued?: boolean;
                selfJoined?: boolean;
                selfParticipation?: CollectiveParticipationState | null;
            }>(`/meditation/collective/participants?sessionId=${encodeURIComponent(targetSessionId)}`);
            if (requestId !== participantsRequestRef.current) return;
            const list = Array.isArray(res.participants) ? res.participants : [];
            const nextList = queuedSessionIdLocal === targetSessionId && selfId && selfName && !list.some((item) => item.id === selfId)
                ? [...list, { id: selfId, name: selfName }]
                : list;
            setParticipants(nextList);
            const nextParticipation = res.selfParticipation || null;
            const joinedAtMs = nextParticipation?.joinedAt ? new Date(nextParticipation.joinedAt).getTime() : null;
            setSelfQueued(Boolean(res.selfQueued));
            if (res.selfQueued) {
                setQueuedSessionIdLocal(targetSessionId);
            }
            setSelfJoined(Boolean(res.selfJoined) && !nextParticipation?.finishedAt);
            setSelfParticipation(nextParticipation);
            if (joinedAtMs && Number.isFinite(joinedAtMs) && !nextParticipation?.finishedAt) {
                setRunStartedAt(joinedAtMs);
                if (resolvedActiveSession && String(resolvedActiveSession.id || '') === targetSessionId) {
                    setRunSession(resolvedActiveSession);
                }
            } else if (!res.selfJoined) {
                setRunStartedAt(null);
                setRunSession(null);
            }
        } catch {
            if (requestId !== participantsRequestRef.current) return;
            // Не сбрасываем запись локально из-за одного неудачного ответа,
            // иначе кнопка самопроизвольно "отжимается".
        }
    }, [queuedSessionIdLocal, resolvedActiveSession, selfId, selfName]);

    useEffect(() => {
        let cancelled = false;
        const load = async () => {
            try {
                const res = await apiGet<{ serverNow: number; activeSession: CollectiveSessionData | null; nextSession: CollectiveSessionData | null }>(
                    '/meditation/collective'
                );
                if (cancelled) return;
                const serverNow = Number(res.serverNow);
                setServerTimeBaseMs(Number.isFinite(serverNow) ? serverNow : null);
                setServerPerfBaseMs(typeof performance !== 'undefined' ? performance.now() : null);
                setActiveSession(res.activeSession ?? null);
                setNextSession(res.nextSession ?? null);
                const s = res.activeSession || res.nextSession;
                const startsAt = s && (typeof s.startsAt === 'number' || typeof s.startsAt === 'string') ? Number(s.startsAt) : null;
                if (startsAt != null && Number.isFinite(startsAt)) setCollectiveStartAt(startsAt);
                setPhaseNow(getServerNowMs());
            } catch {
                // ignore
            }
        };

        load();
        const interval = window.setInterval(load, 10_000);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [getServerNowMs]);

    const collectiveIsActive = Boolean(resolvedActiveSession?.startsAt);

    useEffect(() => {
        if (collectiveIsActive) {
            if (activeSessionId && activeSessionId !== 'none') {
                void loadParticipants(activeSessionId);
            }
            return;
        }

        if (!nextSessionId || nextSessionId === 'none') {
            setParticipants([]);
            setSelfQueued(false);
            setQueuedSessionIdLocal(null);
            setSelfJoined(false);
            setSelfParticipation(null);
            return;
        }

        let cancelled = false;
        const refresh = async () => {
            if (cancelled) return;
            await loadParticipants(nextSessionId);
        };

        refresh();
        const interval = window.setInterval(refresh, 5_000);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [activeSessionId, collectiveIsActive, loadParticipants, nextSessionId, user?._id]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            setPhaseNow(getServerNowMs());
        }, 1000);
        return () => window.clearInterval(interval);
    }, [getServerNowMs]);

    const effectiveRunStartedAt = runStartedAt;
    const localMeditationEndAt = effectiveRunStartedAt != null ? effectiveRunStartedAt + COLLECTIVE_SESSION_MS : null;
    const localMeditationActive = Boolean(
        effectiveRunStartedAt != null
        && localMeditationEndAt != null
        && phaseNow < localMeditationEndAt
    );
    const cycleLen = phase1Ms + phase2Ms;
    const elapsed = Math.max(0, effectiveRunStartedAt != null ? phaseNow - effectiveRunStartedAt : 0);
    const inCycle = cycleLen > 0 ? (elapsed % cycleLen) : 0;
    const collectivePhase: CollectiveMeditationPhase = inCycle < phase1Ms ? 'give' : 'absorb';
    const phaseTitle = collectivePhase === 'give' ? t('meditation_collective.phase_give_title') : t('meditation_collective.phase_absorb_title');
    const phaseSubtitle = collectivePhase === 'give' ? t('meditation_collective.phase_give_subtitle') : null;
    const isCompactLayout = Math.min(windowWidth || 0, windowHeight || 0) <= 1024;
    const isSplitHeader = windowWidth > 0 && (windowWidth < 768 || (isLandscape && windowWidth < 1024));
    const localizedWeText = session ? getLocalizedField(session.weText, session.translations, 'weText', language) : '';

    useEffect(() => {
        if (!isCollectiveOverlayOpen || !isCompactLayout) {
            setBeamOriginScreenY(null);
            return;
        }

        const node = phaseTitleRef.current;
        if (!node) {
            setBeamOriginScreenY(null);
            return;
        }

        let raf = 0;
        raf = window.requestAnimationFrame(() => {
            const rect = node.getBoundingClientRect();
            const viewportHeight = windowHeight || window.innerHeight;
            const origin = rect.bottom + 50;
            const clamped = Math.min(Math.max(origin, 0), Math.max(0, viewportHeight - 20));
            setBeamOriginScreenY(clamped);
        });

        return () => {
            if (raf) window.cancelAnimationFrame(raf);
        };
    }, [isCollectiveOverlayOpen, isCompactLayout, phaseTitle, windowHeight, windowWidth, isLandscape]);

    useEffect(() => {
        if (collectivePhase === 'absorb') {
            setCollectiveHold(false);
        }
    }, [collectivePhase]);

    useEffect(() => {
        const prevent = (event: Event) => event.preventDefault();

        document.addEventListener('copy', prevent);
        document.addEventListener('cut', prevent);
        document.addEventListener('contextmenu', prevent);
        document.addEventListener('selectstart', prevent);

        return () => {
            document.removeEventListener('copy', prevent);
            document.removeEventListener('cut', prevent);
            document.removeEventListener('contextmenu', prevent);
            document.removeEventListener('selectstart', prevent);
        };
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!isCollectiveOverlayOpen || !localMeditationActive) return;

        const isSpaceKey = (event: KeyboardEvent) =>
            event.code === 'Space' || event.key === ' ' || event.key === 'Spacebar';

        const handleKeyDown = (event: KeyboardEvent) => {
            if (!isSpaceKey(event)) return;
            if (event.repeat) return;
            if (collectivePhase !== 'give') return;
            event.preventDefault();
            setCollectiveHold(true);
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            if (!isSpaceKey(event)) return;
            if (collectivePhase !== 'give') return;
            event.preventDefault();
            setCollectiveHold(false);
        };

        const handlePointerDown = (event: PointerEvent) => {
            if (collectivePhase !== 'give') return;
            if (event.button !== undefined && event.button !== 0) return;
            event.preventDefault();
            setCollectiveHold(true);
        };

        const handlePointerUp = (event: PointerEvent) => {
            if (collectivePhase !== 'give') return;
            event.preventDefault();
            setCollectiveHold(false);
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        window.addEventListener('pointerdown', handlePointerDown, { passive: false });
        window.addEventListener('pointerup', handlePointerUp, { passive: false });
        window.addEventListener('pointercancel', handlePointerUp, { passive: false });
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
            window.removeEventListener('pointerdown', handlePointerDown);
            window.removeEventListener('pointerup', handlePointerUp);
            window.removeEventListener('pointercancel', handlePointerUp);
        };
    }, [collectivePhase, isCollectiveOverlayOpen, localMeditationActive]);

    useEffect(() => {
        if (!collectiveIsActive) return;
        if (!effectiveSelfQueued) return;
        if (selfJoined) return;
        if (!activeSessionId || activeSessionId === 'none') return;
        if (joinInFlightRef.current) return;
        joinInFlightRef.current = true;
        void (async () => {
            try {
                const response = await apiPost<{
                    participation?: CollectiveParticipationState;
                }>('/meditation/collective/join', { sessionId: activeSessionId });
                const joinedAtMs = response?.participation?.joinedAt ? new Date(response.participation.joinedAt).getTime() : Date.now();
                finishRequestedRef.current = false;
                setSelfJoined(true);
                setQueuedSessionIdLocal(activeSessionId);
                setSelfParticipation(response?.participation || {
                    sessionId: activeSessionId,
                    joinedAt: new Date(joinedAtMs).toISOString(),
                });
                setRunStartedAt(joinedAtMs);
                setRunSession(resolvedActiveSession);
                setIsCollectiveOverlayOpen(true);
                setCollectiveHold(false);
            } catch {
                // ignore
            } finally {
                joinInFlightRef.current = false;
            }
        })();
    }, [activeSessionId, collectiveIsActive, effectiveSelfQueued, resolvedActiveSession, selfJoined]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!isCollectiveOverlayOpen) return;

        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prev;
        };
    }, [isCollectiveOverlayOpen]);

    const handleOptIn = useCallback(async () => {
        if (!nextSessionId || nextSessionId === 'none') return;
        try {
            const response = await apiPost<{
                sessionTiming?: { startsAt?: number; endsAt?: number };
            }>('/meditation/collective/opt-in', { sessionId: nextSessionId });
            if (typeof response?.sessionTiming?.startsAt === 'number') {
                setCollectiveStartAt(response.sessionTiming.startsAt);
            }
            setSelfQueued(true);
            setQueuedSessionIdLocal(nextSessionId);
            if (selfId && selfName) {
                setParticipants((prev) => prev.some((item) => item.id === selfId) ? prev : [...prev, { id: selfId, name: selfName }]);
            }
            void loadParticipants(nextSessionId);
        } catch {
            // ignore
        }
    }, [loadParticipants, nextSessionId, selfId, selfName]);

    const handleOptOut = useCallback(async () => {
        if (!nextSessionId || nextSessionId === 'none') return;
        try {
            await apiPost('/meditation/collective/opt-out', { sessionId: nextSessionId });
            setSelfQueued(false);
            setQueuedSessionIdLocal(null);
            if (selfId) {
                setParticipants((prev) => prev.filter((item) => item.id !== selfId));
            }
            void loadParticipants(nextSessionId);
        } catch {
            // ignore
        }
    }, [loadParticipants, nextSessionId, selfId]);

    const handleJoin = useCallback(async () => {
        if (!activeSessionId || activeSessionId === 'none') return;
        try {
            const response = await apiPost<{
                participation?: CollectiveParticipationState;
            }>('/meditation/collective/join', { sessionId: activeSessionId });
            const joinedAtMs = response?.participation?.joinedAt ? new Date(response.participation.joinedAt).getTime() : Date.now();
            finishRequestedRef.current = false;
            setSelfJoined(true);
            setQueuedSessionIdLocal(activeSessionId);
            setSelfParticipation(response?.participation || {
                sessionId: activeSessionId,
                joinedAt: new Date(joinedAtMs).toISOString(),
            });
            setRunStartedAt(joinedAtMs);
            setRunSession(resolvedActiveSession);
            setIsCollectiveOverlayOpen(true);
            setCollectiveHold(false);
        } catch {
            // ignore
        }
    }, [activeSessionId, resolvedActiveSession]);

    const finishMeditation = useCallback(async (reason: 'completed' | 'left_early') => {
        const targetSessionId = (selfParticipation?.sessionId || activeSessionId || sessionId);
        if (!targetSessionId || targetSessionId === 'none') return;
        if (finishRequestedRef.current) return;
        finishRequestedRef.current = true;
        try {
            await apiPost('/meditation/collective/finish', {
                sessionId: targetSessionId,
                reason,
            });
            setSelfJoined(false);
            setSelfParticipation((prev) => prev ? { ...prev, finishedAt: new Date().toISOString(), finishReason: reason } : prev);
            setRunStartedAt(null);
            setRunSession(null);
        } catch {
            // ignore
        }
    }, [activeSessionId, selfParticipation?.sessionId, sessionId]);

    useEffect(() => {
        if (!isCollectiveOverlayOpen) return;
        if (!localMeditationEndAt) return;
        if (phaseNow < localMeditationEndAt) return;
        void finishMeditation('completed');
        setCollectiveHold(false);
        setIsCollectiveOverlayOpen(false);
    }, [finishMeditation, isCollectiveOverlayOpen, localMeditationEndAt, phaseNow]);

    useEffect(() => {
        if (!selfJoined) {
            setIsCollectiveOverlayOpen(false);
            if (!isCollectiveOverlayOpen) {
                setRunSession(null);
            }
        }
    }, [isCollectiveOverlayOpen, selfJoined]);

    const handleExit = () => {
        void finishMeditation('left_early');
        setCollectiveHold(false);
        setIsCollectiveOverlayOpen(false);
    };

    return (
        <div
            className={`flex-1 flex flex-col min-h-0 ${windowWidth >= 768 ? 'overflow-hidden' : 'overflow-y-auto'} bg-[#050510] text-slate-200 font-sans selection:bg-cyan-500/30`}
        >
            {isCollectiveOverlayOpen && localMeditationActive && (
                <div
                    className="fixed inset-0 z-[10050]"
                    onMouseDown={(event) => {
                        if (collectivePhase !== 'give') return;
                        event.preventDefault();
                        setCollectiveHold(true);
                    }}
                    onMouseUp={(event) => {
                        if (collectivePhase !== 'give') return;
                        event.preventDefault();
                        setCollectiveHold(false);
                    }}
                    onMouseLeave={() => setCollectiveHold(false)}
                    onTouchStart={(event) => {
                        if (collectivePhase !== 'give') return;
                        event.preventDefault();
                        setCollectiveHold(true);
                    }}
                    onTouchEnd={(event) => {
                        if (collectivePhase !== 'give') return;
                        event.preventDefault();
                        setCollectiveHold(false);
                    }}
                    onTouchCancel={() => setCollectiveHold(false)}
                    onContextMenu={(event) => event.preventDefault()}
                    onSelect={(event) => event.preventDefault()}
                    style={{ touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
                >
                    <button
                        type="button"
                        onClick={handleExit}
                        className="absolute top-4 left-4 z-[110] px-5 py-2.5 rounded-xl font-bold uppercase tracking-widest text-tiny border border-red-400/30 bg-red-500/15 text-red-100 hover:bg-red-500/25 active:scale-95 transition-all backdrop-blur-md"
                    >
                        {t('meditation_collective.exit')}
                    </button>
                    <div className="absolute inset-0 bg-[#02020a]">
                        <div
                            className="absolute inset-0"
                            style={{
                                backgroundImage:
                                    'radial-gradient(ellipse at top, rgba(34,211,238,0.06), rgba(2,2,10,0.95) 60%), url(/8k_stars_milky_way.jpg)',
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                backgroundRepeat: 'no-repeat',
                            }}
                        />
                    </div>
                    <div className="relative z-10 flex h-full w-full flex-col">
                        {isLandscape ? (
                            <div className="flex flex-1 min-h-0">
                                <StickySideAdRail adSlot={sideAdSlot} page="practice_meditation" placement="practice_meditation_sidebar_left" />

                                <div className="flex flex-1 min-w-0 flex-col items-center justify-center gap-4 px-4 py-6">
                                    <div ref={phaseTitleRef} className="text-center text-xl sm:text-2xl md:text-3xl font-extrabold text-cyan-200 tracking-tight">
                                        {phaseTitle}
                                    </div>
                                    <div className="relative w-full flex-1 min-h-0">
                                        <MemoMeditationPlanetScene
                                            phase={collectivePhase}
                                            beamActive={collectiveHold}
                                            beamOriginScreenY={beamOriginScreenY}
                                        />
                                    </div>
                                    {phaseSubtitle && (
                                        <div className="text-center text-secondary text-white/80">
                                            {phaseSubtitle}
                                        </div>
                                    )}
                                </div>

                                <StickySideAdRail adSlot={sideAdSlot} page="practice_meditation" placement="practice_meditation_sidebar_right" />
                            </div>
                        ) : (
                            <div className="flex flex-1 min-h-0 flex-col items-center gap-4 px-4 py-6">
                                <div className="w-full flex justify-center">
                                    <AdaptiveAdWrapper
                                        page="practice_meditation"
                                        placement="practice_meditation_header"
                                        strategy="mobile_tablet_adaptive"
                                    />
                                </div>
                                <div className="relative w-full flex-1 min-h-0">
                                    <MemoMeditationPlanetScene
                                        phase={collectivePhase}
                                        beamActive={collectiveHold}
                                        beamOriginScreenY={beamOriginScreenY}
                                    />
                                </div>
                                <div className="text-center">
                                    <div ref={phaseTitleRef} className="text-xl sm:text-2xl font-extrabold text-cyan-200 tracking-tight">
                                        {phaseTitle}
                                    </div>
                                    {phaseSubtitle && (
                                        <div className="mt-1 text-secondary text-white/80">
                                            {phaseSubtitle}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-[#050510] to-[#050510]" />
                <div className="absolute top-1/4 right-1/4 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
                <div className="absolute bottom-1/3 left-1/4 h-48 w-48 rounded-full bg-indigo-500/10 blur-3xl" />
            </div>

            <div className="relative z-10 flex flex-1 min-h-0">
                <StickySideAdRail adSlot={sideAdSlot} page="practice_meditation" placement="practice_meditation_sidebar_left" />

                <div className="flex-1 flex flex-col min-w-0 px-3 lg:px-4 py-2 lg:py-3 min-h-0">
                    <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
                        <AdaptiveAdWrapper
                            page="practice_meditation"
                            placement="practice_meditation_header"
                            strategy="mobile_tablet_adaptive"
                        />
                    </div>

                    <header className={`mb-2 flex-shrink-0 flex flex-col gap-3 ${isSplitHeader ? '' : 'sm:gap-4'}`}>
                        <div className="flex items-center gap-2 w-full">
                            <Link
                                href={localePath('/practice')}
                                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
                            >
                                <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('meditation_collective.to_practice')}
                            </Link>

                            <div className="flex flex-1 justify-center">
                                <div className="inline-flex rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-md">
                                    <Link
                                        href={localePath('/practice/meditation/me')}
                                        className="px-4 py-1.5 rounded-full text-tiny font-bold uppercase tracking-widest transition-all text-white/55 hover:text-white/80"
                                    >
                                        {t('meditation_collective.tab_me')}
                                    </Link>
                                    <span
                                        className="px-4 py-1.5 rounded-full text-tiny font-bold uppercase tracking-widest bg-cyan-500/25 text-cyan-100 border border-cyan-400/30"
                                    >
                                        {t('meditation_collective.tab_we')}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <PageTitle
                            title={t('meditation_collective.page_title')}
                            Icon={Sparkles}
                            gradientClassName="from-cyan-200 via-cyan-400 to-blue-500"
                            iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-cyan-200"
                            className="w-fit mx-auto"
                        />
                    </header>

                    <div className="flex-1 min-h-0 flex items-stretch justify-center overflow-x-hidden overflow-y-auto no-scrollbar pb-2">
                        <div className="flex min-h-full flex-col items-center justify-center">
                            <div className="w-full max-w-3xl mx-auto">
                                {Boolean(localizedWeText) && (
                                    <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 sm:p-7">
                                        <div className="text-center text-secondary leading-relaxed text-white/80 whitespace-pre-wrap">
                                            {localizedWeText}
                                        </div>
                                    </div>
                                )}

                                <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 sm:p-7">
                                    <div className="flex flex-col items-center gap-3">
                                        <CountdownTimer
                                            isActive={collectiveIsActive}
                                            collectiveStartAt={collectiveStartAt}
                                            serverTimeBaseMs={serverTimeBaseMs}
                                            serverPerfBaseMs={serverPerfBaseMs}
                                        />

                                        {!collectiveIsActive ? (
                                            <div className="flex flex-col items-center gap-3">
                                                {effectiveSelfQueued ? (
                                                    <button
                                                        type="button"
                                                        onClick={handleOptOut}
                                                        className="px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-tiny border border-rose-400/30 bg-rose-500/15 text-rose-100 hover:bg-rose-500/20 active:scale-95 transition-all backdrop-blur-md"
                                                    >
                                                        {t('meditation_collective.opt_out')}
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={handleOptIn}
                                                        className="px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-tiny border transition-all backdrop-blur-md bg-emerald-500/15 border-emerald-400/30 text-emerald-100 hover:bg-emerald-500/20 active:scale-95"
                                                    >
                                                        {t('meditation_collective.opt_in')}
                                                    </button>
                                                )}

                                                <div className="w-full">
                                                    <div className="text-center text-white/70 text-secondary">
                                                        {t('meditation_collective.participants_signed_up')}: <span className="text-white/90 font-semibold">{participants.length}</span>
                                                    </div>
                                                    {participants.length > 0 && (
                                                        <div className="mt-3 max-h-44 overflow-auto rounded-xl border border-white/10 bg-black/20 p-3">
                                                            <div className="grid gap-1.5">
                                                                {participants.map((p) => (
                                                                    <div key={p.id} className="text-white/75 text-secondary">
                                                                        {p.name}{p.id === selfId ? t('meditation_collective.you_marker') : ''}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="flex flex-col items-center gap-3">
                                                {!isCollectiveOverlayOpen && (
                                                    <button
                                                        type="button"
                                                        onClick={handleJoin}
                                                        className="px-6 py-3 rounded-xl font-bold uppercase tracking-widest text-tiny border border-cyan-400/30 bg-cyan-500/15 text-cyan-100 hover:bg-cyan-500/20 active:scale-95 transition-all backdrop-blur-md"
                                                    >
                                                        {selfJoined ? t('meditation_collective.return_to_meditation') : t('meditation_collective.join')}
                                                    </button>
                                                )}
                                                <div className="text-center text-white/70 text-secondary">
                                                    {effectiveSelfQueued
                                                        ? t('meditation_collective.queued_can_enter')
                                                        : t('meditation_collective.session_open_join_anytime')}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {localMeditationActive && isCollectiveOverlayOpen && (
                        <div className="text-center text-tiny text-white/45 uppercase tracking-[0.35em]">
                            {collectivePhase === 'give'
                                ? t('meditation_collective.phase_give_short')
                                : t('meditation_collective.phase_absorb_short')}
                        </div>
                    )}
                </div>

                <StickySideAdRail adSlot={sideAdSlot} page="practice_meditation" placement="practice_meditation_sidebar_right" />
            </div>
        </div>
    );
}
