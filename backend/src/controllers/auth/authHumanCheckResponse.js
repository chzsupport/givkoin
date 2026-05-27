const { pickLang } = require('../../services/auth/authHelpers');

function sendHumanCheckExpiredResponse({
  requestedLang,
  result,
  res,
} = {}) {
  return res.status(result?.status || 400).json({
    message: pickLang(requestedLang, 'Проверка устарела. Обновите страницу и попробуйте снова.', 'The check expired. Refresh the page and try again.'),
  });
}

function sendHumanCheckStatusMissingResponse({
  requestedLang,
  result,
  res,
} = {}) {
  return res.status(result?.status || 400).json({
    message: pickLang(requestedLang, 'Пользователь не найден', 'User not found'),
  });
}

function sendHumanCheckBlockedResponse({
  clearAuthCookie = () => {},
  requestedLang,
  result,
  res,
} = {}) {
  clearAuthCookie(res);

  return res.status(403).json({
    message: pickLang(requestedLang, 'Доступ временно закрыт после проваленной проверки', 'Access is temporarily closed after a failed check'),
    humanCheckBlocked: true,
    blockedUntil: result?.blockedUntil,
  });
}

function sendHumanCheckFailResponse({
  clearAuthCookie = () => {},
  requestedLang,
  result,
  res,
} = {}) {
  clearAuthCookie(res);

  return res.json({
    ...result,
    message: result?.blocked
      ? pickLang(requestedLang, 'Проверка не пройдена 3 раза подряд. Доступ закрыт на 1 час.', 'Three checks failed in a row. Access is closed for 1 hour.')
      : pickLang(requestedLang, 'Проверка не пройдена. Сейчас вы будете выведены из аккаунта.', 'The check failed. You will be signed out now.'),
  });
}

module.exports = {
  sendHumanCheckBlockedResponse,
  sendHumanCheckExpiredResponse,
  sendHumanCheckFailResponse,
  sendHumanCheckStatusMissingResponse,
};
