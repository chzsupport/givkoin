const BATTLE_JOIN_BATCH_BASE_SIZE = Math.max(1, Number(process.env.BATTLE_JOIN_BATCH_BASE_SIZE) || 100);
const BATTLE_JOIN_BATCH_MEDIUM_SIZE = Math.max(
    BATTLE_JOIN_BATCH_BASE_SIZE,
    Number(process.env.BATTLE_JOIN_BATCH_MEDIUM_SIZE) || 250,
);
const BATTLE_JOIN_BATCH_HIGH_SIZE = Math.max(
    BATTLE_JOIN_BATCH_MEDIUM_SIZE,
    Number(process.env.BATTLE_JOIN_BATCH_HIGH_SIZE) || 500,
);
const BATTLE_JOIN_BATCH_MEDIUM_QUEUE = Math.max(1, Number(process.env.BATTLE_JOIN_BATCH_MEDIUM_QUEUE) || 1000);
const BATTLE_JOIN_BATCH_HIGH_QUEUE = Math.max(BATTLE_JOIN_BATCH_MEDIUM_QUEUE, Number(process.env.BATTLE_JOIN_BATCH_HIGH_QUEUE) || 3000);
const BATTLE_JOIN_BATCH_DELAY_MS = Math.max(250, Number(process.env.BATTLE_JOIN_BATCH_DELAY_MS) || 2000);
const BATTLE_JOIN_TICKET_TTL_MS = 10 * 60 * 1000;

const battleJoinQueueState = new Map();

function getBattleJoinQueue(battleId) {
    const safeBattleId = String(battleId || '').trim();
    if (!safeBattleId) return null;
    let state = battleJoinQueueState.get(safeBattleId);
    if (!state) {
        state = {
            openedAtMs: 0,
            nextTicket: 0,
            ticketsByUser: new Map(),
        };
        battleJoinQueueState.set(safeBattleId, state);
    }
    return state;
}

function cleanupBattleJoinQueue(battleId, nowMs = Date.now()) {
    const state = getBattleJoinQueue(battleId);
    if (!state) return null;

    for (const [userId, ticketState] of state.ticketsByUser.entries()) {
        if (!ticketState || (nowMs - Number(ticketState.issuedAtMs || 0)) > BATTLE_JOIN_TICKET_TTL_MS) {
            state.ticketsByUser.delete(userId);
        }
    }

    if (state.ticketsByUser.size === 0) {
        state.openedAtMs = 0;
        state.nextTicket = 0;
    }

    return state;
}

function reserveBattleJoinSlot({ battleId, userId, nowMs = Date.now() }) {
    const state = cleanupBattleJoinQueue(battleId, nowMs);
    if (!state) {
        return { queued: false, retryAfterMs: 0 };
    }

    const safeUserId = String(userId || '').trim();
    if (!safeUserId) {
        return { queued: false, retryAfterMs: 0 };
    }

    if (!state.openedAtMs) {
        state.openedAtMs = nowMs;
    }

    let ticketState = state.ticketsByUser.get(safeUserId);
    if (!ticketState) {
        ticketState = {
            ticket: state.nextTicket,
            issuedAtMs: nowMs,
        };
        state.nextTicket += 1;
        state.ticketsByUser.set(safeUserId, ticketState);
    }

    const waitingCount = Math.max(0, Number(state.ticketsByUser.size) || 0);
    const batchSize = waitingCount >= BATTLE_JOIN_BATCH_HIGH_QUEUE
        ? BATTLE_JOIN_BATCH_HIGH_SIZE
        : waitingCount >= BATTLE_JOIN_BATCH_MEDIUM_QUEUE
            ? BATTLE_JOIN_BATCH_MEDIUM_SIZE
            : BATTLE_JOIN_BATCH_BASE_SIZE;
    const slotIndex = Math.floor(Math.max(0, Number(ticketState.ticket) || 0) / batchSize);
    const slotStartsAtMs = state.openedAtMs + slotIndex * BATTLE_JOIN_BATCH_DELAY_MS;
    const retryAfterMs = Math.max(0, slotStartsAtMs - nowMs);

    return {
        queued: retryAfterMs > 0,
        retryAfterMs,
        batchSize,
        waitingCount,
    };
}

function releaseBattleJoinSlot({ battleId, userId }) {
    const state = getBattleJoinQueue(battleId);
    if (!state) return;
    state.ticketsByUser.delete(String(userId || '').trim());
    if (state.ticketsByUser.size === 0) {
        state.openedAtMs = 0;
        state.nextTicket = 0;
    }
}

function clearBattleJoinQueueState() {
    battleJoinQueueState.clear();
}

module.exports = {
    clearBattleJoinQueueState,
    cleanupBattleJoinQueue,
    getBattleJoinQueue,
    releaseBattleJoinSlot,
    reserveBattleJoinSlot,
};
