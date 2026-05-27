const {
    getUserData,
    getUserRowById,
    toId,
    updateUserDataById,
} = require('./socketDataStore');

const CONNECTION_WARNING_WINDOW_DAYS = 30;
const EMPTY_WARNING_RESULT = { warningCount30Days: 0, lifeDeducted: false };

function normalizeDate(value) {
    const date = value instanceof Date ? value : new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? new Date() : date;
}

function buildStrictDisconnectWarningPatch(data = {}, chatId, {
    now = new Date(),
    windowDays = CONNECTION_WARNING_WINDOW_DAYS,
} = {}) {
    const nowDate = normalizeDate(now);
    const windowStart = new Date(nowDate.getTime() - windowDays * 24 * 60 * 60 * 1000);
    const existingWarnings = Array.isArray(data.connectionWarnings) ? data.connectionWarnings : [];
    const nextWarnings = existingWarnings
        .filter((warning) => {
            const warnedAt = warning?.warnedAt ? new Date(warning.warnedAt) : null;
            if (!warnedAt || Number.isNaN(warnedAt.getTime())) return false;
            return warnedAt >= windowStart;
        })
        .concat([{ warnedAt: nowDate.toISOString(), chatId }]);

    const warningCount30Days = nextWarnings.length;
    const currentLives = Number(data.lives) || 0;
    const shouldDeductLife = warningCount30Days >= 2 && currentLives > 0;
    const patch = {
        connectionWarnings: nextWarnings,
        warningCount30Days,
    };

    if (shouldDeductLife) {
        patch.lives = currentLives - 1;
    }

    return {
        lifeDeducted: shouldDeductLife,
        patch,
        warningCount30Days,
    };
}

function buildWarningNotification(userLang, shouldDeductLife) {
    const language = userLang === 'en' ? 'en' : 'ru';

    return {
        title: shouldDeductLife
            ? (language === 'en' ? '1 life removed' : 'Снята 1 жизнь')
            : (language === 'en' ? 'Chat warning' : 'Предупреждение по чату'),
        message: shouldDeductLife
            ? (language === 'en'
                ? 'For the second time in the last 30 days, you did not return to the chat during the mandatory first 5 minutes. According to the chat rules, 1 life has been deducted.'
                : 'Вы второй раз за последние 30 дней не вернулись в чат в обязательные первые 5 минут. По правилам чата у вас была вычтена 1 жизнь.')
            : (language === 'en'
                ? 'You left the chat and did not wait for the mandatory 5-minute timer. This is your first time, so your lives were kept, but next time 1 life will be deducted.'
                : 'Вы покинули чат и не дождались обязательного 5-минутного таймера. У вас это впервые, поэтому жизни сохранены, но в следующий раз будет снята 1 жизнь.'),
    };
}

async function registerStrictDisconnectWarning(userOrId, chatId, io) {
    try {
        const userId = toId(userOrId);
        if (!userId) return { ...EMPTY_WARNING_RESULT };

        const row = await getUserRowById(userId);
        if (!row) return { ...EMPTY_WARNING_RESULT };

        const data = getUserData(row);
        const warning = buildStrictDisconnectWarningPatch(data, chatId);
        const saved = await updateUserDataById(userId, warning.patch);

        const email = String(saved?.email || row?.email || '').trim();
        const nickname = String(saved?.nickname || row?.nickname || '').trim();
        const userLang = (saved?.language || saved?.data?.language || row?.language || row?.data?.language || 'ru') === 'en' ? 'en' : 'ru';

        if (warning.lifeDeducted && email) {
            const emailService = require('../emailService');
            await emailService.sendUnstableConnectionPenaltyEmail(
                email,
                nickname,
                userLang
            ).catch(() => { });
        }

        const { createNotification } = require('../../controllers/notificationController');
        const notification = buildWarningNotification(userLang, warning.lifeDeducted);
        await createNotification({
            userId,
            type: 'chat_warning',
            title: notification.title,
            message: notification.message,
            link: '/cabinet/history',
            eventKey: `chat_disconnect_warning:${chatId}:${warning.warningCount30Days}`,
            io,
        });

        return {
            warningCount30Days: warning.warningCount30Days,
            lifeDeducted: warning.lifeDeducted,
        };
    } catch (error) {
        console.error('Error in registerStrictDisconnectWarning:', error);
        return { ...EMPTY_WARNING_RESULT };
    }
}

module.exports = {
    buildStrictDisconnectWarningPatch,
    buildWarningNotification,
    CONNECTION_WARNING_WINDOW_DAYS,
    registerStrictDisconnectWarning,
};
