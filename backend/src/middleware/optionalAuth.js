const jwt = require('jsonwebtoken');
const { getSupabaseClient } = require('../lib/supabaseClient');
const {
    extractClientMeta,
    getTokenFromRequest,
    isSessionActive,
    touchSession,
} = require('../services/authTrackingService');
const { evaluateAccessRestriction } = require('../services/securityService');
const { isActiveRestriction, isUserFrozen } = require('../services/multiAccountService');
const { isAdminEmail } = require('../utils/accountRole');
const { getRequestLanguage } = require('../utils/requestLanguage');
const { JWT_SECRET } = require('../config/auth');

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

async function getUserRowById(userId) {
    if (!userId) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,email,nickname,role,status,email_confirmed,access_restricted_until,access_restriction_reason,language,data,last_ip,last_device_id,last_fingerprint')
        .eq('id', String(userId))
        .maybeSingle();
    if (error) return null;
    return data || null;
}

function mapUserRowToAuthUser(row) {
    if (!row) return null;
    const data = row.data && typeof row.data === 'object' ? row.data : {};
    return {
        _id: row.id,
        id: row.id,
        email: row.email,
        nickname: row.nickname,
        role: row.role,
        status: row.status,
        emailConfirmed: Boolean(row.email_confirmed),
        accessRestrictedUntil: row.access_restricted_until,
        accessRestrictionReason: row.access_restriction_reason,
        language: row.language,
        lastIp: row.last_ip,
        lastDeviceId: row.last_device_id,
        lastFingerprint: row.last_fingerprint,
        data,
    };
}

async function updateUserRuntimeMeta({ userId, client, email, nickname }) {
    if (!userId) return;
    const supabase = getSupabaseClient();

    const { data: row, error } = await supabase
        .from('users')
        .select('id,data')
        .eq('id', String(userId))
        .maybeSingle();
    if (error || !row) return;

    const existingData = row.data && typeof row.data === 'object' ? row.data : {};
    const patchData = { ...existingData };

    if (email) patchData.emailNormalized = normalizeEmailForAntiFarm(email);
    if (nickname) patchData.nicknameNormalized = normalizeIdentityString(nickname);
    if (client?.weakFingerprint) patchData.lastWeakFingerprint = String(client.weakFingerprint);

    const nowIso = new Date().toISOString();
    const update = {
      last_online_at: nowIso,
        updated_at: nowIso,
        data: patchData,
    };
    if (client?.ip) update.last_ip = String(client.ip);
    if (client?.deviceId) update.last_device_id = String(client.deviceId);
    if (client?.fingerprint) update.last_fingerprint = String(client.fingerprint);

    await supabase
        .from('users')
        .update(update)
        .eq('id', String(userId));
}

const optionalAuth = async (req, res, next) => {
    try {
        const token = getTokenFromRequest(req);
        if (!token) {
            // No token, proceed as guest
            req.user = null;
            return next();
        }

        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const userRow = await getUserRowById(decoded.userId);
            const user = mapUserRowToAuthUser(userRow);
            const client = extractClientMeta(req);
            const isAdminAccount = user?.role === 'admin';

            const accessCheck = await evaluateAccessRestriction(client);
            const restrictionActive = isActiveRestriction(user?.accessRestrictedUntil);

            if (
                user &&
                user.status !== 'banned' &&
                !isUserFrozen(user) &&
                (!accessCheck.blocked || isAdminAccount) &&
                (!restrictionActive || isAdminAccount) &&
                (!isAdminAccount || isAdminEmail(user.email))
            ) {
                if (isAdminAccount && user.accessRestrictedUntil) {
                    const supabase = getSupabaseClient();
                    await supabase
                        .from('users')
                        .update({
                            access_restricted_until: null,
                            access_restriction_reason: '',
                            updated_at: new Date().toISOString(),
                        })
                        .eq('id', String(user._id));
                }

                if (decoded?.sid) {
                    const active = await isSessionActive({ userId: user._id, sessionId: decoded.sid });
                    if (!active) {
                        req.user = null;
                        return next();
                    }
                    touchSession(decoded.sid, req).catch(() => { });
                }

                req.user = user;
                req.user.profileLanguage = user.language || user.data?.language || 'ru';
                req.user.siteLanguage = getRequestLanguage(req, { fallback: req.user.profileLanguage });
                req.user.language = req.user.siteLanguage;
                req.auth = decoded;

                updateUserRuntimeMeta({
                    userId: user._id,
                    client,
                    email: user.email,
                    nickname: user.nickname,
                }).catch(() => { });
            } else {
                req.user = null;
            }
        } catch (e) {
            // Invalid token, treat as guest
            req.user = null;
        }

        return next();
    } catch (error) {
        req.user = null;
        return next(error);
    }
};

module.exports = optionalAuth;
