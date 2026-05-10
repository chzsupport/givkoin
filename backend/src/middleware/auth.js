const jwt = require('jsonwebtoken');
const { getSupabaseClient } = require('../lib/supabaseClient');
const {
  extractClientMeta,
  decodeTokenUnsafe,
  getTokenFromRequest,
  writeAuthEvent,
  isSessionActive,
  touchSession,
  revokeSession,
  enforceSingleDeviceSession,
  isSessionKnownRevoked,
} = require('../services/authTrackingService');
const { evaluateAccessRestriction } = require('../services/securityService');
const { isHumanCheckBlocked } = require('../services/humanCheckService');
const {
  isActiveRestriction,
  isUserFrozen,
} = require('../services/multiAccountService');
const { isAdminEmail } = require('../utils/accountRole');
const { getRequestLanguage, pickRequestLanguage } = require('../utils/requestLanguage');
const { JWT_SECRET } = require('../config/auth');

const AUTH_RUNTIME_CACHE_TTL_MS = Math.max(60 * 1000, Number(process.env.AUTH_RUNTIME_CACHE_TTL_MS) || (15 * 60 * 1000));
const AUTH_RUNTIME_DB_CHECK_INTERVAL_MS = Math.max(60 * 1000, Number(process.env.AUTH_RUNTIME_DB_CHECK_INTERVAL_MS) || (15 * 60 * 1000));
const AUTH_RUNTIME_ONLINE_WRITE_INTERVAL_MS = Math.max(15 * 1000, Number(process.env.AUTH_RUNTIME_ONLINE_WRITE_INTERVAL_MS) || (60 * 1000));
const AUTH_RUNTIME_SESSION_TOUCH_INTERVAL_MS = Math.max(60 * 1000, Number(process.env.AUTH_RUNTIME_SESSION_TOUCH_INTERVAL_MS) || (5 * 60 * 1000));
const AUTH_RUNTIME_CACHE_MAX = Math.max(1000, Number(process.env.AUTH_RUNTIME_CACHE_MAX) || 50000);
const authRuntimeCache = new Map();

function buildAuthCacheKey(userId, sessionId) {
  const safeUserId = String(userId || '').trim();
  const safeSessionId = String(sessionId || '').trim();
  if (!safeUserId) return '';
  return `${safeUserId}:${safeSessionId || 'no-session'}`;
}

function normalizeIdentityToken(value) {
  return String(value || '').trim().toLowerCase();
}

function buildRequestIdentity(client = {}) {
  return {
    deviceId: normalizeIdentityToken(client.deviceId),
    fingerprint: normalizeIdentityToken(client.fingerprint),
    weakFingerprint: normalizeIdentityToken(client.weakFingerprint),
    profileKey: normalizeIdentityToken(client.profileKey),
  };
}

function hasIdentityValue(identity = {}) {
  return Boolean(identity.deviceId || identity.fingerprint || identity.weakFingerprint || identity.profileKey);
}

function identityMatches(cachedIdentity = {}, requestIdentity = {}) {
  if (!hasIdentityValue(cachedIdentity) || !hasIdentityValue(requestIdentity)) return true;
  return (
    (cachedIdentity.deviceId && requestIdentity.deviceId && cachedIdentity.deviceId === requestIdentity.deviceId)
    || (cachedIdentity.fingerprint && requestIdentity.fingerprint && cachedIdentity.fingerprint === requestIdentity.fingerprint)
    || (cachedIdentity.profileKey && requestIdentity.profileKey && cachedIdentity.profileKey === requestIdentity.profileKey)
    || (cachedIdentity.weakFingerprint && requestIdentity.weakFingerprint && cachedIdentity.weakFingerprint === requestIdentity.weakFingerprint)
  );
}

function cleanupAuthRuntimeCache(nowMs = Date.now()) {
  if (authRuntimeCache.size <= AUTH_RUNTIME_CACHE_MAX) return;
  for (const [key, value] of authRuntimeCache.entries()) {
    if (!value || Number(value.expiresAtMs) <= nowMs) {
      authRuntimeCache.delete(key);
    }
  }
  while (authRuntimeCache.size > AUTH_RUNTIME_CACHE_MAX) {
    const oldestKey = authRuntimeCache.keys().next().value;
    if (!oldestKey) break;
    authRuntimeCache.delete(oldestKey);
  }
}

function buildUserForRequest(baseUser, req) {
  const user = {
    ...(baseUser || {}),
    data: baseUser?.data && typeof baseUser.data === 'object' ? { ...baseUser.data } : {},
  };
  const siteLanguage = getRequestLanguage(req, { fallback: user.language || user?.data?.language || 'ru' });
  user.profileLanguage = user.language || user?.data?.language || 'ru';
  user.siteLanguage = siteLanguage;
  user.language = siteLanguage;
  return user;
}

function isBattleRequestPath(req) {
  return [req?.path, req?.baseUrl, req?.originalUrl]
    .map((value) => String(value || '').trim())
    .some((value) => value.startsWith('/battles/') || value === '/battles' || value.startsWith('/api/battles/'));
}

function buildBattleUserFromToken(decoded, req) {
  const userId = String(decoded?.userId || '').trim();
  if (!userId) return null;

  const snapshot = decoded?.battleUser && typeof decoded.battleUser === 'object'
    ? decoded.battleUser
    : {};
  const snapshotData = snapshot.data && typeof snapshot.data === 'object' ? snapshot.data : {};
  const data = {
    ...snapshotData,
    k: Number.isFinite(Number(snapshotData.k ?? snapshot.k)) ? Number(snapshotData.k ?? snapshot.k) : 0,
    lumens: Number.isFinite(Number(snapshotData.lumens ?? snapshot.lumens)) ? Number(snapshotData.lumens ?? snapshot.lumens) : 0,
    stars: Number.isFinite(Number(snapshotData.stars ?? snapshot.stars)) ? Number(snapshotData.stars ?? snapshot.stars) : 0,
    status: snapshot.status || snapshotData.status || 'active',
    nickname: snapshot.nickname || snapshotData.nickname || String(decoded?.email || userId).split('@')[0],
  };

  const user = {
    _id: userId,
    id: userId,
    email: String(decoded?.email || snapshot.email || '').trim(),
    role: snapshot.role || snapshotData.role || 'user',
    nickname: data.nickname,
    status: data.status,
    emailConfirmed: true,
    emailConfirmedAt: snapshot.emailConfirmedAt || null,
    accessRestrictedUntil: null,
    accessRestrictionReason: '',
    language: snapshot.language || snapshotData.language || 'ru',
    lastSeenAt: null,
    lastOnlineAt: null,
    lastIp: '',
    lastDeviceId: '',
    lastFingerprint: '',
    lastWeakFingerprint: '',
    lastIpIntel: null,
    createdAt: null,
    updatedAt: null,
    data,
  };

  return buildUserForRequest(user, req);
}

function getCachedAuthRuntime(decoded, client, nowMs = Date.now()) {
  const cacheKey = buildAuthCacheKey(decoded?.userId, decoded?.sid);
  if (!cacheKey) return null;
  const cached = authRuntimeCache.get(cacheKey);
  if (!cached) return null;
  if (decoded?.sid && isSessionKnownRevoked(decoded.sid)) {
    authRuntimeCache.delete(cacheKey);
    return null;
  }
  if (Number(cached.expiresAtMs) <= nowMs || Number(cached.nextDbCheckAtMs) <= nowMs) {
    authRuntimeCache.delete(cacheKey);
    return null;
  }
  if (!identityMatches(cached.identity, buildRequestIdentity(client))) {
    authRuntimeCache.delete(cacheKey);
    return null;
  }
  return cached;
}

function setCachedAuthRuntime({ decoded, user, client, nowMs = Date.now() }) {
  const cacheKey = buildAuthCacheKey(decoded?.userId || user?._id, decoded?.sid);
  if (!cacheKey || !user) return null;
  cleanupAuthRuntimeCache(nowMs);
  const cached = {
    user: {
      ...user,
      data: user?.data && typeof user.data === 'object' ? { ...user.data } : {},
    },
    identity: buildRequestIdentity(client),
    expiresAtMs: nowMs + AUTH_RUNTIME_CACHE_TTL_MS,
    nextDbCheckAtMs: nowMs + AUTH_RUNTIME_DB_CHECK_INTERVAL_MS,
    nextOnlineWriteAtMs: nowMs + AUTH_RUNTIME_ONLINE_WRITE_INTERVAL_MS,
    nextSessionTouchAtMs: nowMs + AUTH_RUNTIME_SESSION_TOUCH_INTERVAL_MS,
  };
  authRuntimeCache.set(cacheKey, cached);
  return cached;
}

function refreshCachedRuntimeSideEffects({ cached, decoded, client, req, nowMs = Date.now() }) {
  if (!cached?.user?._id) return;
  if (decoded?.sid && Number(cached.nextSessionTouchAtMs) <= nowMs) {
    cached.nextSessionTouchAtMs = nowMs + AUTH_RUNTIME_SESSION_TOUCH_INTERVAL_MS;
    touchSession(decoded.sid, req).catch(() => { });
  }
  if (Number(cached.nextOnlineWriteAtMs) <= nowMs) {
    cached.nextOnlineWriteAtMs = nowMs + AUTH_RUNTIME_ONLINE_WRITE_INTERVAL_MS;
    cached.user.lastOnlineAt = new Date(nowMs).toISOString();
    if (client.ip) cached.user.lastIp = client.ip;
    if (client.deviceId) cached.user.lastDeviceId = client.deviceId;
    if (client.fingerprint) cached.user.lastFingerprint = client.fingerprint;
    updateUserById(cached.user._id, {
      last_online_at: cached.user.lastOnlineAt,
      last_ip: cached.user.lastIp || null,
      last_device_id: cached.user.lastDeviceId || null,
      last_fingerprint: cached.user.lastFingerprint || null,
    }).catch(() => { });
  }
}

async function fetchUserById(userId) {
  if (!userId) return null;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', String(userId))
      .maybeSingle();
    if (error) return null;
    if (!data) return null;
    const extra = data.data && typeof data.data === 'object' ? data.data : {};
    const base = {
      _id: data.id,
      id: data.id,
      email: data.email,
      role: data.role,
      nickname: data.nickname,
      status: data.status,
      emailConfirmed: Boolean(data.email_confirmed),
      emailConfirmedAt: data.email_confirmed_at,
      accessRestrictedUntil: data.access_restricted_until,
      accessRestrictionReason: data.access_restriction_reason,
      language: data.language,
      lastSeenAt: data.last_seen_at,
      lastOnlineAt: data.last_online_at,
      lastIp: data.last_ip,
      lastDeviceId: data.last_device_id,
      lastFingerprint: data.last_fingerprint,
      lastWeakFingerprint: extra.lastWeakFingerprint || '',
      lastIpIntel: extra.lastIpIntel || null,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
    return { ...extra, ...base, data: extra };
  } catch (_err) {
    return null;
  }
}

async function updateUserById(userId, update) {
  if (!userId || !update || typeof update !== 'object') return false;
  try {
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const payload = { ...update, updated_at: nowIso };
    const { error } = await supabase
      .from('users')
      .update(payload)
      .eq('id', String(userId));
    return !error;
  } catch (_err) {
    return false;
  }
}

function normalizeIdentityString(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, '');
}

function normalizeEmailForAntiFarm(email) {
  const e = String(email || '').toLowerCase().trim();
  const at = e.indexOf('@');
  if (at <= 0) return '';
  let local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const plus = local.indexOf('+');
    if (plus > 0) local = local.slice(0, plus);
    local = local.replace(/\./g, '');
  }
  return `${local}@${domain}`;
}

const auth = async (req, res, next) => {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({
        message: pickRequestLanguage(req, 'Требуется авторизация', 'Authorization required'),
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const client = extractClientMeta(req);
    const nowMs = Date.now();
    const isBattleRequest = isBattleRequestPath(req);

    const cachedRuntime = getCachedAuthRuntime(decoded, client, nowMs);
    if (cachedRuntime) {
      refreshCachedRuntimeSideEffects({
        cached: cachedRuntime,
        decoded,
        client,
        req,
        nowMs,
      });
      req.user = buildUserForRequest(cachedRuntime.user, req);
      req.auth = decoded;
      return next();
    }

    if (isBattleRequest) {
      const battleUser = buildBattleUserFromToken(decoded, req);
      if (!battleUser) {
        return res.status(401).json({
          message: pickRequestLanguage(req, 'Пользователь не найден', 'User not found'),
        });
      }
      if (battleUser.status === 'banned') {
        return res.status(403).json({
          message: pickRequestLanguage(req, 'Аккаунт заблокирован', 'Account is blocked'),
        });
      }
      req.user = battleUser;
      req.auth = decoded;
      setCachedAuthRuntime({
        decoded,
        user: battleUser,
        client,
        nowMs,
      });
      return next();
    }

    const user = await fetchUserById(decoded.userId);

    if (!user) {
      return res.status(401).json({
        message: pickRequestLanguage(req, 'Пользователь не найден', 'User not found'),
      });
    }

    if (user.role === 'admin' && !isAdminEmail(user.email)) {
      return res.status(403).json({
        message: pickRequestLanguage(req, 'Аккаунт администратора настроен неверно', 'Admin account is configured incorrectly'),
      });
    }

    const accessCheck = await evaluateAccessRestriction(client);
    if (accessCheck.blocked && user.role !== 'admin') {
      await writeAuthEvent({
        user: user._id,
        email: user.email,
        eventType: 'session_revoked',
        result: 'failed',
        reason: `blocked:${accessCheck.reason || 'rule'}`,
        req,
        sessionId: decoded?.sid || '',
      });
      return res.status(403).json({
        message: pickRequestLanguage(req, 'Доступ ограничен', 'Access is restricted'),
      });
    }

    if (user.status === 'banned') {
      return res.status(403).json({
        message: pickRequestLanguage(req, 'Аккаунт заблокирован', 'Account is blocked'),
      });
    }

    const humanCheckBlock = isHumanCheckBlocked(user);
    if (humanCheckBlock.blocked && user.role !== 'admin') {
      if (decoded?.sid) {
        await revokeSession({
          sessionId: decoded.sid,
          revokedBy: user._id,
          reason: 'human_check_blocked',
        });
      }
      await writeAuthEvent({
        user: user._id,
        email: user.email,
        eventType: 'session_revoked',
        result: 'failed',
        reason: 'human_check_blocked',
        req,
        sessionId: decoded?.sid || '',
        meta: {
          blockedUntil: humanCheckBlock.blockedUntil,
        },
      });
      return res.status(403).json({
        message: pickRequestLanguage(
          req,
          'Доступ временно закрыт после проваленной проверки',
          'Access is temporarily closed after a failed check',
        ),
        humanCheckBlocked: true,
        blockedUntil: humanCheckBlock.blockedUntil,
      });
    }

    if ((isActiveRestriction(user.accessRestrictedUntil) || isUserFrozen(user)) && user.role !== 'admin') {
      if (decoded?.sid) {
        await revokeSession({
          sessionId: decoded.sid,
          revokedBy: user._id,
          reason: isUserFrozen(user) ? 'multi_account_group_frozen' : 'multi_account_restriction',
        });
      }
      await writeAuthEvent({
        user: user._id,
        email: user.email,
        eventType: 'session_revoked',
        result: 'failed',
        reason: isUserFrozen(user) ? 'multi_account_group_frozen' : 'multi_account_restriction',
        req,
        sessionId: decoded?.sid || '',
      });
      return res.status(403).json({
        message: pickRequestLanguage(
          req,
          isUserFrozen(user)
            ? 'Аккаунт временно заморожен из-за подозрительных действий. Проверка обычно занимает до 24 часов. Не создавайте новые аккаунты и дождитесь решения модератора.'
            : `Доступ ограничен из-за проверки мультиаккаунта до ${new Date(user.accessRestrictedUntil).toISOString()}.`,
          isUserFrozen(user)
            ? 'This account was temporarily frozen due to suspicious activity. The review usually takes up to 24 hours. Please do not create new accounts and wait for the moderator decision.'
            : `Access is restricted due to a multi-account review until ${new Date(user.accessRestrictedUntil).toISOString()}.`,
        ),
        blockedUntil: user.accessRestrictedUntil,
      });
    }

    if (user.accessRestrictedUntil && (!isActiveRestriction(user.accessRestrictedUntil) || user.role === 'admin')) {
      updateUserById(user._id, {
        access_restricted_until: null,
        access_restriction_reason: '',
      }).catch(() => { });
    }

    if (decoded?.sid) {
      const active = await isSessionActive({ userId: user._id, sessionId: decoded.sid });
      if (!active) {
        await writeAuthEvent({
          user: user._id,
          email: user.email,
          eventType: 'session_revoked',
          result: 'failed',
          reason: 'session_not_active',
          req,
          sessionId: decoded.sid,
        });
        return res.status(401).json({
          message: pickRequestLanguage(req, 'Сессия завершена, войдите заново', 'Session expired, please sign in again'),
        });
      }

      const singleDeviceCheck = await enforceSingleDeviceSession({
        userId: user._id,
        sessionId: decoded.sid,
        req,
        revokedBy: user._id,
      });
      if (singleDeviceCheck.conflict) {
        await writeAuthEvent({
          user: user._id,
          email: user.email,
          eventType: 'session_revoked',
          result: 'failed',
          reason: 'single_device_conflict',
          req,
          sessionId: decoded.sid,
        });
        return res.status(401).json({
          message: pickRequestLanguage(
            req,
            'Обнаружен вход с другого устройства. Все сеансы завершены. Войдите заново только на одном устройстве.',
            'A sign-in from another device was detected. All sessions were ended. Sign in again on only one device.',
          ),
        });
      }

      touchSession(decoded.sid, req).catch(() => { });
    }

    const siteLanguage = getRequestLanguage(req, { fallback: user.language || user?.data?.language || 'ru' });
    user.profileLanguage = user.language || user?.data?.language || 'ru';
    user.siteLanguage = siteLanguage;
    user.language = siteLanguage;
    req.user = user;
    req.auth = decoded;

    const now = new Date(nowMs);
    const { ip, deviceId, fingerprint, weakFingerprint } = client;
    const currentData = user?.data && typeof user.data === 'object' ? user.data : {};
    const nextData = {
      ...currentData,
      lastWeakFingerprint: weakFingerprint || currentData.lastWeakFingerprint || '',
    };
    const update = {
      last_online_at: now.toISOString(),
      last_ip: ip || user.lastIp || null,
      last_device_id: deviceId || user.lastDeviceId || null,
      last_fingerprint: fingerprint || user.lastFingerprint || null,
      data: nextData,
    };
    updateUserById(user._id, update).catch(() => { });

    setCachedAuthRuntime({
      decoded,
      user: {
        ...user,
        lastOnlineAt: now.toISOString(),
        lastIp: update.last_ip,
        lastDeviceId: update.last_device_id,
        lastFingerprint: update.last_fingerprint,
        data: nextData,
      },
      client,
      nowMs,
    });

    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {
      const token = getTokenFromRequest(req);
      const unsafe = decodeTokenUnsafe(token);
      const eventType = error.name === 'TokenExpiredError' ? 'token_expired' : 'session_revoked';
      writeAuthEvent({
        user: unsafe?.userId || null,
        email: unsafe?.email || '',
        eventType,
        result: 'failed',
        reason: error.name,
        req,
        sessionId: unsafe?.sid || '',
      }).catch(() => { });
      return res.status(401).json({
        message: pickRequestLanguage(req, 'Недействительный токен', 'Invalid token'),
      });
    }
    return next(error);
  }
};

module.exports = auth;
