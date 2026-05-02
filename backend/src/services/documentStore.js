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

async function listDocsByModel(model, { limit = 1000 } = {}) {
  if (!model) return [];
  const supabase = getSupabaseClient();
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 1000));
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,model,data,created_at,updated_at')
    .eq('model', String(model))
    .limit(safeLimit);
  if (error || !Array.isArray(data)) return [];
  return data.map(mapDocRow).filter(Boolean);
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
