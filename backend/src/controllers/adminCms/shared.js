const crypto = require('crypto');
const { getSupabaseClient } = require('../../lib/supabaseClient');
const { logAdminAction } = require('../../services/adminActionService');
const {
  deleteDocsByModel,
  getDocByModelAndId,
  insertDoc,
  listAllDocsByModel,
  updateDocByModel,
} = require('../../services/documentStore');

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function normalizeText(value, maxLen = 5000) {
  return String(value || '').trim().slice(0, maxLen);
}

function hasPopulatedUser(user) {
  return Boolean(
    user
      && typeof user === 'object'
      && (
        user._id
        || user.id
        || user.email
        || user.nickname
      )
  );
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildOperationId() {
  return `cms_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}

function mutationResponse({
  operationId = null,
  status = 'executed',
  auditId = null,
  message = '',
  data = null,
  requiresApproval = false,
}) {
  return {
    operationId,
    status,
    requiresApproval,
    auditId,
    message,
    ...(data !== null && data !== undefined ? { data } : {}),
  };
}

function parsePagination(query = {}, defaults = {}) {
  const page = Math.max(1, toNumber(query.page, defaults.page || 1));
  const limit = Math.max(1, Math.min(200, toNumber(query.limit, defaults.limit || 20)));
  return { page, limit, skip: (page - 1) * limit };
}

function keywordArray(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function csvEscape(value) {
  const text = String(value ?? '');
  if (/[,"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(headers, rows) {
  const head = headers.map((h) => csvEscape(h.label)).join(',');
  const lines = rows.map((row) => headers.map((h) => csvEscape(row[h.key])).join(','));
  return [head, ...lines].join('\n');
}

function toId(value, depth = 0) {
  if (depth > 3) return '';
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'object') {
    if (value._id != null) return toId(value._id, depth + 1);
    if (value.id != null) return toId(value.id, depth + 1);
    if (value.value != null) return toId(value.value, depth + 1);
    if (typeof value.toString === 'function') {
      const s = value.toString();
      if (s && s !== '[object Object]') return s;
    }
  }
  return '';
}

function stripStoredDocFields(doc) {
  const next = doc && typeof doc === 'object' ? { ...doc } : {};
  delete next._id;
  delete next.id;
  delete next.createdAt;
  delete next.updatedAt;
  return next;
}

function getRiskCaseSource(row) {
  if (!row || typeof row !== 'object') return '';
  const meta = row.meta && typeof row.meta === 'object' ? row.meta : {};
  return String(meta.source || '').trim();
}

function isMultiAccountRiskCase(row) {
  return getRiskCaseSource(row) === 'multi_account';
}

async function listModelDocs(model, { pageSize = 1000 } = {}) {
  return listAllDocsByModel(model, { pageSize });
}

async function getModelDocById(model, id) {
  return getDocByModelAndId(model, id);
}

async function insertModelDoc(model, payload) {
  const id = payload && (payload._id || payload.id)
    ? String(payload._id || payload.id)
    : `${String(model)}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;

  const doc = payload && typeof payload === 'object' ? { ...payload } : {};
  delete doc._id;
  delete doc.id;

  return insertDoc({ id, model: String(model), data: doc }).catch(() => null);
}

async function updateModelDoc(model, id, patch) {
  const existing = await getModelDocById(model, id);
  if (!existing) return null;
  const next = { ...stripStoredDocFields(existing), ...(patch && typeof patch === 'object' ? patch : {}) };
  return updateDocByModel(model, id, next).catch(() => null);
}

async function deleteModelDocs(model, ids) {
  await deleteDocsByModel(model, ids);
}

async function getUsersByIds(ids) {
  const list = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean)));
  const map = new Map();
  if (!list.length) return map;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,status,last_online_at,created_at')
    .in('id', list);
  if (!error && Array.isArray(data)) {
    data.forEach((row) => map.set(String(row.id), row));
  }
  return map;
}

async function sendCsvResponse(res, { headers, rows, mapRow, fileName }) {
  const safeHeaders = Array.isArray(headers) ? headers : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const rowMapper = typeof mapRow === 'function' ? mapRow : ((row) => row || {});

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  res.write(`${safeHeaders.map((h) => csvEscape(h.label)).join(',')}\n`);

  for (const sourceRow of safeRows) {
    const row = rowMapper(sourceRow) || {};
    const line = `${safeHeaders.map((h) => csvEscape(row[h.key])).join(',')}\n`;
    if (!res.write(line)) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => res.once('drain', resolve));
    }
  }

  res.end();
}

async function logCmsAudit(req, actionType, entityType, entityId, before, after, meta, severity = 'normal') {
  const audit = await logAdminAction({
    req,
    actionType,
    entityType,
    entityId,
    before,
    after,
    meta,
    severity,
    source: 'admin_cms',
  });
  return audit?.actionLogId || audit?.auditId || null;
}

function getPeriodWindow(period = 'day', offset = 0) {
  const now = new Date();
  const safePeriod = ['day', 'week', 'month'].includes(period) ? period : 'day';

  let durationMs = 24 * 60 * 60 * 1000;
  if (safePeriod === 'week') durationMs = 7 * durationMs;
  if (safePeriod === 'month') durationMs = 30 * durationMs;

  const end = new Date(now.getTime() - offset * durationMs);
  const start = new Date(end.getTime() - durationMs);
  return { start, end, durationMs, period: safePeriod };
}

function withDateRange(query, start, end) {
  const out = { ...(query || {}) };
  out.createdAt = { $gte: start, $lt: end };
  return out;
}

function pickContentPreview(content) {
  if (typeof content === 'string') return content.slice(0, 120);
  try {
    return JSON.stringify(content).slice(0, 120);
  } catch (_err) {
    return '';
  }
}

module.exports = {
  buildOperationId,
  deleteModelDocs,
  escapeHtml,
  getModelDocById,
  getPeriodWindow,
  getUsersByIds,
  hasPopulatedUser,
  insertModelDoc,
  isMultiAccountRiskCase,
  keywordArray,
  listModelDocs,
  logCmsAudit,
  mutationResponse,
  normalizeText,
  parsePagination,
  pickContentPreview,
  sendCsvResponse,
  stripStoredDocFields,
  toCsv,
  toDate,
  toId,
  toNumber,
  updateModelDoc,
  withDateRange,
};
