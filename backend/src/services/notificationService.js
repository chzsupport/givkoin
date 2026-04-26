const { createNotification } = require('../controllers/notificationController');
const { getOnlineUserIds } = require('./socketService');
const { forEachUserBatch } = require('./userBatchService');

const NOTIFY_BATCH = Number(process.env.NOTIFICATION_BATCH || 200);

function normalizeLang(value) {
  return value === 'en' ? 'en' : 'ru';
}

function resolveLocalizedText(value, lang) {
  if (value && typeof value === 'object') {
    const target = normalizeLang(lang);
    const localized = value[target];
    return typeof localized === 'string' ? localized : '';
  }
  return value == null ? '' : String(value);
}

function buildTranslations(title, message) {
  const isLocalizedTitle = title && typeof title === 'object';
  const isLocalizedMessage = message && typeof message === 'object';
  if (!isLocalizedTitle && !isLocalizedMessage) return undefined;

  return {
    ru: {
      title: resolveLocalizedText(title, 'ru'),
      message: resolveLocalizedText(message, 'ru'),
    },
    en: {
      title: resolveLocalizedText(title, 'en') || resolveLocalizedText(title, 'ru'),
      message: resolveLocalizedText(message, 'en') || resolveLocalizedText(message, 'ru'),
    },
  };
}

async function broadcastNotification({
  type = 'event',
  eventKey,
  title,
  message,
  link,
}) {
  const io = global.io;
  return forEachUserBatch({
    pageSize: NOTIFY_BATCH,
    map: (user) => ({ _id: user._id, language: user.language }),
    handler: async (batch) => {
      const translations = buildTranslations(title, message);
      await Promise.all(
        batch.map((user) =>
        createNotification({
          userId: user._id,
          type,
          eventKey,
          title: resolveLocalizedText(title, user.language),
          message: resolveLocalizedText(message, user.language),
          link,
          translations,
          io,
        }).catch(() => {})
        )
      );
    },
  });
}

async function broadcastNotificationByPresence({ online, offline }) {
  const onlineSet = new Set(getOnlineUserIds().map((id) => id.toString()));
  const io = global.io;
  return forEachUserBatch({
    pageSize: NOTIFY_BATCH,
    map: (user) => ({ _id: user._id, language: user.language }),
    handler: async (batch) => {
      const onlineTranslations = online ? buildTranslations(online.title, online.message) : undefined;
      const offlineTranslations = offline ? buildTranslations(offline.title, offline.message) : undefined;
      await Promise.all(
        batch.map((user) => {
        const isOnline = onlineSet.has(user._id.toString());
        if (isOnline && online) {
          return createNotification({
            userId: user._id,
            type: online.type || 'system',
            eventKey: online.eventKey,
            title: resolveLocalizedText(online.title, user.language),
            message: resolveLocalizedText(online.message, user.language),
            link: online.link,
            translations: onlineTranslations,
            io,
          }).catch(() => {});
        }
        if (!isOnline && offline) {
          return createNotification({
            userId: user._id,
            type: offline.type || 'event',
            eventKey: offline.eventKey,
            title: resolveLocalizedText(offline.title, user.language),
            message: resolveLocalizedText(offline.message, user.language),
            link: offline.link,
            translations: offlineTranslations,
          }).catch(() => {});
        }
        return null;
        })
      );
    },
  });
}

module.exports = { broadcastNotification, broadcastNotificationByPresence };
