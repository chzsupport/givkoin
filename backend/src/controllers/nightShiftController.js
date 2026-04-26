const { recordActivity } = require('../services/activityService');
const { awardReferralBlessingExternal } = require('../services/scService');
const { awardRadianceForActivity } = require('../services/activityRadianceService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const nightShiftRuntimeService = require('../services/nightShiftRuntimeService');
const { createNotification } = require('./notificationController');
const emailService = require('../services/emailService');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
const NIGHT_SHIFT_DEFAULT_SALARY = Object.freeze({ sc: 100, lm: 100, stars: 0.001 });

function normalizeLang(value) {
    return value === 'en' ? 'en' : 'ru';
}

function pickLang(lang, ru, en) {
    return normalizeLang(lang) === 'en' ? en : ru;
}

function normalizeNightShiftSalary(value) {
    const sc = Number(value?.sc);
    const lm = Number(value?.lm);
    const stars = Number(value?.stars);

    if (sc === 10 && lm === 50 && stars === 0.01) {
        return { ...NIGHT_SHIFT_DEFAULT_SALARY };
    }

    if (!Number.isFinite(sc) || !Number.isFinite(lm) || !Number.isFinite(stars)) {
        return { ...NIGHT_SHIFT_DEFAULT_SALARY };
    }

    return { sc, lm, stars };
}

async function getSystemSettings() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from(DOC_TABLE)
        .select('id,data')
        .eq('model', 'SystemSettings')
        .maybeSingle();
    
    if (error || !data) {
        // Return defaults
        return {
            _id: 'system_settings',
            nightShiftSalary: { ...NIGHT_SHIFT_DEFAULT_SALARY },
            nightShiftSchedule: { start: null, end: null },
        };
    }
    
    return {
        _id: data.id,
        ...(data.data || {}),
        nightShiftSalary: normalizeNightShiftSalary(data.data?.nightShiftSalary),
        nightShiftSchedule: data.data?.nightShiftSchedule || { start: null, end: null },
    };
}

async function saveSystemSettings(settings) {
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    
    const { data: existing, error: findError } = await supabase
        .from(DOC_TABLE)
        .select('id')
        .eq('model', 'SystemSettings')
        .maybeSingle();
    
    const payload = {
        nightShiftSalary: normalizeNightShiftSalary(settings.nightShiftSalary),
        nightShiftSchedule: settings.nightShiftSchedule || { start: null, end: null },
    };
    
    if (existing) {
        await supabase
            .from(DOC_TABLE)
            .update({ data: payload, updated_at: nowIso })
            .eq('id', existing.id);
    } else {
        await supabase.from(DOC_TABLE).insert({
            model: 'SystemSettings',
            id: 'system_settings',
            data: payload,
            created_at: nowIso,
            updated_at: nowIso,
        });
    }
    
    return settings;
}

function toId(value, depth = 0) {
    if (depth > 3) return '';
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
    if (typeof value === 'object') {
        if (value._id != null) return toId(value._id, depth + 1);
        if (value.id != null) return toId(value.id, depth + 1);
        if (value.value != null) return toId(value.value, depth + 1);
        if (typeof value.toString === 'function') {
            const s = value.toString();
            if (s && s !== '[object Object]') return s;
        }
    }
    return '';
}

async function getUserRowById(userId) {
    const id = toId(userId);
    if (!id) return null;
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from('users')
        .select('id,email,nickname,data')
        .eq('id', String(id))
        .maybeSingle();
    if (error) return null;
    return data || null;
}

async function updateUserDataById(userId, patch) {
    const id = toId(userId);
    if (!id || !patch || typeof patch !== 'object') return null;
    const row = await getUserRowById(id);
    if (!row) return null;
    const existing = getUserData(row);
    const next = { ...existing, ...patch };
    const supabase = getSupabaseClient();
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
        .from('users')
        .update({ data: next, updated_at: nowIso })
        .eq('id', String(id))
        .select('id,email,nickname,data')
        .maybeSingle();
    if (error) return null;
    return data || null;
}

exports.getStatus = async (req, res) => {
    try {
        const nightShift = await nightShiftRuntimeService.getNightShiftStatusForUser(req.user._id);
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || 'ru');
        if (!nightShift) {
            return res.status(404).json({ message: userLang === 'en' ? 'User not found' : 'Пользователь не найден' });
        }
        res.json({ nightShift });
    } catch (error) {
        console.error('Get Night Shift status error:', error);
        res.status(500).json({
            message: pickLang(req.user?.language || req.user?.data?.language, 'Ошибка сервера', 'Server error'),
        });
    }
};

exports.startShift = async (req, res) => {
    try {
        const result = await nightShiftRuntimeService.startShiftForUser(req.user._id);
        const sync = nightShiftRuntimeService.getSyncConfig();
        res.json({
            ok: true,
            shiftSessionId: result.runtime.sessionId,
            heartbeatWindowSeconds: sync.heartbeatWindowSeconds,
            emptyWindowsLimit: sync.emptyWindowsLimit,
            minAnomaliesPerActiveHour: sync.minAnomaliesPerActiveHour,
            minAnomaliesPerPaidHour: sync.minAnomaliesPerPaidHour,
            nightShift: result.nightShift,
        });
    } catch (error) {
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || 'ru');
        if (error.message === 'shift_already_active') {
            return res.status(400).json({ message: userLang === 'en' ? 'You are already on duty.' : 'Вы уже на посту.' });
        }
        if (error.message === 'shift_rest_required') {
            return res.status(400).json({
                message: userLang === 'en'
                    ? 'You had a recent shift. You need to rest now and skip the next duty.'
                    : 'У вас уже была недавняя смена. Сейчас нужно восстановить силы и пропустить следующий выход на пост.',
            });
        }
        if (error.message === 'shift_slots_full') {
            return res.status(400).json({
                message: userLang === 'en'
                    ? 'No duty slots are available right now. Please try again later.'
                    : 'Свободных мест на пост сейчас нет. Попробуйте немного позже.',
            });
        }
        if (error.message === 'shift_schedule_closed') {
            return res.status(400).json({
                message: userLang === 'en'
                    ? 'Night Shift is available only from 19:00 to 06:00 (server time).'
                    : 'Ночная смена доступна только с 19:00 до 06:00 по серверу.',
            });
        }
        console.error('Start shift error:', error);
        res.status(500).json({ message: userLang === 'en' ? 'Server error' : 'Ошибка сервера' });
    }
};

exports.endShift = async (req, res) => {
    try {
        const shiftSessionId = String(req.body?.shiftSessionId || '').trim();
        if (!shiftSessionId) {
            return res.status(400).json({
                message: pickLang(req.user?.language || req.user?.data?.language, 'Нужен идентификатор смены', 'Shift session is required'),
            });
        }

        const result = await nightShiftRuntimeService.endShiftForUser({
            userId: req.user._id,
            shiftSessionId,
            startedAt: req.body?.startedAt,
            endedAt: req.body?.endedAt,
            totalDurationSeconds: req.body?.totalDurationSeconds,
            totalAnomalies: req.body?.totalAnomalies,
            pageHits: req.body?.pageHits,
            windowReports: req.body?.windowReports,
            now: new Date(),
        });
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || 'ru');
        res.json({
            ok: true,
            queued: Boolean(result.queued),
            message: result.queued
                ? (userLang === 'en'
                    ? 'Your Night Shift payout will arrive soon. Please wait for a notification.'
                    : 'Вам поступит оплата в ближайшее время за ночную смену, ожидайте уведомления.')
                : (userLang === 'en' ? 'Thank you for your work.' : 'Благодарим за труд.'),
            settlementEtaSeconds: result.settlementEtaSeconds,
            rewardPreview: result.reward,
            payableHours: result.payableHours,
            closeReason: result.closeReason,
        });
    } catch (error) {
        if (error.message === 'night_shift_session_not_found') {
            return res.status(400).json({
                message: pickLang(req.user?.language || req.user?.data?.language, 'Активная смена не найдена', 'No active shift'),
            });
        }
        console.error('End shift error:', error);
        res.status(500).json({
            message: pickLang(req.user?.language || req.user?.data?.language, 'Ошибка сервера', 'Server error'),
        });
    }
};

exports.getRadar = async (req, res) => {
    try {
        const nightShift = await nightShiftRuntimeService.getNightShiftStatusForUser(req.user._id);
        if (!nightShift) {
            return res.status(404).json({
                message: pickLang(req.user?.language || req.user?.data?.language, 'Пользователь не найден', 'User not found'),
            });
        }
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || 'ru');
        return res.json({
            status: nightShift.isServing ? 'compatibility' : 'off_duty',
            message: userLang === 'en'
                ? 'Radar simulation is now calculated on the client'
                : 'Локальная симуляция радара теперь рассчитывается на клиенте',
        });
    } catch (error) {
        console.error('Get Radar error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.completeMission = async (req, res) => {
    try {
        const userLang = normalizeLang(req.user?.language || req.user?.data?.language || 'ru');
        res.json({
            ok: true,
            compatibility: true,
            message: userLang === 'en'
                ? 'Anomalies are now counted locally and sent as a total at the end of the shift'
                : 'Аномалии теперь считаются локально и отправляются общей суммой в конце смены',
        });
    } catch (error) {
        console.error('Complete mission error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.heartbeat = async (req, res) => {
    try {
        const shiftSessionId = String(req.body?.shiftSessionId || '').trim();
        if (!shiftSessionId) {
            return res.status(400).json({
                message: pickLang(req.user?.language || req.user?.data?.language, 'Не найдена смена', 'Shift not found'),
            });
        }
        const result = await nightShiftRuntimeService.recordShiftHeartbeat({
            userId: req.user._id,
            shiftSessionId,
            windowStartedAt: req.body?.windowStartedAt,
            windowEndedAt: req.body?.windowEndedAt,
            hourIndex: req.body?.hourIndex,
            hourAnomalyCount: req.body?.hourAnomalyCount,
            now: new Date(),
        });
        res.json({
            ok: true,
            accepted: Boolean(result.accepted),
            suspicious: Boolean(result.suspicious),
            consecutiveEmptyWindows: result.consecutiveEmptyWindows,
            hourAnomalies: result.hourAnomalies,
            payableHours: result.payableHours,
            shouldClose: Boolean(result.shouldClose),
            closeReason: result.closeReason || null,
            acceptedAnomaliesTotal: result.acceptedAnomaliesTotal,
            currentWindow: result.currentWindow || null,
        });
    } catch (error) {
        if (error.message === 'night_shift_session_not_found') {
            return res.status(400).json({
                message: pickLang(req.user?.language || req.user?.data?.language, 'Активная смена не найдена', 'Active shift not found'),
            });
        }
        if (error.message === 'night_shift_invalid_heartbeat') {
            return res.status(400).json({
                message: pickLang(req.user?.language || req.user?.data?.language, 'Отчёт по смене выглядит неверно', 'Shift report looks invalid'),
            });
        }
        console.error('Night shift heartbeat error:', error);
        res.status(500).json({
            message: pickLang(req.user?.language || req.user?.data?.language, 'Ошибка сервера', 'Server error'),
        });
    }
};

// Admin Endpoints
exports.getAdminData = async (req, res) => {
    try {
        const snapshot = await nightShiftRuntimeService.getAdminSnapshot({ recentLimit: 100 });

        res.json({
            active: snapshot.active,
            recentShifts: snapshot.recentShifts,
            history: snapshot.recentShifts,
            suspicious: snapshot.suspicious,
        });

    } catch (error) {
        console.error('Get admin data error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.reviewShift = async (req, res) => {
    try {
        const sessionId = String(req.body?.sessionId || '').trim();
        const action = String(req.body?.action || '').trim();

        if (!sessionId) {
            return res.status(400).json({
                message: pickLang(req.user?.language || req.user?.data?.language, 'Не найдена смена для проверки', 'Shift for review not found'),
            });
        }

        const result = await nightShiftRuntimeService.reviewSuspiciousShift({
            sessionId,
            action,
            adminUserId: req.user?._id || null,
            now: new Date(),
        });

        if (action === 'penalize' && result?.user?._id) {
            const userLang = normalizeLang(result?.user?.language || result?.user?.data?.language || 'ru');
        }

        res.json({
            ok: true,
            action,
            penalty: result?.penalty || null,
        });
    } catch (error) {
        if (error.message === 'night_shift_review_not_found') {
            return res.status(404).json({
                message: pickLang(req.user?.language || req.user?.data?.language, 'Смена для проверки не найдена', 'Shift for review not found'),
            });
        }
        if (error.message === 'night_shift_review_invalid_action') {
            return res.status(400).json({
                message: pickLang(req.user?.language || req.user?.data?.language, 'Некорректное действие проверки', 'Invalid review action'),
            });
        }
        if (error.message === 'night_shift_review_already_handled') {
            return res.status(400).json({
                message: pickLang(req.user?.language || req.user?.data?.language, 'Эта смена уже была проверена', 'This shift has already been reviewed'),
            });
        }
        console.error('Night shift review error:', error);
        res.status(500).json({
            message: pickLang(req.user?.language || req.user?.data?.language, 'Ошибка сервера', 'Server error'),
        });
    }
};

exports.updateSalarySettings = async (req, res) => {
    try {
        const { sc, lm, stars, nightShiftSchedule } = req.body;
        const settings = await getSystemSettings();

        if (sc !== undefined) settings.nightShiftSalary.sc = Number(sc);
        if (lm !== undefined) settings.nightShiftSalary.lm = Number(lm);
        if (stars !== undefined) settings.nightShiftSalary.stars = Number(stars);

        if (nightShiftSchedule && typeof nightShiftSchedule === 'object') {
            if (nightShiftSchedule.start !== undefined) {
                const nextStart = nightShiftSchedule.start ? new Date(nightShiftSchedule.start) : null;
                if (nextStart && Number.isNaN(nextStart.getTime())) {
                    return res.status(400).json({
                        message: pickLang(req.user?.language || req.user?.data?.language, 'Некорректная дата начала смены', 'Invalid shift start date'),
                    });
                }
                settings.nightShiftSchedule.start = nextStart;
            }
            if (nightShiftSchedule.end !== undefined) {
                const nextEnd = nightShiftSchedule.end ? new Date(nightShiftSchedule.end) : null;
                if (nextEnd && Number.isNaN(nextEnd.getTime())) {
                    return res.status(400).json({
                        message: pickLang(req.user?.language || req.user?.data?.language, 'Некорректная дата конца смены', 'Invalid shift end date'),
                    });
                }
                settings.nightShiftSchedule.end = nextEnd;
            }

            const s = settings.nightShiftSchedule?.start ? new Date(settings.nightShiftSchedule.start) : null;
            const e = settings.nightShiftSchedule?.end ? new Date(settings.nightShiftSchedule.end) : null;
            if (s && e && s >= e) {
                return res.status(400).json({
                    message: pickLang(
                        req.user?.language || req.user?.data?.language,
                        'Начало смены должно быть раньше конца смены',
                        'Shift start must be earlier than shift end'
                    ),
                });
            }
        }

        await saveSystemSettings(settings);
        res.json({
            ok: true,
            settings: {
                ...settings.nightShiftSalary,
                nightShiftSchedule: settings.nightShiftSchedule
            }
        });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.getSalarySettings = async (req, res) => {
    try {
        const settings = await getSystemSettings();
        res.json({
            settings: {
                ...settings.nightShiftSalary,
                nightShiftSchedule: settings.nightShiftSchedule
            }
        });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

