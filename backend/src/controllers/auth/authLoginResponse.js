const { pickLang } = require('../../services/auth/authHelpers');

function sendLoginErrorResponse({
  clearAuthCookie = () => {},
  loginResult,
  requestedLang,
  res,
} = {}) {
  if (!loginResult) {
    return res.status(403).json({ message: pickLang(requestedLang, 'Доступ ограничен', 'Access is restricted') });
  }

  if (loginResult.reason === 'user_not_found' || loginResult.reason === 'bad_credentials') {
    return res.status(401).json({ message: pickLang(requestedLang, 'Неверный email или пароль', 'Invalid email or password') });
  }

  if (loginResult.reason === 'admin_email_policy_violation') {
    return res.status(403).json({ message: pickLang(requestedLang, 'Аккаунт администратора настроен неверно', 'Admin account is configured incorrectly') });
  }

  if (loginResult.reason === 'access_blocked') {
    return res.status(403).json({ message: pickLang(requestedLang, 'Доступ ограничен', 'Access is restricted') });
  }

  if (loginResult.reason === 'multi_account_group_frozen' || loginResult.reason === 'temporary_restriction_active') {
    const loginAccessFrozen = loginResult.reason === 'multi_account_group_frozen';

    return res.status(403).json({
      message: pickLang(
        requestedLang,
        loginAccessFrozen
          ? 'Аккаунт временно заморожен из-за подозрительных действий. Проверка обычно занимает до 24 часов. Не создавайте новые аккаунты и дождитесь решения модератора.'
          : `Доступ ограничен из-за проверки мультиаккаунта. Ограничение действует до ${new Date(loginResult.blockedUntil).toISOString()}.`,
        loginAccessFrozen
          ? 'This account was temporarily frozen due to suspicious activity. The review usually takes up to 24 hours. Please do not create new accounts and wait for the moderator decision.'
          : `Access is restricted due to a multi-account review. The restriction is active until ${new Date(loginResult.blockedUntil).toISOString()}.`
      ),
      blockedUntil: loginResult.blockedUntil,
    });
  }

  if (loginResult.reason === 'email_not_confirmed') {
    return res.status(403).json({ message: pickLang(requestedLang, 'Подтвердите email перед входом', 'Please confirm your email before logging in') });
  }

  if (loginResult.reason === 'user_banned') {
    return res.status(403).json({ message: pickLang(requestedLang, 'Аккаунт заблокирован', 'Account is blocked') });
  }

  if (loginResult.reason === 'human_check_blocked') {
    return res.status(403).json({
      message: pickLang(
        requestedLang,
        `Доступ временно закрыт после проваленной проверки. Попробуйте после ${new Date(loginResult.blockedUntil).toISOString()}.`,
        `Access is temporarily closed after a failed check. Try again after ${new Date(loginResult.blockedUntil).toISOString()}.`,
      ),
      humanCheckBlocked: true,
      blockedUntil: loginResult.blockedUntil,
    });
  }

  if (loginResult.reason === 'multi_account_frozen_after_login') {
    return res.status(403).json({
      message: pickLang(
        requestedLang,
        'Аккаунт временно заморожен из-за подозрительных действий. Проверка обычно занимает до 24 часов. Не создавайте новые аккаунты и дождитесь решения модератора.',
        'This account was temporarily frozen due to suspicious activity. The review usually takes up to 24 hours. Please do not create new accounts and wait for the moderator decision.'
      ),
      groupId: loginResult.groupId,
    });
  }

  if (loginResult.reason === 'single_device_conflict') {
    clearAuthCookie(res);

    return res.status(409).json({
      message: pickLang(
        requestedLang,
        'Обнаружен вход с другого устройства. Все сеансы этого аккаунта завершены. Войдите заново только на одном устройстве.',
        'A sign-in from another device was detected. All sessions for this account were ended. Sign in again on only one device.',
      ),
    });
  }

  if (loginResult.reason === 'missing_session_id') {
    return res.status(500).json({
      message: pickLang(requestedLang, 'Не удалось открыть сеанс входа', 'Failed to open a login session'),
    });
  }

  return res.status(loginResult.status || 403).json({ message: pickLang(requestedLang, 'Доступ ограничен', 'Access is restricted') });
}

module.exports = {
  sendLoginErrorResponse,
};
