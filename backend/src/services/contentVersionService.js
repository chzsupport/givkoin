const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

function mapDocRow(row) {
  if (!row) return null;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return {
    ...data,
    _id: String(row.id),
    createdAt: row.created_at ? new Date(row.created_at) : data.createdAt || null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : data.updatedAt || null,
  };
}

async function listContentVersionDocs({ entityType, entityId, pageSize = 1000 } = {}) {
  const supabase = getSupabaseClient();
  const out = [];
  let from = 0;
  const size = Math.max(1, Math.min(2000, Number(pageSize) || 1000));

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', 'ContentVersion')
      .range(from, from + size - 1);

    if (error || !Array.isArray(data) || data.length === 0) break;
    const rows = data
      .map(mapDocRow)
      .filter(Boolean)
      .filter((row) => String(row?.entityType || '') === String(entityType) && String(row?.entityId || '') === String(entityId));

    out.push(...rows);
    if (data.length < size) break;
    from += size;
  }

  return out;
}

async function insertContentVersionDoc(payload) {
  const supabase = getSupabaseClient();
  const id = payload && (payload._id || payload.id)
    ? String(payload._id || payload.id)
    : `ContentVersion_${Date.now()}`;

  const doc = payload && typeof payload === 'object' ? { ...payload } : {};
  delete doc._id;
  delete doc.id;

  const { data, error } = await supabase
    .from(DOC_TABLE)
    .insert({ id, model: 'ContentVersion', data: doc })
    .select('id,data,created_at,updated_at')
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

async function getNextVersion(entityType, entityId) {
  const rows = await listContentVersionDocs({ entityType, entityId });
  const maxVersion = rows.reduce((acc, row) => {
    const v = Number(row?.version) || 0;
    return v > acc ? v : acc;
  }, 0);
  return maxVersion + 1;
}

async function createContentVersion({ entityType, entityId, snapshot, changedBy = null, changeNote = '' }) {
  const version = await getNextVersion(entityType, entityId);
  const safeEntityType = String(entityType);
  const safeEntityId = String(entityId);
  const id = `ContentVersion_${safeEntityType}_${safeEntityId}_${version}`;

  return insertContentVersionDoc({
    _id: id,
    entityType: safeEntityType,
    entityId: safeEntityId,
    version,
    snapshot,
    changedBy: changedBy || null,
    changeNote: String(changeNote || '').trim(),
  });
}

async function listContentVersions({ entityType, entityId, limit = 50 }) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 50));
  const rows = await listContentVersionDocs({ entityType, entityId });
  rows.sort((a, b) => (Number(b?.version) || 0) - (Number(a?.version) || 0));
  return rows.slice(0, safeLimit);
}

module.exports = {
  createContentVersion,
  listContentVersions,
};
