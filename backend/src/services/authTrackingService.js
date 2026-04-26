const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { AUTH_COOKIE_NAME } = require('../config/auth');
const { parseCookieHeader } = require('../utils/httpCookies');
const { getSupabaseClient } = require('../lib/supabaseClient');

function decodeBase64UrlJson(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const normalized = raw
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(raw.length / 4) * 4, '=');
    const parsed = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_error) {
    return null;
  }
}

function extractClientMeta(req) {
  const ip = String(req?.ip || req?.socket?.remoteAddress || '').trim();
  const deviceId = (req.headers?.['x-device-id'] || '').toString().trim();
  const fingerprint = (req.headers?.['x-client-fingerprint'] || '').toString().trim();
  const weakFingerprint = (req.headers?.['x-client-fingerprint-weak'] || '').toString().trim();
  const profileKey = (req.headers?.['x-client-profile-key'] || '').toString().trim();
  const userAgent = String(req.headers?.['user-agent'] || '').trim();
  const clientProfile = decodeBase64UrlJson(req?.headers?.['x-client-profile']);
  return { ip, deviceId, fingerprint, weakFingerprint, userAgent, profileKey, clientProfile };
}

function buildSessionId() {
  return `sid_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

function normalizeIdentityToken(value) {
  return String(value || '').trim().toLowerCase();
}

function buildClientIdentity(source = null) {
  const meta = source?.meta && typeof source.meta === 'object' ? source.meta : {};
  return {
    deviceId: normalizeIdentityToken(source?.device_id ?? source?.deviceId),
    fingerprint: normalizeIdentityToken(source?.fingerprint),
    weakFingerprint: normalizeIdentityToken(source?.weak_fingerprint ?? source?.weakFingerprint ?? meta.weakFingerprint),
    profileKey: normalizeIdentityToken(meta.profileKey ?? source?.profileKey),
  };
}

function hasClientIdentity(identity) {
  if (!identity || typeof identity !== 'object') return false;
  return Boolean(identity.deviceId || identity.fingerprint || identity.profileKey || identity.weakFingerprint);
}

function isSameClientIdentity(left, right) {
  if (!hasClientIdentity(left) || !hasClientIdentity(right)) return false;
  return (
    (left.deviceId && right.deviceId && left.deviceId === right.deviceId)
    || (left.fingerprint && right.fingerprint && left.fingerprint === right.fingerprint)
    || (left.profileKey && right.profileKey && left.profileKey === right.profileKey)
    || (left.weakFingerprint && right.weakFingerprint && left.weakFingerprint === right.weakFingerprint)
  );
}

function mergeClientIdentity(primary = null, fallback = null) {
  return {
    deviceId: primary?.deviceId || fallback?.deviceId || '',
    fingerprint: primary?.fingerprint || fallback?.fingerprint || '',
    weakFingerprint: primary?.weakFingerprint || fallback?.weakFingerprint || '',
    profileKey: primary?.profileKey || fallback?.profileKey || '',
  };
}

function notifyForcedLogout({ userId, reason = 'session_revoked', sessionIds = [] } = {}) {
  try {
    const io = global.io;
    if (!io || !userId) return false;
    io.to(`user-${String(userId)}`).emit('auth:force_logout', {
      reason: String(reason || 'session_revoked'),
      sessionIds: Array.isArray(sessionIds)
        ? sessionIds.map((sessionId) => String(sessionId || '').trim()).filter(Boolean)
        : [],
    });
    return true;
  } catch (_err) {
    return false;
  }
}

function getTokenFromRequest(req) {
  const authHeader = req?.headers?.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.split(' ')[1] || '';
  }

  const cookies = parseCookieHeader(req?.headers?.cookie || '');
  return String(cookies[AUTH_COOKIE_NAME] || '').trim();
}

function decodeTokenUnsafe(token) {
  if (!token) return null;
  try {
    return jwt.decode(token) || null;
  } catch (_err) {
    return null;
  }
}

async function writeAuthEvent({
  user = null,
  email = '',
  eventType,
  result = 'success',
  reason = null,
  req = null,
  sessionId = '',
  meta = null,
}) {
  if (!eventType) return null;
  const client = req ? extractClientMeta(req) : {
    ip: '',
    deviceId: '',
    fingerprint: '',
    weakFingerprint: '',
    userAgent: '',
    profileKey: '',
    clientProfile: null,
  };
  try {
    const supabase = getSupabaseClient();
    const payload = {
      user_id: user || null,
      email: String(email || '').trim().toLowerCase(),
      event_type: String(eventType),
      result: String(result || 'success'),
      reason: reason ? String(reason).slice(0, 500) : null,
      ip: String(client.ip || ''),
      user_agent: String(client.userAgent || ''),
      device_id: String(client.deviceId || ''),
      fingerprint: String(client.fingerprint || ''),
      session_id: String(sessionId || '').trim(),
      meta: {
        weakFingerprint: String(client.weakFingerprint || ''),
        profileKey: String(client.profileKey || ''),
        clientProfile: client.clientProfile && typeof client.clientProfile === 'object'
          ? client.clientProfile
          : null,
        ...(meta && typeof meta === 'object' ? meta : {}),
      },
    };
    const { data, error } = await supabase
      .from('auth_events')
      .insert(payload)
      .select('*')
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch (_err) {
    return null;
  }
}

async function listActiveUserSessions({ userId }) {
  if (!userId) return [];
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', String(userId))
      .eq('is_active', true);
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch (_err) {
    return [];
  }
}

async function revokeSessionsByIds({ sessionIds = [], revokedBy = null, reason = 'session_revoked' }) {
  const safeSessionIds = Array.isArray(sessionIds)
    ? sessionIds.map((sessionId) => String(sessionId || '').trim()).filter(Boolean)
    : [];
  if (!safeSessionIds.length) return [];
  try {
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('user_sessions')
      .update({
        is_active: false,
        ended_at: nowIso,
        revoked_at: nowIso,
        revoked_by: revokedBy || null,
        revoke_reason: String(reason || 'session_revoked').slice(0, 500),
        updated_at: nowIso,
      })
      .in('session_id', safeSessionIds)
      .eq('is_active', true)
      .select('*');
    if (error || !Array.isArray(data)) return [];
    return data;
  } catch (_err) {
    return [];
  }
}

async function prepareSingleDeviceSession({ userId, req, revokedBy = null }) {
  if (!userId) {
    return {
      allowed: false,
      conflict: false,
      revokedCount: 0,
      conflictingSessionIds: [],
    };
  }

  const activeSessions = await listActiveUserSessions({ userId });
  if (!activeSessions.length) {
    return {
      allowed: true,
      conflict: false,
      revokedCount: 0,
      conflictingSessionIds: [],
    };
  }

  const clientIdentity = buildClientIdentity(extractClientMeta(req));
  const conflictingSessions = activeSessions.filter((session) => {
    const sessionIdentity = buildClientIdentity(session);
    if (!hasClientIdentity(clientIdentity) || !hasClientIdentity(sessionIdentity)) return false;
    return !isSameClientIdentity(sessionIdentity, clientIdentity);
  });

  if (conflictingSessions.length) {
    const revokedCount = await revokeAllUserSessions({
      userId,
      revokedBy,
      reason: 'single_device_conflict',
    });
    notifyForcedLogout({
      userId,
      reason: 'single_device_conflict',
      sessionIds: activeSessions.map((session) => session?.session_id),
    });
    return {
      allowed: false,
      conflict: true,
      revokedCount,
      conflictingSessionIds: conflictingSessions.map((session) => String(session?.session_id || '').trim()).filter(Boolean),
    };
  }

  await revokeAllUserSessions({
    userId,
    revokedBy,
    reason: 'single_session_refresh',
  });
  return {
    allowed: true,
    conflict: false,
    revokedCount: activeSessions.length,
    conflictingSessionIds: [],
  };
}

async function enforceSingleDeviceSession({ userId, sessionId, req, revokedBy = null }) {
  const safeSessionId = String(sessionId || '').trim();
  if (!userId || !safeSessionId) {
    return {
      valid: true,
      conflict: false,
      revokedCount: 0,
      conflictingSessionIds: [],
    };
  }

  const activeSessions = await listActiveUserSessions({ userId });
  if (activeSessions.length <= 1) {
    return {
      valid: true,
      conflict: false,
      revokedCount: 0,
      conflictingSessionIds: [],
    };
  }

  const currentSession = activeSessions.find((session) => String(session?.session_id || '').trim() === safeSessionId) || null;
  const requestIdentity = buildClientIdentity(extractClientMeta(req));
  const currentIdentity = mergeClientIdentity(requestIdentity, buildClientIdentity(currentSession));
  const otherSessions = activeSessions.filter((session) => String(session?.session_id || '').trim() !== safeSessionId);
  const conflictingSessions = otherSessions.filter((session) => {
    const sessionIdentity = buildClientIdentity(session);
    if (!hasClientIdentity(currentIdentity) || !hasClientIdentity(sessionIdentity)) return false;
    return !isSameClientIdentity(sessionIdentity, currentIdentity);
  });

  if (conflictingSessions.length) {
    const revokedCount = await revokeAllUserSessions({
      userId,
      revokedBy,
      reason: 'single_device_conflict',
    });
    notifyForcedLogout({
      userId,
      reason: 'single_device_conflict',
      sessionIds: activeSessions.map((session) => session?.session_id),
    });
    return {
      valid: false,
      conflict: true,
      revokedCount,
      conflictingSessionIds: conflictingSessions.map((session) => String(session?.session_id || '').trim()).filter(Boolean),
    };
  }

  const revokedSessions = await revokeSessionsByIds({
    sessionIds: otherSessions.map((session) => session?.session_id),
    revokedBy,
    reason: 'single_session_refresh',
  });
  return {
    valid: true,
    conflict: false,
    revokedCount: revokedSessions.length,
    conflictingSessionIds: [],
  };
}

async function createUserSession({ userId, req, sessionId = null }) {
  if (!userId) return null;
  const sessionPreparation = await prepareSingleDeviceSession({
    userId,
    req,
    revokedBy: userId,
  });
  if (!sessionPreparation.allowed) {
    return {
      conflict: true,
      revokedAll: true,
      revokedCount: sessionPreparation.revokedCount,
      conflictingSessionIds: sessionPreparation.conflictingSessionIds,
    };
  }
  const sid = sessionId || buildSessionId();
  const client = extractClientMeta(req);
  try {
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();

    await supabase
      .from('user_sessions')
      .update({
        is_active: false,
        revoked_at: nowIso,
        revoke_reason: 'session_id_reused',
        updated_at: nowIso,
      })
      .eq('session_id', String(sid))
      .eq('user_id', String(userId))
      .eq('is_active', true);

    const { data, error } = await supabase
      .from('user_sessions')
      .upsert({
        session_id: String(sid),
        user_id: String(userId),
        ip: String(client.ip || ''),
        device_id: String(client.deviceId || ''),
        fingerprint: String(client.fingerprint || ''),
        user_agent: String(client.userAgent || ''),
        started_at: nowIso,
        last_seen_at: nowIso,
        is_active: true,
        ended_at: null,
        revoked_at: null,
        revoked_by: null,
        revoke_reason: null,
        meta: {
          weakFingerprint: String(client.weakFingerprint || ''),
          profileKey: String(client.profileKey || ''),
          clientProfile: client.clientProfile && typeof client.clientProfile === 'object'
            ? client.clientProfile
            : null,
        },
        updated_at: nowIso,
      }, { onConflict: 'session_id' })
      .select('*')
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch (_err) {
    return null;
  }
}

async function touchSession(sessionId, req) {
  if (!sessionId) return false;
  const client = req ? extractClientMeta(req) : {
    ip: '',
    deviceId: '',
    fingerprint: '',
    weakFingerprint: '',
    profileKey: '',
    clientProfile: null,
  };
  try {
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const update = {
      last_seen_at: nowIso,
      updated_at: nowIso,
    };
    if (client.ip) update.ip = String(client.ip);
    if (client.deviceId) update.device_id = String(client.deviceId);
    if (client.fingerprint) update.fingerprint = String(client.fingerprint);
    if (client.weakFingerprint || client.profileKey || client.clientProfile) {
      update.meta = {
        weakFingerprint: String(client.weakFingerprint || ''),
        profileKey: String(client.profileKey || ''),
        clientProfile: client.clientProfile && typeof client.clientProfile === 'object'
          ? client.clientProfile
          : null,
      };
    }
    const { error } = await supabase
      .from('user_sessions')
      .update(update)
      .eq('session_id', String(sessionId))
      .eq('is_active', true);
    if (error) return false;
    return true;
  } catch (_err) {
    return false;
  }
}

async function isSessionActive({ userId, sessionId }) {
  if (!sessionId || !userId) return false;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('user_sessions')
      .select('session_id')
      .eq('session_id', String(sessionId))
      .eq('user_id', String(userId))
      .eq('is_active', true)
      .maybeSingle();
    if (error) return false;
    return Boolean(data);
  } catch (_err) {
    return false;
  }
}

async function revokeSession({ sessionId, revokedBy = null, reason = 'session_revoked' }) {
  if (!sessionId) return null;
  try {
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const { data: session, error: readError } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('session_id', String(sessionId))
      .maybeSingle();
    if (readError) return null;
    if (!session || !session.is_active) return session || null;

    const { data, error } = await supabase
      .from('user_sessions')
      .update({
        is_active: false,
        ended_at: nowIso,
        revoked_at: nowIso,
        revoked_by: revokedBy || null,
        revoke_reason: String(reason || 'session_revoked').slice(0, 500),
        updated_at: nowIso,
      })
      .eq('session_id', String(sessionId))
      .select('*')
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch (_err) {
    return null;
  }
}

async function revokeAllUserSessions({ userId, revokedBy = null, reason = 'revoke_all' }) {
  if (!userId) return 0;
  try {
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('user_sessions')
      .update({
        is_active: false,
        ended_at: nowIso,
        revoked_at: nowIso,
        revoked_by: revokedBy || null,
        revoke_reason: String(reason || 'revoke_all').slice(0, 500),
        updated_at: nowIso,
      })
      .eq('user_id', String(userId))
      .eq('is_active', true)
      .select('session_id');
    if (error) return 0;
    return Array.isArray(data) ? data.length : 0;
  } catch (_err) {
    return 0;
  }
}

module.exports = {
  extractClientMeta,
  buildSessionId,
  getTokenFromRequest,
  decodeTokenUnsafe,
  writeAuthEvent,
  listActiveUserSessions,
  createUserSession,
  touchSession,
  isSessionActive,
  revokeSession,
  revokeAllUserSessions,
  enforceSingleDeviceSession,
  notifyForcedLogout,
};
