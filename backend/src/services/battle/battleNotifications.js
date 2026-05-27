const { getFrontendBaseUrl } = require('../../config/env');
const { broadcastNotificationByPresence } = require('../notificationService');
const { forEachUserBatch } = require('../userBatchService');
const { sendDarknessAttackEmail } = require('../emailService');

const BATTLE_START_NOTIFICATION = {
  type: 'game',
  eventKey: 'battle_start',
  title: 'Мрак напал на Древо',
  message: 'Мрак напал! Войдите в бой и защитите Древо.',
  link: '/battle',
};

const BATTLE_START_NOTIFY_BATCH = 200;

async function notifyBattleStart() {
  const appUrl = getFrontendBaseUrl();
  const battleUrl = `${appUrl}/battle`;
  await broadcastNotificationByPresence({
    online: {
      type: BATTLE_START_NOTIFICATION.type,
      title: BATTLE_START_NOTIFICATION.title,
      message: BATTLE_START_NOTIFICATION.message,
      link: BATTLE_START_NOTIFICATION.link,
    },
    offline: {
      type: 'event',
      eventKey: BATTLE_START_NOTIFICATION.eventKey,
      title: BATTLE_START_NOTIFICATION.title,
      message: BATTLE_START_NOTIFICATION.message,
      link: BATTLE_START_NOTIFICATION.link,
    },
  });

  await forEachUserBatch({
    pageSize: BATTLE_START_NOTIFY_BATCH,
    filter: (user) => Boolean(user?.email),
    map: (user) => ({ email: user.email, nickname: user.nickname, language: user.language }),
    handler: async (batch) => {
      await Promise.all(
        batch.map((user) =>
          sendDarknessAttackEmail(
            user.email,
            user.nickname,
            battleUrl,
            user.language
          ))
      );
    },
  });
}

module.exports = {
  notifyBattleStart,
};
