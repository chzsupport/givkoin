const { invalidateModerationRulesCache } = require('../../services/moderationFilterService');
const {
  buildOperationId,
  deleteModelDocs,
  getModelDocById,
  getUsersByIds,
  insertModelDoc,
  listModelDocs,
  logCmsAudit,
  mutationResponse,
  normalizeText,
  parsePagination,
  toId,
  updateModelDoc,
} = require('./shared');

async function listModerationRules(req, res) {
  try {
    const query = {};
    if (req.query.isEnabled !== undefined) query.isEnabled = String(req.query.isEnabled) === 'true';
    if (req.query.type) query.type = String(req.query.type);

    const all = await listModelDocs('ModerationRule', { pageSize: 2000 });
    const rules = (Array.isArray(all) ? all : [])
      .filter((row) => {
        if (query.isEnabled !== undefined && Boolean(row?.isEnabled) !== Boolean(query.isEnabled)) return false;
        if (query.type && String(row?.type || '') !== String(query.type)) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 1000);
    return res.json({ rules });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
}

async function createModerationRule(req, res) {
  try {
    const operationId = buildOperationId();
    const payload = req.body || {};
    const rule = await insertModelDoc('ModerationRule', {
      name: normalizeText(payload.name, 200),
      description: normalizeText(payload.description, 500),
      type: payload.type,
      pattern: normalizeText(payload.pattern, 1000),
      action: payload.action || 'flag',
      scopes: Array.isArray(payload.scopes) && payload.scopes.length ? payload.scopes : ['all'],
      flagOnly: Boolean(payload.flagOnly),
      isEnabled: payload.isEnabled !== undefined ? Boolean(payload.isEnabled) : true,
      isException: Boolean(payload.isException),
      createdBy: req.user?._id || null,
      updatedBy: req.user?._id || null,
    });
    if (!rule) return res.status(500).json({ message: 'Не удалось создать правило' });
    invalidateModerationRulesCache();

    const auditId = await logCmsAudit(
      req,
      'cms.moderation.rule.create',
      'ModerationRule',
      rule._id,
      null,
      rule,
      { operationId }
    );

    return res.status(201).json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Правило создано',
      data: { rule },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function patchModerationRule(req, res) {
  try {
    const operationId = buildOperationId();
    const { id } = req.params;
    const rule = await getModelDocById('ModerationRule', id);
    if (!rule) return res.status(404).json({ message: 'Правило не найдено' });

    const before = { ...rule };
    const payload = req.body || {};

    const patch = {};
    if (payload.name !== undefined) patch.name = normalizeText(payload.name, 200);
    if (payload.description !== undefined) patch.description = normalizeText(payload.description, 500);
    if (payload.pattern !== undefined) patch.pattern = normalizeText(payload.pattern, 1000);
    if (payload.type !== undefined) patch.type = payload.type;
    if (payload.action !== undefined) patch.action = payload.action;
    if (payload.scopes !== undefined) {
      patch.scopes = Array.isArray(payload.scopes) && payload.scopes.length ? payload.scopes : ['all'];
    }
    if (payload.flagOnly !== undefined) patch.flagOnly = Boolean(payload.flagOnly);
    if (payload.isEnabled !== undefined) patch.isEnabled = Boolean(payload.isEnabled);
    if (payload.isException !== undefined) patch.isException = Boolean(payload.isException);
    patch.updatedBy = req.user?._id || null;

    const saved = await updateModelDoc('ModerationRule', id, patch);
    if (!saved) return res.status(500).json({ message: 'Не удалось обновить правило' });
    invalidateModerationRulesCache();

    const auditId = await logCmsAudit(
      req,
      'cms.moderation.rule.update',
      'ModerationRule',
      id,
      before,
      saved,
      { operationId }
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Правило обновлено',
      data: { rule: saved },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function deleteModerationRule(req, res) {
  try {
    const operationId = buildOperationId();
    const { id } = req.params;
    const rule = await getModelDocById('ModerationRule', id);
    if (!rule) return res.status(404).json({ message: 'Правило не найдено' });

    const before = { ...rule };
    await deleteModelDocs('ModerationRule', [id]);
    invalidateModerationRulesCache();

    const auditId = await logCmsAudit(
      req,
      'cms.moderation.rule.delete',
      'ModerationRule',
      id,
      before,
      null,
      { operationId },
      'high'
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Правило удалено',
      data: { id },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function listModerationHits(req, res) {
  try {
    const { page, limit, skip } = parsePagination(req.query, { page: 1, limit: 50 });
    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.scope) query.scope = req.query.scope;
    if (req.query.ruleType) query.ruleType = req.query.ruleType;
    if (req.query.user) query.user = req.query.user;

    const all = await listModelDocs('ModerationHit', { pageSize: 2000 });
    const filtered = (Array.isArray(all) ? all : [])
      .filter((row) => {
        if (query.status && String(row?.status || '') !== String(query.status)) return false;
        if (query.scope && String(row?.scope || '') !== String(query.scope)) return false;
        if (query.ruleType && String(row?.ruleType || '') !== String(query.ruleType)) return false;
        if (query.user && String(toId(row?.user) || '') !== String(query.user)) return false;
        return true;
      })
      .sort((a, b) => {
        const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      });

    const total = filtered.length;
    const safeHits = filtered.slice(skip, skip + limit);

    const ruleIds = Array.from(new Set(safeHits.map((h) => toId(h?.rule)).filter(Boolean)));
    const rulesById = new Map();
    if (ruleIds.length) {
      const ruleDocs = await Promise.all(ruleIds.map((rid) => getModelDocById('ModerationRule', rid)));
      ruleDocs.filter(Boolean).forEach((r) => {
        rulesById.set(String(r._id), {
          _id: r._id,
          name: r.name,
          type: r.type,
          action: r.action,
        });
      });
    }

    const userIds = Array.from(new Set(safeHits.flatMap((h) => [toId(h?.user), toId(h?.resolvedBy)]).filter(Boolean)));
    const userMap = await getUsersByIds(userIds);
    const enrichedHits = safeHits.map((h) => {
      const rule = (() => {
        const id = toId(h?.rule);
        return id ? rulesById.get(String(id)) || null : null;
      })();
      const user = (() => {
        const id = toId(h?.user);
        const u = id ? userMap.get(id) : null;
        return u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : null;
      })();
      const resolvedBy = (() => {
        const id = toId(h?.resolvedBy);
        const u = id ? userMap.get(id) : null;
        return u ? { _id: u.id, email: u.email, nickname: u.nickname, status: u.status } : null;
      })();
      return { ...h, rule, user, resolvedBy };
    });

    return res.json({
      hits: enrichedHits,
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

async function resolveModerationHit(req, res) {
  try {
    const operationId = buildOperationId();
    const { id } = req.params;
    const { status = 'resolved', note = '' } = req.body || {};
    const hit = await getModelDocById('ModerationHit', id);
    if (!hit) return res.status(404).json({ message: 'Срабатывание не найдено' });

    const before = { ...hit };
    const patch = {
      status: status === 'false_positive' ? 'false_positive' : 'resolved',
      resolvedBy: req.user?._id || null,
      resolvedAt: new Date(),
      resolutionNote: normalizeText(note, 500),
    };
    const saved = await updateModelDoc('ModerationHit', id, patch);
    if (!saved) return res.status(500).json({ message: 'Не удалось обновить срабатывание' });

    const auditId = await logCmsAudit(
      req,
      'cms.moderation.hit.resolve',
      'ModerationHit',
      id,
      before,
      saved,
      { operationId }
    );

    return res.json(mutationResponse({
      operationId,
      status: 'executed',
      auditId,
      message: 'Срабатывание обработано',
      data: { hit: saved },
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

module.exports = {
  createModerationRule,
  deleteModerationRule,
  listModerationHits,
  listModerationRules,
  patchModerationRule,
  resolveModerationHit,
};
