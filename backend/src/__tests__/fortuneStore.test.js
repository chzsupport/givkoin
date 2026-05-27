const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDataEqFilter,
  stripStoredDocFields,
  toLegacyDocRow,
} = require('../services/fortune/fortuneStore');

test('fortune store strips document metadata without mutating source', () => {
  const source = {
    _id: 'doc-1',
    id: 'row-1',
    createdAt: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T01:00:00.000Z',
    user: 'u1',
    tickets: [],
  };

  assert.deepEqual(stripStoredDocFields(source), { user: 'u1', tickets: [] });
  assert.equal(source._id, 'doc-1');
});

test('fortune store keeps legacy document row shape stable', () => {
  assert.deepEqual(toLegacyDocRow({
    _id: 'lot-1',
    createdAt: '2026-05-25T00:00:00.000Z',
    updatedAt: '2026-05-25T01:00:00.000Z',
    user: 'u1',
  }), {
    id: 'lot-1',
    data: { user: 'u1' },
    created_at: '2026-05-25T00:00:00.000Z',
    updated_at: '2026-05-25T01:00:00.000Z',
  });

  assert.equal(toLegacyDocRow({ user: 'u1' }), null);
  assert.equal(toLegacyDocRow(null), null);
});

test('fortune store builds dataEq filters with string values only', () => {
  assert.deepEqual(buildDataEqFilter({
    user: 123,
    type: 'lottery',
    skipNull: null,
    skipUndefined: undefined,
    emptyKey: 'ignored',
    '': 'ignored',
  }), {
    user: '123',
    type: 'lottery',
    emptyKey: 'ignored',
  });
});
