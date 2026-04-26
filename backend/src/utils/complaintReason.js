const VALID_COMPLAINT_REASONS = ['insults', 'spam', 'inappropriate', 'fraud', 'other'];

const LEGACY_REASON_MAP = new Map([
  ['insults', 'insults'],
  ['spam', 'spam'],
  ['inappropriate', 'inappropriate'],
  ['fraud', 'fraud'],
  ['other', 'other'],
  ['оскорбления / агрессия', 'insults'],
  ['спам / реклама', 'spam'],
  ['неадекватное поведение', 'inappropriate'],
  ['мошенничество', 'fraud'],
  ['другое', 'other'],
  ['insults / aggression', 'insults'],
  ['spam / advertising', 'spam'],
  ['inappropriate behavior', 'inappropriate'],
  ['fraud', 'fraud'],
  ['other', 'other'],
]);

function normalizeComplaintReason(value) {
  const safe = String(value || '').trim().toLowerCase();
  if (!safe) return '';
  return LEGACY_REASON_MAP.get(safe) || '';
}

function isComplaintReason(value) {
  return VALID_COMPLAINT_REASONS.includes(String(value || ''));
}

module.exports = {
  VALID_COMPLAINT_REASONS,
  normalizeComplaintReason,
  isComplaintReason,
};
