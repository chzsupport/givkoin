const crypto = require('crypto');
const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

function buildDocId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}

function mapDocRow(row) {
  if (!row) return null;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return {
    ...data,
    _id: String(row.id),
    createdAt: row.created_at ? new Date(row.created_at) : (data.createdAt || null),
    updatedAt: row.updated_at ? new Date(row.updated_at) : (data.updatedAt || null),
  };
}

async function insertModelDoc(model, payload) {
  const supabase = getSupabaseClient();
  const id = payload && (payload._id || payload.id) ? String(payload._id || payload.id) : buildDocId(String(model));
  const doc = payload && typeof payload === 'object' ? { ...payload } : {};
  delete doc._id;
  delete doc.id;

  const { data, error } = await supabase
    .from(DOC_TABLE)
    .insert({ id, model: String(model), data: doc })
    .select('id,data,created_at,updated_at')
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
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
