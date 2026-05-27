const {
  getDocByModelAndId,
  insertDoc,
  listAllDocsByModel,
  updateDocByModel,
} = require('../documentStore');

async function getModelDocById(model, id) {
  if (!id) return null;
  return getDocByModelAndId(model, id);
}

async function insertModelDoc(model, payload) {
  const id = payload && (payload._id || payload.id)
    ? String(payload._id || payload.id)
    : `${String(model)}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const doc = payload && typeof payload === 'object' ? { ...payload } : {};
  delete doc._id;
  delete doc.id;

  return insertDoc({ id, model: String(model), data: doc }).catch(() => null);
}

async function updateModelDoc(model, id, patch) {
  if (!id || !patch || typeof patch !== 'object') return null;
  const current = await getModelDocById(model, id);
  if (!current) return null;
  const next = { ...current, ...patch };
  delete next._id;
  delete next.id;
  delete next.createdAt;
  delete next.updatedAt;
  return updateDocByModel(model, id, next).catch(() => null);
}

async function listModelDocs(model) {
  return listAllDocsByModel(model, { pageSize: 1000 });
}

async function getLatestModelDoc(model) {
  const all = await listModelDocs(model);
  all.sort((a, b) => {
    const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
  return all[0] || null;
}

module.exports = {
  getLatestModelDoc,
  getModelDocById,
  insertModelDoc,
  listModelDocs,
  updateModelDoc,
};
