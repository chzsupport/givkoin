export interface SalarySettings {
  k: number;
  lm: number;
  stars: number;
}

export interface ActiveGuardian {
  userId: string;
  nickname: string;
  email: string;
  sessionId: string;
  startedAt: string | null;
  lastSeenAt: string | null;
  totalAnomalies: number;
}

export interface RecentShift {
  userId: string;
  nickname: string;
  email: string;
  sessionId: string;
  startedAt: string | null;
  endedAt: string | null;
  totalDurationSeconds: number;
  anomaliesCleared: number;
  payableHours: number;
  reward?: {
    k: number;
    lm: number;
    stars: number;
  };
  settlementStatus?: string;
  closeReason?: string | null;
  reviewStatus?: string;
}

export interface SuspiciousDetail {
  anomalyId: string;
  reason: string;
  pagePath: string;
}

export interface SuspiciousWindow {
  index: number;
  reason: string;
  claimedCount: number;
  acceptedCount: number;
  invalidCount: number;
  reportedAt: string | null;
  details: SuspiciousDetail[];
}

export interface SuspiciousShift {
  userId: string;
  nickname: string;
  email: string;
  sessionId: string;
  startedAt: string | null;
  endedAt: string | null;
  closeReason?: string | null;
  reward?: {
    k: number;
    lm: number;
    stars: number;
  };
  payableHours: number;
  totalDurationSeconds: number;
  totalAcceptedAnomalies: number;
  totalReportedAnomalies: number;
  mismatchCount: number;
  latestMismatch?: SuspiciousWindow | null;
  suspiciousWindows?: SuspiciousWindow[];
}
