const { logAdminAction } = require('../services/adminActionService');

function isRequestLike(value) {
  return Boolean(value && typeof value === 'object' && (value.user || value.headers || value.ip !== undefined));
}

function extractEntityId(meta = {}) {
  if (!meta || typeof meta !== 'object') return null;
  if (meta.targetId !== undefined) return meta.targetId;
  if (meta.entityId !== undefined) return meta.entityId;
  if (meta.id !== undefined) return meta.id;
  if (meta.appealId !== undefined) return meta.appealId;
  if (meta.battleId !== undefined) return meta.battleId;
  if (meta.feedbackId !== undefined) return meta.feedbackId;
  return null;
}

async function adminAudit(arg1, arg2, arg3, arg4) {
  try {
    // New format: adminAudit(actionType, req, meta)
    if (typeof arg1 === 'string' && isRequestLike(arg2)) {
      const actionType = arg1;
      const req = arg2;
      const meta = arg3 && typeof arg3 === 'object' ? arg3 : {};
      return await logAdminAction({
        req,
        actionType,
        entityType: 'admin',
        entityId: extractEntityId(meta),
        meta,
      });
    }

    // Legacy format: adminAudit(actorId, actionType, entityType, meta)
    const actorId = arg1 || null;
    const actionType = arg2;
    const entityType = arg3 || 'admin';
    const meta = arg4 && typeof arg4 === 'object' ? arg4 : {};
    if (!actionType) return null;
    return await logAdminAction({
      actorId,
      actionType,
      entityType,
      entityId: extractEntityId(meta),
      meta,
      source: 'admin_legacy',
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('adminAudit error', e);
    return null;
  }
}

module.exports = { adminAudit };
