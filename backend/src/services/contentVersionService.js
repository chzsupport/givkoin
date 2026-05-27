const { insertDoc, listAllDocsByModel } = require('./documentStore');

function normalizeContentVersionDoc(doc) {
  if (!doc) return null;
  return {
    ...doc,
    createdAt: doc.createdAt ? new Date(doc.createdAt) : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : null,
  };
}

async function listContentVersionDocs({ entityType, entityId, pageSize = 1000 } = {}) {
  const rows = await listAllDocsByModel('ContentVersion', { pageSize });
  return rows
    .map(normalizeContentVersionDoc)
    .filter(Boolean)
    .filter((row) => String(row?.entityType || '') === String(entityType) && String(row?.entityId || '') === String(entityId));
}

async function insertContentVersionDoc(payload) {
  const id = payload && (payload._id || payload.id)
    ? String(payload._id || payload.id)
    : `ContentVersion_${Date.now()}`;

  const doc = payload && typeof payload === 'object' ? { ...payload } : {};
  delete doc._id;
  delete doc.id;

  try {
    const inserted = await insertDoc({ id, model: 'ContentVersion', data: doc });
    return normalizeContentVersionDoc(inserted);
  } catch (_error) {
    return null;
  }
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
