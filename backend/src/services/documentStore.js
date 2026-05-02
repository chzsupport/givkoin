const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
const docCacheById = new Map();
const modelDocIds = new Map();

function toIso(value = new Date()) {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function cloneData(value) {
  if (value && typeof value === 'object') {
    return JSON.parse(JSON.stringify(value));
  }
  return value || {};
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

function buildCachedDoc(id, model, data = {}, createdAt = null, updatedAt = null) {
  return {
    _id: String(id),
    ...cloneData(data),
    createdAt: createdAt || null,
    updatedAt: updatedAt || null,
  };
}

function cloneCachedDoc(doc) {
  if (!doc) return null;
  return {
    ...cloneData(doc),
    _id: String(doc._id || ''),
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

function cacheDoc(model, doc) {
  const safeModel = String(model || '').trim();
  const safeId = String(doc?._id || '').trim();
  if (!safeModel || !safeId) return null;
  const cached = cloneCachedDoc(doc);
  docCacheById.set(safeId, { model: safeModel, doc: cached });
  const ids = modelDocIds.get(safeModel) || new Set();
  ids.add(safeId);
  modelDocIds.set(safeModel, ids);
  return cloneCachedDoc(cached);
}

function removeCachedDoc(id, model = '') {
  const safeId = String(id || '').trim();
  if (!safeId) return;
  const entry = docCacheById.get(safeId);
  docCacheById.delete(safeId);
  const safeModel = String(model || entry?.model || '').trim();
  if (!safeModel) return;
  const ids = modelDocIds.get(safeModel);
  if (!ids) return;
  ids.delete(safeId);
  if (!ids.size) {
    modelDocIds.delete(safeModel);
  }
}

function getCachedDoc(id) {
  const entry = docCacheById.get(String(id || '').trim());
  return entry ? cloneCachedDoc(entry.doc) : null;
}

function listCachedDocsByModel(model, { limit = 1000 } = {}) {
  const safeModel = String(model || '').trim();
  if (!safeModel) return [];
  const ids = modelDocIds.get(safeModel);
  if (!ids || !ids.size) return [];
  return Array.from(ids)
    .map((id) => docCacheById.get(id))
    .filter((entry) => entry?.model === safeModel && entry.doc)
    .map((entry) => cloneCachedDoc(entry.doc))
    .slice(0, Math.max(1, Math.min(5000, Number(limit) || 1000)));
}

function warnDocStore(action, error) {
  const message = error?.message || String(error || 'unknown error');
  console.warn(`[documentStore] ${action}: ${message}`);
}

async function getDocById(id) {
  if (!id) return null;
  const cached = getCachedDoc(id);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,model,data,created_at,updated_at')
    .eq('id', String(id))
    .maybeSingle();
  if (error || !data) {
    if (error) warnDocStore(`getDocById(${id})`, error);
    return cached || null;
  }
  const doc = mapDocRow(data);
  return cacheDoc(data.model, doc);
}

async function listDocsByModel(model, { limit = 1000 } = {}) {
  if (!model) return [];
  const supabase = getSupabaseClient();
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 1000));
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,model,data,created_at,updated_at')
    .eq('model', String(model))
    .limit(safeLimit);
  if (error || !Array.isArray(data)) {
    if (error) warnDocStore(`listDocsByModel(${model})`, error);
    return listCachedDocsByModel(model, { limit: safeLimit });
  }
  return data
    .map((row) => cacheDoc(row.model, mapDocRow(row)))
    .filter(Boolean);
}

async function insertDoc({ id, model, data = {}, createdAt = new Date(), updatedAt = createdAt }) {
  if (!id || !model) {
    throw new Error('insertDoc requires id and model');
  }
  const safeId = String(id);
  const safeModel = String(model);
  const existingCached = docCacheById.get(safeId);
  if (existingCached && existingCached.model === safeModel) {
    const duplicateError = new Error(`duplicate cached document ${safeModel}/${safeId}`);
    duplicateError.code = '23505';
    throw duplicateError;
  }
  const cachedDoc = cacheDoc(safeModel, buildCachedDoc(safeId, safeModel, data, toIso(createdAt), toIso(updatedAt)));
  const supabase = getSupabaseClient();
  const payload = {
    id: safeId,
    model: safeModel,
    data,
    created_at: toIso(createdAt),
    updated_at: toIso(updatedAt),
  };
  const { data: inserted, error } = await supabase
    .from(DOC_TABLE)
    .insert(payload)
    .select('id,model,data,created_at,updated_at')
    .maybeSingle();
  if (error) {
    warnDocStore(`insertDoc(${safeModel}/${safeId})`, error);
    return cachedDoc;
  }
  return cacheDoc(inserted.model, mapDocRow(inserted));
}

async function updateDoc(id, data, { updatedAt = new Date() } = {}) {
  if (!id) throw new Error('updateDoc requires id');
  const safeId = String(id);
  const existingCached = docCacheById.get(safeId);
  const supabase = getSupabaseClient();
  const { data: updated, error } = await supabase
    .from(DOC_TABLE)
    .update({
      data,
      updated_at: toIso(updatedAt),
    })
    .eq('id', safeId)
    .select('id,model,data,created_at,updated_at')
    .maybeSingle();
  if (error || !updated) {
    if (existingCached?.doc) {
      const fallback = cacheDoc(existingCached.model, {
        ...existingCached.doc,
        ...cloneData(data),
        _id: safeId,
        updatedAt: toIso(updatedAt),
      });
      if (error) warnDocStore(`updateDoc(${safeId})`, error);
      return fallback;
    }
    if (error) throw error;
    return null;
  }
  return cacheDoc(updated.model, mapDocRow(updated));
}

async function upsertDoc({ id, model, data = {}, createdAt = new Date(), updatedAt = new Date() } = {}) {
  if (!id || !model) {
    throw new Error('upsertDoc requires id and model');
  }
  const safeId = String(id);
  const safeModel = String(model);
  const existingCached = docCacheById.get(safeId);
  const cachedDoc = cacheDoc(safeModel, {
    ...(existingCached?.doc || {}),
    ...cloneData(data),
    _id: safeId,
    createdAt: existingCached?.doc?.createdAt || toIso(createdAt),
    updatedAt: toIso(updatedAt),
  });
  const supabase = getSupabaseClient();
  const payload = {
    id: safeId,
    model: safeModel,
    data,
    created_at: toIso(createdAt),
    updated_at: toIso(updatedAt),
  };

  const { data: upserted, error } = await supabase
    .from(DOC_TABLE)
    .upsert(payload, { onConflict: 'model,id' })
    .select('id,model,data,created_at,updated_at')
    .maybeSingle();
  if (error || !upserted) {
    if (error) warnDocStore(`upsertDoc(${safeModel}/${safeId})`, error);
    return cachedDoc;
  }
  return cacheDoc(upserted.model, mapDocRow(upserted));
}

async function deleteDoc(id) {
  if (!id) return;
  removeCachedDoc(id);
  const supabase = getSupabaseClient();
  const { error } = await supabase.from(DOC_TABLE).delete().eq('id', String(id));
  if (error) {
    warnDocStore(`deleteDoc(${id})`, error);
  }
}

module.exports = {
  DOC_TABLE,
  deleteDoc,
  getDocById,
  insertDoc,
  listDocsByModel,
  mapDocRow,
  toIso,
  updateDoc,
  upsertDoc,
};
