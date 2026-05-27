export type RouletteSector = {
    label: string;
    value: number | string;
    type: string;
    color: string;
};

export type RouletteSpinResult = {
    label: string;
    type: string;
    value: number | string;
};

export type RoulettePlannedSpin = {
    id?: string;
    sectorIndex: number;
    result: RouletteSpinResult;
};

export type RouletteHistoryItem = {
    label: string;
    id: number;
};

export type RouletteTodayWins = {
    total: number;
    best: number;
    count: number;
};

export type RouletteGlobalStats = {
    roulette?: {
        activeUsers?: number;
        totalKIssued?: number;
        totalSpins?: number;
    };
};
