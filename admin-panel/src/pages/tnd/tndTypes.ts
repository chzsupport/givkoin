export type TndTab = 'daily' | 'referrals' | 'rules';

export type TndTone = 'blue' | 'green' | 'red' | 'amber' | 'slate';

export type TndDailyData = {
  dayKey?: string;
  totalReports?: number;
  passed?: number;
  failed?: number;
  activeUsersTotal?: number;
  uncheckedActiveUsers?: number;
  rows?: TndDailyRow[];
  pagination?: {
    page?: number;
    totalPages?: number;
  };
};

export type TndDailyRow = {
  _id: string;
  passed?: boolean;
  reason?: string;
  user?: TndUser;
  summary?: {
    minutesTotal?: number;
    kActionCount?: number;
    pagesVisited?: number;
  };
};

export type TndReferralData = {
  total?: number;
  active?: number;
  inactive?: number;
  pending?: number;
  topReferrers?: TndTopReferrer[];
  rows?: TndReferralRow[];
  pagination?: {
    page?: number;
    totalPages?: number;
  };
};

export type TndTopReferrer = {
  user?: TndUser;
  activeReferrals?: number;
};

export type TndReferralRow = {
  id: string;
  inviter?: TndUser;
  invitee?: TndUser;
  status?: string;
  checkReason?: string;
  activitySummary?: {
    visitDays?: number;
    kDebitActions?: number;
    kCreditActions?: number;
    battleParticipations?: number;
    bigBattleRewards?: number;
    newsViews?: number;
    hasEntity?: boolean;
  };
};

export type TndRules = {
  daily?: {
    minutes?: number;
    kActions?: number;
    pages?: number;
  };
  referral?: {
    visitDays?: number;
    kDebits?: number;
    kCredits?: number;
    battles?: number;
    bigBattleRewards?: number;
    newsViews?: number;
  };
};

export type TndStatsData = {
  daily?: TndDailyData;
  referrals?: TndReferralData;
  rules?: TndRules;
};

export type TndUser = {
  _id?: string;
  nickname?: string;
  email?: string;
};
