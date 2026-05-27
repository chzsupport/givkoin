const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

function toIso(value = new Date()) {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function mapDocRow(row) {
  if (!row) return null;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return {
    _id: String(row.id),
    ...data,
    createdAt: row.created_at || data.createdAt || null,
    updatedAt: row.updated_at || data.updatedAt || null,
  };
}

async function getDocById(id) {
  if (!id) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,model,data,created_at,updated_at')
    .eq('id', String(id))
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

async function getDocByModelAndId(model, id) {
  if (!model || !id) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,model,data,created_at,updated_at')
    .eq('model', String(model))
    .eq('id', String(id))
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

async function listDocsByModel(
  model,
  {
    limit = 1000,
    offset = 0,
    orderBy = '',
    ascending = true,
    nullsFirst = undefined,
    ids = [],
    dataEq = {},
    dataIn = {},
    dataIlike = {},
    dataGte = {},
    dataLt = {},
    dataLte = {},
    columnGte = {},
    columnLt = {},
    columnLte = {},
  } = {}
) {
  if (!model) return [];
  const supabase = getSupabaseClient();
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 1000));
  const safeOffset = Math.max(0, Number(offset) || 0);
  let query = supabase
    .from(DOC_TABLE)
    .select('id,model,data,created_at,updated_at')
    .eq('model', String(model));

  const safeIds = Array.isArray(ids)
    ? ids.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  if (safeIds.length) {
    query = query.in('id', safeIds);
  }

  for (const [key, value] of Object.entries(dataEq || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.eq(`data->>${key}`, String(value));
  }

  for (const [key, values] of Object.entries(dataIn || {})) {
    const list = Array.isArray(values)
      ? values.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    if (!key || list.length === 0) continue;
    query = query.in(`data->>${key}`, list);
  }

  for (const [key, value] of Object.entries(dataIlike || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.ilike(`data->>${key}`, String(value));
  }

  for (const [key, value] of Object.entries(dataGte || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.gte(`data->>${key}`, String(value));
  }

  for (const [key, value] of Object.entries(dataLt || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.lt(`data->>${key}`, String(value));
  }

  for (const [key, value] of Object.entries(dataLte || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.lte(`data->>${key}`, String(value));
  }

  for (const [key, value] of Object.entries(columnGte || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.gte(String(key), String(value));
  }

  for (const [key, value] of Object.entries(columnLt || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.lt(String(key), String(value));
  }

  for (const [key, value] of Object.entries(columnLte || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.lte(String(key), String(value));
  }

  if (orderBy) {
    const options = { ascending: Boolean(ascending) };
    if (nullsFirst !== undefined) options.nullsFirst = Boolean(nullsFirst);
    query = query.order(String(orderBy), options);
  }

  const { data, error } = await query.range(safeOffset, safeOffset + safeLimit - 1);
  if (error || !Array.isArray(data)) return [];
  return data.map(mapDocRow).filter(Boolean);
}

async function listDocsByModelBeforeCursor(
  model,
  {
    limit = 100,
    dataEq = {},
    cursorCreatedAt = '',
    cursorId = '',
    orderBy = 'created_at',
  } = {}
) {
  if (!model) return [];
  const supabase = getSupabaseClient();
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 100));
  let query = supabase
    .from(DOC_TABLE)
    .select('id,model,data,created_at,updated_at')
    .eq('model', String(model));

  for (const [key, value] of Object.entries(dataEq || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.eq(`data->>${key}`, String(value));
  }

  const safeCursorCreatedAt = String(cursorCreatedAt || '').trim();
  const safeCursorId = String(cursorId || '').trim();
  if (safeCursorCreatedAt && safeCursorId) {
    query = query.or(`created_at.lt.${safeCursorCreatedAt},and(created_at.eq.${safeCursorCreatedAt},id.lt.${safeCursorId})`);
  }

  const { data, error } = await query
    .order(String(orderBy || 'created_at'), { ascending: false })
    .order('id', { ascending: false })
    .range(0, safeLimit - 1);
  if (error || !Array.isArray(data)) return [];
  return data.map(mapDocRow).filter(Boolean);
}

async function countDocsByModel(
  model,
  {
    dataEq = {},
    dataIn = {},
    dataIlike = {},
    dataGte = {},
    dataLt = {},
    dataLte = {},
    columnGte = {},
    columnLt = {},
    columnLte = {},
  } = {}
) {
  if (!model) return 0;
  const supabase = getSupabaseClient();
  let query = supabase
    .from(DOC_TABLE)
    .select('id', { head: true, count: 'exact' })
    .eq('model', String(model));

  for (const [key, value] of Object.entries(dataEq || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.eq(`data->>${key}`, String(value));
  }

  for (const [key, values] of Object.entries(dataIn || {})) {
    const list = Array.isArray(values)
      ? values.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    if (!key || list.length === 0) continue;
    query = query.in(`data->>${key}`, list);
  }

  for (const [key, value] of Object.entries(dataIlike || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.ilike(`data->>${key}`, String(value));
  }

  for (const [key, value] of Object.entries(dataGte || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.gte(`data->>${key}`, String(value));
  }

  for (const [key, value] of Object.entries(dataLt || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.lt(`data->>${key}`, String(value));
  }

  for (const [key, value] of Object.entries(dataLte || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.lte(`data->>${key}`, String(value));
  }

  for (const [key, value] of Object.entries(columnGte || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.gte(String(key), String(value));
  }

  for (const [key, value] of Object.entries(columnLt || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.lt(String(key), String(value));
  }

  for (const [key, value] of Object.entries(columnLte || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.lte(String(key), String(value));
  }

  const { count, error } = await query;
  if (error) return 0;
  return Math.max(0, Number(count) || 0);
}

async function listAllDocsByModel(model, { pageSize = 1000 } = {}) {
  if (!model) return [];
  const supabase = getSupabaseClient();
  const out = [];
  let from = 0;
  const size = Math.max(1, Math.min(2000, Number(pageSize) || 1000));

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .select('id,model,data,created_at,updated_at')
      .eq('model', String(model))
      .range(from, from + size - 1);

    if (error || !Array.isArray(data) || data.length === 0) break;
    out.push(...data.map(mapDocRow).filter(Boolean));
    if (data.length < size) break;
    from += size;
  }

  return out;
}

async function insertDoc({ id, model, data = {}, createdAt = new Date(), updatedAt = createdAt }) {
  if (!id || !model) {
    throw new Error('insertDoc requires id and model');
  }
  const supabase = getSupabaseClient();
  const payload = {
    id: String(id),
    model: String(model),
    data,
    created_at: toIso(createdAt),
    updated_at: toIso(updatedAt),
  };
  const { data: inserted, error } = await supabase
    .from(DOC_TABLE)
    .insert(payload)
    .select('id,model,data,created_at,updated_at')
    .maybeSingle();
  if (error) throw error;
  return mapDocRow(inserted);
}

async function updateDoc(id, data, { updatedAt = new Date() } = {}) {
  if (!id) throw new Error('updateDoc requires id');
  const supabase = getSupabaseClient();
  const { data: updated, error } = await supabase
    .from(DOC_TABLE)
    .update({
      data,
      updated_at: toIso(updatedAt),
    })
    .eq('id', String(id))
    .select('id,model,data,created_at,updated_at')
    .maybeSingle();
  if (error) throw error;
  return mapDocRow(updated);
}

async function updateDocByModel(model, id, data, { updatedAt = new Date() } = {}) {
  if (!model || !id) throw new Error('updateDocByModel requires model and id');
  const supabase = getSupabaseClient();
  const { data: updated, error } = await supabase
    .from(DOC_TABLE)
    .update({
      data,
      updated_at: toIso(updatedAt),
    })
    .eq('model', String(model))
    .eq('id', String(id))
    .select('id,model,data,created_at,updated_at')
    .maybeSingle();
  if (error) throw error;
  return mapDocRow(updated);
}

async function updateDocByModelIfDataEq(model, id, data, dataEq = {}, { updatedAt = new Date() } = {}) {
  if (!model || !id) throw new Error('updateDocByModelIfDataEq requires model and id');
  const supabase = getSupabaseClient();
  let query = supabase
    .from(DOC_TABLE)
    .update({
      data,
      updated_at: toIso(updatedAt),
    })
    .eq('model', String(model))
    .eq('id', String(id));

  for (const [key, value] of Object.entries(dataEq || {})) {
    if (!key || value === undefined || value === null) continue;
    query = query.eq(`data->>${key}`, String(value));
  }

  const { data: updated, error } = await query
    .select('id,model,data,created_at,updated_at')
    .maybeSingle();
  if (error) throw error;
  return mapDocRow(updated);
}

async function upsertDoc({ id, model, data = {}, createdAt = new Date(), updatedAt = new Date() } = {}) {
  if (!id || !model) {
    throw new Error('upsertDoc requires id and model');
  }
  const supabase = getSupabaseClient();
  const payload = {
    id: String(id),
    model: String(model),
    data,
    updated_at: toIso(updatedAt),
  };

  const { data: upserted, error } = await supabase
    .from(DOC_TABLE)
    .upsert(payload, { onConflict: 'model,id' })
    .select('id,model,data,created_at,updated_at')
    .maybeSingle();
  if (error) throw error;
  return mapDocRow(upserted);
}

async function deleteDoc(id) {
  if (!id) return;
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(DOC_TABLE).delete().eq('id', String(id));
  if (error) throw error;
}

async function deleteDocsByModel(model, ids = []) {
  const safeIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!model || !safeIds.length) return 0;
  const supabase = getSupabaseClient();
  let deleted = 0;

  for (let index = 0; index < safeIds.length; index += 200) {
    const chunk = safeIds.slice(index, index + 200);
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .delete()
      .eq('model', String(model))
      .in('id', chunk)
      .select('id');
    if (error) throw error;
    deleted += Array.isArray(data) ? data.length : 0;
  }

  return deleted;
}

async function deleteDocsByModelWhereDataEq(model, dataEq = {}) {
  if (!model) return 0;
  const entries = Object.entries(dataEq || {}).filter(([, value]) => value !== undefined && value !== null);
  if (!entries.length) return 0;
  const supabase = getSupabaseClient();
  let query = supabase
    .from(DOC_TABLE)
    .delete()
    .eq('model', String(model));

  for (const [key, value] of entries) {
    if (!key) continue;
    query = query.eq(`data->>${key}`, String(value));
  }

  const { data, error } = await query.select('id');
  if (error) throw error;
  return Array.isArray(data) ? data.length : 0;
}

module.exports = {
  DOC_TABLE,
  countDocsByModel,
  deleteDoc,
  deleteDocsByModel,
  deleteDocsByModelWhereDataEq,
  getDocById,
  getDocByModelAndId,
  insertDoc,
  listAllDocsByModel,
  listDocsByModelBeforeCursor,
  listDocsByModel,
  mapDocRow,
  toIso,
  updateDoc,
  updateDocByModel,
  updateDocByModelIfDataEq,
  upsertDoc,
};
