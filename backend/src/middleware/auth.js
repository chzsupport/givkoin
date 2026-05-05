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
} = require('../services/authTrackingService');
const { evaluateAccessRestriction } = require('../services/securityService');
const {
  isActiveRestriction,
  isUserFrozen,
  handleAuthenticatedSessionMultiAccount,
} = require('../services/multiAccountService');
const { isAdminEmail } = require('../utils/accountRole');
const { getRequestLanguage, pickRequestLanguage } = require('../utils/requestLanguage');
const { JWT_SECRET } = require('../config/auth');

const SESSION_MULTI_ACCOUNT_CHECK_INTERVAL_MS = 5 * 60 * 1000;

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
    const nextData = {
      ...currentData,
      lastWeakFingerprint: weakFingerprint || currentData.lastWeakFingerprint || '',
      ...(shouldRunSecurityCheck ? { lastSecuritySignalCheckAt: now.toISOString() } : {}),
    };
    const update = {
      last_online_at: now.toISOString(),
      last_ip: ip || user.lastIp || null,
      last_device_id: deviceId || user.lastDeviceId || null,
      last_fingerprint: fingerprint || user.lastFingerprint || null,
      data: nextData,
    };
    await updateUserById(user._id, update);

    if (shouldRunSecurityCheck) {
      const sessionCheckResult = await handleAuthenticatedSessionMultiAccount({
        user: {
          ...user,
          lastIp: update.last_ip,
          lastDeviceId: update.last_device_id,
          lastFingerprint: update.last_fingerprint,
          lastWeakFingerprint: nextData.lastWeakFingerprint,
          data: nextData,
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

      if (sessionCheckResult?.frozen) {
        if (decoded?.sid) {
          await revokeSession({
            sessionId: decoded.sid,
            revokedBy: user._id,
            reason: 'multi_account_group_frozen',
          });
        }
        return res.status(403).json({
          message: pickRequestLanguage(
            req,
            'Аккаунт временно заморожен из-за подозрительных действий. Проверка обычно занимает до 24 часов. Не создавайте новые аккаунты и дождитесь решения модератора.',
            'This account was temporarily frozen due to suspicious activity. The review usually takes up to 24 hours. Please do not create new accounts and wait for the moderator decision.',
          ),
          groupId: sessionCheckResult.groupId || null,
        });
      }
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
      }).catch(() => { });
      return res.status(401).json({
        message: pickRequestLanguage(req, 'Недействительный токен', 'Invalid token'),
      });
    }
    return next(error);
  }
};

module.exports = auth;
