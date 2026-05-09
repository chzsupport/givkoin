const { getSupabaseClient } = require('../lib/supabaseClient');

const cooldowns = new Map(); // userId -> expiration timestamp
const onlineProfiles = new Map();
const onlineProfilesByGenderAge = new Map();
const RECENT_PARTNER_COOLDOWN_MS = 72 * 60 * 60 * 1000;

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

function getRecentAvoidedPartnerIds(data, nowMs = Date.now()) {
    const result = new Set();
    const safeData = data && typeof data === 'object' ? data : {};

    const friends = Array.isArray(safeData.friends) ? safeData.friends : [];
    for (const friendId of friends) {
        const id = normalizeUserId(friendId);
        if (id) result.add(id);
    }

    const chatHistory = Array.isArray(safeData.chatHistory) ? safeData.chatHistory : [];
    for (const entry of chatHistory) {
        const partnerId = normalizeUserId(entry?.partnerId);
        if (!partnerId) continue;
        const lastChatAtMs = new Date(entry?.lastChatAt || 0).getTime();
        if (Number.isFinite(lastChatAtMs) && nowMs - lastChatAtMs <= RECENT_PARTNER_COOLDOWN_MS) {
            result.add(partnerId);
        }
    }

    return Array.from(result);
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
    const recentPartnerIds = Array.isArray(rawData.recentPartnerIds)
        ? rawData.recentPartnerIds.map((id) => String(id || '')).filter(Boolean)
        : ((userData.friends !== undefined || userData.chatHistory !== undefined)
            ? getRecentAvoidedPartnerIds(userData)
            : (previousProfile?.recentPartnerIds || []));

    return {
        userId: normalizeUserId(userId || source?.id || previousProfile?.userId),
        _id: normalizeUserId(userId || source?.id || previousProfile?.userId),
        id: normalizeUserId(userId || source?.id || previousProfile?.userId),
        nickname: String(rawData.nickname || userData.nickname || previousProfile?.nickname || '').trim(),
        language: String(rawData.language || userData.language || previousProfile?.language || 'ru').trim() || 'ru',
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
        recentPartnerIds,
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
    if ((firstProfile.recentPartnerIds || []).includes(secondProfile.userId)) return false;
    if ((secondProfile.recentPartnerIds || []).includes(firstProfile.userId)) return false;
    return true;
}

function addRecentPartnerRuntime(userId, partnerId) {
    const userKey = normalizeUserId(userId);
    const partnerKey = normalizeUserId(partnerId);
    if (!userKey || !partnerKey) return null;
    const profile = getOnlineProfile(userKey);
    if (!profile) return null;
    const recent = Array.isArray(profile.recentPartnerIds) ? profile.recentPartnerIds.map(String) : [];
    const nextRecent = recent.includes(partnerKey) ? recent : [...recent, partnerKey];
    return updateOnlineUser(userKey, { recentPartnerIds: nextRecent });
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
        if ((initiatorProfile.recentPartnerIds || []).includes(candidateKey)) continue;
        if ((candidateProfile.recentPartnerIds || []).includes(initiatorProfile.userId)) continue;
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

function setCooldown(userId, durationSeconds) {
    cooldowns.set(userId, Date.now() + durationSeconds * 1000);
}

async function isNewPartner(userId, partnerId) {
    const userRow = await getUserRowById(userId);
    if (!userRow) return false;
    const data = getUserData(userRow);
    return !getRecentAvoidedPartnerIds(data).includes(String(partnerId));
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
    updateOnlineUser(userId, {
        recentPartnerIds: getRecentAvoidedPartnerIds({ ...data, chatHistory: history }),
    });
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
    findMatch,
    isNewPartner,
    updateChatHistory,
    setCooldown,
    registerOnlineUser,
    unregisterOnlineUser,
    updateOnlineUser,
    getOnlineProfile,
    addRecentPartnerRuntime,
    areProfilesMutuallyCompatible,
};

