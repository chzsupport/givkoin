const test = require('node:test');
const assert = require('node:assert/strict');

const {
    createBattleDocumentAccess,
} = require('../controllers/battle/battleDocumentAccess');

test('battle document access keeps Battle model read contract', async () => {
    const calls = [];
    const access = createBattleDocumentAccess({
        getDocByModelAndId: async (model, id) => {
            calls.push(['get', model, id]);
            return { _id: id };
        },
        listAllDocsByModel: async (model, options) => {
            calls.push(['list', model, options]);
            return [{ _id: 'battle-1' }];
        },
    });

    assert.deepEqual(await access.getBattleDocById('battle-1'), { _id: 'battle-1' });
    assert.equal(await access.getBattleDocById(''), null);
    assert.deepEqual(await access.listBattleDocs({ pageSize: 2000 }), [{ _id: 'battle-1' }]);
    assert.deepEqual(calls, [
        ['get', 'Battle', 'battle-1'],
        ['list', 'Battle', { pageSize: 2000 }],
    ]);
});
