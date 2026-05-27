const {
    computeChatDurationSeconds,
    computeDurationSeconds,
} = require('../chatCompletionService');

const CHAT_IDLE_TIMEOUT_MS = 60 * 60 * 1000;

function getWaitingSince(chat) {
    return chat?.waitingState?.isWaiting && chat.waitingState?.waitingSince
        ? chat.waitingState.waitingSince
        : null;
}

function getActiveChatDurationSeconds(chat, {
    endedAt = new Date(),
    reportedTotalDurationSeconds = null,
} = {}) {
    const endDate = endedAt instanceof Date ? endedAt : new Date(endedAt || Date.now());
    return computeChatDurationSeconds({
        startedAt: chat?.startedAt || endDate,
        endedAt: endDate,
        reportedTotalDurationSeconds,
        waitingSince: getWaitingSince(chat),
    });
}

function getAdjustedStartedAtAfterWaiting(chat, resumedAt = new Date()) {
    const waitingSince = getWaitingSince(chat);
    const startedAtMs = chat?.startedAt ? new Date(chat.startedAt).getTime() : Date.now();
    const waitingSinceMs = waitingSince ? new Date(waitingSince).getTime() : 0;
    const resumedAtMs = resumedAt instanceof Date ? resumedAt.getTime() : new Date(resumedAt || Date.now()).getTime();
    if (!Number.isFinite(startedAtMs) || !Number.isFinite(waitingSinceMs) || !Number.isFinite(resumedAtMs)) {
        return null;
    }
    if (waitingSinceMs <= startedAtMs || resumedAtMs <= waitingSinceMs) {
        return null;
    }
    return new Date(startedAtMs + (resumedAtMs - waitingSinceMs));
}

function getCompletedChatDurationSeconds(chat, {
    endedAt = new Date(),
    durationSeconds = null,
    reportedTotalDurationSeconds = null,
} = {}) {
    if (durationSeconds != null) {
        return Math.max(0, Math.floor(Number(durationSeconds) || 0));
    }
    const endDate = endedAt instanceof Date ? endedAt : new Date(endedAt || Date.now());
    return computeDurationSeconds({
        startedAt: chat?.startedAt || new Date(),
        endedAt: endDate,
        reportedTotalDurationSeconds,
    });
}

function getChatIdleDeadline(chatState, chat) {
    const startedAtMs = chat?.startedAt ? new Date(chat.startedAt).getTime() : Date.now();
    const lastActivityMs = chatState?.lastActivityAt ? new Date(chatState.lastActivityAt).getTime() : startedAtMs;
    if (!Number.isFinite(lastActivityMs)) return null;
    return lastActivityMs + CHAT_IDLE_TIMEOUT_MS;
}

module.exports = {
    CHAT_IDLE_TIMEOUT_MS,
    getActiveChatDurationSeconds,
    getAdjustedStartedAtAfterWaiting,
    getChatIdleDeadline,
    getCompletedChatDurationSeconds,
    getWaitingSince,
};
