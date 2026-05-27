const {
  insertDoc,
  listDocsByModel,
  updateDocByModel,
} = require('../documentStore');

function stripStoredDocFields(doc) {
  const data = doc && typeof doc === 'object' ? { ...doc } : {};
  delete data._id;
  delete data.id;
  delete data.createdAt;
  delete data.updatedAt;
  return data;
}

function toLegacyDocRow(doc) {
  if (!doc) return null;
  const id = String(doc._id || doc.id || '').trim();
  if (!id) return null;
  return {
    id,
    data: stripStoredDocFields(doc),
    created_at: doc.createdAt || null,
    updated_at: doc.updatedAt || null,
  };
}

function buildDataEqFilter(filter = {}) {
  const dataEq = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (!key || value === undefined || value === null) continue;
    dataEq[key] = String(value);
  }
  return dataEq;
}

async function listFortuneSpins(filter = {}) {
  return listDocsByModel('FortuneSpin', {
    dataEq: buildDataEqFilter(filter),
    limit: 1000,
  });
}

async function listLotteries(filter = {}) {
  return listDocsByModel('Lottery', {
    dataEq: buildDataEqFilter(filter),
    limit: 1000,
  });
}

async function listTransactions(filter = {}, limit = 5000) {
  return listDocsByModel('Transaction', {
    dataEq: buildDataEqFilter(filter),
    limit: Math.max(1, Math.min(5000, Number(limit) || 5000)),
  });
}

async function findLotteryByUserAndDate(userId, dayStart) {
  const dayIso = dayStart instanceof Date ? dayStart.toISOString() : dayStart;
  const data = await listDocsByModel('Lottery', {
    dataEq: {
      user: String(userId),
      drawDate: String(dayIso),
    },
    limit: 1,
  });
  return toLegacyDocRow(data[0] || null);
}

async function upsertLottery(id, data) {
  if (id) {
    await updateDocByModel('Lottery', id, data).catch(() => null);
    return { ...data, _id: id };
  }

  const newId = `lot_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  await insertDoc({ id: newId, model: 'Lottery', data }).catch(() => null);
  return { ...data, _id: newId };
}

async function findFortuneSpinByUser(userId) {
  const rows = await listDocsByModel('FortuneSpin', {
    dataEq: { user: userId },
    limit: 1,
  });
  return toLegacyDocRow(rows[0] || null);
}

async function upsertFortuneSpin(id, data) {
  if (id) {
    await updateDocByModel('FortuneSpin', id, data).catch(() => null);
    return { ...data, _id: id };
  }

  const newId = `fs_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  await insertDoc({ id: newId, model: 'FortuneSpin', data }).catch(() => null);
  return { ...data, _id: newId };
}

module.exports = {
  buildDataEqFilter,
  findFortuneSpinByUser,
  findLotteryByUserAndDate,
  listFortuneSpins,
  listLotteries,
  listTransactions,
  stripStoredDocFields,
  toLegacyDocRow,
  upsertFortuneSpin,
  upsertLottery,
};
