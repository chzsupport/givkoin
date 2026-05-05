const jwt = require('jsonwebtoken');
const {
  extractClientMeta,
  decodeTokenUnsafe,
  getTokenFromRequest,
  writeAuthEvent,
  touchSession,
  revokeSession,
} = require('../services/authTrackingService');
const { evaluateAccessRestriction } = require('../services/securityService');
const {
  isActiveRestriction,
  isUserFrozen,
} = require('../services/multiAccountService');
const { isAdminEmail } = require('../utils/accountRole');
const { getRequestLanguage, pickRequestLanguage } = require('../utils/requestLanguage');
const { JWT_SECRET } = require('../config/auth');
const { getCachedUser, invalidateUser } = require('../services/userCache');
const { isSessionActiveCached } = require('../services/sessionCache');
const { isBanned } = require('../services/banBlacklist');
const { queueOnlineUpdate, queueSecurityCheck } = require('../services/backgroundSecurity');

const SESSION_MULTI_ACCOUNT_CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function updateUserById(userId, update) {
  if (!userId || !update || typeof update !== 'object') return false;
  try {
    const { getSupabaseClient } = require('../lib/supabaseClient');
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

    // 1. Проверка бана — мгновенная, из памяти (без запроса к базе)
    if (isBanned(decoded.userId)) {
      return res.status(403).json({
        message: pickRequestLanguage(req, 'Аккаунт заблокирован', 'Account is blocked'),
      });
    }

    // 2. Загрузка юзера — из кеша (без запроса к базе если кеш актуален)
    const user = await getCachedUser(decoded.userId);

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

    // 3. Блокировки по IP/устройству — кеш уже есть в securityService (30 сек)
    const accessCheck = await evaluateAccessRestriction(client);
    if (accessCheck.blocked && user.role !== 'admin') {
      writeAuthEvent({
        user: user._id,
        email: user.email,
        eventType: 'session_revoked',
        result: 'failed',
        reason: `blocked:${accessCheck.reason || 'rule'}`,
        req,
        sessionId: decoded?.sid || '',
      }).catch(() => {});
      return res.status(403).json({
        message: pickRequestLanguage(req, 'Доступ ограничен', 'Access is restricted'),
      });
    }

    // 4. Проверка бана из данных юзера (на случай если кеш устарел)
    if (user.status === 'banned') {
      return res.status(403).json({
        message: pickRequestLanguage(req, 'Аккаунт заблокирован', 'Account is blocked'),
      });
    }

    // 5. Ограничения доступа / заморозка — из кешированных данных юзера
    if ((isActiveRestriction(user.accessRestrictedUntil) || isUserFrozen(user)) && user.role !== 'admin') {
      if (decoded?.sid) {
        await revokeSession({
          sessionId: decoded.sid,
          revokedBy: user._id,
          reason: isUserFrozen(user) ? 'multi_account_group_frozen' : 'multi_account_restriction',
        });
      }
      writeAuthEvent({
        user: user._id,
        email: user.email,
        eventType: 'session_revoked',
        result: 'failed',
        reason: isUserFrozen(user) ? 'multi_account_group_frozen' : 'multi_account_restriction',
        req,
        sessionId: decoded?.sid || '',
      }).catch(() => {});
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

    // Снятие устаревшего ограничения — в фоне
    if (user.accessRestrictedUntil && (!isActiveRestriction(user.accessRestrictedUntil) || user.role === 'admin')) {
      updateUserById(user._id, {
        access_restricted_until: null,
        access_restriction_reason: '',
      }).catch(() => {});
      invalidateUser(user._id);
    }

    // 6. Проверка сессии — из кеша (без запроса к базе если кеш актуален)
    if (decoded?.sid) {
      const active = await isSessionActiveCached({ userId: user._id, sessionId: decoded.sid });
      if (!active) {
        writeAuthEvent({
          user: user._id,
          email: user.email,
          eventType: 'session_revoked',
          result: 'failed',
          reason: 'session_not_active',
          req,
          sessionId: decoded.sid,
        }).catch(() => {});
        return res.status(401).json({
          message: pickRequestLanguage(req, 'Сессия завершена, войдите заново', 'Session expired, please sign in again'),
        });
      }

      // Проверка одного устройства — УБРАНА из каждого запроса
      // Теперь делается только при входе (в authTrackingService.createUserSession)
      // Если нужно мгновенно выкинуть — админка шлёт сигнал через сокет

      touchSession(decoded.sid, req).catch(() => {});
    }

    const siteLanguage = getRequestLanguage(req, { fallback: user.language || user?.data?.language || 'ru' });
    user.profileLanguage = user.language || user?.data?.language || 'ru';
    user.siteLanguage = siteLanguage;
    user.language = siteLanguage;
    req.user = user;
    req.auth = decoded;

    // 7. Запись last_online_at — в фоне (не блокирует ответ юзеру)
    const now = new Date();
    const { ip, deviceId, fingerprint, weakFingerprint } = client;
    const currentData = user?.data && typeof user.data === 'object' ? user.data : {};
    const lastSecurityCheckAtMs = currentData.lastSecuritySignalCheckAt
      ? new Date(currentData.lastSecuritySignalCheckAt).getTime()
      : 0;
    const shouldRunSecurityCheck = user.role !== 'admin'
      && Boolean(ip || deviceId || fingerprint || weakFingerprint)
      && (
        !Number.isFinite(lastSecurityCheckAtMs)
        || !lastSecurityCheckAtMs
        || (now.getTime() - lastSecurityCheckAtMs) >= SESSION_MULTI_ACCOUNT_CHECK_INTERVAL_MS
      );

    queueOnlineUpdate(user._id, {
      lastIp: ip || user.lastIp || null,
      lastDeviceId: deviceId || user.lastDeviceId || null,
      lastFingerprint: fingerprint || user.lastFingerprint || null,
      lastWeakFingerprint: weakFingerprint || currentData.lastWeakFingerprint || '',
      ...(shouldRunSecurityCheck ? { lastSecuritySignalCheckAt: now.toISOString() } : {}),
    });

    // 8. Проверка мультиаккаунта — в фоне (не блокирует ответ юзеру)
    if (shouldRunSecurityCheck) {
      queueSecurityCheck(user._id, {
        user: {
          ...user,
          lastIp: ip || user.lastIp || null,
          lastDeviceId: deviceId || user.lastDeviceId || null,
          lastFingerprint: fingerprint || user.lastFingerprint || null,
          lastWeakFingerprint: weakFingerprint || currentData.lastWeakFingerprint || '',
          data: currentData,
        },
        req,
        signals: {
          ip,
          deviceId,
          fingerprint,
          weakFingerprint,
          email: user.email,
          userAgent: client.userAgent,
        },
      });
    }

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
      }).catch(() => {});
      return res.status(401).json({
        message: pickRequestLanguage(req, 'Недействительный токен', 'Invalid token'),
      });
    }
    return next(error);
  }
};

module.exports = auth;
