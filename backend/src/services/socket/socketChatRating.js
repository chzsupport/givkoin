const { awardRadianceForActivity } = require('../activityRadianceService');
const {
    getChatById,
    getUserData,
    getUserRowById,
    updateChatById,
    updateUserDataById,
} = require('./socketDataStore');

const CHAT_ROOM_PREFIX = 'chat-';

function getChatPartnerId(chat, currentUserId) {
    return (chat?.participants || []).find((participantId) => participantId.toString() !== currentUserId);
}

function hasUserRated(chat, currentUserId) {
    return Array.isArray(chat?.ratings)
        && chat.ratings.some((rating) => String(rating?.from || '') === String(currentUserId));
}

function buildRatingEntry({ from, to, rating }) {
    return {
        from: String(from),
        to: String(to),
        rating: Boolean(rating),
    };
}

function buildNextRatings(chat, ratingEntry) {
    return (Array.isArray(chat?.ratings) ? chat.ratings : []).concat([ratingEntry]);
}

function buildPositiveRatingStats(partnerStats) {
    const currentStats = partnerStats && typeof partnerStats === 'object' ? partnerStats : {};
    const likes = (Number(currentStats.totalPositiveRatingsReceived) || 0) + 1;
    return {
        likes,
        nextPartnerStats: {
            ...currentStats,
            totalPositiveRatingsReceived: likes,
        },
    };
}

function getLikeAchievementIds(likes) {
    const ids = [];
    if (likes >= 50) ids.push(76);
    if (likes >= 100) ids.push(93);
    return ids;
}

async function awardRatingRadiance({ userId, chatId, rating }) {
    try {
        const radianceAmount = rating ? 2 : 1;
        await awardRadianceForActivity({
            userId,
            amount: radianceAmount,
            activityType: 'chat_rate',
            meta: { chatId, rating: Boolean(rating) },
            dedupeKey: `chat_rate:${chatId}:${userId}`,
        });
    } catch (_error) {
        // ignore
    }
}

async function awardPositiveRatingEffects({ currentUserId, partnerId, chatId }) {
    const { applyStarsDelta } = require('../../utils/stars');
    await applyStarsDelta({
        userId: partnerId,
        delta: 0.001,
        type: 'chat_rating',
        description: 'Оценка общения',
        relatedEntity: chatId,
    });

    try {
        const { grantAchievement } = require('../achievementService');
        const partnerRow = await getUserRowById(partnerId);
        const partnerData = getUserData(partnerRow);
        const { likes, nextPartnerStats } = buildPositiveRatingStats(partnerData.achievementStats);
        await updateUserDataById(partnerId, { achievementStats: nextPartnerStats });

        for (const achievementId of getLikeAchievementIds(likes)) {
            await grantAchievement({ userId: partnerId, achievementId });
        }
    } catch (err) {
        console.error('Error updating chat like achievements:', err);
    }

    const kService = require('../kService');
    await kService.creditK({
        userId: currentUserId,
        amount: 5,
        type: 'chat_rating',
        description: 'Награда за оценку собеседника',
        relatedEntity: chatId,
    });
}

async function handleRatePartner(socket, currentUserId, { chatId, rating } = {}) {
    const chat = await getChatById(chatId);
    if (!chat) return;

    if (!(chat.participants || []).map(String).includes(String(currentUserId))) return;

    const partnerId = getChatPartnerId(chat, currentUserId);
    if (!partnerId) return;

    if (hasUserRated(chat, currentUserId)) {
        socket.to(`${CHAT_ROOM_PREFIX}${chatId}`).emit('partner_rated');
        return;
    }

    await awardRatingRadiance({ userId: currentUserId, chatId, rating });

    const nextRatings = buildNextRatings(chat, buildRatingEntry({
        from: currentUserId,
        to: partnerId,
        rating,
    }));
    await updateChatById(chatId, { ratings: nextRatings });

    if (rating) {
        await awardPositiveRatingEffects({ currentUserId, partnerId, chatId });
    }

    socket.to(`${CHAT_ROOM_PREFIX}${chatId}`).emit('partner_rated');
}

module.exports = {
    buildNextRatings,
    buildPositiveRatingStats,
    buildRatingEntry,
    getChatPartnerId,
    getLikeAchievementIds,
    handleRatePartner,
    hasUserRated,
};
