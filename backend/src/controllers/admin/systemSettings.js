const { adminAudit } = require('../../middleware/adminAudit');
const {
    createOperationApproval,
    serializeApproval,
} = require('../../services/operationApprovalService');
const { getCollectiveMeditationAdminStats } = require('../../services/meditationRuntimeService');
const {
    getRegistrySettingValue,
    updateRegistrySettings,
} = require('../../services/settingsRegistryService');
const { getSetting, setSetting } = require('../../utils/settings');
const {
    COLLECTIVE_MEDITATION_SCHEDULE_KEY,
    getDefaultSchedule,
    normalizeSchedule,
} = require('../meditationController');

function operationMutationResponse({
    operationId = null,
    status = 'executed',
    requiresApproval = false,
    auditId = null,
    data = null,
    message = null,
}) {
    return {
        operationId,
        status,
        requiresApproval,
        auditId,
        ...(message ? { message } : {}),
        ...(data !== null && data !== undefined ? { data } : {}),
    };
}

const getSettings = async (_req, res) => {
    try {
        const [chatKHourlyRate, initialLives, appealCompensation, chatMinutesCap] = await Promise.all([
            getRegistrySettingValue('CHAT_K_PER_HOUR'),
            getRegistrySettingValue('INITIAL_LIVES'),
            getRegistrySettingValue('K_APPEAL_COMPENSATION'),
            getRegistrySettingValue('CHAT_MINUTES_PER_DAY_CAP'),
        ]);

        const settings = {
            // Legacy key for existing admin UI compatibility
            K_PER_HOUR_CHAT: chatKHourlyRate,
            CHAT_MINUTES_PER_DAY_CAP: chatMinutesCap,
            INITIAL_LIVES: initialLives,
            K_APPEAL_COMPENSATION: appealCompensation,
        };

        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateSettings = async (req, res) => {
    try {
        const updates = req.body && typeof req.body === 'object' ? req.body : {};
        const updated = await updateRegistrySettings(updates, {
            userId: req.user._id,
            description: 'Updated via Admin Panel (legacy /admin/settings)',
        });

        await adminAudit('settings.update', req, {
            keys: updated.updated.map((row) => row.key),
        });

        res.json({ message: 'Настройки успешно обновлены', results: updated.updated });
    } catch (error) {
        if (error.status === 400) {
            return res.status(400).json({ message: error.message, key: error.settingKey || null });
        }
        res.status(500).json({ message: error.message });
    }
};

const createBackup = async (req, res) => {
    try {
        const result = await createOperationApproval({
            req,
            actionType: 'system.backup.create',
            reason: req.body?.reason,
            impactPreview: req.body?.impactPreview,
            confirmationPhrase: req.body?.confirmationPhrase,
            payload: {
                source: 'legacy_admin_backup_button',
            },
        });

        res.status(202).json(operationMutationResponse({
            operationId: result.operationId,
            status: result.approval.status,
            requiresApproval: true,
            auditId: result.auditId,
            data: { approval: serializeApproval(result.approval) },
            message: 'Заявка на резервную копию отправлена на подтверждение',
        }));
    } catch (error) {
        res.status(error.status || 500).json({ message: error.message });
    }
};

const getCollectiveMeditationSettings = async (_req, res) => {
    try {
        const serverNow = Date.now();
        const stored = await getSetting(COLLECTIVE_MEDITATION_SCHEDULE_KEY, getDefaultSchedule());
        const schedule = normalizeSchedule(stored);
        const stats = await getCollectiveMeditationAdminStats();
        res.json({ serverNow, schedule, stats });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const updateCollectiveMeditationSettings = async (req, res) => {
    try {
        const nextSchedule = normalizeSchedule(req.body?.schedule);

        await setSetting(
            COLLECTIVE_MEDITATION_SCHEDULE_KEY,
            nextSchedule,
            'Updated collective meditation schedule',
            req.user._id
        );

        await adminAudit('settings.meditation_schedule.update', req, {
            count: nextSchedule.length,
            startsAt: nextSchedule.slice(0, 5).map((s) => s.startsAt),
        });

        res.json({ message: 'Расписание коллективной медитации обновлено', schedule: nextSchedule, serverNow: Date.now() });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = {
    getSettings,
    updateSettings,
    createBackup,
    getCollectiveMeditationSettings,
    updateCollectiveMeditationSettings,
};
