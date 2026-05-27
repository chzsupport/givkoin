'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import { useAuth } from '@/context/AuthContext';
import { apiGet, apiPost } from '@/utils/api';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { useI18n } from '@/context/I18nContext';
import { getLocalizedField } from '@/i18n/localizedContent';
import { CollectiveMeditationBackground } from '@/components/meditation-collective/CollectiveMeditationBackground';
import { CollectiveMeditationHeader } from '@/components/meditation-collective/CollectiveMeditationHeader';
import { CollectiveMeditationOverlay } from '@/components/meditation-collective/CollectiveMeditationOverlay';
import { CollectiveMeditationStatusPanel } from '@/components/meditation-collective/CollectiveMeditationStatusPanel';
import { getCollectiveSessionView } from '@/components/meditation-collective/collectiveSessionView';
import { useCollectiveOverlayControls } from '@/components/meditation-collective/useCollectiveOverlayControls';
import type {
    CollectiveParticipationState,
    CollectiveSessionData,
} from '@/components/meditation-collective/types';

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
    const [participants, setParticipants] = useState<{ id: string; name: string }[]>([]);
    const [selfQueued, setSelfQueued] = useState(false);
    const [queuedSessionIdLocal, setQueuedSessionIdLocal] = useState<string | null>(null);
    const [selfJoined, setSelfJoined] = useState(false);
    const [selfParticipation, setSelfParticipation] = useState<CollectiveParticipationState | null>(null);
    const [runStartedAt, setRunStartedAt] = useState<number | null>(null);
    const [runSession, setRunSession] = useState<CollectiveSessionData | null>(null);
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

    const {
        activeSessionId,
        collectiveIsActive,
        collectivePhase,
        effectiveSelfQueued,
        localMeditationActive,
        localMeditationEndAt,
        nextSessionId,
        resolvedActiveSession,
        session,
        sessionId,
        selfId,
        selfName,
    } = getCollectiveSessionView({
        activeSession,
        nextSession,
        phaseNow,
        queuedSessionIdLocal,
        runSession,
        runStartedAt,
        selfQueued,
        user,
    });
    const [collectiveStartAt, setCollectiveStartAt] = useState<number>(() => Date.now());

    const getServerNowMs = useCallback(() => {
        if (serverTimeBaseMs == null || serverPerfBaseMs == null) return Date.now();
        return serverTimeBaseMs + (performance.now() - serverPerfBaseMs);
    }, [serverPerfBaseMs, serverTimeBaseMs]);

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

    const phaseTitle = collectivePhase === 'give' ? t('meditation_collective.phase_give_title') : t('meditation_collective.phase_absorb_title');
    const phaseSubtitle = collectivePhase === 'give' ? t('meditation_collective.phase_give_subtitle') : null;
    const isCompactLayout = Math.min(windowWidth || 0, windowHeight || 0) <= 1024;
    const isSplitHeader = windowWidth > 0 && (windowWidth < 768 || (isLandscape && windowWidth < 1024));
    const localizedWeText = session ? getLocalizedField(session.weText, session.translations, 'weText', language) : '';
    const {
        collectiveHold,
        beamOriginScreenY,
        startCollectiveHold,
        endCollectiveHold,
    } = useCollectiveOverlayControls({
        isOpen: isCollectiveOverlayOpen,
        isActive: localMeditationActive,
        isCompactLayout,
        phase: collectivePhase,
        phaseTitle,
        phaseTitleRef,
        windowHeight,
        windowWidth,
        isLandscape,
    });

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
                endCollectiveHold();
            } catch {
                // ignore
            } finally {
                joinInFlightRef.current = false;
            }
        })();
    }, [activeSessionId, collectiveIsActive, effectiveSelfQueued, endCollectiveHold, resolvedActiveSession, selfJoined]);

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
            endCollectiveHold();
        } catch {
            // ignore
        }
    }, [activeSessionId, endCollectiveHold, resolvedActiveSession]);

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
        endCollectiveHold();
        setIsCollectiveOverlayOpen(false);
    }, [endCollectiveHold, finishMeditation, isCollectiveOverlayOpen, localMeditationEndAt, phaseNow]);

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
        endCollectiveHold();
        setIsCollectiveOverlayOpen(false);
    };

    return (
        <div
            className={`flex-1 flex flex-col min-h-0 ${windowWidth >= 768 ? 'overflow-hidden' : 'overflow-y-auto'} bg-[#050510] text-slate-200 font-sans selection:bg-cyan-500/30`}
        >
            <CollectiveMeditationOverlay
                isOpen={isCollectiveOverlayOpen}
                isActive={localMeditationActive}
                isLandscape={isLandscape}
                sideAdSlot={sideAdSlot}
                phase={collectivePhase}
                phaseTitle={phaseTitle}
                phaseSubtitle={phaseSubtitle}
                phaseTitleRef={phaseTitleRef}
                beamActive={collectiveHold}
                beamOriginScreenY={beamOriginScreenY}
                onExit={handleExit}
                onHoldStart={startCollectiveHold}
                onHoldEnd={endCollectiveHold}
                t={t}
            />

            <CollectiveMeditationBackground />

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

                    <CollectiveMeditationHeader
                        practiceHref={localePath('/practice')}
                        personalHref={localePath('/practice/meditation/me')}
                        isSplitHeader={isSplitHeader}
                        t={t}
                    />

                    <div className="flex-1 min-h-0 flex items-stretch justify-center overflow-x-hidden overflow-y-auto no-scrollbar pb-2">
                        <div className="flex min-h-full flex-col items-center justify-center">
                            <CollectiveMeditationStatusPanel
                                localizedWeText={localizedWeText}
                                isActive={collectiveIsActive}
                                collectiveStartAt={collectiveStartAt}
                                serverTimeBaseMs={serverTimeBaseMs}
                                serverPerfBaseMs={serverPerfBaseMs}
                                selfQueued={effectiveSelfQueued}
                                isOverlayOpen={isCollectiveOverlayOpen}
                                selfJoined={selfJoined}
                                participants={participants}
                                selfId={selfId}
                                onOptIn={handleOptIn}
                                onOptOut={handleOptOut}
                                onJoin={handleJoin}
                                t={t}
                            />
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
