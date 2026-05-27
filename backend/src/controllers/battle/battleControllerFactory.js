const battleService = require('../../services/battleService');
const battleRuntimeStore = require('../../services/battleRuntimeStore');
const {
    getDocByModelAndId,
    listAllDocsByModel,
} = require('../../services/documentStore');
const {
    createBattleDocumentAccess,
} = require('./battleDocumentAccess');
const {
    getCachedCurrentBattlePersonal,
    getCachedCurrentBattleShared,
} = require('./currentBattleCache');
const {
    createBattleAttendanceRuntime,
} = require('./attendanceRuntime');
const {
    createBattleReportMerger,
} = require('./heartbeatReportMerge');
const {
    createBattleDocumentCache,
} = require('./battleDocumentCache');
const {
    createSubmitDamageHandler,
} = require('./finalReportController');
const {
    createJoinBattleHandler,
} = require('./joinBattleController');
const {
    createBattleHeartbeatHandler,
} = require('./heartbeatController');
const {
    createGetCurrentBattleHandler,
} = require('./currentBattleController');
const {
    createGetUserBattleHistoryHandler,
} = require('./historyController');
const {
    createGetBattleSummaryHandler,
} = require('./summaryController');

const HEARTBEAT_BATTLE_CACHE_TTL_MS = 5000;
const SUMMARY_BATTLE_CACHE_TTL_MS = 30000;
const ATTENDANCE_RUNTIME_TTL_MS = 3 * 60 * 60 * 1000;

function createBattleController({
    services = {},
    stores = {},
    documentStore = {},
} = {}) {
    const resolvedBattleService = services.battleService || battleService;
    const resolvedBattleRuntimeStore = stores.battleRuntimeStore || battleRuntimeStore;
    const resolvedDocumentStore = {
        getDocByModelAndId,
        listAllDocsByModel,
        ...documentStore,
    };

    const {
        getBattleDocById,
        listBattleDocs,
    } = createBattleDocumentAccess(resolvedDocumentStore);

    const {
        clearSummaryBattleSnapshot,
        getActiveHeartbeatBattleSnapshot,
        getCachedBattleDocById,
        getHeartbeatBattleSnapshot,
        refreshBattleSnapshotIfEndTimeChanged,
        getSummaryBattleSnapshot,
        setHeartbeatBattleSnapshot,
        setSummaryBattleSnapshot,
    } = createBattleDocumentCache({
        getBattleDocById,
        heartbeatTtlMs: HEARTBEAT_BATTLE_CACHE_TTL_MS,
        summaryTtlMs: SUMMARY_BATTLE_CACHE_TTL_MS,
    });

    const {
        ensureBattleAttendanceReady,
        getAttendanceRuntimeSnapshot,
    } = createBattleAttendanceRuntime({
        getHeartbeatBattleSnapshot,
        attendanceRuntimeTtlMs: ATTENDANCE_RUNTIME_TTL_MS,
    });

    const {
        mergeBattleReportIntoAttendanceState,
    } = createBattleReportMerger({
        getAttendanceRuntimeSnapshot,
        runtimeStore: resolvedBattleRuntimeStore,
        attendanceRuntimeTtlMs: ATTENDANCE_RUNTIME_TTL_MS,
    });

    return {
        getCurrentBattle: createGetCurrentBattleHandler({
            battleService: resolvedBattleService,
            getCachedCurrentBattleShared,
            getCachedCurrentBattlePersonal,
        }),
        getUserBattleHistory: createGetUserBattleHistoryHandler({
            listBattleDocs,
        }),
        getBattleSummary: createGetBattleSummaryHandler({
            battleRuntimeStore: resolvedBattleRuntimeStore,
            battleService: resolvedBattleService,
            getSummaryBattleSnapshot,
            getCachedBattleDocById,
            getBattleDocById,
            getAttendanceRuntimeSnapshot,
            setSummaryBattleSnapshot,
            summaryBattleCacheTtlMs: SUMMARY_BATTLE_CACHE_TTL_MS,
        }),
        submitDamage: createSubmitDamageHandler({
            battleRuntimeStore: resolvedBattleRuntimeStore,
            battleService: resolvedBattleService,
            getCachedBattleDocById,
            refreshBattleSnapshotIfEndTimeChanged,
            getAttendanceRuntimeSnapshot,
        }),
        joinBattle: createJoinBattleHandler({
            getCachedBattleDocById,
            ensureBattleAttendanceReady,
            setHeartbeatBattleSnapshot,
            clearSummaryBattleSnapshot,
            heartbeatBattleCacheTtlMs: HEARTBEAT_BATTLE_CACHE_TTL_MS,
        }),
        battleHeartbeat: createBattleHeartbeatHandler({
            getActiveHeartbeatBattleSnapshot,
            getAttendanceRuntimeSnapshot,
            mergeBattleReportIntoAttendanceState,
        }),
    };
}

module.exports = {
    createBattleController,
};
