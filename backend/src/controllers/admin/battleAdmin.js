const {
    deleteScheduledBattleTotally,
} = require('../../services/adminCleanupService');
const battleService = require('../../services/battleService');
const { adminAudit } = require('../../middleware/adminAudit');
const { listAllDocsByModel } = require('../../services/documentStore');
const { getUsersByIds, toId } = require('./userLookup');

async function listModelDocs(model, { pageSize = 1000 } = {}) {
    return listAllDocsByModel(model, { pageSize });
}

const getBattleControl = async (_req, res) => {
    try {
        const [active, upcoming, scheduledBattles] = await Promise.all([
            battleService.getCurrentBattle(),
            battleService.getUpcomingBattle(),
            battleService.listScheduledBattles({ includeAuto: false }),
        ]);
        const safeUpcoming = upcoming && upcoming.scheduleSource === 'auto'
            ? {
                ...upcoming,
                startsAt: null,
                durationSeconds: null,
                scheduledIntervalHours: null,
            }
            : upcoming;
        const mergedScheduledBattles = [];
        const seenBattleIds = new Set();
        if (safeUpcoming && String(safeUpcoming.scheduleSource || '') !== 'auto' && String(safeUpcoming.status || '') === 'scheduled') {
            const upcomingId = String(safeUpcoming._id || '').trim();
            if (upcomingId) {
                seenBattleIds.add(upcomingId);
                mergedScheduledBattles.push(safeUpcoming);
            }
        }
        for (const battle of Array.isArray(scheduledBattles) ? scheduledBattles : []) {
            const battleId = String(battle?._id || '').trim();
            if (!battleId || seenBattleIds.has(battleId)) continue;
            seenBattleIds.add(battleId);
            mergedScheduledBattles.push(battle);
        }
        res.json({
            active,
            upcoming: safeUpcoming,
            scheduledBattles: mergedScheduledBattles,
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getSuspiciousBattleUsers = async (req, res) => {
    try {
        const limitRaw = Number(req.query?.limit);
        const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 200;

        const battles = await listModelDocs('Battle');
        const flat = [];

        for (const battle of battles) {
            if (!['active', 'finished'].includes(String(battle?.status || ''))) continue;
            const attendance = Array.isArray(battle?.attendance) ? battle.attendance : [];
            if (!attendance.length) continue;
            for (const entry of attendance) {
                if (!entry || !entry.suspicious) continue;
                flat.push({ battle, entry });
            }
        }

        flat.sort((a, b) => {
            const aSusp = a?.entry?.suspiciousAt ? new Date(a.entry.suspiciousAt).getTime() : 0;
            const bSusp = b?.entry?.suspiciousAt ? new Date(b.entry.suspiciousAt).getTime() : 0;
            if (bSusp !== aSusp) return bSusp - aSusp;
            const aEnds = a?.battle?.endsAt ? new Date(a.battle.endsAt).getTime() : 0;
            const bEnds = b?.battle?.endsAt ? new Date(b.battle.endsAt).getTime() : 0;
            if (bEnds !== aEnds) return bEnds - aEnds;
            const aStarts = a?.battle?.startsAt ? new Date(a.battle.startsAt).getTime() : 0;
            const bStarts = b?.battle?.startsAt ? new Date(b.battle.startsAt).getTime() : 0;
            return bStarts - aStarts;
        });

        const sliced = flat.slice(0, limit);
        const userIds = Array.from(new Set(sliced.map((row) => toId(row?.entry?.user)).filter(Boolean)));
        const usersById = await getUsersByIds(userIds);

        const rows = sliced.map(({ battle, entry }) => {
            const userId = toId(entry?.user);
            const user = userId ? usersById.get(userId) : null;
            return {
                battleId: battle?._id,
                battleStatus: battle?.status,
                startsAt: battle?.startsAt,
                endsAt: battle?.endsAt,
                scheduleSource: battle?.scheduleSource,
                scheduledIntervalHours: battle?.scheduledIntervalHours,
                attendanceCount: battle?.attendanceCount,
                userId,
                nickname: user?.nickname,
                email: user?.email,
                suspicious: Boolean(entry?.suspicious),
                suspiciousAt: entry?.suspiciousAt,
                suspiciousReasons: entry?.suspiciousReasons,
                suspiciousEvidence: entry?.suspiciousEvidence,
                damage: entry?.damage,
                totalShots: entry?.totalShots,
                totalHits: entry?.totalHits,
                crystalsCollected: entry?.crystalsCollected,
                lumensSpentTotal: entry?.lumensSpentTotal,
            };
        });

        res.json({ rows });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const startBattleNow = async (req, res) => {
    try {
        const durationSecondsRaw = Number(req.body?.durationSeconds);
        const durationLocked = Number.isFinite(durationSecondsRaw) && durationSecondsRaw > 0;
        const durationSeconds = durationLocked
            ? durationSecondsRaw
            : undefined;

        const active = await battleService.getCurrentBattle();
        if (active) {
            return res.status(400).json({ message: 'Сейчас уже идет бой' });
        }

        const now = new Date();
        const upcoming = await battleService.getUpcomingBattle();
        const battle = upcoming
            ? await battleService.startBattle(upcoming._id, {
                startsAt: now,
                durationSeconds,
                durationLocked,
                scheduleSource: 'admin_force',
                scheduledIntervalHours: null,
            })
            : await (async () => {
                const scheduled = await battleService.scheduleBattle({
                    startsAt: now,
                    durationSeconds,
                    durationLocked,
                    scheduleSource: 'admin_force',
                    scheduledIntervalHours: null,
                });
                return battleService.startBattle(scheduled._id, {
                    startsAt: now,
                    durationSeconds,
                    durationLocked,
                    scheduleSource: 'admin_force',
                    scheduledIntervalHours: null,
                });
            })();

        await adminAudit('battle.start_now', req, {
            battleId: battle?._id || null,
            startsAt: battle?.startsAt || null,
            durationSeconds: battle?.durationSeconds || null,
        });

        res.json({
            message: 'Бой запущен',
            battle,
        });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

const scheduleBattle = async (req, res) => {
    try {
        const {
            battleId,
            startsAt,
            durationSeconds: durationRaw,
            cancelScheduled,
        } = req.body || {};

        if (cancelScheduled) {
            const requestedBattleId = battleId ? String(battleId) : null;
            if (!requestedBattleId) {
                return res.status(400).json({ message: 'Не найден запланированный бой' });
            }
            const battle = await deleteScheduledBattleTotally(requestedBattleId, 'Удалено администратором');

            await adminAudit('battle.schedule_cancel', req, {
                battleId: requestedBattleId,
                cancelledBattleId: battle?.battleId || null,
            });

            return res.json({
                message: 'Запланированный бой удален',
                battle,
            });
        }

        if (!startsAt) {
            return res.status(400).json({ message: 'Укажите время запуска' });
        }

        const starts = new Date(startsAt);
        if (Number.isNaN(starts.getTime())) {
            return res.status(400).json({ message: 'Некорректная дата запуска' });
        }

        if (starts <= new Date()) {
            return res.status(400).json({ message: 'Время запуска должно быть в будущем' });
        }

        const durationSeconds = Number(durationRaw);
        const durationExplicitlySet = Number.isFinite(durationSeconds) && durationSeconds > 0;
        const durationPatch = durationExplicitlySet
            ? durationSeconds
            : undefined;

        const active = await battleService.getCurrentBattle();
        if (active) {
            return res.status(400).json({ message: 'Нельзя планировать, пока идет бой' });
        }

        let battle = null;
        let mode = 'create';

        if (battleId) {
            const existing = await battleService.getBattleById(String(battleId));
            if (!existing || String(existing.status || '') !== 'scheduled') {
                return res.status(404).json({ message: 'Запланированный бой не найден' });
            }

            battle = await battleService.updateScheduledBattle(String(battleId), {
                startsAt: starts,
                durationSeconds: durationPatch,
                durationLocked: durationExplicitlySet,
                scheduleSource: 'admin_schedule',
                scheduledIntervalHours: null,
            });
            mode = 'update';
        } else {
            const existingManual = await battleService.listScheduledBattles({ includeAuto: false });
            if (existingManual.length > 0) {
                return res.status(409).json({ message: 'Сначала измени или удали уже запланированный бой' });
            }

            const upcoming = await battleService.getUpcomingBattle();
            if (upcoming && String(upcoming.scheduleSource || '') === 'auto') {
                battle = await battleService.updateScheduledBattle(upcoming._id, {
                    startsAt: starts,
                    durationSeconds: durationPatch,
                    durationLocked: durationExplicitlySet,
                    scheduleSource: 'admin_schedule',
                    scheduledIntervalHours: null,
                });
                mode = 'replace_auto';
            } else {
                battle = await battleService.scheduleBattle({
                    startsAt: starts,
                    durationSeconds: durationPatch,
                    durationLocked: durationExplicitlySet,
                    scheduleSource: 'admin_schedule',
                    scheduledIntervalHours: null,
                });
            }
        }

        await adminAudit('battle.schedule', req, {
            battleId: battle?._id || null,
            startsAt: battle?.startsAt || null,
            durationSeconds: battle?.durationSeconds || null,
            mode,
        });

        res.json({
            message: mode === 'update' ? 'Запланированный бой обновлен' : 'Бой запланирован',
            battle,
        });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

const cancelScheduledBattle = async (req, res) => {
    try {
        const battleId = String(req.params?.id || '').trim();
        if (!battleId) {
            return res.status(400).json({ message: 'Не найден запланированный бой' });
        }

        const battle = await deleteScheduledBattleTotally(battleId, 'Удалено администратором');

        await adminAudit('battle.schedule_cancel', req, {
            battleId,
            cancelledBattleId: battle?.battleId || null,
        });

        res.json({
            message: 'Запланированный бой удален',
            battle,
        });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

const clearUpcomingBattle = async (req, res) => {
    try {
        const upcoming = await battleService.getUpcomingBattle();
        const battle = upcoming?._id
            ? await deleteScheduledBattleTotally(upcoming._id, 'Удалено администратором')
            : null;

        await adminAudit('battle.schedule_clear_next', req, {
            clearedBattleId: battle?.battleId || null,
        });

        res.json({
            message: battle ? 'Ближайший запуск убран' : 'Следующий запуск очищен',
            battle,
        });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

const finishBattleNow = async (req, res) => {
    try {
        const active = await battleService.getCurrentBattle();
        if (!active) {
            return res.status(400).json({ message: 'Сейчас нет активного боя' });
        }

        const battle = await battleService.forceFinishBattleNow(active._id);

        await adminAudit('battle.finish_now', req, {
            battleId: battle?._id || null,
            status: battle?.status || null,
        });

        res.json({
            message: 'Бой завершен',
            battle,
        });
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

module.exports = {
    getBattleControl,
    getSuspiciousBattleUsers,
    startBattleNow,
    scheduleBattle,
    cancelScheduledBattle,
    clearUpcomingBattle,
    finishBattleNow,
};
