import type { CollectiveMeditationPhase } from '@/components/meditation/MeditationPlanetScene';
import type { CollectiveSessionData } from '@/components/meditation-collective/types';

type CollectiveSessionUser = {
    _id?: string;
    nickname?: string;
} | null;

type CollectiveSessionViewParams = {
    activeSession: CollectiveSessionData | null;
    nextSession: CollectiveSessionData | null;
    phaseNow: number;
    queuedSessionIdLocal: string | null;
    runSession: CollectiveSessionData | null;
    runStartedAt: number | null;
    selfQueued: boolean;
    user: CollectiveSessionUser;
};

const toFiniteNumber = (value: unknown, fallback: number) => {
    const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
};

export function getCollectiveSessionView({
    activeSession,
    nextSession,
    phaseNow,
    queuedSessionIdLocal,
    runSession,
    runStartedAt,
    selfQueued,
    user,
}: CollectiveSessionViewParams) {
    const localScheduledSessionStarted = Boolean(
        !activeSession?.startsAt
        && nextSession?.startsAt
        && phaseNow >= Number(nextSession.startsAt),
    );
    const resolvedActiveSession = activeSession || (localScheduledSessionStarted ? nextSession : null);
    const resolvedNextSession = activeSession ? nextSession : (localScheduledSessionStarted ? null : nextSession);
    const session = resolvedActiveSession || resolvedNextSession;
    const effectiveSession = runSession || session;
    const phase1Min = toFiniteNumber(effectiveSession?.phase1Min, 1);
    const phase2Min = toFiniteNumber(effectiveSession?.phase2Min, 1);
    const rounds = Math.max(1, toFiniteNumber(effectiveSession?.rounds, 3));
    const phase1Ms = Math.round(phase1Min * 60 * 1000);
    const phase2Ms = Math.round(phase2Min * 60 * 1000);
    const collectiveSessionMs = (phase1Ms + phase2Ms) * rounds;
    const activeSessionId = resolvedActiveSession?.id ? String(resolvedActiveSession.id) : 'none';
    const nextSessionId = resolvedNextSession?.id ? String(resolvedNextSession.id) : 'none';
    const sessionId = activeSessionId !== 'none' ? activeSessionId : nextSessionId;
    const selfId = user?._id ? String(user._id) : '';
    const selfName = typeof user?.nickname === 'string' ? user.nickname.trim() : '';
    const effectiveSelfQueued = Boolean(
        selfQueued
        || (queuedSessionIdLocal && queuedSessionIdLocal === sessionId)
        || (queuedSessionIdLocal && queuedSessionIdLocal === activeSessionId),
    );
    const localMeditationEndAt = runStartedAt != null ? runStartedAt + collectiveSessionMs : null;
    const localMeditationActive = Boolean(
        runStartedAt != null
        && localMeditationEndAt != null
        && phaseNow < localMeditationEndAt,
    );
    const cycleLen = phase1Ms + phase2Ms;
    const elapsed = Math.max(0, runStartedAt != null ? phaseNow - runStartedAt : 0);
    const inCycle = cycleLen > 0 ? (elapsed % cycleLen) : 0;
    const collectivePhase: CollectiveMeditationPhase = inCycle < phase1Ms ? 'give' : 'absorb';

    return {
        activeSessionId,
        collectiveIsActive: Boolean(resolvedActiveSession?.startsAt),
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
    };
}
