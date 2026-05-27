const { getSupabaseClient } = require('../../lib/supabaseClient');
const {
  disableIpRule,
  upsertIpRule,
} = require('../../services/securityService');
const {
  revokeAllUserSessions,
  revokeSession,
  writeAuthEvent,
} = require('../../services/authTrackingService');
const {
  buildOperationId,
  getUsersByIds,
  listModelDocs,
  logCmsAudit,
  mutationResponse,
  normalizeText,
  parsePagination,
  toDate,
  toId,
} = require('./shared');

async function listIpBlockRules(req, res) {
  try {
    const query = {};
    if (req.query.type) query.ruleType = String(req.query.type);
    if (req.query.status) {
      const status = String(req.query.status);
      if (status === 'active') query.isActive = true;
      if (status === 'off') query.isActive = false;
    }

    const all = await listModelDocs('IpBlockRule', { pageSize: 2000 });
    const safeRules = (Array.isArray(all) ? all : [])
      .filter((row) => {
        if (query.ruleType && String(row?.ruleType || '') !== String(query.ruleType)) return false;
        if (query.isActive !== undefined && Boolean(row?.isActive) !== Boolean(query.isActive)) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 1000);

    const actorIds = Array.from(new Set(safeRules.map((row) => toId(row?.blockedBy)).filter(Boolean)));
    const actorMap = await getUsersByIds(actorIds);
    const enrichedRules = safeRules.map((row) => {
      const id = toId(row?.blockedBy);
      const u = id ? actorMap.get(id) : null;
      return {
        ...row,
        blockedBy: u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : row.blockedBy,
      };
    });

    return res.json({ rules: enrichedRules });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getIpRules(req, res) {
  return listIpBlockRules(req, res);
}

async function blockIpRule(req, res) {
  try {
    const operationId = buildOperationId();
    const { ruleType, value, reason, isWhitelist = false, expiresAt = null } = req.body || {};
    const rule = await upsertIpRule({
      ruleType,
      value,
      reason,
      isWhitelist,
      actorId: req.user?._id || null,
      expiresAt,
    });

    const auditId = await logCmsAudit(
      req,
      isWhitelist ? 'cms.security.ip.whitelist' : 'cms.security.ip.block',
      'IpBlockRule',
      rule._id,
      null,
      rule,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: isWhitelist ? 'Исключение добавлено' : 'Правило блокировки добавлено',
      data: { rule },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function unblockIpRule(req, res) {
  try {
    const operationId = buildOperationId();
    const { ruleType, value, isWhitelist = false } = req.body || {};
    const rule = await disableIpRule({ ruleType, value, isWhitelist });
    if (!rule) return res.status(404).json({ message: 'Правило не найдено' });

    const auditId = await logCmsAudit(
      req,
      isWhitelist ? 'cms.security.ip.whitelist.remove' : 'cms.security.ip.unblock',
      'IpBlockRule',
      rule._id,
      null,
      rule,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Правило отключено',
      data: { rule },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function getAuthEvents(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 50 });
    const supabase = getSupabaseClient();
    let q = supabase
      .from('auth_events')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(skip, skip + limit - 1);

    if (req.query.user) q = q.eq('user_id', String(req.query.user));
    if (req.query.eventType) q = q.eq('event_type', String(req.query.eventType));
    if (req.query.result) q = q.eq('result', String(req.query.result));
    if (req.query.ip) q = q.eq('ip', String(req.query.ip));
    if (req.query.deviceId) q = q.eq('device_id', String(req.query.deviceId));

    const from = req.query.from ? toDate(req.query.from) : null;
    const to = req.query.to ? toDate(req.query.to) : null;
    if (from) q = q.gte('created_at', from.toISOString());
    if (to) q = q.lte('created_at', to.toISOString());

    const { data, error, count } = await q;
    if (error) throw error;
    const eventsRaw = Array.isArray(data) ? data : [];

    const userIds = Array.from(new Set(eventsRaw.map((row) => String(row?.user_id || '').trim()).filter(Boolean)));
    const userMap = new Map();
    if (userIds.length) {
      const { data: users, error: userErr } = await supabase
        .from('users')
        .select('id,email,nickname,status')
        .in('id', userIds);
      if (!userErr && Array.isArray(users)) {
        users.forEach((u) => userMap.set(String(u.id), u));
      }
    }

    const events = eventsRaw.map((row) => {
      const u = row?.user_id ? userMap.get(String(row.user_id)) : null;
      return {
        _id: row?.id,
        user: row?.user_id
          ? {
            _id: row.user_id,
            email: u?.email,
            nickname: u?.nickname,
            status: u?.status,
          }
          : null,
        email: row?.email,
        eventType: row?.event_type,
        result: row?.result,
        reason: row?.reason,
        ip: row?.ip,
        userAgent: row?.user_agent,
        deviceId: row?.device_id,
        fingerprint: row?.fingerprint,
        sessionId: row?.session_id,
        meta: row?.meta,
        createdAt: row?.created_at,
        updatedAt: row?.updated_at,
      };
    });
    const total = Number(count || 0);

    return res.json({
      events,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function getUserSessions(req, res) {
  try {
    const userId = req.params.id;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('user_id', String(userId))
      .order('started_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    const sessionsRaw = Array.isArray(data) ? data : [];

    const revokedByIds = Array.from(new Set(sessionsRaw.map((row) => String(row?.revoked_by || '').trim()).filter(Boolean)));
    const revokedByMap = new Map();
    if (revokedByIds.length) {
      const { data: users, error: userErr } = await supabase
        .from('users')
        .select('id,email,nickname')
        .in('id', revokedByIds);
      if (!userErr && Array.isArray(users)) {
        users.forEach((u) => revokedByMap.set(String(u.id), u));
      }
    }

    const sessions = sessionsRaw.map((row) => {
      const revokedBy = row?.revoked_by ? revokedByMap.get(String(row.revoked_by)) : null;
      return {
        _id: row?.session_id,
        sessionId: row?.session_id,
        user: row?.user_id,
        ip: row?.ip,
        deviceId: row?.device_id,
        fingerprint: row?.fingerprint,
        userAgent: row?.user_agent,
        startedAt: row?.started_at,
        lastSeenAt: row?.last_seen_at,
        endedAt: row?.ended_at,
        isActive: row?.is_active,
        revokedAt: row?.revoked_at,
        revokedBy: row?.revoked_by
          ? {
            _id: row.revoked_by,
            email: revokedBy?.email,
            nickname: revokedBy?.nickname,
          }
          : null,
        revokeReason: row?.revoke_reason,
        createdAt: row?.created_at,
        updatedAt: row?.updated_at,
      };
    });

    return res.json({ sessions });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function revokeUserSession(req, res) {
  try {
    const operationId = buildOperationId();
    const { sessionId } = req.params;
    const reason = normalizeText(req.body?.reason || 'revoked_by_admin', 300);
    const session = await revokeSession({
      sessionId,
      revokedBy: req.user?._id || null,
      reason,
    });

    if (!session) return res.status(404).json({ message: 'Сессия не найдена' });

    await writeAuthEvent({
      user: session.user_id,
      eventType: 'session_revoked',
      result: 'success',
      reason,
      req,
      sessionId: session.session_id,
      meta: { revokedBy: req.user?._id || null },
    });

    const auditId = await logCmsAudit(
      req,
      'cms.sessions.revoke',
      'UserSession',
      session.session_id,
      null,
      session,
      { operationId, reason },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Сессия завершена',
      data: { session },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function revokeAllSessions(req, res) {
  try {
    const operationId = buildOperationId();
    const userId = req.params.id;
    const reason = normalizeText(req.body?.reason || 'revoke_all_by_admin', 300);
    const revokedCount = await revokeAllUserSessions({
      userId,
      revokedBy: req.user?._id || null,
      reason,
    });

    await writeAuthEvent({
      user: userId,
      eventType: 'session_revoked',
      result: 'success',
      reason,
      req,
      sessionId: '',
      meta: { mode: 'all', revokedCount },
    });

    const auditId = await logCmsAudit(
      req,
      'cms.sessions.revoke_all',
      'User',
      userId,
      null,
      { revokedCount },
      { operationId, reason },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Все сессии пользователя завершены',
      data: { revokedCount },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

module.exports = {
  blockIpRule,
  getAuthEvents,
  getIpRules,
  getUserSessions,
  revokeAllSessions,
  revokeUserSession,
  unblockIpRule,
};
