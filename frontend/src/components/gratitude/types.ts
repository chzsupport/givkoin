export const GRATITUDE_COUNT = 3;

export type GratitudeTodayResponse = {
  serverDay: string;
  completedIndexes: number[];
  rewardedCount: number;
  totalSlots: number;
  rewards?: {
    kRewardPerEntry?: number;
    starsPerEntry?: number;
    radiancePerEntry?: number;
  };
};

export type GratitudeCompleteResponse = {
  ok: boolean;
  already: boolean;
  index: number;
  serverDay: string;
  completedIndexes: number[];
  awardedK: number;
  awardedStars: number;
  user?: {
    _id?: string;
    id?: string;
    email?: string;
    nickname?: string;
    k?: number;
    stars?: number;
  };
};

export type GratitudeRewardConfig = {
  kRewardPerEntry: number;
  starsPerEntry: number;
};
