const { toId } = require('./socketDataStore');

// Chat context cache: chatId -> { participants, participantLanguages, startedAt, status }
const activeChatContexts = new Map();

function getActiveChatContext(chatId) {
    const id = toId(chatId);
    if (!id) return null;
    return activeChatContexts.get(String(id)) || null;
}

function setActiveChatContext(chatId, context = {}) {
    const id = toId(chatId);
    if (!id) return null;
    const participants = Array.isArray(context.participants)
        ? context.participants.map((value) => String(value)).filter(Boolean)
        : [];
    const participantLanguages = context.participantLanguages && typeof context.participantLanguages === 'object'
        ? context.participantLanguages
        : {};
    const next = {
        participants,
        participantLanguages,
        startedAt: context.startedAt || null,
        status: context.status || 'active',
        isFriend: typeof context.isFriend === 'boolean' ? context.isFriend : null,
        readyAt: context.readyAt || null,
        isPreparing: Boolean(context.isPreparing),
    };
    activeChatContexts.set(String(id), next);
    return next;
}

function clearActiveChatContext(chatId) {
    const id = toId(chatId);
    if (!id) return;
    activeChatContexts.delete(String(id));
}

function resetActiveChatContexts() {
    activeChatContexts.clear();
}

function getChatPreparationState(chatLike, now = Date.now()) {
    const startedAtMs = chatLike?.startedAt ? new Date(chatLike.startedAt).getTime() : 0;
    const futureStartedAt = Number.isFinite(startedAtMs) && startedAtMs > now
        ? new Date(startedAtMs).toISOString()
        : null;
    const readyAtValue = chatLike?.preparationState?.readyAt || chatLike?.readyAt || futureStartedAt || null;
    const readyAtMs = readyAtValue ? new Date(readyAtValue).getTime() : 0;
    const isPreparingByTime = Number.isFinite(readyAtMs) && readyAtMs > now;
    const isPreparingFlag = typeof chatLike?.preparationState?.isPreparing === 'boolean'
        ? chatLike.preparationState.isPreparing
        : Boolean(chatLike?.isPreparing);

    return {
        readyAt: readyAtValue,
        readyAtMs: Number.isFinite(readyAtMs) ? readyAtMs : 0,
        isPreparing: isPreparingFlag || isPreparingByTime,
        countdownSeconds: Math.max(0, Math.ceil(((Number.isFinite(readyAtMs) ? readyAtMs : now) - now) / 1000)),
    };
}

module.exports = {
    clearActiveChatContext,
    getActiveChatContext,
    getChatPreparationState,
    resetActiveChatContexts,
    setActiveChatContext,
};
