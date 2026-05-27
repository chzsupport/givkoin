const { pickLang } = require('../../services/auth/authHelpers');

function sendRegistrationErrorResponse({
  registrationResult,
  requestedLang,
  res,
} = {}) {
  if (!registrationResult) {
    return res.status(400).json({ message: pickLang(requestedLang, 'Не удалось создать пользователя', 'Failed to create user') });
  }

  if (registrationResult.reason === 'access_blocked') {
    return res.status(403).json({ message: pickLang(requestedLang, 'Доступ ограничен', 'Access is restricted') });
  }

  if (registrationResult.reason === 'invalid_email') {
    return res.status(400).json({ message: pickLang(requestedLang, 'Некорректный email', 'Invalid email') });
  }

  if (registrationResult.reason === 'email_not_allowed') {
    return res.status(400).json({ message: pickLang(requestedLang, 'Разрешены только почты из списка проекта', 'Only project-approved emails are allowed') });
  }

  if (registrationResult.reason === 'registration_limit') {
    return res.status(429).json({
      message: pickLang(
        requestedLang,
        `Превышен лимит аккаунтов. Разрешено не более ${registrationResult.maxAllowed || 3} аккаунтов на один набор сигналов.`,
        `Account limit exceeded. No more than ${registrationResult.maxAllowed || 3} accounts are allowed for one set of signals.`
      ),
      blockedUntil: registrationResult.blockedUntil,
    });
  }

  if (registrationResult.reason === 'email_exists') {
    return res.status(400).json({ message: pickLang(requestedLang, 'Пользователь с таким email уже существует', 'A user with this email already exists') });
  }

  if (registrationResult.reason === 'nickname_exists') {
    return res.status(400).json({ message: pickLang(requestedLang, 'Никнейм уже занят', 'Nickname is already taken') });
  }

  if (registrationResult.reason === 'create_failed') {
    return res.status(400).json({ message: pickLang(requestedLang, 'Не удалось создать пользователя', 'Failed to create user') });
  }

  if (registrationResult.reason === 'multi_account_frozen') {
    return res.status(403).json({
      message: pickLang(
        requestedLang,
        'Аккаунт временно заморожен из-за подозрительных действий. Проверка обычно занимает до 24 часов. Не создавайте новые аккаунты и дождитесь решения модератора.',
        'This account was temporarily frozen due to suspicious activity. The review usually takes up to 24 hours. Please do not create new accounts and wait for the moderator decision.'
      ),
      groupId: registrationResult.groupId,
      clusterSize: registrationResult.clusterSize,
    });
  }

  return res.status(registrationResult.status || 400).json({ message: pickLang(requestedLang, 'Не удалось создать пользователя', 'Failed to create user') });
}

function sendRegistrationDuplicateErrorResponse({
  error,
  requestedLang,
  res,
} = {}) {
  if (!error || error.code !== 11000) {
    return null;
  }

  const key = (error.keyPattern && Object.keys(error.keyPattern)[0]) || '';

  if (key === 'nickname') {
    return res.status(400).json({ message: pickLang(requestedLang, 'Никнейм уже занят', 'Nickname is already taken') });
  }

  if (key === 'email') {
    return res.status(400).json({ message: pickLang(requestedLang, 'Пользователь с таким email уже существует', 'A user with this email already exists') });
  }

  return res.status(400).json({ message: pickLang(requestedLang, 'Данные уже используются', 'Data is already in use') });
}

module.exports = {
  sendRegistrationDuplicateErrorResponse,
  sendRegistrationErrorResponse,
};
