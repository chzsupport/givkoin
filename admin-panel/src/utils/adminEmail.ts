export const ADMIN_EMAIL_DOMAIN = 'givkoin.com';

export function isAdminEmail(value: string) {
  const email = String(value || '').trim().toLowerCase();
  const [local, domain] = email.split('@');
  if (!local || !domain) return false;
  if (local.includes('.') || /[^a-zA-Z0-9]/.test(local)) return false;
  return domain === ADMIN_EMAIL_DOMAIN;
}
