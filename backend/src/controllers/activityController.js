const { recordActivity } = require('../services/activityService');
const { recordBehaviorEvent } = require('../services/behaviorEventService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { normalizeSitePath } = require('../utils/sitePath');

const ALLOWED_BEHAVIOR_CATEGORIES = new Set(['navigation', 'battle', 'http', 'economy', 'system']);
const LAST_SEEN_WRITE_TTL_MS = Math.max(
  1000,
  Number(process.env.ACTIVITY_LAST_SEEN_WRITE_TTL_MS) || 60 * 1000
);

const lastSeenWriteCache = new Map();

function cleanupExpiredLastSeenWrites(nowMs = Date.now()) {
  if (lastSeenWriteCache.size < 1000) return;
  for (const [key, expiresAt] of lastSeenWriteCache.entries()) {
    if (!expiresAt || expiresAt <= nowMs) {
      lastSeenWriteCache.delete(key);
    }
  }
}

function shouldWriteLastSeen(userId, nowMs = Date.now()) {
  const key = userId ? String(userId) : '';
  if (!key) return false;
  const cachedUntil = lastSeenWriteCache.get(key) || 0;
  if (cachedUntil > nowMs) return false;
  cleanupExpiredLastSeenWrites(nowMs);
  lastSeenWriteCache.set(key, nowMs + LAST_SEEN_WRITE_TTL_MS);
  return true;
}

function __resetActivityControllerRuntimeState() {
  lastSeenWriteCache.clear();
}

function trimString(value, maxLen = 512) {
  return String(value || '').slice(0, maxLen);
}

function normalizeTrackedPath(value, maxLen = 512) {
  const raw = trimString(value, maxLen).trim();
  if (!raw) return '';
  return trimString(normalizeSitePath(raw), maxLen);
}

function sanitizeNavigationMeta(body = {}) {
  return {
    path: normalizeTrackedPath(body.path, 512),
    referrer: trimString(body.referrer, 512),
    previousPath: normalizeTrackedPath(body.previousPath, 512),
    navigationSource: trimString(body.navigationSource, 64),
    viaUiClick: Boolean(body.viaUiClick),
    uiTargetPath: normalizeTrackedPath(body.uiTargetPath, 512),
    isDirectNavigation: Boolean(body.isDirectNavigation),
    chainExpected: Boolean(body.chainExpected),
    chainSatisfied: Boolean(body.chainSatisfied),
    skippedPaths: Array.isArray(body.skippedPaths)
      ? body.skippedPaths
        .slice(0, 10)
        .map((item) => normalizeTrackedPath(item, 256))
        .filter(Boolean)
      : [],
    navigationLatencyMs: Number.isFinite(Number(body.navigationLatencyMs))
      ? Math.max(0, Number(body.navigationLatencyMs))
      : null,
    utm_source: trimString(body.utm_source || body.utmSource, 128),
    utm_medium: trimString(body.utm_medium || body.utmMedium, 128),
    utm_campaign: trimString(body.utm_campaign || body.utmCampaign, 128),
  };
}

async function recordPageView(req, res, next) {
  try {
    const meta = sanitizeNavigationMeta({
      ...(req.body && typeof req.body === 'object' ? req.body : {}),
      referrer: req.body?.referrer || req.headers?.referer || '',
    });
    const { path } = meta;
    if (!path) {
      return res.status(400).json({ message: 'path is required' });
    }

    const writes = [recordActivity({
      userId: req.user._id,
      type: 'page_view',
      minutes: 0,
      meta,
    })];

    if (meta.navigationSource === 'direct_open' || (meta.chainExpected && !meta.chainSatisfied)) {
      const eventType = meta.chainExpected && !meta.chainSatisfied
        ? 'navigation_chain_skipped'
        : 'navigation_direct_open';
      writes.push(recordBehaviorEvent({
        userId: req.user._id,
        category: 'navigation',
        eventType,
        sessionId: req.auth?.sid || '',
        path,
        scoreHint: eventType === 'navigation_chain_skipped' ? 4 : 2,
        meta: {
          previousPath: meta.previousPath,
          navigationSource: meta.navigationSource,
          viaUiClick: meta.viaUiClick,
          uiTargetPath: meta.uiTargetPath,
          skippedPaths: meta.skippedPaths,
          navigationLatencyMs: meta.navigationLatencyMs,
        },
      }));
    }

    await Promise.all(writes);

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

async function recordBehavior(req, res, next) {
  try {
    const category = trimString(req.body?.category, 60);
    const eventType = trimString(req.body?.eventType, 120);
    const path = normalizeTrackedPath(req.body?.path || '', 512);
    const battleId = trimString(req.body?.battleId || '', 120);
    const scoreHint = Number(req.body?.scoreHint);

    if (!category || !eventType) {
      return res.status(400).json({ message: 'category and eventType are required' });
    }

    if (!ALLOWED_BEHAVIOR_CATEGORIES.has(category)) {
      return res.status(400).json({ message: 'Invalid behavior category' });
    }

    await recordBehaviorEvent({
      userId: req.user._id,
      category,
      eventType,
      sessionId: req.auth?.sid || '',
      path,
      battleId: battleId || null,
      scoreHint: Number.isFinite(scoreHint) ? scoreHint : 0,
      meta: req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : {},
    });

    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

async function recordLeave(req, res, next) {
  try {
    if (shouldWriteLastSeen(req.user?._id)) {
      const supabase = getSupabaseClient();
      const nowIso = new Date().toISOString();
      await supabase
        .from('users')
        .update({ last_seen_at: nowIso, updated_at: nowIso })
        .eq('id', String(req.user._id));
    }
    return res.json({ ok: true });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  recordPageView,
  recordBehavior,
  recordLeave,
  __resetActivityControllerRuntimeState,
};
