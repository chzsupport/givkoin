const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createRiskCaseDocuments,
  isMultiAccountRiskCaseRecord,
  pickLatestRiskCase,
} = require('../services/multiAccount/riskCaseDocuments');

test('multi-account risk case documents pick latest matching case', () => {
  const rows = [
    { _id: 'old', updatedAt: '2026-05-24T10:00:00.000Z', meta: { source: 'multi_account' } },
    { _id: 'other', updatedAt: '2026-05-25T12:00:00.000Z', meta: { source: 'other' } },
    { _id: 'latest', updatedAt: '2026-05-25T10:00:00.000Z', meta: { source: 'multi_account' } },
  ];

  assert.equal(
    pickLatestRiskCase(rows, (row) => isMultiAccountRiskCaseRecord(row))._id,
    'latest'
  );
  assert.equal(pickLatestRiskCase(null), null);
});

test('multi-account risk case documents recognize only multi-account source', () => {
  assert.equal(isMultiAccountRiskCaseRecord({ meta: { source: 'multi_account' } }), true);
  assert.equal(isMultiAccountRiskCaseRecord({ meta: { source: 'manual_review' } }), false);
  assert.equal(isMultiAccountRiskCaseRecord({}), false);
});

test('multi-account risk case documents use document store without changing payload shape', async () => {
  const calls = [];
  const helpers = createRiskCaseDocuments({
    listAllDocsByModel: async (model, options) => {
      calls.push(['listAll', model, options]);
      return [{ _id: 'case-all' }];
    },
    listDocsByModel: async (model, options) => {
      calls.push(['listDocs', model, options]);
      return [
        { _id: 'case-1', user: 'user-1', updatedAt: '2026-05-24T10:00:00.000Z', meta: { source: 'other' } },
        { _id: 'case-2', user: 'user-1', updatedAt: '2026-05-25T10:00:00.000Z', meta: { source: 'multi_account' } },
      ];
    },
    getDocByModelAndId: async (model, id) => {
      calls.push(['getDoc', model, id]);
      return {
        _id: id,
        createdAt: '2026-05-24T00:00:00.000Z',
        updatedAt: '2026-05-24T01:00:00.000Z',
        user: 'user-1',
        status: 'watch',
      };
    },
    updateDocByModel: async (model, id, data) => {
      calls.push(['updateDoc', model, id, data]);
      return { _id: id, ...data };
    },
    insertDoc: async (doc) => {
      calls.push(['insertDoc', doc]);
      return { _id: doc.id, ...doc.data };
    },
  });

  assert.deepEqual(await helpers.listModelRiskCases(), [{ _id: 'case-all' }]);
  assert.equal((await helpers.getRiskCaseByUserId('user-1', { source: 'multi_account' }))._id, 'case-2');

  const updated = await helpers.updateRiskCaseById('case-2', { status: 'frozen' });
  assert.equal(updated.status, 'frozen');
  const updateCall = calls.find((row) => row[0] === 'updateDoc');
  assert.deepEqual(updateCall.slice(0, 3), ['updateDoc', 'RiskCase', 'case-2']);
  assert.deepEqual(updateCall[3], { user: 'user-1', status: 'frozen' });

  const created = await helpers.createRiskCase({ user: 'user-2', status: 'watch' });
  assert.equal(created.user, 'user-2');
  const insertCall = calls.find((row) => row[0] === 'insertDoc');
  assert.equal(insertCall[1].model, 'RiskCase');
  assert.equal(insertCall[1].data.status, 'watch');
});
