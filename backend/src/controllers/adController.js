const { getAdRate, getTier } = require('../config/adRateMatrix');
const { AD_TARGETS, normalizeAdTargetList } = require('../config/adTargets');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { deleteCreativeTotally } = require('../services/adminCleanupService');

const geoip = require('geoip-lite');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

const AD_CREATIVE_CACHE_TTL_MS = Math.max(
    1000,
    Number(process.env.AD_CREATIVE_CACHE_TTL_MS) || 15 * 1000
);
const activeCreativeCache = new Map();
const activeCreativeInflight = new Map();
const rotationCreativesCache = new Map();
const rotationCreativesInflight = new Map();

const IMPRESSION_MATCH_STAGE = {
    $or: [
        { eventType: 'impression' },
        { eventType: { $exists: false } }
    ]
};

const DEVICE_PATTERNS = {
    bot: /(bot|spider|crawler|slurp|bingpreview|duckduckbot|facebookexternalhit)/i,
    tablet: /(ipad|tablet|kindle|silk|playbook|android(?!.*mobile))/i,
    mobile: /(iphone|ipod|android.*mobile|windows phone|blackberry|opera mini|mobile)/i,
    desktop: /(windows nt|macintosh|linux x86_64|x11|cros)/i
};

function getClientIp(req) {
    let ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || '';
    if (ip && String(ip).includes(',')) {
        ip = String(ip).split(',')[0].trim();
    }
    return String(ip || '').trim();
}

function getCountryCode(req) {
    const geo = geoip.lookup(getClientIp(req));
    const country = String(geo?.country || '').toUpperCase().trim();
    if (/^[A-Z]{2}$/.test(country)) return country;
    return 'ZZ';
}

function getDeviceType(req) {
    const userAgent = String(req.headers['user-agent'] || '');
    if (!userAgent) return 'unknown';
    if (DEVICE_PATTERNS.bot.test(userAgent)) return 'bot';
    if (DEVICE_PATTERNS.tablet.test(userAgent)) return 'tablet';
    if (DEVICE_PATTERNS.mobile.test(userAgent)) return 'mobile';
    if (DEVICE_PATTERNS.desktop.test(userAgent)) return 'desktop';
    return 'unknown';
}

function normalizePage(page) {
    const value = String(page || '').trim();
    if (!value) return '';
    return value.slice(0, 120);
}

function normalizePlacement(placement) {
    const value = String(placement || '').trim();
    if (!value) return '';
    return value.slice(0, 120);
}

function normalizeMetaValue(value, limit = 255) {
    const out = String(value || '').trim();
    return out.slice(0, limit);
}

function normalizeDurationSeconds(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    // Max 24h to avoid corrupted values.
    return Math.min(Math.round(numeric), 24 * 60 * 60);
}

function calculateAdEventRevenue(adRate) {
    const safeRate = Number(adRate);
    if (!Number.isFinite(safeRate) || safeRate <= 0) return 0;
    return (safeRate / 1000) * 0.8;
}

function normalizeCreativeKind(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'banner' || raw === 'html') return 'banner';
    if (raw === 'vast') return 'vast';
    return '';
}

function normalizeTargetPlacements(value) {
    const raw = Array.isArray(value) ? value : [value];
    const placements = raw
        .flatMap((item) => String(item || '').split(','))
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 100);
    const unique = Array.from(new Set(placements));
    if (!unique.length || unique.includes('all')) return ['all'];
    return unique;
}

function getCreativeKind(data) {
    return normalizeCreativeKind(data?.kind || data?.type);
}

function mapCreativeRow(row) {
    if (!row) return null;
    const data = row.data && typeof row.data === 'object' ? row.data : {};
    const kind = getCreativeKind(data);
    return {
        _id: row.id,
        ...data,
        kind: kind || String(data.kind || data.type || 'legacy'),
        type: kind || String(data.type || data.kind || 'legacy'),
        targetPages: normalizeAdTargetList(data.targetPages || 'all'),
        targetPlacements: normalizeTargetPlacements(data.targetPlacements || 'all'),
        createdAt: row.created_at || data.createdAt || null,
        updatedAt: row.updated_at || data.updatedAt || null,
    };
}

function normalizeCreativeInput(input = {}, existing = null) {
    const base = existing && typeof existing === 'object' ? existing : {};
    const merged = { ...base, ...(input && typeof input === 'object' ? input : {}) };
    const kind = normalizeCreativeKind(merged.kind || merged.type);
    if (!kind) {
        const error = new Error('Тип рекламы должен быть Баннер или VAST');
        error.statusCode = 400;
        throw error;
    }

    const content = String(merged.content || '').trim();
    if (!content) {
        const error = new Error(kind === 'vast' ? 'Вставьте VAST ссылку DAO.ad' : 'Вставьте код баннера');
        error.statusCode = 400;
        throw error;
    }

    return {
        name: String(merged.name || '').trim() || (kind === 'vast' ? 'DAO.ad VAST' : 'Баннер'),
        kind,
        type: kind,
        content,
        active: merged.active !== false,
        priority: Number.isFinite(Number(merged.priority)) ? Number(merged.priority) : 0,
        duration: Math.max(3, Math.min(3600, Math.round(Number(merged.duration) || 10))),
        targetPages: normalizeAdTargetList(merged.targetPages || 'all'),
        targetPlacements: normalizeTargetPlacements(merged.targetPlacements || 'all'),
        startDate: merged.startDate || null,
        endDate: merged.endDate || null,
    };
}

function getCreativeCacheExpiry(nowMs = Date.now()) {
    return nowMs + AD_CREATIVE_CACHE_TTL_MS;
}

function buildActiveCreativeCacheKey(page, placement, kind = 'banner') {
    return `${normalizeCreativeKind(kind) || 'banner'}::${normalizePage(page)}::${normalizePlacement(placement)}`;
}

function buildRotationCreativesCacheKey({ page = '', placement = '', kind = 'banner' } = {}) {
    return `${normalizeCreativeKind(kind) || 'banner'}::${normalizePage(page)}::${normalizePlacement(placement)}`;
}

function isCreativeVisibleNow(data, now = new Date()) {
    const startDate = data?.startDate ? new Date(data.startDate) : null;
    const endDate = data?.endDate ? new Date(data.endDate) : null;
    const startMatch = !startDate || startDate <= now;
    const endMatch = !endDate || endDate >= now;
    return startMatch && endMatch;
}

function creativeMatchesTarget(data, { page = '', placement = '', kind = 'banner', now = new Date() } = {}) {
    if (!data || data.active !== true) return false;
    const normalizedKind = normalizeCreativeKind(kind) || 'banner';
    if (getCreativeKind(data) !== normalizedKind) return false;
    if (!isCreativeVisibleNow(data, now)) return false;

    const normalizedPage = normalizePage(page);
    const normalizedPlacement = normalizePlacement(placement);
    const targetPages = normalizeAdTargetList(data.targetPages || 'all');
    const targetPlacements = normalizeTargetPlacements(data.targetPlacements || 'all');
    const pageMatch = !normalizedPage || targetPages.includes('all') || targetPages.includes(normalizedPage);
    const placementMatch = !normalizedPlacement || targetPlacements.includes('all') || targetPlacements.includes(normalizedPlacement);
    return pageMatch && placementMatch;
}

function getCachedActiveCreative(cacheKey, nowMs = Date.now()) {
    if (!activeCreativeCache.has(cacheKey)) {
        return { hit: false, value: null };
    }

    const cached = activeCreativeCache.get(cacheKey);
    if (cached.expiresAt <= nowMs) {
        activeCreativeCache.delete(cacheKey);
        return { hit: false, value: null };
    }
    return { hit: true, value: cached.value };
}

function setCachedActiveCreative(cacheKey, value, nowMs = Date.now()) {
    activeCreativeCache.set(cacheKey, {
        value,
        expiresAt: getCreativeCacheExpiry(nowMs)
    });
    return value;
}

function getCachedRotationCreatives(cacheKey, nowMs = Date.now()) {
    const cached = rotationCreativesCache.get(cacheKey);
    if (!cached) return null;
    if (cached.expiresAt <= nowMs) {
        rotationCreativesCache.delete(cacheKey);
        return null;
    }
    return cached.value;
}

function setCachedRotationCreatives(cacheKey, value, nowMs = Date.now()) {
    rotationCreativesCache.set(cacheKey, {
        value,
        expiresAt: getCreativeCacheExpiry(nowMs),
    });
    return value;
}

function invalidateCreativeRuntimeState() {
    activeCreativeCache.clear();
    activeCreativeInflight.clear();
    rotationCreativesCache.clear();
    rotationCreativesInflight.clear();
}

async function loadActiveCreative(page, placement, now = new Date(), kind = 'banner') {
    const cacheKey = buildActiveCreativeCacheKey(page, placement, kind);
    const nowMs = now.getTime();
    const cached = getCachedActiveCreative(cacheKey, nowMs);
    if (cached.hit) return cached.value;

    const inflight = activeCreativeInflight.get(cacheKey);
    if (inflight) return inflight;

    const promise = (async () => {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from(DOC_TABLE)
            .select('id,data,created_at,updated_at')
            .eq('model', 'AdCreative')
            .eq('data->>active', 'true')
            .limit(100);
        
        if (error || !Array.isArray(data)) return null;
        
        const filtered = data.filter((row) => {
            const d = row.data || {};
            return creativeMatchesTarget(d, { page, placement, kind, now });
        });
        
        filtered.sort((a, b) => (Number(b.data?.priority) || 0) - (Number(a.data?.priority) || 0));
        
        const creative = filtered[0] ? mapCreativeRow(filtered[0]) : null;
        return setCachedActiveCreative(cacheKey, creative, nowMs);
    })().finally(() => {
        if (activeCreativeInflight.get(cacheKey) === promise) {
            activeCreativeInflight.delete(cacheKey);
        }
    });

    activeCreativeInflight.set(cacheKey, promise);
    return promise;
}

async function loadRotationCreatives(now = new Date(), { page = '', placement = '', kind = 'banner' } = {}) {
    const nowMs = now.getTime();
    const cacheKey = buildRotationCreativesCacheKey({ page, placement, kind });
    const cached = getCachedRotationCreatives(cacheKey, nowMs);
    if (cached !== null) return cached;
    const inflight = rotationCreativesInflight.get(cacheKey);
    if (inflight) return inflight;

    const promise = (async () => {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from(DOC_TABLE)
            .select('id,data,created_at,updated_at')
            .eq('model', 'AdCreative')
            .eq('data->>active', 'true')
            .limit(100);
        
        if (error || !Array.isArray(data)) return [];
        
        const filtered = data.filter((row) => {
            const d = row.data || {};
            return creativeMatchesTarget(d, { page, placement, kind, now });
        });
        
        filtered.sort((a, b) => {
            const prioDiff = (Number(b.data?.priority) || 0) - (Number(a.data?.priority) || 0);
            if (prioDiff !== 0) return prioDiff;
            return (b.created_at || '').localeCompare(a.created_at || '');
        });
        
        return setCachedRotationCreatives(cacheKey, filtered.map(mapCreativeRow).filter(Boolean), nowMs);
    })().finally(() => {
        if (rotationCreativesInflight.get(cacheKey) === promise) {
            rotationCreativesInflight.delete(cacheKey);
        }
    });

    rotationCreativesInflight.set(cacheKey, promise);
    return promise;
}

async function listAdImpressionRows() {
    const supabase = getSupabaseClient();
    const out = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
        // eslint-disable-next-line no-await-in-loop
        const { data, error } = await supabase
            .from(DOC_TABLE)
            .select('id,data,created_at')
            .eq('model', 'AdImpression')
            .order('created_at', { ascending: false })
            .range(from, from + pageSize - 1);

        if (error || !Array.isArray(data) || data.length === 0) {
            break;
        }

        out.push(...data);
        if (data.length < pageSize) {
            break;
        }
        from += data.length;
    }

    return out;
}

exports.recordImpression = async (req, res) => {
    try {
        const {
            page,
            placement,
            eventType: rawEventType,
            durationSeconds,
            creativeId,
            referrer,
            utmSource,
            utmMedium,
            utmCampaign
        } = req.body || {};

        const userId = req.user?._id;
        const safeEventType = String(rawEventType || '').trim();
        const eventType = ['session', 'vast_start', 'vast_complete', 'vast_error'].includes(safeEventType)
            ? safeEventType
            : 'impression';
        const normalizedPage = normalizePage(page);
        const normalizedPlacement = normalizePlacement(
            placement || (eventType === 'session' ? 'page_session' : 'rotation')
        );

        if (!normalizedPage) {
            return res.status(400).json({ message: 'Поле page обязательно' });
        }
        if (!normalizedPlacement) {
            return res.status(400).json({ message: 'Поле placement обязательно' });
        }

        const country = getCountryCode(req);
        const deviceType = getDeviceType(req);
        const safeDurationSeconds = eventType === 'session' ? normalizeDurationSeconds(durationSeconds) : 0;
        const adRate = getAdRate(country);

        const supabase = getSupabaseClient();
        const nowIso = new Date().toISOString();
        const id = `ai_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
        
        const impressionData = {
            eventType,
            page: normalizedPage,
            placement: normalizedPlacement,
            referrer: normalizeMetaValue(referrer || req.headers.referer || '', 500),
            utmSource: normalizeMetaValue(utmSource, 120),
            utmMedium: normalizeMetaValue(utmMedium, 120),
            utmCampaign: normalizeMetaValue(utmCampaign, 120),
            country,
            deviceType,
            durationSeconds: safeDurationSeconds,
            userId: userId || null,
            creativeId: creativeId || null,
            adRate
        };
        
        await supabase.from(DOC_TABLE).insert({
            model: 'AdImpression',
            id,
            data: impressionData,
            created_at: nowIso,
            updated_at: nowIso,
        });

        res.json({ success: true, country, adRate, deviceType, eventType });
    } catch (error) {
        console.error('Impression Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Get ad statistics
exports.getStats = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const impressionRows = await listAdImpressionRows();
        
        let filtered = impressionRows;
        if (startDate || endDate) {
            filtered = impressionRows.filter((row) => {
                const createdAt = row.created_at ? new Date(row.created_at) : null;
                if (!createdAt) return false;
                if (startDate && createdAt < new Date(startDate)) return false;
                if (endDate && createdAt > new Date(endDate)) return false;
                return true;
            });
        }
        
        const sessionRows = filtered.filter((row) => row.data?.eventType === 'session' && (row.data?.durationSeconds || 0) > 0);
        const impressionRowsOnly = filtered.filter((row) => row.data?.eventType !== 'session');

        // Daily stats
        const dailyMap = new Map();
        for (const row of filtered) {
            const d = row.data || {};
            const dateKey = row.created_at ? row.created_at.slice(0, 10) : 'unknown';
            const entry = dailyMap.get(dateKey) || {
                impressions: 0,
                totalAdRate: 0,
                impressionRevenue: 0,
                sessionRevenue: 0,
            };
            if (d.eventType === 'session') {
                entry.sessionRevenue += calculateAdEventRevenue(d.adRate);
            } else {
                entry.impressions += 1;
                entry.totalAdRate += Number(d.adRate) || 0;
                entry.impressionRevenue += calculateAdEventRevenue(d.adRate);
            }
            dailyMap.set(dateKey, entry);
        }
        
        const dailyStats = Array.from(dailyMap.entries())
            .map(([date, stats]) => ({
                date,
                impressions: stats.impressions,
                avgAdRate: stats.impressions > 0 ? stats.totalAdRate / stats.impressions : 0,
                revenue: stats.impressionRevenue + stats.sessionRevenue,
                impressionRevenue: stats.impressionRevenue,
                sessionRevenue: stats.sessionRevenue,
            }))
            .sort((a, b) => b.date.localeCompare(a.date))
            .slice(0, 30);
        
        // Country stats
        const countryMap = new Map();
        for (const row of filtered) {
            const d = row.data || {};
            const country = d.country || 'ZZ';
            const entry = countryMap.get(country) || {
                impressions: 0,
                totalAdRate: 0,
                impressionRevenue: 0,
                sessionRevenue: 0,
            };
            if (d.eventType === 'session') {
                entry.sessionRevenue += calculateAdEventRevenue(d.adRate);
            } else {
                entry.impressions += 1;
                entry.totalAdRate += Number(d.adRate) || 0;
                entry.impressionRevenue += calculateAdEventRevenue(d.adRate);
            }
            countryMap.set(country, entry);
        }
        
        const countryStats = Array.from(countryMap.entries())
            .map(([country, stats]) => ({
                country,
                impressions: stats.impressions,
                avgAdRate: stats.impressions > 0 ? stats.totalAdRate / stats.impressions : 0,
                revenue: stats.impressionRevenue + stats.sessionRevenue,
            }))
            .sort((a, b) => b.impressions - a.impressions)
            .slice(0, 20);
        
        // Page stats
        const pageMap = new Map();
        for (const row of impressionRowsOnly) {
            const d = row.data || {};
            const page = d.page || '(unknown)';
            const entry = pageMap.get(page) || { impressions: 0 };
            entry.impressions += 1;
            pageMap.set(page, entry);
        }
        
        const pageStats = Array.from(pageMap.entries())
            .map(([page, stats]) => ({ page, impressions: stats.impressions }))
            .sort((a, b) => b.impressions - a.impressions);
        
        // Time by page
        const timeByPageMap = new Map();
        for (const row of sessionRows) {
            const d = row.data || {};
            const page = d.page || '(unknown)';
            const entry = timeByPageMap.get(page) || { sessions: 0, totalDurationSeconds: 0 };
            entry.sessions += 1;
            entry.totalDurationSeconds += Number(d.durationSeconds) || 0;
            timeByPageMap.set(page, entry);
        }
        
        const timeByPageStats = Array.from(timeByPageMap.entries())
            .map(([page, stats]) => ({
                page,
                sessions: stats.sessions,
                totalDurationSeconds: stats.totalDurationSeconds,
                avgDurationSeconds: stats.sessions > 0 ? stats.totalDurationSeconds / stats.sessions : 0
            }))
            .sort((a, b) => b.totalDurationSeconds - a.totalDurationSeconds)
            .slice(0, 100);
        
        // Time by country
        const timeByCountryMap = new Map();
        for (const row of sessionRows) {
            const d = row.data || {};
            const country = d.country || 'ZZ';
            const entry = timeByCountryMap.get(country) || { sessions: 0, totalDurationSeconds: 0 };
            entry.sessions += 1;
            entry.totalDurationSeconds += Number(d.durationSeconds) || 0;
            timeByCountryMap.set(country, entry);
        }
        
        const timeByCountryStats = Array.from(timeByCountryMap.entries())
            .map(([country, stats]) => ({
                country,
                sessions: stats.sessions,
                totalDurationSeconds: stats.totalDurationSeconds,
                avgDurationSeconds: stats.sessions > 0 ? stats.totalDurationSeconds / stats.sessions : 0
            }))
            .sort((a, b) => b.totalDurationSeconds - a.totalDurationSeconds)
            .slice(0, 50);
        
        // Time by device
        const timeByDeviceMap = new Map();
        for (const row of sessionRows) {
            const d = row.data || {};
            const device = d.deviceType || 'unknown';
            const entry = timeByDeviceMap.get(device) || { sessions: 0, totalDurationSeconds: 0 };
            entry.sessions += 1;
            entry.totalDurationSeconds += Number(d.durationSeconds) || 0;
            timeByDeviceMap.set(device, entry);
        }
        
        const timeByDeviceStats = Array.from(timeByDeviceMap.entries())
            .map(([device, stats]) => ({
                device,
                sessions: stats.sessions,
                totalDurationSeconds: stats.totalDurationSeconds,
                avgDurationSeconds: stats.sessions > 0 ? stats.totalDurationSeconds / stats.sessions : 0
            }))
            .sort((a, b) => b.totalDurationSeconds - a.totalDurationSeconds);
        
        // Totals
        const totalImpressions = impressionRowsOnly.length;
        const totalRevenue = dailyStats.reduce((sum, d) => sum + d.revenue, 0);
        const totalImpressionRevenue = dailyStats.reduce((sum, d) => sum + d.impressionRevenue, 0);
        const totalSessionRevenue = dailyStats.reduce((sum, d) => sum + d.sessionRevenue, 0);
        
        const sessionTotals = {
            sessions: sessionRows.length,
            totalDurationSeconds: sessionRows.reduce((sum, row) => sum + (Number(row.data?.durationSeconds) || 0), 0),
            revenue: sessionRows.reduce((sum, row) => sum + calculateAdEventRevenue(row.data?.adRate), 0),
            avgDurationSeconds: sessionRows.length > 0 
                ? sessionRows.reduce((sum, row) => sum + (Number(row.data?.durationSeconds) || 0), 0) / sessionRows.length 
                : 0
        };

        res.json({
            daily: dailyStats.map(d => ({
                date: d.date,
                impressions: d.impressions,
                avgAdRate: Math.round(d.avgAdRate * 100) / 100,
                revenue: Math.round(d.revenue * 100) / 100
            })),
            byCountry: countryStats.map(c => ({
                country: c.country,
                impressions: c.impressions,
                tier: getTier(c.country),
                avgAdRate: Math.round(c.avgAdRate * 100) / 100,
                revenue: Math.round(c.revenue * 100) / 100
            })),
            byPage: pageStats,
            timeByPage: timeByPageStats.map(p => ({
                page: p.page,
                sessions: p.sessions,
                totalDurationSeconds: Math.round(p.totalDurationSeconds),
                avgDurationSeconds: Math.round(p.avgDurationSeconds * 10) / 10
            })),
            timeByCountry: timeByCountryStats.map(c => ({
                country: c.country,
                sessions: c.sessions,
                totalDurationSeconds: Math.round(c.totalDurationSeconds),
                avgDurationSeconds: Math.round(c.avgDurationSeconds * 10) / 10
            })),
            timeByDevice: timeByDeviceStats.map(d => ({
                device: d.device,
                sessions: d.sessions,
                totalDurationSeconds: Math.round(d.totalDurationSeconds),
                avgDurationSeconds: Math.round(d.avgDurationSeconds * 10) / 10
            })),
            totals: {
                impressions: totalImpressions,
                revenue: Math.round(totalRevenue * 100) / 100,
                potentialRevenue: Math.round(totalRevenue * 100) / 100,
                impressionRevenue: Math.round(totalImpressionRevenue * 100) / 100,
                sessionRevenue: Math.round(totalSessionRevenue * 100) / 100,
            },
            sessionTotals: {
                sessions: sessionTotals.sessions,
                totalDurationSeconds: Math.round(sessionTotals.totalDurationSeconds),
                avgDurationSeconds: Math.round(sessionTotals.avgDurationSeconds * 10) / 10,
                revenue: Math.round(sessionTotals.revenue * 100) / 100,
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get all creatives
exports.getCreatives = async (req, res) => {
    try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase
            .from(DOC_TABLE)
            .select('id,data,created_at,updated_at')
            .eq('model', 'AdCreative')
            .limit(500);
        
        if (error) return res.status(500).json({ message: error.message });
        
        const creatives = (data || [])
            .map(mapCreativeRow)
            .filter(Boolean)
            .sort((a, b) => {
                const prioDiff = (Number(b.priority) || 0) - (Number(a.priority) || 0);
                if (prioDiff !== 0) return prioDiff;
                return (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '');
            });
        
        res.json(creatives);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Create creative
exports.createCreative = async (req, res) => {
    try {
        const supabase = getSupabaseClient();
        const nowIso = new Date().toISOString();
        const id = `ac_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
        
        const creativeData = normalizeCreativeInput(req.body);
        
        await supabase.from(DOC_TABLE).insert({
            model: 'AdCreative',
            id,
            data: creativeData,
            created_at: nowIso,
            updated_at: nowIso,
        });
        
        invalidateCreativeRuntimeState();
        res.status(201).json({ _id: id, ...creativeData });
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message });
    }
};

// Update creative
exports.updateCreative = async (req, res) => {
    try {
        const supabase = getSupabaseClient();
        const { data: existing, error: findError } = await supabase
            .from(DOC_TABLE)
            .select('id,data')
            .eq('model', 'AdCreative')
            .eq('id', req.params.id)
            .maybeSingle();
        
        if (!existing) {
            return res.status(404).json({ message: 'Креатив не найден' });
        }
        
        const onlyActiveToggle = req.body
            && Object.keys(req.body).every((key) => key === 'active')
            && !normalizeCreativeKind(existing.data?.kind || existing.data?.type);
        const nextData = onlyActiveToggle
            ? { ...existing.data, active: req.body.active !== false }
            : normalizeCreativeInput(req.body, existing.data);
        await supabase
            .from(DOC_TABLE)
            .update({ data: nextData, updated_at: new Date().toISOString() })
            .eq('id', req.params.id);
        
        invalidateCreativeRuntimeState();
        res.json({ _id: existing.id, ...nextData });
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message });
    }
};

// Delete creative
exports.deleteCreative = async (req, res) => {
    try {
        await deleteCreativeTotally(req.params.id);
        invalidateCreativeRuntimeState();
        res.json({ message: 'Креатив удалён' });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

// Get active creative for a page/placement
exports.getActiveCreative = async (req, res) => {
    try {
        const page = normalizePage(req.query?.page);
        const placement = normalizePlacement(req.query?.placement);
        const kind = normalizeCreativeKind(req.query?.kind) || 'banner';
        const now = new Date();
        const creative = await loadActiveCreative(page, placement, now, kind);
        res.json(creative);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Get all active creatives for rotation (Global)
exports.getRotation = async (req, res) => {
    try {
        const now = new Date();
        const creatives = await loadRotationCreatives(now, {
            page: normalizePage(req.query?.page),
            placement: normalizePlacement(req.query?.placement),
            kind: normalizeCreativeKind(req.query?.kind) || 'banner',
        });
        res.json(creatives);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getTargets = async (_req, res) => {
    res.json({ targets: AD_TARGETS });
};

exports.loadActiveAdCreative = loadActiveCreative;
exports.loadRotationAdCreatives = loadRotationCreatives;
exports.normalizeCreativeKind = normalizeCreativeKind;
exports.__resetAdControllerRuntimeState = invalidateCreativeRuntimeState;

