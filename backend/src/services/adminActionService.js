const crypto = require('crypto');
const { insertDoc } = require('./documentStore');

function buildDocId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}

function normalizeDoc(doc) {
  if (!doc) return null;
  return {
    ...doc,
    createdAt: doc.createdAt ? new Date(doc.createdAt) : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : null,
  };
}

async function insertModelDoc(model, payload) {
  const id = payload && (payload._id || payload.id) ? String(payload._id || payload.id) : buildDocId(String(model));
  const doc = payload && typeof payload === 'object' ? { ...payload } : {};
  delete doc._id;
  delete doc.id;

  try {
    return normalizeDoc(await insertDoc({ id, model: String(model), data: doc }));
  } catch (_error) {
    return null;
  }
}

function safeClone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function safeEntityId(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }
  if (typeof value === 'object') {
    if (value._id !== undefined) return safeEntityId(value._id);
    if (value.id !== undefined) return safeEntityId(value.id);
    if (typeof value.toString === 'function') {
      const s = value.toString();
      if (s && s !== '[object Object]') return s;
    }
  }
  return null;
}

function extractIp(req) {
  if (!req) return null;
  const forwarded = req.headers?.['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.ip || null;
}

function extractUserAgent(req) {
  if (!req) return null;
  if (typeof req.get === 'function') return req.get('user-agent');
  return req.headers?.['user-agent'] || null;
}

function getActorId(req, explicitActorId = null) {
  if (explicitActorId) return explicitActorId;
  return req?.user?._id || null;
}

async function logAdminAction({
  req,
  actorId,
  actionType,
  entityType = null,
  entityId = null,
  before = null,
  after = null,
  meta = null,
  source = 'admin',
  severity = 'normal',
  requestId = null,
}) {
  const actor = getActorId(req, actorId);
  if (!actor || !actionType) return null;

  const ip = extractIp(req);
  const userAgent = extractUserAgent(req);

  let auditDoc = null;
  let actionLogDoc = null;

  try {
    auditDoc = await insertModelDoc('AdminAudit', {
      user: actor,
      action: String(actionType),
      meta: safeClone(meta),
      ip,
      userAgent,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('AdminAudit write failed', err);
  }

  try {
    actionLogDoc = await insertModelDoc('AdminActionLog', {
      actor,
      actionType: String(actionType),
      entityType: entityType ? String(entityType) : null,
      entityId: safeEntityId(entityId),
      before: safeClone(before),
      after: safeClone(after),
      meta: safeClone(meta),
      ip,
      userAgent,
      requestId: requestId || req?.headers?.['x-request-id'] || null,
      source,
      severity,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('AdminActionLog write failed', err);
  }

  return {
    auditId: auditDoc?._id || null,
    actionLogId: actionLogDoc?._id || null,
    auditDoc,
    actionLogDoc,
  };
}

module.exports = {
  logAdminAction,
};
