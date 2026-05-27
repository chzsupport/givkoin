const {
    buildUserBattleHistoryList,
} = require('./historyPayload');
const {
    sendServerError,
} = require('./localizedResponse');

function createGetUserBattleHistoryHandler({ listBattleDocs }) {
    return async function getUserBattleHistory(req, res) {
        try {
            const userId = req.user?._id;
            const all = await listBattleDocs({ pageSize: 2000 });
            const list = buildUserBattleHistoryList({ battles: all, userId, limit: 50 });

            return res.json({ battles: list });
        } catch (error) {
            console.error('Get user battle history error:', error);
            return sendServerError(res, req);
        }
    };
}

module.exports = {
    createGetUserBattleHistoryHandler,
};
