const ADMIN_EMAIL_DOMAIN = 'givkoin.com';
const USER_EMAIL_DOMAINS = ['yahoo.com', 'gmail.com', 'mail.ru', 'yandex.ru', 'yandex.com', 'rambler.ru'];

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getEmailParts(email) {
  const normalizedEmail = normalizeEmail(email);
  const atIndex = normalizedEmail.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === normalizedEmail.length - 1) {
    return { local: '', domain: '' };
  }
  return {
    local: normalizedEmail.slice(0, atIndex),
    domain: normalizedEmail.slice(atIndex + 1),
  };
}

function getEmailDomain(email) {
  return getEmailParts(email).domain;
}

function hasValidEmailLocalPart(email) {
  const { local, domain } = getEmailParts(email);
  if (!local || !domain) return false;
  if (local.includes('.')) return false;
  if (/[^a-zA-Z0-9]/.test(local)) return false;
  return true;
}

function isAdminEmail(email) {
  return getEmailDomain(email) === ADMIN_EMAIL_DOMAIN && hasValidEmailLocalPart(email);
}

function isAllowedUserEmail(email) {
  return USER_EMAIL_DOMAINS.includes(getEmailDomain(email)) && hasValidEmailLocalPart(email);
}

function isAllowedLoginEmail(email) {
  return isAllowedUserEmail(email) || isAdminEmail(email);
}

function isAllowedEmailForRole(email, role) {
  if (role === 'admin') return isAdminEmail(email);
  if (role === 'user') return isAllowedUserEmail(email);
  return false;
}

function getEmailPolicyMessage(role) {
  if (role === 'admin') {
    return `Email администратора должен быть в домене @${ADMIN_EMAIL_DOMAIN} без точек и символов до @`;
  }
  return `Разрешены только почты: ${USER_EMAIL_DOMAINS.join(', ')} без точек и символов до @`;
}

module.exports = {
  ADMIN_EMAIL_DOMAIN,
  USER_EMAIL_DOMAINS,
  normalizeEmail,
  getEmailParts,
  getEmailDomain,
  hasValidEmailLocalPart,
  isAdminEmail,
  isAllowedUserEmail,
  isAllowedLoginEmail,
  isAllowedEmailForRole,
  getEmailPolicyMessage,
};

