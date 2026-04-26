const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

function extractRequestId(req) {
  return String(req?.headers?.['x-request-id'] || '').trim();
}

function extractIp(req) {
  return (req?.headers?.['x-forwarded-for'] || req?.ip || '').toString().split(',')[0].trim();
}

async function insertSystemErrorEvent(doc) {
  const supabase = getSupabaseClient();
  const id = `see_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const nowIso = new Date().toISOString();
  await supabase.from(DOC_TABLE).insert({
    model: 'SystemErrorEvent',
    id,
    data: doc,
    created_at: nowIso,
    updated_at: nowIso,
  });
  return { ...doc, _id: id };
}

async function logSystemErrorEvent({
  req,
  eventType = 'server_error',
  statusCode = 500,
  message = '',
  stack = '',
  meta = null,
}) {
  try {
    return await insertSystemErrorEvent({
      eventType,
      statusCode,
      method: String(req?.method || ''),
      path: String(req?.originalUrl || req?.url || ''),
      requestId: extractRequestId(req),
      ip: extractIp(req),
      userAgent: String(req?.headers?.['user-agent'] || ''),
      user: req?.user?._id || null,
      message: String(message || '').slice(0, 500),
      stack: String(stack || '').slice(0, 8000),
      meta: meta || null,
    });
  } catch (_error) {
    return null;
  }
}

module.exports = {
  logSystemErrorEvent,
};
