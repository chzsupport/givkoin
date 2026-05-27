const {
  getDocByModelAndId,
  insertDoc,
  listAllDocsByModel,
  listDocsByModel,
  updateDocByModel,
} = require('../documentStore');
const {
  getRiskCaseSource,
} = require('./freezeState');

const MULTI_ACCOUNT_RISK_SOURCE = 'multi_account';

function cleanText(value) {
  return String(value || '').trim();
}

function isMultiAccountRiskCaseRecord(riskCase) {
  return getRiskCaseSource(riskCase) === MULTI_ACCOUNT_RISK_SOURCE;
}

function pickLatestRiskCase(rows = [], predicate = null) {
  const filtered = (Array.isArray(rows) ? rows : []).filter((row) => {
    if (!row || typeof row !== 'object') return false;
    return typeof predicate === 'function' ? predicate(row) : true;
  });
  if (!filtered.length) return null;
  filtered.sort((a, b) => {
    const aTime = new Date(a?.updatedAt || a?.createdAt || 0).getTime();
    const bTime = new Date(b?.updatedAt || b?.createdAt || 0).getTime();
    return bTime - aTime;
  });
  return filtered[0] || null;
}

function createRiskCaseDocuments(store = {}) {
  const readDoc = store.getDocByModelAndId || getDocByModelAndId;
  const addDoc = store.insertDoc || insertDoc;
  const listAllDocs = store.listAllDocsByModel || listAllDocsByModel;
  const listDocs = store.listDocsByModel || listDocsByModel;
  const updateDoc = store.updateDocByModel || updateDocByModel;

  async function listModelRiskCases() {
    return listAllDocs('RiskCase', { pageSize: 1000 });
  }

  async function listRiskCasesByUserId(userId) {
    if (!userId) return null;
    return listDocs('RiskCase', {
      dataEq: { user: String(userId) },
      limit: 5000,
    });
  }

  async function getRiskCaseByUserId(userId, { source = '' } = {}) {
    const rows = await listRiskCasesByUserId(userId);
    const safeSource = cleanText(source);
    if (!safeSource) return pickLatestRiskCase(rows);
    return pickLatestRiskCase(rows, (row) => getRiskCaseSource(row) === safeSource);
  }

  async function updateRiskCaseById(id, patch = {}) {
    if (!id) return null;
    const existing = await readDoc('RiskCase', id);
    if (!existing) return null;

    const { _id, createdAt, updatedAt, ...existingData } = existing;
    void _id;
    void createdAt;
    void updatedAt;
    const next = {
      ...existingData,
      ...patch,
    };
    return updateDoc('RiskCase', id, next).catch(() => null);
  }

  async function createRiskCase(doc = {}) {
    const id = `rc_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    return addDoc({
      model: 'RiskCase',
      id,
      data: doc,
      createdAt: nowIso,
      updatedAt: nowIso,
    }).catch(() => null);
  }

  return {
    createRiskCase,
    getRiskCaseByUserId,
    listModelRiskCases,
    listRiskCasesByUserId,
    updateRiskCaseById,
  };
}

module.exports = {
  ...createRiskCaseDocuments(),
  createRiskCaseDocuments,
  isMultiAccountRiskCaseRecord,
  pickLatestRiskCase,
};
