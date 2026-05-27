const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildStoredDocPayload,
  createNewsDocumentStore,
  generateObjectId,
} = require('../services/news/newsDocumentStore');

test('news document store builds old payload shape without runtime fields', () => {
  const result = buildStoredDocPayload({
    _id: 'doc-1',
    id: 'row-id',
    title: 'Title',
    createdAt: 'old',
    updatedAt: 'old',
  });

  assert.equal(result.id, 'doc-1');
  assert.deepEqual(result.payload, {
    _id: 'doc-1',
    title: 'Title',
  });
});

test('news document store keeps generated object id length stable', () => {
  const id = generateObjectId(() => Buffer.from('123456789012'));
  assert.equal(id, Buffer.from('123456789012').toString('hex'));
});

test('news document store delegates CRUD calls with normalized ids', async () => {
  const calls = [];
  const rows = new Map([['doc-1', { _id: 'doc-1', title: 'Old' }]]);
  const store = createNewsDocumentStore({
    getDocByModelAndId: async (model, id) => {
      calls.push(['get', model, id]);
      return rows.get(id) || null;
    },
    listAllDocsByModel: async (model, options) => {
      calls.push(['list', model, options.pageSize]);
      return [];
    },
    insertDoc: async (payload) => {
      calls.push(['insert', payload.model, payload.id, payload.data]);
      return payload.data;
    },
    upsertDoc: async (payload) => {
      calls.push(['upsert', payload.model, payload.id, payload.data]);
      rows.set(payload.id, payload.data);
      return payload.data;
    },
    deleteDocsByModel: async (model, ids) => {
      calls.push(['delete', model, ids]);
      return ids.length;
    },
  });

  assert.deepEqual(await store.getModelDocById('NewsPost', { _id: 'doc-1' }), { _id: 'doc-1', title: 'Old' });
  assert.deepEqual(await store.listModelDocs('NewsPost', { pageSize: 10 }), []);
  assert.deepEqual(await store.insertModelDoc('NewsPost', { _id: 'doc-2', id: 'ignore', title: 'New' }), {
    _id: 'doc-2',
    title: 'New',
  });
  assert.deepEqual(await store.updateModelDoc('NewsPost', 'doc-1', { title: 'Changed' }), {
    _id: 'doc-1',
    title: 'Changed',
  });
  assert.equal(await store.deleteModelDoc('NewsPost', { id: 'doc-1' }), true);

  assert.deepEqual(calls[0], ['get', 'NewsPost', 'doc-1']);
  assert.deepEqual(calls.at(-1), ['delete', 'NewsPost', ['doc-1']]);
});
