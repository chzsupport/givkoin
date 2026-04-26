const { getSocketStateClient } = require('./socketAdapterService');

const searchQueue = new Map();
const pendingCalls = new Map();

const SEARCH_QUEUE_INDEX_KEY = 'socket:queue:index';
const SEARCH_QUEUE_ENTRY_PREFIX = 'socket:queue:entry:';
const PENDING_CALL_TARGET_PREFIX = 'socket:pending:target:';
const PENDING_CALL_INITIATOR_PREFIX = 'socket:pending:initiator:';
const QUEUE_SWEEP_LOCK_KEY = 'socket:queue:sweep-lock';

function normalizeUserId(userId) {
    return userId == null ? '' : userId.toString();
}

function getStateClient() {
    const client = getSocketStateClient();
    return client?.isOpen ? client : null;
}

function queueEntryKey(userId) {
    return `${SEARCH_QUEUE_ENTRY_PREFIX}${normalizeUserId(userId)}`;
}

function pendingTargetKey(userId) {
    return `${PENDING_CALL_TARGET_PREFIX}${normalizeUserId(userId)}`;
}

function pendingInitiatorKey(userId) {
    return `${PENDING_CALL_INITIATOR_PREFIX}${normalizeUserId(userId)}`;
}

function parseQueueEntry(rawValue) {
    if (!rawValue) return null;

    try {
        const parsed = JSON.parse(rawValue);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_error) {
        return null;
    }
}

function parsePendingCall(rawValue) {
    if (!rawValue) return null;

    try {
        const parsed = JSON.parse(rawValue);
        if (parsed && typeof parsed === 'object') {
            return {
                initiatorId: normalizeUserId(parsed.initiatorId),
                token: String(parsed.token || ''),
                createdAt: Number(parsed.createdAt) || 0,
            };
        }
    } catch (_error) {
        // Backward-compatible fallback for plain string payloads.
    }

    return {
        initiatorId: normalizeUserId(rawValue),
        token: '',
        createdAt: 0,
    };
}

async function getQueuedUser(userId) {
    const userKey = normalizeUserId(userId);
    if (!userKey) return null;

    const client = getStateClient();
    if (!client) {
        return searchQueue.get(userKey) || null;
    }

    return parseQueueEntry(await client.get(queueEntryKey(userKey)));
}

async function getQueuedUsersBatch(limit = 1) {
    const safeLimit = Math.max(0, Number(limit) || 0);
    if (safeLimit === 0) return [];

    const client = getStateClient();
    if (!client) {
        return Array.from(searchQueue.values()).slice(0, safeLimit);
    }

    const userIds = await client.zRange(SEARCH_QUEUE_INDEX_KEY, 0, safeLimit - 1);
    if (!userIds.length) return [];

    const rawEntries = await client.mGet(userIds.map((userId) => queueEntryKey(userId)));
    return rawEntries.map(parseQueueEntry).filter(Boolean);
}

async function addToQueue(entry) {
    const userKey = normalizeUserId(entry?.userId);
    if (!userKey || !entry) return false;

    const normalizedEntry = {
        ...entry,
        userId: userKey,
        startedAt: Number(entry.startedAt) || Date.now(),
    };

    const client = getStateClient();
    if (!client) {
        if (searchQueue.has(userKey)) return false;
        searchQueue.set(userKey, normalizedEntry);
        return true;
    }

    const setResult = await client.set(queueEntryKey(userKey), JSON.stringify(normalizedEntry), { NX: true });
    if (setResult !== 'OK') return false;

    try {
        await client.zAdd(SEARCH_QUEUE_INDEX_KEY, [{ score: normalizedEntry.startedAt, value: userKey }]);
        return true;
    } catch (error) {
        await client.del(queueEntryKey(userKey));
        throw error;
    }
}

async function removeFromQueue(userId) {
    const userKey = normalizeUserId(userId);
    if (!userKey) return;

    const client = getStateClient();
    if (!client) {
        searchQueue.delete(userKey);
        return;
    }

    await Promise.all([
        client.del(queueEntryKey(userKey)),
        client.zRem(SEARCH_QUEUE_INDEX_KEY, userKey),
    ]);
}

async function getQueueSize() {
    const client = getStateClient();
    if (!client) return searchQueue.size;
    return Number(await client.zCard(SEARCH_QUEUE_INDEX_KEY)) || 0;
}

async function setPendingCall(targetId, initiatorId, ttlMs, token = '') {
    const targetKey = normalizeUserId(targetId);
    const initiatorKey = normalizeUserId(initiatorId);
    if (!targetKey || !initiatorKey) return false;

    const record = {
        initiatorId: initiatorKey,
        token: String(token || ''),
        createdAt: Date.now(),
    };

    const client = getStateClient();
    if (!client) {
        if (pendingCalls.has(targetKey)) return false;
        pendingCalls.set(targetKey, record);
        return true;
    }

    const setResult = await client.set(pendingTargetKey(targetKey), JSON.stringify(record), {
        NX: true,
        PX: ttlMs,
    });
    if (setResult !== 'OK') return false;

    const initiatorTargetsKey = pendingInitiatorKey(initiatorKey);
    await client.sAdd(initiatorTargetsKey, targetKey);
    await client.pExpire(initiatorTargetsKey, ttlMs);
    return true;
}

async function getPendingCallRecord(targetId) {
    const targetKey = normalizeUserId(targetId);
    if (!targetKey) return null;

    const client = getStateClient();
    if (!client) {
        return pendingCalls.get(targetKey) || null;
    }

    return parsePendingCall(await client.get(pendingTargetKey(targetKey)));
}

async function getPendingCall(targetId) {
    return (await getPendingCallRecord(targetId))?.initiatorId || null;
}

async function hasPendingCall(targetId) {
    return Boolean(await getPendingCall(targetId));
}

async function clearPendingCall(targetId) {
    const targetKey = normalizeUserId(targetId);
    if (!targetKey) return null;

    const client = getStateClient();
    if (!client) {
        const record = pendingCalls.get(targetKey) || null;
        pendingCalls.delete(targetKey);
        return record?.initiatorId || null;
    }

    const record = await getPendingCallRecord(targetKey);
    await client.del(pendingTargetKey(targetKey));
    if (record?.initiatorId) {
        await client.sRem(pendingInitiatorKey(record.initiatorId), targetKey);
    }
    return record?.initiatorId || null;
}

async function clearPendingCallsForUser(userId) {
    const userKey = normalizeUserId(userId);
    if (!userKey) return;

    const client = getStateClient();
    if (!client) {
        for (const [targetId, record] of Array.from(pendingCalls.entries())) {
            if (targetId === userKey || record?.initiatorId === userKey) {
                pendingCalls.delete(targetId);
            }
        }
        return;
    }

    await clearPendingCall(userKey);
    const initiatorTargetsKey = pendingInitiatorKey(userKey);
    const targetIds = await client.sMembers(initiatorTargetsKey);
    for (const targetId of targetIds) {
        await clearPendingCall(targetId);
    }
    await client.del(initiatorTargetsKey);
}

async function acquireQueueSweepLock(token, ttlMs) {
    const client = getStateClient();
    if (!client) return true;
    const lockResult = await client.set(QUEUE_SWEEP_LOCK_KEY, token, { NX: true, PX: ttlMs });
    return lockResult === 'OK';
}

async function releaseQueueSweepLock(token) {
    const client = getStateClient();
    if (!client) return;

    const currentToken = await client.get(QUEUE_SWEEP_LOCK_KEY);
    if (currentToken === token) {
        await client.del(QUEUE_SWEEP_LOCK_KEY);
    }
}

function resetRuntimeState() {
    searchQueue.clear();
    pendingCalls.clear();
}

module.exports = {
    getQueuedUser,
    getQueuedUsersBatch,
    addToQueue,
    removeFromQueue,
    getQueueSize,
    setPendingCall,
    getPendingCallRecord,
    getPendingCall,
    hasPendingCall,
    clearPendingCall,
    clearPendingCallsForUser,
    acquireQueueSweepLock,
    releaseQueueSweepLock,
    resetRuntimeState,
};