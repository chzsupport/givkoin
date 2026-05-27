const { insertDoc, listDocsByModel } = require('../documentStore');

async function findAppealByUser(againstUser, status) {
  const rows = await listDocsByModel('Appeal', {
    dataEq: { againstUser: String(againstUser), status },
    limit: 1,
  });
  return rows[0] || null;
}

async function findAppealByChat(chatId, complainant, againstUser, status) {
  const rows = await listDocsByModel('Appeal', {
    dataEq: {
      chat: String(chatId),
      complainant: String(complainant),
      againstUser: String(againstUser),
      status,
    },
    limit: 1,
  });
  return rows[0] || null;
}

function buildAppealInsertPayload(doc, { id, nowIso }) {
  const appealData = {
    status: 'pending',
    ...doc,
  };

  return {
    id,
    appealData,
    document: {
      model: 'Appeal',
      id,
      data: appealData,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  };
}

async function insertAppeal(doc) {
  const id = `app_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const nowIso = new Date().toISOString();
  const { appealData, document } = buildAppealInsertPayload(doc, { id, nowIso });
  const inserted = await insertDoc(document);
  return inserted || { ...appealData, _id: id };
}

module.exports = {
  buildAppealInsertPayload,
  findAppealByChat,
  findAppealByUser,
  insertAppeal,
};
