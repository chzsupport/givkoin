export type FortuneMode = 'stats' | 'roulette' | 'lottery' | 'wins';

export type RouletteSector = {
  label?: string;
  type?: string;
  value?: number;
  weight?: number;
  enabled?: boolean;
};

export type RouletteConfig = {
  dailyFreeSpins?: number;
  minSpinsSinceStar?: number;
  minDaysSinceStar?: number;
  sectors?: RouletteSector[];
};

export type LotteryConfig = {
  ticketCost?: number;
  maxTicketsPerDay?: number;
  drawHour?: number;
  drawMinute?: number;
  payoutByMatches?: Record<number | string, number>;
};

export type WinsFilter = {
  gameType: string;
  rewardType: string;
  userId: string;
  from: string;
  to: string;
};

export type FortuneStats = {
  roulette?: {
    totalSpins?: number;
    activeUsers?: number;
  };
  lottery?: {
    totalTickets?: number;
    totalPrizesPaid?: number;
  };
};

export type FortuneWinRow = {
  _id: string;
  occurredAt?: string;
  createdAt?: string;
  gameType?: string;
  rewardType?: string;
  amount?: number;
  label?: string;
  user?: {
    _id?: string;
    nickname?: string;
    email?: string;
  };
};

export type FortuneWinsSummary = {
  all?: {
    count?: number;
    totalAmount?: number;
  };
};

export type FortuneApiError = {
  response?: {
    data?: {
      message?: string;
    };
  };
  message?: string;
};
