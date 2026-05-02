const crypto = require('crypto');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { getDocById, listDocsByModel, upsertDoc } = require('../services/documentStore');
const { recordTransaction } = require('../services/scService');
const { getNightShiftStatusForUser } = require('../services/nightShiftRuntimeService');
const { applyTreeBlessingToReward } = require('../services/treeBlessingService');
const { normalizeSitePath } = require('../utils/sitePath');

const PROGRESS_MODEL = 'UserCrystalProgress';
const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
const CRYSTAL_DAILY_CACHE_TTL_MS = Math.max(1000, Number(process.env.CRYSTAL_DAILY_CACHE_TTL_MS) || 10 * 1000);
const TOTAL_SHARDS = 12;

let dailyCrystalShardCache = { key: '', value: null, expiresAt: 0 };
const dailyCrystalShardInflight = new Map();
const crystalProgressInflight = new Map();

const TARGET_PAGES = [
    { url: '/entity/profile', name: 'Профиль Сущности' },
    { url: '/galaxy', name: 'Желания' },
    { url: '/bridges', name: 'Мосты Мира' },
    { url: '/fortune', name: 'Фортуна' },
    { url: '/fortune/roulette', name: 'Рулетка' },
    { url: '/fortune/lottery', name: 'Лотерея' },
    { url: '/shop', name: 'Магазин' },
    { url: '/news', name: 'Новости' },
    { url: '/chronicle', name: 'Летопись' },
    { url: '/practice', name: 'Практика' },
    { url: '/practice/meditation/me', name: 'Моя Медитация' },
    { url: '/practice/meditation/we', name: 'Коллективная Медитация' },
    { url: '/practice/gratitude', name: 'Благодарность' },
    { url: '/activity/achievements', name: 'Достижения' },
    { url: '/activity/collect', name: 'Сбор' },
    { url: '/activity/night-shift', name: 'Ночная Смена' },
    { url: '/about', name: 'О нас' },
    { url: '/rules', name: 'Правила' },
    { url: '/feedback', name: 'Обратная связь' },
    { url: '/roadmap', name: 'Дорожная карта' },
];

function normalizePath(path) {
    const raw = String(path || '').trim();
    if (!raw) return '';
    return normalizeSitePath(raw);
}

function getDailyMechanicsSalt() {
    return String(
        process.env.DAILY_MECHANICS_SALT
        || process.env.APP_SECRET
        || process.env.JWT_SECRET
        || 'givkoin-daily-salt'
    ).trim();
}

function toIsoDayKey(sessionStart) {
    return new Date(sessionStart).toISOString();
}

function buildDailyDocId(sessionStart) {
    return `crystal_daily:${toIsoDayKey(sessionStart)}`;
}

function buildProgressDocId(userId, sessionStart) {
    return `crystal_progress:${String(userId)}:${toIsoDayKey(sessionStart)}`;
}

function mapProgressRow(row, userId, sessionStart) {
    const sessionIso = toIsoDayKey(sessionStart);
    const collectedShards = Array.isArray(row?.collectedShards)
        ? row.collectedShards.map((value) => Number(value)).filter(Number.isFinite)
        : [];
    const collectedShardIds = Array.isArray(row?.collectedShardIds)
        ? row.collectedShardIds.map((value) => String(value)).filter(Boolean)
        : [];
    const collectedEntries = Array.isArray(row?.collectedEntries)
        ? row.collectedEntries
            .map((entry) => {
                if (!entry || typeof entry !== 'object') return null;
                const shardId = String(entry.shardId || '').trim();
                if (!shardId) return null;
                return {
                    shardId,
                    shardIndex: Number.isFinite(Number(entry.shardIndex)) ? Number(entry.shardIndex) : null,
                    pagePath: normalizePath(entry.pagePath),
                    collectedAt: entry.collectedAt ? String(entry.collectedAt) : null,
                };
            })
            .filter(Boolean)
        : [];
    const mismatchDetails = Array.isArray(row?.mismatchDetails)
        ? row.mismatchDetails
            .map((entry) => {
                if (!entry || typeof entry !== 'object') return null;
                return {
                    shardId: String(entry.shardId || '').trim(),
                    shardIndex: Number.isFinite(Number(entry.shardIndex)) ? Number(entry.shardIndex) : null,
                    expectedPagePath: normalizePath(entry.expectedPagePath),
                    reportedPagePath: normalizePath(entry.reportedPagePath),
                    reason: String(entry.reason || '').trim(),
                };
            })
            .filter(Boolean)
        : [];
    const reportedEntries = Array.isArray(row?.reportedEntries)
        ? row.reportedEntries
            .map((entry) => {
                if (!entry || typeof entry !== 'object') return null;
                const shardId = String(entry.shardId || '').trim();
                const shardIndex = Number(entry.shardIndex);
                const pagePath = normalizePath(entry.pagePath);
                if (!shardId && !Number.isFinite(shardIndex)) return null;
                return {
                    shardId,
                    shardIndex: Number.isFinite(shardIndex) ? shardIndex : null,
                    pagePath,
                    collectedAt: entry.collectedAt ? String(entry.collectedAt) : null,
                };
            })
            .filter(Boolean)
        : [];
    return {
        _id: row?._id || buildProgressDocId(userId, sessionStart),
        userId: String(userId),
        lastResetDate: row?.lastResetDate || sessionIso,
        collectedShards,
        collectedShardIds,
        collectedEntries,
        rewardGranted: Boolean(row?.rewardGranted || collectedShards.length >= TOTAL_SHARDS || collectedShardIds.length >= TOTAL_SHARDS),
        activeBuffUntil: row?.activeBuffUntil || null,
        reviewStatus: String(row?.reviewStatus || 'clean').trim() || 'clean',
        mismatchCount: Math.max(0, Math.floor(Number(row?.mismatchCount) || mismatchDetails.length || 0)),
        mismatchDetails,
        reviewQueuedAt: row?.reviewQueuedAt || null,
        reviewedAt: row?.reviewedAt || null,
        reportedEntries,
        reportedCount: Math.max(0, Math.floor(Number(row?.reportedCount) || reportedEntries.length || 0)),
        rewardLogStatus: String(row?.rewardLogStatus || 'idle').trim() || 'idle',
        rewardLoggedAt: row?.rewardLoggedAt || null,
        rewardGrantedAt: row?.rewardGrantedAt || null,
    };
}

function getCrystalSessionStart(date = new Date()) {
    const d = new Date(date);
    const sessionStart = new Date(d);
    sessionStart.setHours(0, 1, 0, 0);
    if (d < sessionStart) {
        sessionStart.setDate(sessionStart.getDate() - 1);
    }
    return sessionStart;
}

function getCrystalSessionKey(sessionStart) {
    return toIsoDayKey(sessionStart);
}

function getCrystalDailyCacheExpiry(sessionStart, nowMs = Date.now()) {
    const nextSessionStart = new Date(sessionStart);
    nextSessionStart.setDate(nextSessionStart.getDate() + 1);
    const expiresAt = Math.min(nowMs + CRYSTAL_DAILY_CACHE_TTL_MS, nextSessionStart.getTime());
    return expiresAt > nowMs ? expiresAt : nowMs + 1;
}

function getCachedCrystalDaily(sessionKey, nowMs = Date.now()) {
    if (dailyCrystalShardCache.key !== sessionKey) return null;
    if (dailyCrystalShardCache.expiresAt <= nowMs) return null;
    return dailyCrystalShardCache.value || null;
}

function setCachedCrystalDaily(sessionKey, daily, sessionStart, nowMs = Date.now()) {
    dailyCrystalShardCache = {
        key: sessionKey,
        value: daily,
        expiresAt: getCrystalDailyCacheExpiry(sessionStart, nowMs),
    };
    return daily;
}

async function findCrystalProgress(userId, sessionStart) {
    const direct = await getDocById(buildProgressDocId(userId, sessionStart));
    if (direct) return mapProgressRow(direct, userId, sessionStart);

    const sessionIso = toIsoDayKey(sessionStart);
    const legacyRows = await listDocsByModel(PROGRESS_MODEL, { limit: 2000 });
    const legacy = legacyRows.find((row) => String(row.userId) === String(userId) && String(row.lastResetDate) === sessionIso);
    return legacy ? mapProgressRow(legacy, userId, sessionStart) : null;
}

async function upsertCrystalProgress(userId, sessionStart, patch = {}, existingProgress = null) {
    const existing = existingProgress
        ? mapProgressRow(existingProgress, userId, sessionStart)
        : await findCrystalProgress(userId, sessionStart);
    const base = mapProgressRow(existing, userId, sessionStart);
    const next = {
        ...base,
        ...patch,
    };
    next.collectedShards = Array.from(new Set((Array.isArray(next.collectedShards) ? next.collectedShards : []).map((value) => Number(value)).filter(Number.isFinite))).sort((a, b) => a - b);
    next.collectedShardIds = Array.from(new Set((Array.isArray(next.collectedShardIds) ? next.collectedShardIds : []).map((value) => String(value)).filter(Boolean)));
    next.collectedEntries = Array.isArray(next.collectedEntries)
        ? Array.from(new Map(
            next.collectedEntries
                .map((entry) => {
                    if (!entry || typeof entry !== 'object') return null;
                    const shardId = String(entry.shardId || '').trim();
                    if (!shardId) return null;
                    return [shardId, {
                        shardId,
                        shardIndex: Number.isFinite(Number(entry.shardIndex)) ? Number(entry.shardIndex) : null,
                        pagePath: normalizePath(entry.pagePath),
                        collectedAt: entry.collectedAt ? String(entry.collectedAt) : null,
                    }];
                })
                .filter(Boolean)
        ).values())
        : [];
    next.mismatchDetails = Array.isArray(next.mismatchDetails)
        ? next.mismatchDetails
            .map((entry) => {
                if (!entry || typeof entry !== 'object') return null;
                return {
                    shardId: String(entry.shardId || '').trim(),
                    shardIndex: Number.isFinite(Number(entry.shardIndex)) ? Number(entry.shardIndex) : null,
                    expectedPagePath: normalizePath(entry.expectedPagePath),
                    reportedPagePath: normalizePath(entry.reportedPagePath),
                    reason: String(entry.reason || '').trim(),
                };
            })
            .filter(Boolean)
            .slice(0, TOTAL_SHARDS)
        : [];
    next.rewardGranted = Boolean(next.rewardGranted);
    next.lastResetDate = toIsoDayKey(sessionStart);
    next.userId = String(userId);
    next.reviewStatus = String(next.reviewStatus || 'clean').trim() || 'clean';
    next.mismatchCount = Math.max(0, Math.floor(Number(next.mismatchCount) || next.mismatchDetails.length || 0));
    next.reportedEntries = Array.isArray(next.reportedEntries)
        ? next.reportedEntries
            .map((entry) => {
                if (!entry || typeof entry !== 'object') return null;
                const shardId = String(entry.shardId || '').trim();
                const shardIndex = Number(entry.shardIndex);
                const pagePath = normalizePath(entry.pagePath);
                if (!shardId && !Number.isFinite(shardIndex)) return null;
                return {
                    shardId,
                    shardIndex: Number.isFinite(shardIndex) ? shardIndex : null,
                    pagePath,
                    collectedAt: entry.collectedAt ? String(entry.collectedAt) : null,
                };
            })
            .filter(Boolean)
            .slice(0, TOTAL_SHARDS * 4)
        : [];
    next.reportedCount = Math.max(0, Math.floor(Number(next.reportedCount) || next.reportedEntries.length || 0));
    next.rewardLogStatus = String(next.rewardLogStatus || (next.rewardGranted ? 'pending' : 'idle')).trim() || 'idle';

    const docId = existing?._id || buildProgressDocId(userId, sessionStart);
    const saved = await upsertDoc({
        id: docId,
        model: PROGRESS_MODEL,
        data: {
            userId: next.userId,
            lastResetDate: next.lastResetDate,
            collectedShards: next.collectedShards,
            collectedShardIds: next.collectedShardIds,
            collectedEntries: next.collectedEntries,
            rewardGranted: next.rewardGranted,
            activeBuffUntil: next.activeBuffUntil || null,
            reviewStatus: next.reviewStatus,
            mismatchCount: next.mismatchCount,
            mismatchDetails: next.mismatchDetails,
            reviewQueuedAt: next.reviewQueuedAt || null,
            reviewedAt: next.reviewedAt || null,
            reportedEntries: next.reportedEntries,
            reportedCount: next.reportedCount,
            rewardLogStatus: next.rewardLogStatus,
            rewardLoggedAt: next.rewardLoggedAt || null,
            rewardGrantedAt: next.rewardGrantedAt || null,
        },
    });
    return mapProgressRow(saved, userId, sessionStart);
}

async function findOrCreateCrystalProgress(userId, sessionStart) {
    const progressKey = `${String(userId)}:${getCrystalSessionKey(sessionStart)}`;
    const inflight = crystalProgressInflight.get(progressKey);
    if (inflight) return inflight;

    const promise = (async () => {
        const existing = await findCrystalProgress(userId, sessionStart);
        if (existing) return existing;
        return upsertCrystalProgress(userId, sessionStart, {});
    })().finally(() => {
        crystalProgressInflight.delete(progressKey);
    });

    crystalProgressInflight.set(progressKey, promise);
    return promise;
}

function buildDailyLocations(sessionKey) {
    const salt = getDailyMechanicsSalt();
    const ranked = TARGET_PAGES
        .map((page) => {
            const hash = crypto
                .createHash('sha256')
                .update(`${salt}:crystal:${sessionKey}:${normalizePath(page.url)}`)
                .digest('hex');
            return {
                ...page,
                hash,
            };
        })
        .sort((left, right) => left.hash.localeCompare(right.hash));

    return ranked.slice(0, TOTAL_SHARDS).map((page, index) => ({
        shardId: `shard:${sessionKey}:${index}`,
        shardIndex: index,
        pageName: page.name,
        url: normalizePath(page.url),
        side: index < TOTAL_SHARDS / 2 ? 'left' : 'right',
    }));
}

async function createTransaction(doc) {
    const supabase = getSupabaseClient();
    const id = `tx_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    await supabase.from(DOC_TABLE).insert({
        model: 'Transaction',
        id,
        data: doc,
        created_at: nowIso,
        updated_at: nowIso,
    });
    return { ...doc, _id: id };
}

async function getUserRowById(userId) {
    if (!userId) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,data')
        .eq('id', String(userId))
        .maybeSingle();
    if (error) return null;
    return data || null;
}

function getUserData(row) {
    return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function updateUserDataById(userId, patch) {
    if (!userId || !patch || typeof patch !== 'object') return null;
    const row = await getUserRowById(userId);
    if (!row) return null;
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const existing = getUserData(row);
    const next = { ...existing, ...patch };
    const { data, error } = await supabase
        .from('users')
        .update({ data: next, updated_at: nowIso })
        .eq('id', String(userId))
        .select('id,data')
        .maybeSingle();
    if (error) return null;
    return data || null;
}

async function generateDailyShards(force = false, date = new Date()) {
    const sessionStart = getCrystalSessionStart(date);
    const sessionKey = getCrystalSessionKey(sessionStart);
    const nowMs = Date.now();

    if (!force) {
        const cached = getCachedCrystalDaily(sessionKey, nowMs);
        if (cached) return cached;
        const inflight = dailyCrystalShardInflight.get(sessionKey);
        if (inflight) return inflight;
    }

    const promise = (async () => {
        const sessionIso = toIsoDayKey(sessionStart);
        const daily = {
            _id: buildDailyDocId(sessionStart),
            date: sessionIso,
            sessionKey,
            locations: buildDailyLocations(sessionKey),
            createdAt: sessionIso,
            updatedAt: new Date(nowMs).toISOString(),
        };

        return setCachedCrystalDaily(sessionKey, daily, sessionStart, nowMs);
    })().finally(() => {
        dailyCrystalShardInflight.delete(sessionKey);
    });

    dailyCrystalShardInflight.set(sessionKey, promise);
    return promise;
}

async function applyCrystalCompletionReward(userId) {
    if (!userId) return null;
    const userRow = await getUserRowById(userId);
    if (!userRow) return null;
    const userData = getUserData(userRow);
    const blessingReward = await applyTreeBlessingToReward({
        userId,
        sc: 12,
        lumens: 12,
        now: new Date(),
    });
    const nowIso = new Date().toISOString();
    const supabase = getSupabaseClient();

    const { error } = await supabase
        .from('users')
        .update({
            data: {
                ...userData,
                sc: (Number(userData.sc) || 0) + blessingReward.sc,
                lumens: (Number(userData.lumens) || 0) + blessingReward.lumens,
                stars: (Number(userData.stars) || 1) + 0.001,
            },
            updated_at: nowIso,
        })
        .eq('id', String(userId));

    if (error) return null;
    return nowIso;
}

async function getCrystalCollectionBlock(userId) {
    const nightShift = await getNightShiftStatusForUser(userId).catch(() => null);
    if (nightShift?.isServing) {
        return {
            blocked: true,
            message: 'Во время Ночной Смены сбор осколков временно недоступен. Сдайте пост, и сбор снова откроется.',
        };
    }
    return { blocked: false, message: '' };
}

function buildCrystalMismatchReport(daily, progress) {
    const locations = Array.isArray(daily?.locations) ? daily.locations : [];
    const collectedEntries = Array.isArray(progress?.collectedEntries) ? progress.collectedEntries : [];
    const locationByShardId = new Map(locations.map((location) => [String(location.shardId), location]));
    const mismatches = [];

    for (const entry of collectedEntries) {
        const location = locationByShardId.get(String(entry.shardId));
        if (!location) {
            mismatches.push({
                shardId: String(entry.shardId || ''),
                shardIndex: Number.isFinite(Number(entry.shardIndex)) ? Number(entry.shardIndex) : null,
                expectedPagePath: '',
                reportedPagePath: normalizePath(entry.pagePath),
                reason: 'shard_not_found',
            });
            continue;
        }

        const expectedPagePath = normalizePath(location.url);
        const reportedPagePath = normalizePath(entry.pagePath);
        if (expectedPagePath !== reportedPagePath) {
            mismatches.push({
                shardId: String(entry.shardId || ''),
                shardIndex: Number.isFinite(Number(location.shardIndex)) ? Number(location.shardIndex) : null,
                expectedPagePath,
                reportedPagePath,
                reason: reportedPagePath ? 'wrong_page' : 'missing_page',
            });
        }
    }

    return {
        hasMismatch: mismatches.length > 0,
        mismatchCount: mismatches.length,
        mismatchDetails: mismatches,
    };
}

function normalizeCollectedEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries
        .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const shardId = String(entry.shardId || '').trim();
            const shardIndex = Number(entry.shardIndex);
            const pagePath = normalizePath(entry.pagePath);
            if (!shardId && !Number.isFinite(shardIndex)) return null;
            return {
                shardId,
                shardIndex: Number.isFinite(shardIndex) ? shardIndex : null,
                pagePath,
                collectedAt: entry.collectedAt ? String(entry.collectedAt) : new Date().toISOString(),
            };
        })
        .filter(Boolean);
}

function buildCrystalFinalReport(daily, rawEntries, reportedCount) {
    const locations = Array.isArray(daily?.locations) ? daily.locations : [];
    const locationById = new Map(locations.map((location) => [String(location.shardId), location]));
    const locationByIndex = new Map(locations.map((location) => [Number(location.shardIndex), location]));
    const normalizedEntries = normalizeCollectedEntries(rawEntries);
    const seenShardIds = new Set();
    const uniqueEntries = [];
    const mismatches = [];

    if (Number.isFinite(Number(reportedCount)) && Number(reportedCount) !== normalizedEntries.length) {
        mismatches.push({
            shardId: '',
            shardIndex: null,
            expectedPagePath: '',
            reportedPagePath: '',
            reason: `count_mismatch:${Number(reportedCount)}:${normalizedEntries.length}`,
        });
    }

    if (normalizedEntries.length > TOTAL_SHARDS) {
        mismatches.push({
            shardId: '',
            shardIndex: null,
            expectedPagePath: '',
            reportedPagePath: '',
            reason: `too_many_entries:${normalizedEntries.length}`,
        });
    }

    for (const entry of normalizedEntries) {
        const location = entry.shardId
            ? locationById.get(String(entry.shardId))
            : locationByIndex.get(Number(entry.shardIndex));

        const resolvedShardId = location ? String(location.shardId) : String(entry.shardId || '');
        const resolvedShardIndex = location
            ? Number(location.shardIndex)
            : (Number.isFinite(Number(entry.shardIndex)) ? Number(entry.shardIndex) : null);

        if (!location) {
            mismatches.push({
                shardId: resolvedShardId,
                shardIndex: resolvedShardIndex,
                expectedPagePath: '',
                reportedPagePath: normalizePath(entry.pagePath),
                reason: 'shard_not_found',
            });
            continue;
        }

        if (seenShardIds.has(resolvedShardId)) {
            mismatches.push({
                shardId: resolvedShardId,
                shardIndex: resolvedShardIndex,
                expectedPagePath: normalizePath(location.url),
                reportedPagePath: normalizePath(entry.pagePath),
                reason: 'duplicate_shard',
            });
            continue;
        }

        seenShardIds.add(resolvedShardId);
        uniqueEntries.push({
            shardId: resolvedShardId,
            shardIndex: resolvedShardIndex,
            pagePath: normalizePath(entry.pagePath),
            collectedAt: entry.collectedAt ? String(entry.collectedAt) : new Date().toISOString(),
        });

        const expectedPagePath = normalizePath(location.url);
        const reportedPagePath = normalizePath(entry.pagePath);
        if (expectedPagePath !== reportedPagePath) {
            mismatches.push({
                shardId: resolvedShardId,
                shardIndex: resolvedShardIndex,
                expectedPagePath,
                reportedPagePath,
                reason: reportedPagePath ? 'wrong_page' : 'missing_page',
            });
        }
    }

    for (const location of locations) {
        const shardId = String(location.shardId);
        if (!seenShardIds.has(shardId)) {
            mismatches.push({
                shardId,
                shardIndex: Number(location.shardIndex),
                expectedPagePath: normalizePath(location.url),
                reportedPagePath: '',
                reason: 'missing_shard',
            });
        }
    }

    return {
        uniqueEntries,
        uniqueShardIds: uniqueEntries.map((entry) => String(entry.shardId)),
        uniqueShardIndexes: uniqueEntries
            .map((entry) => Number(entry.shardIndex))
            .filter(Number.isFinite)
            .sort((a, b) => a - b),
        hasMismatch: mismatches.length > 0,
        mismatchCount: mismatches.length,
        mismatchDetails: mismatches.slice(0, TOTAL_SHARDS * 3),
    };
}

exports.getCrystalSessionStart = getCrystalSessionStart;
exports.generateDailyShards = generateDailyShards;

exports.getLocationsPublic = async (_req, res) => {
    try {
        const daily = await generateDailyShards();
        res.json({ locations: daily.locations || [] });
    } catch (error) {
        console.error('Crystal getLocationsPublic error:', error);
        res.status(500).json({ message: error.message });
    }
};

exports.getCrystalStatus = async (req, res) => {
    try {
        const sessionStart = getCrystalSessionStart(new Date());
        const [daily, progress, block] = await Promise.all([
            generateDailyShards(),
            findCrystalProgress(req.user.id, sessionStart),
            getCrystalCollectionBlock(req.user.id),
        ]);

        const safeProgress = progress ? mapProgressRow(progress, req.user.id, sessionStart) : mapProgressRow(null, req.user.id, sessionStart);
        const locations = Array.isArray(daily.locations) ? daily.locations : [];
        const rewardGranted = Boolean(safeProgress.rewardGranted);

        res.json({
            sessionKey: daily.sessionKey || getCrystalSessionKey(sessionStart),
            locations,
            collectedShards: rewardGranted ? locations.map((row) => Number(row.shardIndex)).filter(Number.isFinite).sort((a, b) => a - b) : [],
            collectedShardIds: rewardGranted ? locations.map((row) => String(row.shardId)).filter(Boolean) : [],
            rewardGranted,
            activeBuffUntil: safeProgress.activeBuffUntil || null,
            collectionDisabled: Boolean(block.blocked),
            collectionDisabledMessage: block.message || '',
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.completeCollection = async (req, res) => {
    try {
        const sessionStart = getCrystalSessionStart(new Date());
        const block = await getCrystalCollectionBlock(req.user.id);

        if (block.blocked) {
            return res.status(400).json({
                message: block.message,
                collectionDisabled: true,
            });
        }

        const [daily, existingProgress] = await Promise.all([
            generateDailyShards(),
            findCrystalProgress(req.user.id, sessionStart),
        ]);

        const progress = existingProgress
            ? mapProgressRow(existingProgress, req.user.id, sessionStart)
            : mapProgressRow(null, req.user.id, sessionStart);
        const locations = Array.isArray(daily.locations) ? daily.locations : [];

        if (progress.rewardGranted) {
            return res.json({
                collectedShards: locations.map((row) => Number(row.shardIndex)).filter(Number.isFinite).sort((a, b) => a - b),
                collectedShardIds: locations.map((row) => String(row.shardId)).filter(Boolean),
                rewardGranted: true,
                reviewStatus: progress.reviewStatus || 'clean',
                mismatchCount: Math.max(0, Number(progress.mismatchCount) || 0),
            });
        }

        const rawEntries = normalizeCollectedEntries(req.body?.collectedEntries);
        const reportedCount = Math.max(0, Math.floor(Number(req.body?.collectedCount) || rawEntries.length || 0));
        if (Math.max(reportedCount, rawEntries.length) < TOTAL_SHARDS) {
            return res.status(400).json({ message: 'Сердце ещё не собрано полностью.' });
        }

        const fullShardIndexes = locations.map((row) => Number(row.shardIndex)).filter(Number.isFinite).sort((a, b) => a - b);
        const fullShardIds = locations.map((row) => String(row.shardId)).filter(Boolean);

        const rewardGrantedAt = await applyCrystalCompletionReward(req.user.id);
        if (!rewardGrantedAt) {
            return res.status(500).json({ message: 'Не удалось выдать награду за сбор.' });
        }

        const updatedProgress = await upsertCrystalProgress(req.user.id, sessionStart, {
            ...progress,
            collectedShards: fullShardIndexes,
            collectedShardIds: fullShardIds,
            collectedEntries: rawEntries,
            rewardGranted: true,
            rewardGrantedAt,
            rewardLogStatus: 'pending',
            rewardLoggedAt: null,
            reviewStatus: 'queued',
            mismatchCount: 0,
            mismatchDetails: [],
            reviewQueuedAt: rewardGrantedAt,
            reviewedAt: null,
            reportedEntries: rawEntries,
            reportedCount,
        }, progress);

        return res.json({
            collectedShards: updatedProgress.collectedShards || [],
            collectedShardIds: updatedProgress.collectedShardIds || [],
            rewardGranted: Boolean(updatedProgress.rewardGranted),
            reviewStatus: updatedProgress.reviewStatus || 'clean',
            mismatchCount: Math.max(0, Number(updatedProgress.mismatchCount) || 0),
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.collectShard = exports.completeCollection;

async function flushCrystalRewardHistory(progress, sessionStart) {
    if (!progress?.rewardGranted || String(progress.rewardLogStatus || 'idle') !== 'pending') {
        return progress;
    }

    const scRow = await recordTransaction({
        userId: progress.userId,
        type: 'crystal',
        direction: 'credit',
        amount: 12,
        currency: 'K',
        description: 'Сбор осколков',
        relatedEntity: toIsoDayKey(sessionStart),
    }).catch(() => null);

    const starRow = await recordTransaction({
        userId: progress.userId,
        type: 'crystal',
        direction: 'credit',
        amount: 0.001,
        currency: 'STAR',
        description: 'Сбор осколков',
        relatedEntity: toIsoDayKey(sessionStart),
    }).catch(() => null);

    if (!scRow || !starRow) {
        return progress;
    }

    return upsertCrystalProgress(progress.userId, sessionStart, {
        ...progress,
        rewardLogStatus: 'done',
        rewardLoggedAt: new Date().toISOString(),
    }, progress);
}

async function finalizeCrystalReview(progress, sessionStart) {
    if (String(progress?.reviewStatus || 'clean') !== 'queued') {
        return progress;
    }

    const daily = await generateDailyShards(false, sessionStart);

    const review = buildCrystalFinalReport(daily, progress.reportedEntries, progress.reportedCount);
    return upsertCrystalProgress(progress.userId, sessionStart, {
        ...progress,
        collectedEntries: review.uniqueEntries,
        reviewStatus: review.hasMismatch ? 'pending' : 'clean',
        mismatchCount: review.mismatchCount,
        mismatchDetails: review.mismatchDetails,
        reviewedAt: review.hasMismatch ? null : new Date().toISOString(),
    }, progress);
}

exports.processPendingCrystalSettlements = async (limit = 100) => {
    const rows = await listDocsByModel(PROGRESS_MODEL, { limit: 5000 });
    const pending = rows
        .map((row) => {
            const sessionStart = row?.lastResetDate ? new Date(row.lastResetDate) : null;
            if (!sessionStart || Number.isNaN(sessionStart.getTime())) return null;
            const progress = mapProgressRow(row, row.userId, sessionStart);
            if (!progress.rewardGranted) return null;
            if (String(progress.rewardLogStatus || 'idle') !== 'pending' && String(progress.reviewStatus || 'clean') !== 'queued') {
                return null;
            }
            return { progress, sessionStart };
        })
        .filter(Boolean)
        .sort((a, b) => {
            const aTime = a.progress.rewardGrantedAt ? new Date(a.progress.rewardGrantedAt).getTime() : 0;
            const bTime = b.progress.rewardGrantedAt ? new Date(b.progress.rewardGrantedAt).getTime() : 0;
            return aTime - bTime;
        })
        .slice(0, Math.max(1, Number(limit) || 100));

    const settled = [];
    for (const item of pending) {
        let next = item.progress;
        if (String(next.rewardLogStatus || 'idle') === 'pending') {
            // eslint-disable-next-line no-await-in-loop
            next = await flushCrystalRewardHistory(next, item.sessionStart);
        }
        if (String(next.reviewStatus || 'clean') === 'queued') {
            // eslint-disable-next-line no-await-in-loop
            next = await finalizeCrystalReview(next, item.sessionStart);
        }
        settled.push(next);
    }

    return settled;
};

exports.__resetCrystalControllerRuntimeState = () => {
    dailyCrystalShardCache = { key: '', value: null, expiresAt: 0 };
    dailyCrystalShardInflight.clear();
    crystalProgressInflight.clear();
};

