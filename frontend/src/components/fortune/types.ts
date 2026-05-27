export interface FortuneStats {
    totalPlayers: number;
    totalWins: number;
    jackpotsThisMonth: number;
    avgDailyPlayers: number;
    leaderboard: LeaderEntry[];
    recentWinners: LuckyWinner[];
}

export interface LeaderEntry {
    rank: number;
    name: string;
    wins: number;
}

export interface LuckyWinner {
    name: string;
    prize: string;
    date: string;
}

export type FortuneTranslate = (key: string) => string;
