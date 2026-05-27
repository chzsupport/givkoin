export type ApprovalPayload = {
  reason: string;
  impactPreview: string;
  confirmationPhrase: string;
};

export type RequestApprovalPayload = (options: {
  title: string;
  impactPreviewDefault: string;
  confirmationPhrase: string;
}) => ApprovalPayload | null;

export type DateValue = string | number | Date | null | undefined;

export type BattleRecord = {
  _id?: string;
  startsAt?: DateValue;
  endsAt?: DateValue;
  createdAt?: DateValue;
  durationSeconds?: number;
  scheduleSource?: string;
  scheduledIntervalHours?: number;
  attendanceCount?: number;
  attendance?: unknown[];
  participants?: unknown[];
  lightDamage?: number;
  darknessDamage?: number;
};

export type BattleSchedulePayload = {
  battleId?: string;
  startsAt: string;
  durationSeconds?: number;
};

export type BattleMoodReason = {
  title?: string;
  value?: string | number;
  text?: string;
};

export type BattleMoodScale = {
  id?: string;
  title?: string;
  score?: number;
  text?: string;
};

export type BattleMood = {
  riskScore?: number;
  stage?: {
    title?: string;
    horizon?: string;
    forecast?: string;
  };
  stats?: {
    activeUsers72h?: number;
    usefulActions72h?: number;
    pendingAppeals?: number;
    suspiciousReports7d?: number;
    entityCoveragePercent?: number;
    kEarned7d?: number;
    kSpent7d?: number;
    adRevenue7d?: number;
  };
  notes?: {
    activeBattleText?: string;
    upcomingBattleText?: string;
  };
  darkReasons?: BattleMoodReason[];
  calmReasons?: BattleMoodReason[];
  scales?: BattleMoodScale[];
};

export type SuspiciousBattleRow = {
  battleId?: string;
  userId?: string;
  nickname?: string;
  email?: string;
  startsAt?: DateValue;
  suspiciousAt?: DateValue;
  suspiciousReasons?: unknown[];
  suspiciousEvidence?: unknown;
};
