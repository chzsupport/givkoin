const { normalizeRequestLanguage } = require('../../utils/requestLanguage');

function getSocketSiteLanguage(socket) {
  return normalizeRequestLanguage(socket?.data?.siteLanguage || 'ru');
}

function pickSocketText(socket, ru, en) {
  return getSocketSiteLanguage(socket) === 'en' ? en : ru;
}

function buildSocketMessage(socket, messageKey, ru, en, extra = {}) {
  return {
    ...extra,
    messageKey,
    message: pickSocketText(socket, ru, en),
  };
}

function buildSocketMessageKey(messageKey, extra = {}) {
  return {
    ...extra,
    messageKey,
  };
}

module.exports = {
  buildSocketMessage,
  buildSocketMessageKey,
  getSocketSiteLanguage,
  pickSocketText,
};
