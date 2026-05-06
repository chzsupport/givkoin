const crypto = require('crypto');
const { getSupabaseClient } = require('../lib/supabaseClient');

const cooldowns = new Map(); // userId -> expiration timestamp
const onlineProfiles = new Map();
const onlineProfilesByGenderAge = new Map();

function mapChatRow(row) {
    if (!row) return null;
    return {
        _id: row.id,
        participants: Array.isArray(row.participants) ? row.participants : [],
        status: row.status,
        startedAt: row.started_at ? new Date(row.started_at) : null,
        endedAt: row.ended_at ? new Date(row.ended_at) : null,
        duration: Number(row.duration || 0),
        kAwarded: Boolean(row.k_awarded),
        waitingState: row.waiting_state && typeof row.waiting_state === 'object' ? row.waiting_state : null,
        disconnectionCount: row.disconnection_count && typeof row.disconnection_count === 'object' ? row.disconnection_count : {},
        createdAt: row.created_at ? new Date(row.created_at) : null,
        updatedAt: row.updated_at ? new Date(row.updated_at) : null,
    };
}

function normalizeGender(gender) {
    const normalized = String(gender || '').toLowerCase().trim();
    if (normalized === 'male' || normalized === 'female' || normalized === 'other') {
        return normalized;
    }
    return 'other';
}

function normalizePreferredGender(gender) {
    const normalized = String(gender || '').toLowerCase().trim();
    if (normalized === 'any' || normalized === 'male' || normalized === 'female' || normalized === 'other') {
        return normalized;
    }
    return 'any';
}

function computeAgeFromBirthDate(birthDate) {
    if (!birthDate) return null;
    const date = new Date(birthDate);
    if (Number.isNaN(date.getTime())) return null;

    const now = new Date();
    let age = now.getUTCFullYear() - date.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - date.getUTCMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < date.getUTCDate())) {
        age -= 1;
    }
    if (!Number.isFinite(age)) return null;
    return age;
}

function normalizePreferredAgeRange(ageFrom, ageTo) {
    const rawFrom = Number(ageFrom);
    const rawTo = Number(ageTo);
    const safeFrom = Number.isFinite(rawFrom) ? Math.max(18, Math.min(99, Math.floor(rawFrom))) : 18;
    const safeTo = Number.isFinite(rawTo) ? Math.max(18, Math.min(99, Math.floor(rawTo))) : 99;
    return {
        from: Math.min(safeFrom, safeTo),
        to: Math.max(safeFrom, safeTo),
    };
}

function matchesPreferredGender(preferredGender, candidateGender) {
    const safePreferredGender = normalizePreferredGender(preferredGender);
    if (safePreferredGender === 'any') return true;
    return normalizeGender(candidateGender) === safePreferredGender;
}

function matchesPreferredAge(ageRange, candidateAge) {
    const age = Number(candidateAge);
    if (!Number.isFinite(age)) return false;
    return age >= ageRange.from && age <= ageRange.to;
}

async function getUserRowById(userId) {
    if (!userId) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,data,last_online_at,status')
        .eq('id', String(userId))
        .maybeSingle();
    if (error) return null;
    return data || null;
}

async function updateUserDataById(userId, patch) {
    if (!userId || !patch || typeof patch !== 'object') return null;
    const supabase = getSupabaseClient();
    const row = await getUserRowById(userId);
    if (!row) return null;
    const existing = row.data && typeof row.data === 'object' ? row.data : {};
    const next = { ...existing, ...patch };
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from('users')
        .update({ data: next, updated_at: nowIso })
        .eq('id', String(userId))
        .select('id,data,last_online_at,status')
        .maybeSingle();
    if (error) return null;
    return data || null;
}

function getUserData(row) {
    return row?.data && typeof row.data === 'object' ? row.data : {};
}

function normalizeUserId(userId) {
    return userId == null ? '' : String(userId);
}

function getBlockedUserIds(data) {
    const now = new Date();
    const blockedList = data && typeof data === 'object' && Array.isArray(data.blockedUsers)
        ? data.blockedUsers
            .filter((b) => b?.userId && (!b?.until || new Date(b.until) > now))
            .map((b) => String(b.userId))
        : [];
    return blockedList.filter(Boolean);
}

function getAgeGenderKey(gender, age) {
    return `${normalizeGender(gender)}:${Number(age) || 0}`;
}

function reindexOnlineProfile(previousProfile, nextProfile) {
    if (previousProfile) {
        const previousKey = getAgeGenderKey(previousProfile.gender, previousProfile.age);
        const previousSet = onlineProfilesByGenderAge.get(previousKey);
        if (previousSet) {
            previousSet.delete(previousProfile.userId);
            if (previousSet.size === 0) {
                onlineProfilesByGenderAge.delete(previousKey);
            }
        }
    }

    if (nextProfile && Number.isFinite(nextProfile.age) && nextProfile.age >= 18) {
        const nextKey = getAgeGenderKey(nextProfile.gender, nextProfile.age);
        const nextSet = onlineProfilesByGenderAge.get(nextKey) || new Set();
        nextSet.add(nextProfile.userId);
        onlineProfilesByGenderAge.set(nextKey, nextSet);
    }
}

function buildOnlineProfile(userId, source = {}, previousProfile = null) {
    const rowData = source?.data && typeof source.data === 'object' ? source.data : {};
    const rawData = source && typeof source === 'object' ? source : {};
    const userData = { ...rowData, ...rawData };

    const age = computeAgeFromBirthDate(userData.birthDate);
    const normalizedAgeRange = normalizePreferredAgeRange(userData.preferredAgeFrom, userData.preferredAgeTo);
    const blockedUserIds = Array.isArray(rawData.blockedUserIds)
        ? rawData.blockedUserIds.map((id) => String(id || '')).filter(Boolean)
        : (userData.blockedUsers !== undefined ? getBlockedUserIds(userData) : (previousProfile?.blockedUserIds || []));

    return {
        userId: normalizeUserId(userId || source?.id || previousProfile?.userId),
        _id: normalizeUserId(userId || source?.id || previousProfile?.userId),
        id: normalizeUserId(userId || source?.id || previousProfile?.userId),
        nickname: String(rawData.nickname || previousProfile?.nickname || '').trim(),
        birthDate: userData.birthDate || previousProfile?.birthDate || null,
        gender: normalizeGender(userData.gender || previousProfile?.gender),
        age: Number.isFinite(age) ? age : (Number.isFinite(previousProfile?.age) ? previousProfile.age : null),
        preferredGender: normalizePreferredGender(
            userData.preferredGender !== undefined ? userData.preferredGender : previousProfile?.preferredGender
        ),
        preferredAgeFrom: normalizedAgeRange.from,
        preferredAgeTo: normalizedAgeRange.to,
        preferredAgeRange: normalizedAgeRange,
        chatStatus: String(
            userData.chatStatus !== undefined
                ? userData.chatStatus
                : (rawData.chatStatus !== undefined ? rawData.chatStatus : (previousProfile?.chatStatus || 'available'))
        ),
        blockedUserIds,
        isSearching: typeof rawData.isSearching === 'boolean'
            ? rawData.isSearching
            : Boolean(previousProfile?.isSearching),
        searchStartedAt: Number(rawData.searchStartedAt || previousProfile?.searchStartedAt || 0) || 0,
        lastSeenAt: Date.now(),
    };
}

function registerOnlineUser(userId, source = {}) {
    const userKey = normalizeUserId(userId || source?.id);
    if (!userKey) return null;

    const previousProfile = onlineProfiles.get(userKey) || null;
    const nextProfile = buildOnlineProfile(userKey, source, previousProfile);

    onlineProfiles.set(userKey, nextProfile);
    reindexOnlineProfile(previousProfile, nextProfile);
    return nextProfile;
}

function unregisterOnlineUser(userId) {
    const userKey = normalizeUserId(userId);
    if (!userKey) return;
    const previousProfile = onlineProfiles.get(userKey);
    if (!previousProfile) return;
    onlineProfiles.delete(userKey);
    reindexOnlineProfile(previousProfile, null);
}

function updateOnlineUser(userId, patch = {}) {
    const userKey = normalizeUserId(userId);
    if (!userKey) return null;
    const previousProfile = onlineProfiles.get(userKey);
    if (!previousProfile) return null;

    const nextProfile = buildOnlineProfile(userKey, {
        ...previousProfile,
        ...patch,
        data: {
            gender: patch.gender !== undefined ? patch.gender : previousProfile.gender,
            birthDate: patch.birthDate !== undefined ? patch.birthDate : previousProfile.birthDate,
            preferredGender: patch.preferredGender !== undefined ? patch.preferredGender : previousProfile.preferredGender,
            preferredAgeFrom: patch.preferredAgeFrom !== undefined ? patch.preferredAgeFrom : previousProfile.preferredAgeFrom,
            preferredAgeTo: patch.preferredAgeTo !== undefined ? patch.preferredAgeTo : previousProfile.preferredAgeTo,
            chatStatus: patch.chatStatus !== undefined ? patch.chatStatus : previousProfile.chatStatus,
            blockedUsers: patch.blockedUsers,
        },
    }, previousProfile);

    nextProfile.isSearching = typeof patch.isSearching === 'boolean' ? patch.isSearching : previousProfile.isSearching;
    nextProfile.searchStartedAt = patch.searchStartedAt !== undefined
        ? Number(patch.searchStartedAt || 0)
        : previousProfile.searchStartedAt;
    nextProfile.lastSeenAt = Date.now();

    onlineProfiles.set(userKey, nextProfile);
    reindexOnlineProfile(previousProfile, nextProfile);
    return nextProfile;
}

function getOnlineProfile(userId) {
    return onlineProfiles.get(normalizeUserId(userId)) || null;
}

function isUserInCooldown(userId) {
    const userKey = normalizeUserId(userId);
    if (!userKey) return false;
    const expiresAt = cooldowns.get(userKey);
    if (!expiresAt) return false;
    if (Date.now() < expiresAt) return true;
    cooldowns.delete(userKey);
    return false;
}

function getCandidateIdsForProfile(profile) {
    const ids = [];
    const seen = new Set();
    const genders = profile.preferredGender === 'any'
        ? ['male', 'female', 'other']
        : [profile.preferredGender];

    for (const gender of genders) {
        for (let age = profile.preferredAgeRange.from; age <= profile.preferredAgeRange.to; age += 1) {
            const bucket = onlineProfilesByGenderAge.get(getAgeGenderKey(gender, age));
            if (!bucket) continue;
            for (const candidateId of bucket.values()) {
                if (seen.has(candidateId)) continue;
                seen.add(candidateId);
                ids.push(candidateId);
            }
        }
    }

    return ids;
}

function profileMatchesCandidate(initiatorProfile, candidateProfile) {
    if (!initiatorProfile || !candidateProfile) return false;
    if (!Number.isFinite(candidateProfile.age)) return false;
    if (candidateProfile.chatStatus !== 'available') return false;
    if (!matchesPreferredGender(initiatorProfile.preferredGender, candidateProfile.gender)) return false;
    if (!matchesPreferredAge(initiatorProfile.preferredAgeRange, candidateProfile.age)) return false;
    return true;
}

function areProfilesMutuallyCompatible(firstProfile, secondProfile) {
    if (!profileMatchesCandidate(firstProfile, secondProfile)) return false;
    if (!profileMatchesCandidate(secondProfile, firstProfile)) return false;
    if ((firstProfile.blockedUserIds || []).includes(secondProfile.userId)) return false;
    if ((secondProfile.blockedUserIds || []).includes(firstProfile.userId)) return false;
    return true;
}

async function getSearchProfile(userId) {
    const onlineProfile = getOnlineProfile(userId);
    if (onlineProfile) return onlineProfile;

    const userRow = await getUserRowById(userId);
    if (!userRow) return null;
    return buildOnlineProfile(userId, userRow);
}

function mapCandidateProfile(profile) {
    if (!profile) return null;
    return {
        _id: profile.userId,
        id: profile.userId,
        nickname: profile.nickname,
        gender: profile.gender,
        age: profile.age,
        preferredGender: profile.preferredGender,
        preferredAgeFrom: profile.preferredAgeFrom,
        preferredAgeTo: profile.preferredAgeTo,
        chatStatus: profile.chatStatus,
        isSearching: Boolean(profile.isSearching),
        searchStartedAt: Number(profile.searchStartedAt || 0),
    };
}

function bucketAge(age) {
    const n = Number(age);
    if (!Number.isFinite(n) || n < 18) return 'u18';
    if (n <= 30) return '18-30';
    if (n <= 45) return '31-45';
    return '46+';
}

function scoreRecency(lastSeenAt) {
    const ts = Number(lastSeenAt);
    if (!Number.isFinite(ts) || ts <= 0) return 0;
    const elapsedMs = Math.max(0, Date.now() - ts);
    // Smooth decay: recent users closer to 1, older users approach 0.
    const halfLifeMs = 60 * 60 * 1000;
    return 1 / (1 + (elapsedMs / halfLifeMs));
}

async function findMatch(userId, triedSet = new Set()) {
    const matches = await findMatchCandidates(userId, { excludeIds: triedSet });
    return matches[0] || null;
}

async function findMatchCandidates(userId, options = {}) {
    const initiatorProfile = await getSearchProfile(userId);
    if (!initiatorProfile) return [];

    const excludeIds = new Set(
        [userId, ...(options.excludeIds instanceof Set ? Array.from(options.excludeIds) : []), ...(initiatorProfile.blockedUserIds || [])]
            .map((id) => normalizeUserId(id))
            .filter(Boolean)
    );

    const onlySearching = Boolean(options.onlySearching);
    const requireMutual = Boolean(options.requireMutual);
    const candidates = [];

    for (const candidateId of getCandidateIdsForProfile(initiatorProfile)) {
        const candidateKey = normalizeUserId(candidateId);
        if (!candidateKey || excludeIds.has(candidateKey)) continue;

        const candidateProfile = getOnlineProfile(candidateKey);
        if (!candidateProfile) continue;
        if ((candidateProfile.blockedUserIds || []).includes(initiatorProfile.userId)) continue;
        if (onlySearching && !candidateProfile.isSearching) continue;
        if (isUserInCooldown(candidateKey)) continue;
        if (!profileMatchesCandidate(initiatorProfile, candidateProfile)) continue;
        if (requireMutual && !areProfilesMutuallyCompatible(initiatorProfile, candidateProfile)) continue;

        candidates.push(mapCandidateProfile(candidateProfile));
    }

    if (onlySearching) {
        candidates.sort((left, right) => {
            const a = Number(left.searchStartedAt || 0) || 0;
            const b = Number(right.searchStartedAt || 0) || 0;
            return a - b;
        });
    }

    return candidates;
}

async function findMatchForUser(userId, triedSet = new Set()) {
    return findMatch(userId, triedSet);
}

async function createChat(userId, partnerId) {
    if (!userId || !partnerId) {
        throw new Error('userId and partnerId are required');
    }

    const supabase = getSupabaseClient();
    const a = String(userId);
    const b = String(partnerId);
    const { data: existingRow } = await supabase
        .from('chats')
        .select('*')
        .contains('participants', [a, b])
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (existingRow) return mapChatRow(existingRow);

    const chatId = crypto.randomBytes(12).toString('hex');
    const nowIso = new Date().toISOString();
    const { data: createdRow, error } = await supabase
        .from('chats')
        .insert({
            id: chatId,
            participants: [a, b],
            status: 'active',
            started_at: nowIso,
            created_at: nowIso,
            updated_at: nowIso,
        })
        .select('*')
        .maybeSingle();
    if (error || !createdRow) {
        throw new Error('Failed to create chat');
    }

    const chat = mapChatRow(createdRow);

    // Best-effort status update; chat creation should not fail because of it.
    Promise.all([
        updateUserDataById(userId, { chatStatus: 'in_chat' }),
        updateUserDataById(partnerId, { chatStatus: 'in_chat' }),
    ]).catch(() => { });
    updateOnlineUser(userId, { chatStatus: 'in_chat', isSearching: false, searchStartedAt: 0 });
    updateOnlineUser(partnerId, { chatStatus: 'in_chat', isSearching: false, searchStartedAt: 0 });

    return chat;
}

function setCooldown(userId, durationSeconds) {
    cooldowns.set(userId, Date.now() + durationSeconds * 1000);
}

async function isNewPartner(userId, partnerId) {
    const userRow = await getUserRowById(userId);
    if (!userRow) return false;
    const data = getUserData(userRow);
    const friends = Array.isArray(data.friends) ? data.friends : [];

    const isFriend = friends.map(String).includes(String(partnerId));
    if (isFriend) return false;

    const chatHistory = Array.isArray(data.chatHistory) ? data.chatHistory : [];
    const lastChat = chatHistory.find((h) => String(h?.partnerId) === String(partnerId));
    if (!lastChat) return true; // Never chatted

    const hoursSinceLastChat = (Date.now() - new Date(lastChat.lastChatAt).getTime()) / (1000 * 60 * 60);
    return hoursSinceLastChat > 72;
}

async function upsertChatHistory(userId, partnerId, at) {
    const row = await getUserRowById(userId);
    if (!row) return;
    const data = getUserData(row);
    const history = Array.isArray(data.chatHistory) ? [...data.chatHistory] : [];
    const pid = String(partnerId);
    const atIso = at instanceof Date ? at.toISOString() : new Date(at).toISOString();

    const idx = history.findIndex((h) => String(h?.partnerId) === pid);
    if (idx >= 0) {
        history[idx] = { ...history[idx], partnerId: pid, lastChatAt: atIso };
    } else {
        history.push({ partnerId: pid, lastChatAt: atIso });
    }

    await updateUserDataById(userId, { chatHistory: history });
}

async function updateChatHistory(userId, partnerId) {
    const at = new Date();
    await Promise.all([
        upsertChatHistory(userId, partnerId, at),
        upsertChatHistory(partnerId, userId, at),
    ]);
}

module.exports = {
    normalizeGender,
    bucketAge,
    scoreRecency,
    findMatchForUser,
    findMatchCandidates,
    createChat,
    findMatch,
    isNewPartner,
    updateChatHistory,
    setCooldown,
    registerOnlineUser,
    unregisterOnlineUser,
    updateOnlineUser,
    getOnlineProfile,
    areProfilesMutuallyCompatible,
};

