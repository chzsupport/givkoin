export type ManualReferralBoostStatus = {
  stepsTotal: number;
  watchedSteps: number[];
  active: boolean;
  activeUntil: string | null;
  percent: number;
  completed: boolean;
};

export type ReferralRegistration = {
  nickname: string;
  date: string;
  status: string;
};

export type ReferralStats = {
  code: string;
  totalInvited: number;
  activeCount: number;
  totalEarned: number;
  manualBoost?: ManualReferralBoostStatus;
  hasMore?: boolean;
  referrals: ReferralRegistration[];
};

export type ReferralText = (key: string) => string;
