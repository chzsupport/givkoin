const crypto = require('crypto');
const { toId } = require('./newsCommon');

function generateObjectId(randomBytes = crypto.randomBytes) {
  return randomBytes(12).toString('hex');
}

function buildStoredDocPayload(doc, fallbackId) {
  const id = String(doc?._id || fallbackId || generateObjectId());
  const payload = { ...(doc && typeof doc === 'object' ? doc : {}) };
  payload._id = id;
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;
  return { id, payload };
}

function createNewsDocumentStore({
  deleteDocsByModel,
  getDocByModelAndId,
  insertDoc,
  listAllDocsByModel,
  upsertDoc,
} = {}) {
  async function getModelDocById(modelName, id) {
    const docId = toId(id);
    if (!modelName || !docId) return null;
    return getDocByModelAndId(modelName, docId);
  }

  async function listModelDocs(modelName, { pageSize = 1000 } = {}) {
    return listAllDocsByModel(modelName, { pageSize });
  }

  async function insertModelDoc(modelName, doc) {
    const { id, payload } = buildStoredDocPayload(doc);
    return insertDoc({ model: String(modelName), id, data: payload });
  }

  async function upsertModelDoc(modelName, id, doc) {
    const docId = String(id || '').trim();
    if (!docId) throw new Error('Missing id');
    const { payload } = buildStoredDocPayload(doc, docId);
    payload._id = payload._id || docId;
    return upsertDoc({ model: String(modelName), id: docId, data: payload });
  }

  async function updateModelDoc(modelName, id, patch) {
    const existing = await getModelDocById(modelName, id);
    if (!existing) return null;
    const next = { ...existing, ...(patch && typeof patch === 'object' ? patch : {}) };
    return upsertModelDoc(modelName, existing._id, next);
  }

  async function updateExistingModelDoc(modelName, existing, patch) {
    if (!existing?._id) return null;
    const next = {
      ...existing,
      ...(patch && typeof patch === 'object' ? patch : {}),
    };
    return upsertModelDoc(modelName, existing._id, next);
  }

  async function deleteModelDoc(modelName, id) {
    const docId = toId(id);
    if (!docId) return false;
    const deleted = await deleteDocsByModel(modelName, [docId]);
    return deleted > 0;
  }

  return {
    getModelDocById,
    listModelDocs,
    insertModelDoc,
    upsertModelDoc,
    updateModelDoc,
    updateExistingModelDoc,
    deleteModelDoc,
  };
}

module.exports = {
  generateObjectId,
  buildStoredDocPayload,
  createNewsDocumentStore,
};
