const {
    buildBattleHeartbeatEndedResponsePayload,
    buildBattleHeartbeatResponsePayload,
    buildBattleHeartbeatTimingPayload,
} = require('./responsePayload');
const {
    getRequestLang,
    pickLang,
    sendLocalizedError,
    sendServerError,
} = require('./localizedResponse');

function createBattleHeartbeatHandler({
    getActiveHeartbeatBattleSnapshot,
    getAttendanceRuntimeSnapshot,
    mergeBattleReportIntoAttendanceState,
}) {
    return async function battleHeartbeat(req, res) {
        try {
            const { battleId, report, reportSequence } = req.body || {};
            const userLang = getRequestLang(req);
            if (!battleId) {
                return sendLocalizedError(res, { status: 400, lang: userLang, ru: 'Не указан battleId', en: 'Missing battleId' });
            }

            const battle = await getActiveHeartbeatBattleSnapshot(battleId);
            if (!battle || battle.status !== 'active') {
                return sendLocalizedError(res, { status: 400, lang: userLang, ru: 'Бой не активен', en: 'Battle is not active' });
            }

            const nowMs = Date.now();
            const { battleEnded, timeLeftMs } = buildBattleHeartbeatTimingPayload({ battle, nowMs });
            if (battleEnded) {
                return res.status(409).json(buildBattleHeartbeatEndedResponsePayload());
            }
            const attendanceCount = Number(battle.attendanceCount) || 0;
            let acceptedReport = false;
            let ignoredReport = false;
            let personalEntry = null;

            if (report && typeof report === 'object') {
                const attendanceEntry = await getAttendanceRuntimeSnapshot({ battleId, userId: req.user._id });
                if (!attendanceEntry) {
                    return sendLocalizedError(res, { status: 400, lang: userLang, ru: 'Нет участия в бою', en: 'No participation in battle' });
                }
                const mergeResult = await mergeBattleReportIntoAttendanceState({
                    battleId,
                    userId: req.user._id,
                    entry: attendanceEntry,
                    report,
                    reportSequence,
                    markFinal: false,
                    lang: userLang,
                });
                if (mergeResult?.message === pickLang(userLang, 'Не указан reportSequence', 'Missing reportSequence')) {
                    return sendLocalizedError(res, { status: 400, lang: userLang, ru: 'Не указан reportSequence', en: 'Missing reportSequence' });
                }
                acceptedReport = Boolean(mergeResult?.accepted);
                ignoredReport = Boolean(mergeResult?.ignored);
                personalEntry = mergeResult?.entry || attendanceEntry;
            } else {
                personalEntry = await getAttendanceRuntimeSnapshot({ battleId, userId: req.user._id }).catch(() => null);
            }

            return res.json(buildBattleHeartbeatResponsePayload({
                serverNowMs: nowMs,
                timeLeftMs,
                attendanceCount,
                acceptedReport,
                ignoredReport,
                personalEntry,
                fallbackUser: req.user || null,
            }));
        } catch (error) {
            console.error('Battle heartbeat error:', error);
            return sendServerError(res, req);
        }
    };
}

module.exports = {
    createBattleHeartbeatHandler,
};
