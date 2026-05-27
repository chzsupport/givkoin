export type ApprovalPayload = {
  reason?: string;
  impactPreview?: string;
  confirmationPhrase?: string;
};

export type RequestApprovalPayload = (options: {
  title: string;
  impactPreviewDefault: string;
  confirmationPhrase: string;
}) => ApprovalPayload | null;

export type SystemOverview = {
  generatedAt?: string;
  incidents?: {
    pendingApprovals?: number;
    failedApprovals?: number;
  };
  criticalActions?: CriticalAction[];
};

export type ApprovalItem = {
  id: string;
  status?: string;
  actionType?: string;
  reason?: string;
  createdAt?: string;
  approvals?: unknown[];
};

export type SystemJob = {
  jobName: string;
  title?: string;
  dangerous?: boolean;
};

export type SystemJobRun = {
  runId: string;
  jobName?: string;
  status?: string;
  createdAt?: string;
  result?: {
    backupId?: string;
  };
  error?: string;
};

export type CriticalAction = {
  _id: string;
  actionType?: string;
  createdAt?: string;
  actor?: {
    nickname?: string;
    email?: string;
  };
};
