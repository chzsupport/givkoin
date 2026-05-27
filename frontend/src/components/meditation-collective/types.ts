export type CollectiveSessionData = {
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

export type CollectiveParticipationState = {
    sessionId?: string;
    joinedAt?: string | number | null;
    finishedAt?: string | number | null;
    finishReason?: string | null;
    activeGivePhaseMsTotal?: number | null;
};
