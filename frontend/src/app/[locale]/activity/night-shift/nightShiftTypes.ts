export interface ShiftStats {
    totalTimeMs: number;
    anomaliesCleared: number;
    totalEarnings: {
        k: number;
        lm: number;
        stars: number;
    };
}

export interface NightShiftStatus {
    isServing: boolean;
    sessionId?: string | null;
    startTime: string | null;
    shiftWindow?: {
        isOpen: boolean;
        startAt?: string | null;
        endAt?: string | null;
    } | null;
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

export interface EndShiftResult {
    message: string;
    settlementEtaSeconds?: number;
    queued?: boolean;
    payableHours?: number;
    closeReason?: string | null;
}
