const VALID_COMPLAINT_REASONS = ['insults', 'spam', 'inappropriate', 'fraud', 'other'] as const;

type ComplaintReasonCode = typeof VALID_COMPLAINT_REASONS[number];

const LEGACY_REASON_MAP: Record<string, ComplaintReasonCode> = {
  insults: 'insults',
  spam: 'spam',
  inappropriate: 'inappropriate',
  fraud: 'fraud',
  other: 'other',
  'оскорбления / агрессия': 'insults',
  'спам / реклама': 'spam',
  'неадекватное поведение': 'inappropriate',
  'мошенничество': 'fraud',
  'другое': 'other',
  'insults / aggression': 'insults',
  'spam / advertising': 'spam',
  'inappropriate behavior': 'inappropriate',
};

const APPEAL_STATUS_KEYS: Record<string, string> = {
  pending: 'chat.appeal_status_pending',
  approved: 'chat.appeal_status_approved',
  rejected: 'chat.appeal_status_rejected',
  resolved: 'chat.appeal_status_resolved',
};

export function normalizeComplaintReasonCode(value: unknown): ComplaintReasonCode | '' {
  const safe = String(value || '').trim().toLowerCase();
  if (!safe) return '';
  return LEGACY_REASON_MAP[safe] || '';
}

export function getComplaintReasonLabel(t: (key: string) => string, value: unknown): string {
  const code = normalizeComplaintReasonCode(value);
  if (!code) return String(value || '').trim();
  return t(`chat.complaint_reason_${code}`);
}

export function getAppealStatusLabel(t: (key: string) => string, value: unknown): string {
  const safe = String(value || '').trim().toLowerCase();
  const key = APPEAL_STATUS_KEYS[safe];
  return key ? t(key) : String(value || '').trim();
}
