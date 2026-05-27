function createBattleDocumentAccess({
    getDocByModelAndId,
    listAllDocsByModel,
    model = 'Battle',
}) {
    async function getBattleDocById(battleId) {
        if (!battleId) return null;
        return getDocByModelAndId(model, battleId);
    }

    async function listBattleDocs({ pageSize = 1000 } = {}) {
        return listAllDocsByModel(model, { pageSize });
    }

    return {
        getBattleDocById,
        listBattleDocs,
    };
}

module.exports = {
    createBattleDocumentAccess,
};
