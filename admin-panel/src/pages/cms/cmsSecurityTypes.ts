export type CmsSecurityUser = {
  _id?: string;
  nickname?: string;
  email?: string;
  status?: string;
  [key: string]: unknown;
};

export type RiskGroup = {
  id?: string;
  users?: CmsSecurityUser[];
  emails?: string[];
  signals?: unknown[];
  evidence?: unknown[];
  riskCaseIds?: string[];
  latestTs?: number;
  riskScore?: number;
  status?: string;
  freezeStatus?: string;
};

export type RiskCase = {
  _id?: string;
  user?: CmsSecurityUser;
  relatedUsersData?: CmsSecurityUser[];
  signals?: unknown[];
  evidence?: unknown[];
  categoryScores?: Record<string, unknown>;
  riskScoreDetailed?: RiskScoreDetail[];
  rewardRollback?: RewardRollbackRow[];
  notes?: string;
  groupId?: string;
  status?: string;
  freezeStatus?: string;
  riskScore?: number | string;
  [key: string]: unknown;
};

export type RiskScoreDetail = {
  signal?: string;
  category?: string;
  score?: number | string;
  count?: number | string;
  summary?: string;
  [key: string]: unknown;
};

export type RewardRollbackRow = {
  transactionId?: string;
  userId?: string;
  battleId?: string;
  userNickname?: string;
  userEmail?: string;
  amount?: number | string;
  currency?: string;
  status?: string;
  occurredAt?: string | number | Date;
  transactionCount?: number | string;
  rolledBackAmount?: number | string;
  shortfall?: number | string;
  [key: string]: unknown;
};

export type SignalHistoryEntry = {
  id?: string;
  user?: CmsSecurityUser;
  eventType?: string;
  createdAt?: string | number | Date;
  ip?: string;
  ipIntel?: {
    isTor?: boolean;
    isVpn?: boolean;
    isProxy?: boolean;
    isHosting?: boolean;
    [key: string]: unknown;
  };
  deviceId?: string;
  fingerprint?: string;
  weakFingerprint?: string;
  profileKey?: string;
  clientProfile?: {
    webdriver?: boolean;
    headless?: boolean;
    emulator?: boolean;
    platform?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};
