const crypto = require('crypto');

const { awardFortuneSc, spendSc } = require('../services/scService');

const { applyStarsDelta } = require('../utils/stars');

const { getSetting, setSetting } = require('../utils/settings');

const { createNotification } = require('./notificationController');

const { broadcastNotificationByPresence } = require('../services/notificationService');

const { recordActivity } = require('../services/activityService');

const { awardRadianceForActivity } = require('../services/activityRadianceService');

const { getFortuneConfig } = require('../services/fortuneConfigService');

const { recordFortuneWin } = require('../services/fortuneWinLogService');

const { createAdBoostOffer } = require('../services/adBoostService');

const emailService = require('../services/emailService');

const { getFrontendBaseUrl } = require('../config/env');

const { getSupabaseClient } = require('../lib/supabaseClient');

const { getRequestLanguage } = require('../utils/requestLanguage');

const {

    reservePersonalLuckClaim,

    finalizePersonalLuckClaim,

    rollbackPersonalLuckClaim,

} = require('../services/personalLuckService');



const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';



function normalizeLang(lang) {

    return String(lang || '').toLowerCase() === 'en' ? 'en' : 'ru';

}



function pickLang(lang, ru, en) {

    return normalizeLang(lang) === 'en' ? en : ru;

}



function mapDocRow(row) {

    if (!row) return null;

    const data = row.data && typeof row.data === 'object' ? row.data : {};

    return {

        ...data,

        _id: String(row.id),

        createdAt: row.created_at ? new Date(row.created_at) : (data.createdAt || null),

        updatedAt: row.updated_at ? new Date(row.updated_at) : (data.updatedAt || null),

    };

}



async function listFortuneSpins(filter = {}) {

    const supabase = getSupabaseClient();

    const { data, error } = await supabase

        .from(DOC_TABLE)

        .select('id,data,created_at,updated_at')

        .eq('model', 'FortuneSpin')

        .limit(1000);

    if (error || !Array.isArray(data)) return [];

    return data.map(mapDocRow).filter((row) => {

        for (const [key, val] of Object.entries(filter)) {

            if (row[key] !== val) return false;

        }

        return true;

    });

}



async function insertFortuneSpin(doc) {

    const supabase = getSupabaseClient();

    const id = `fs_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

    const nowIso = new Date().toISOString();

    await supabase.from(DOC_TABLE).insert({

        model: 'FortuneSpin',

        id,

        data: doc,

        created_at: nowIso,

        updated_at: nowIso,

    });

    return { ...doc, _id: id };

}



async function listLotteries(filter = {}) {

    const supabase = getSupabaseClient();

    const { data, error } = await supabase

        .from(DOC_TABLE)

        .select('id,data,created_at,updated_at')

        .eq('model', 'Lottery')

        .limit(1000);

    if (error || !Array.isArray(data)) return [];

    return data.map(mapDocRow).filter((row) => {

        for (const [key, val] of Object.entries(filter)) {

            if (row[key] !== val) return false;

        }

        return true;

    });

}



async function insertLottery(doc) {

    const supabase = getSupabaseClient();

    const id = `lot_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

    const nowIso = new Date().toISOString();

    await supabase.from(DOC_TABLE).insert({

        model: 'Lottery',

        id,

        data: doc,

        created_at: nowIso,

        updated_at: nowIso,

    });

    return { ...doc, _id: id };

}



async function updateLottery(id, updates) {

    const supabase = getSupabaseClient();

    const { data: existing, error: loadError } = await supabase

        .from(DOC_TABLE)

        .select('id,data')

        .eq('id', id)

        .maybeSingle();

    if (loadError || !existing) return null;



    const newData = { ...existing.data, ...updates };

    await supabase

        .from(DOC_TABLE)

        .update({ data: newData, updated_at: new Date().toISOString() })

        .eq('id', id);

    return { ...newData, _id: id };

}



async function createTransaction(doc) {

    const supabase = getSupabaseClient();

    const id = `tx_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

    const nowIso = new Date().toISOString();

    await supabase.from(DOC_TABLE).insert({

        model: 'Transaction',

        id,

        data: doc,

        created_at: nowIso,

        updated_at: nowIso,

    });

    return { ...doc, _id: id };

}



const LOTTERY_TICKET_LENGTH = 7;

const LOTTERY_MIN_NUMBER = 1;

const LOTTERY_MAX_NUMBER = 49;

const LOTTERY_DAILY_SETTING_KEY = 'lottery_daily';

const personalLuckInFlight = new Set();

const fortuneSpinCreateInflight = new Map();



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



function getUserData(row) {

    return row?.data && typeof row.data === 'object' ? row.data : {};

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



async function getUsersByIds(ids) {

    const list = Array.isArray(ids) ? ids.map((v) => String(v)).filter(Boolean) : [];

    if (!list.length) return new Map();

    const supabase = getSupabaseClient();

    const { data, error } = await supabase

        .from('users')

        .select('id,email,nickname,data')

        .in('id', list);

    const rows = !error && Array.isArray(data) ? data : [];

    const map = new Map();

    rows.forEach((row) => {

        const d = getUserData(row);

        map.set(String(row.id), {

            id: String(row.id),

            email: row.email || d.email || null,

            nickname: row.nickname || d.nickname || null,

            data: d,

        });

    });

    return map;

}



function startOfDayLocal(date) {

    const d = new Date(date);

    d.setHours(0, 0, 0, 0);

    return d;

}



function nextMidnightLocal(date) {

    const d = startOfDayLocal(date);

    d.setDate(d.getDate() + 1);

    return d;

}



function isSameLocalDay(a, b) {

    if (!a || !b) return false;

    return startOfDayLocal(a).getTime() === startOfDayLocal(b).getTime();

}



function pad2(value) {

    return String(Math.max(0, Math.trunc(Number(value) || 0))).padStart(2, '0');

}



function getDayKey(date) {

    const d = startOfDayLocal(date);

    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

}



function getDrawAt(date, lotteryConfig = null) {

    const d = startOfDayLocal(date);

    const hour = Number(lotteryConfig?.drawHour);

    const minute = Number(lotteryConfig?.drawMinute);

    d.setHours(

        Number.isFinite(hour) ? hour : 23,

        Number.isFinite(minute) ? minute : 59,

        0,

        0

    );

    return d;

}



function getNextDrawAt(date, lotteryConfig = null) {

    const now = new Date(date);

    const currentDrawAt = getDrawAt(now, lotteryConfig);

    if (now.getTime() < currentDrawAt.getTime()) {

        return currentDrawAt;

    }

    return getDrawAt(nextMidnightLocal(now), lotteryConfig);

}



function formatDrawTimeLabel(lotteryConfig = null) {

    const hour = Number(lotteryConfig?.drawHour);

    const minute = Number(lotteryConfig?.drawMinute);

    return `${pad2(Number.isFinite(hour) ? hour : 23)}:${pad2(Number.isFinite(minute) ? minute : 59)}`;

}



function generateLotteryNumbers() {

    const pool = Array.from({ length: LOTTERY_MAX_NUMBER }, (_, index) => index + LOTTERY_MIN_NUMBER);

    for (let i = pool.length - 1; i > 0; i -= 1) {

        const j = Math.floor(Math.random() * (i + 1));

        [pool[i], pool[j]] = [pool[j], pool[i]];

    }

    return pool.slice(0, LOTTERY_TICKET_LENGTH);

}



function formatLotteryNumbers(numbers = []) {

    return numbers.map((n) => n.toString().padStart(2, '0')).join(' ');

}



function parseLotteryNumbers(input) {

    if (!input) return [];

    if (Array.isArray(input)) {

        return input.map((value) => Number(value));

    }

    const raw = String(input);

    const digitsOnly = raw.replace(/\D/g, '');

    if (digitsOnly.length === LOTTERY_TICKET_LENGTH && digitsOnly.length === raw.length) {

        return digitsOnly.split('').map((digit) => Number(digit));

    }

    const matches = raw.match(/\d{1,2}/g) || [];

    return matches.map((value) => Number(value));

}



function normalizeTicketNumbers(input) {

    const numbers = parseLotteryNumbers(input);

    if (numbers.length !== LOTTERY_TICKET_LENGTH) return null;

    const seen = new Set();

    for (const value of numbers) {

        if (!Number.isInteger(value)) return null;

        if (value < LOTTERY_MIN_NUMBER || value > LOTTERY_MAX_NUMBER) return null;

        if (seen.has(value)) return null;

        seen.add(value);

    }

    return numbers;

}



function formatLotteryNumbersForDisplay(numbers = []) {

    const normalized = normalizeTicketNumbers(numbers) || parseLotteryNumbers(numbers);

    if (!normalized.length) return '';

    return normalized.map((value) => String(value)).join(' ');

}



async function getDailyLotteryNumbers(date = new Date()) {

    const dayKey = getDayKey(date);

    const stored = await getSetting(LOTTERY_DAILY_SETTING_KEY);

    if (stored && stored.dateKey === dayKey) {

        if (Array.isArray(stored.winningNumbers) && stored.winningNumbers.length === LOTTERY_TICKET_LENGTH) {

            return stored.winningNumbers.slice();

        }

        if (typeof stored.winningNumber === 'string') {

            const parsed = normalizeTicketNumbers(stored.winningNumber);

            if (parsed) return parsed;

        }

    }



    const winningNumbers = generateLotteryNumbers();

    await setSetting(

        LOTTERY_DAILY_SETTING_KEY,

        {

            dateKey: dayKey,

            winningNumbers,

            winningNumber: formatLotteryNumbers(winningNumbers),

        },

        'Daily lottery winning numbers'

    );

    return winningNumbers.slice();

}



function countTicketMatches(ticketNumbers, winningNumbers) {

    const normalizedTicket = normalizeTicketNumbers(ticketNumbers) || parseLotteryNumbers(ticketNumbers);

    if (!normalizedTicket.length || !winningNumbers || !winningNumbers.length) return 0;

    const winningSet = new Set(winningNumbers);

    return normalizedTicket.reduce((sum, value) => sum + (winningSet.has(value) ? 1 : 0), 0);

}



function getPrizeForMatches(matches, lotteryConfig = null) {

    const payout = lotteryConfig?.payoutByMatches && typeof lotteryConfig.payoutByMatches === 'object'

        ? lotteryConfig.payoutByMatches

        : {};

    const value = Number(payout[matches]);

    if (Number.isFinite(value) && value >= 0) return value;

    return 0;

}



function extractNicknameOrNull(value) {

    const nickname = typeof value === 'string' ? value.trim() : '';

    return nickname || null;

}



function getDirectionTotals(rows = []) {

    let earned = 0;

    let spent = 0;

    for (const row of rows) {

        if (row._id === 'credit') {

            earned = row.total;

        } else if (row._id === 'debit') {

            spent = row.total;

        }

    }

    return { earned, spent };

}



async function findLotteryByUserAndDate(userId, dayStart) {

    const supabase = getSupabaseClient();

    const { data, error } = await supabase

        .from(DOC_TABLE)

        .select('id,data,created_at,updated_at')

        .eq('model', 'Lottery')

        .limit(500);

    if (error || !Array.isArray(data)) return null;

    

    const dayIso = dayStart instanceof Date ? dayStart.toISOString() : dayStart;

    return data.find((row) => {

        const d = row.data || {};

        return String(d.user) === String(userId) && d.drawDate === dayIso;

    }) || null;

}



async function upsertLottery(id, data) {

    const supabase = getSupabaseClient();

    const nowIso = new Date().toISOString();

    

    if (id) {

        await supabase

            .from(DOC_TABLE)

            .update({ data, updated_at: nowIso })

            .eq('id', id);

        return { ...data, _id: id };

    }

    

    const newId = `lot_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

    await supabase.from(DOC_TABLE).insert({

        model: 'Lottery',

        id: newId,

        data,

        created_at: nowIso,

        updated_at: nowIso,

    });

    return { ...data, _id: newId };

}



async function ensureUserLotteryForDay({ userId, dayStart, winningNumbers, now, drawAt }) {

    let existing = await findLotteryByUserAndDate(userId, dayStart);

    const dayIso = dayStart instanceof Date ? dayStart.toISOString() : dayStart;

    

    let data;

    if (!existing) {

        data = {

            user: userId,

            tickets: [],

            drawDate: dayIso,

            status: 'open',

            winningNumbers,

            winningNumber: formatLotteryNumbers(winningNumbers),

        };

    } else {

        data = existing.data || {};

    }



    let shouldSave = false;

    if (!Array.isArray(data.winningNumbers) || data.winningNumbers.length !== LOTTERY_TICKET_LENGTH) {

        data.winningNumbers = winningNumbers;

        shouldSave = true;

    }

    if (!data.winningNumber) {

        data.winningNumber = formatLotteryNumbers(data.winningNumbers || winningNumbers);

        shouldSave = true;

    }

    if (now && drawAt && now >= drawAt && data.status === 'open') {

        data.status = 'closed';

        shouldSave = true;

    }

    if (shouldSave || !existing) {

        const id = existing?.id || null;

        return upsertLottery(id, data);

    }



    return { ...data, _id: existing.id };

}



async function findFortuneSpinByUser(userId) {

    const supabase = getSupabaseClient();

    const { data, error } = await supabase

        .from(DOC_TABLE)

        .select('id,data,created_at,updated_at')

        .eq('model', 'FortuneSpin')

        .limit(500);

    if (error || !Array.isArray(data)) return null;

    

    return data.find((row) => {

        const d = row.data || {};

        return String(d.user) === String(userId);

    }) || null;

}



async function upsertFortuneSpin(id, data) {

    const supabase = getSupabaseClient();

    const nowIso = new Date().toISOString();

    

    if (id) {

        await supabase

            .from(DOC_TABLE)

            .update({ data, updated_at: nowIso })

            .eq('id', id);

        return { ...data, _id: id };

    }

    

    const newId = `fs_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

    await supabase.from(DOC_TABLE).insert({

        model: 'FortuneSpin',

        id: newId,

        data,

        created_at: nowIso,

        updated_at: nowIso,

    });

    return { ...data, _id: newId };

}



async function findOrCreateFortuneSpin(userId) {

    let existing = await findFortuneSpinByUser(userId);

    if (existing) return { ...existing.data, _id: existing.id };



    const inflightKey = String(userId);

    const inflight = fortuneSpinCreateInflight.get(inflightKey);

    if (inflight) {

        await inflight;

        existing = await findFortuneSpinByUser(userId);

        return existing ? { ...existing.data, _id: existing.id } : null;

    }



    const createPromise = upsertFortuneSpin(null, { user: userId, spinsToday: 0, totalSpins: 0 });

    fortuneSpinCreateInflight.set(inflightKey, createPromise);

    try {

        return await createPromise;

    } finally {

        if (fortuneSpinCreateInflight.get(inflightKey) === createPromise) {

            fortuneSpinCreateInflight.delete(inflightKey);

        }

    }

}



async function ensureFortuneSpinStateForToday(userId, now = new Date(), { persistReset = false } = {}) {

    const spinData = await findOrCreateFortuneSpin(userId);

    const lastSpin = spinData.lastSpinAt ? new Date(spinData.lastSpinAt) : null;



    if (!lastSpin || isSameLocalDay(now, lastSpin)) {

        if (!Number.isFinite(Number(spinData.adOfferSpinsToday))) {

            spinData.adOfferSpinsToday = Number(spinData.spinsToday) || 0;

        }

        return spinData;

    }



    const shouldPersistReset = (Number(spinData.spinsToday) > 0 || Number(spinData.adOfferSpinsToday) > 0) && persistReset;

    spinData.spinsToday = 0;

    spinData.adOfferSpinsToday = 0;



    if (shouldPersistReset) {

        await upsertFortuneSpin(spinData._id, spinData);

    }



    return spinData;

}



async function getRouletteRewardsToday(userId, now = new Date()) {

    const from = startOfDayLocal(now).toISOString();

    const to = nextMidnightLocal(now).toISOString();

    const supabase = getSupabaseClient();

    const { data, error } = await supabase

        .from('transactions')

        .select('id,type,direction,amount,currency,description,occurred_at')

        .eq('user_id', String(userId))

        .eq('direction', 'credit')

        .gte('occurred_at', from)

        .lt('occurred_at', to)

        .limit(5000);

    if (error || !Array.isArray(data)) return { sc: 0, stars: 0 };



    return data.reduce((acc, row) => {

        const type = String(row?.type || '');

        const currency = String(row?.currency || 'K').toUpperCase();

        const description = String(row?.description || '').trim().toLowerCase();

        const amount = Number(row?.amount) || 0;

        if (!(amount > 0)) return acc;

        if (type === 'fortune' && currency === 'K') {

            const isRouletteWin = description.includes('выигрыш в колесе фортуны')

                || description.includes('fortune wheel winnings');

            if (isRouletteWin) acc.sc += amount;

        }

        if (type === 'fortune_roulette' && currency === 'STAR') {

            acc.stars += amount;

        }

        return acc;

    }, { sc: 0, stars: 0 });

}



exports.ensureDailyLotteryNumber = async () => {

    await getDailyLotteryNumbers(new Date());

};



exports.__resetFortuneControllerRuntimeState = () => {

    fortuneSpinCreateInflight.clear();

    personalLuckInFlight.clear();

};



exports.getConfig = async (_req, res) => {

    try {

        const config = await getFortuneConfig();

        res.json(config);

    } catch (error) {

        const userLang = normalizeLang(_req?.query?.language || 'ru');

        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });

    }

};



exports.getSpinStatus = async (req, res) => {

    try {

        const now = new Date();

        const [fortuneConfig, spinData, userRowForBoost] = await Promise.all([

            getFortuneConfig(),

            ensureFortuneSpinStateForToday(req.user._id, now, { persistReset: true }),

            getUserRowById(req.user._id),

        ]);

        const dailyFreeSpins = Math.max(1, Number(fortuneConfig?.roulette?.dailyFreeSpins) || 3);

        const userBoostData = getUserData(userRowForBoost);

        const fortuneBoosts = userBoostData.fortuneBoosts && typeof userBoostData.fortuneBoosts === 'object' ? userBoostData.fortuneBoosts : {};

        const availableAdExtraSpins = Math.max(0, Math.floor(Number(fortuneBoosts.rouletteExtraSpins) || 0));

        const countedSpinsToday = Math.max(

            Math.max(0, Math.floor(Number(spinData.spinsToday) || 0)),

            Math.max(0, Math.floor(Number(spinData.adOfferSpinsToday) || 0))

        );

        const freeSpinsLeft = Math.max(0, dailyFreeSpins - countedSpinsToday);

        const spinsLeft = freeSpinsLeft + availableAdExtraSpins;

        const alreadyToday = await hasClaimedPersonalLuckToday({
            userId: req.user._id,
            now,
            fallbackLastLuckyDrawAt: getUserData(userRowForBoost)?.achievementStats?.lastLuckyDrawAt || null,
        });

        res.json({

            spinsLeft,

            freeSpinsLeft,

            adExtraSpins: availableAdExtraSpins,

            totalSpins: spinData.totalSpins,

            lastSpinAt: spinData.lastSpinAt,

            nextResetAt: nextMidnightLocal(now),

            luckyDayAvailable: !alreadyToday,

        });

    } catch (error) {

        const userLang = normalizeLang(getRequestLanguage(req));

        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });

    }

};



exports.spin = async (req, res) => {

    try {

        const userLang = normalizeLang(getRequestLanguage(req));

        const now = new Date();

        const [fortuneConfig, spinData] = await Promise.all([

            getFortuneConfig(),

            ensureFortuneSpinStateForToday(req.user._id, now),

        ]);

        const rouletteConfig = fortuneConfig?.roulette || {};

        const dailyFreeSpins = Math.max(1, Number(rouletteConfig.dailyFreeSpins) || 3);

        const minSpinsSinceStar = Math.max(0, Number(rouletteConfig.minSpinsSinceStar) || 21);

        const minDaysSinceStar = Math.max(0, Number(rouletteConfig.minDaysSinceStar) || 7);

        const allSectors = Array.isArray(rouletteConfig.sectors) ? rouletteConfig.sectors : [];

        const userRowForBoost = await getUserRowById(req.user._id);

        const userBoostData = getUserData(userRowForBoost);

        const fortuneBoosts = userBoostData.fortuneBoosts && typeof userBoostData.fortuneBoosts === 'object' ? userBoostData.fortuneBoosts : {};

        const availableAdExtraSpins = Math.max(0, Math.floor(Number(fortuneBoosts.rouletteExtraSpins) || 0));

        const adOfferSpinsToday = Math.max(0, Math.floor(Number(spinData.adOfferSpinsToday) || 0));

        const freeAttemptLimitReached = adOfferSpinsToday >= dailyFreeSpins;

        const usingAdExtraSpin = freeAttemptLimitReached && availableAdExtraSpins > 0;



        if (freeAttemptLimitReached && !usingAdExtraSpin) {

            return res.status(400).json({

                message: pickLang(userLang, 'Бесплатные вращения на сегодня закончились', 'Free spins for today are over'),

            });

        }



        const canWinStar = () => {

            if (spinData.spinsSinceLastStar < minSpinsSinceStar) {

                return false;

            }



            if (spinData.lastStarWinAt) {

                const daysSinceLastStar = (now - new Date(spinData.lastStarWinAt)) / (1000 * 60 * 60 * 24);

                if (daysSinceLastStar < minDaysSinceStar) {

                    return false;

                }

            }



            return true;

        };



        let availableSectors = allSectors.filter((s) => s && s.enabled !== false);



        if (!canWinStar()) {

            availableSectors = availableSectors.filter(s => s.type !== 'star');

        }



        if (!availableSectors.length) {

            return res.status(400).json({

                message: pickLang(userLang, 'В конфигурации рулетки нет активных секторов', 'No active roulette sectors in configuration'),

            });

        }



        const totalWeight = availableSectors.reduce((sum, s) => sum + s.weight, 0);

        let randomValue = Math.random() * totalWeight;

        let result = availableSectors[availableSectors.length - 1];



        for (const sector of availableSectors) {

            if (randomValue < sector.weight) {

                result = sector;

                break;

            }

            randomValue -= sector.weight;

        }



        const originalIndex = allSectors.findIndex((s) =>

            s.label === result.label

            && s.type === result.type

            && Number(s.value) === Number(result.value)

        );



        const lastSpinWasBonus = spinData.lastSpinWasBonus;



        spinData.spinsToday += usingAdExtraSpin ? 0 : 1;

        if (!usingAdExtraSpin) {

            spinData.adOfferSpinsToday = Math.max(0, Math.floor(Number(spinData.adOfferSpinsToday) || 0)) + 1;

        }

        spinData.totalSpins += 1;

        spinData.lastSpinAt = now;

        spinData.spinsSinceLastStar += 1;



        spinData.lastPrize = result.label;

        spinData.lastPrizeType = result.type;



        // Ачивки

        try {

            const { grantAchievement } = require('../services/achievementService');



            // #63. Доп. вращение после победы

            if (result.type === 'spin') {

                const supabase = getSupabaseClient();

                const { data: battleRows, error: battleError } = await supabase

                    .from(DOC_TABLE)

                    .select('id,data,updated_at')

                    .eq('model', 'Battle')

                    .limit(500);

                

                if (!battleError && Array.isArray(battleRows)) {

                    const userBattles = battleRows

                        .filter((row) => {

                            const participants = row.data?.participants || [];

                            return participants.some((p) => String(p.user) === String(req.user._id));

                        })

                        .map((row) => ({ ...row.data, _id: row.id, updatedAt: row.updated_at }))

                        .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));

                    

                    const lastBattle = userBattles[0];

                    if (lastBattle && lastBattle.status === 'finished' && lastBattle.winner === 'light') {

                        if (Date.now() - new Date(lastBattle.updatedAt).getTime() < 15 * 60 * 1000) {

                            await grantAchievement({ userId: req.user._id, achievementId: 63 });

                        }

                    }

                }

            }



            // #79. 100 K трижды

            if (result.type === 'sc' && result.value === 100) {

                const userRow = await getUserRowById(req.user._id);

                const data = getUserData(userRow);

                const stats = data.achievementStats && typeof data.achievementStats === 'object' ? data.achievementStats : {};

                const nextCount = (Number(stats.totalRoulette100ScWins) || 0) + 1;

                await updateUserDataById(req.user._id, { achievementStats: { ...stats, totalRoulette100ScWins: nextCount } });

                if (nextCount >= 3) {

                    await grantAchievement({ userId: req.user._id, achievementId: 79 });

                }

            }



            // #80. Бонус -> 50+ K

            if (lastSpinWasBonus && result.type === 'sc' && result.value >= 50) {

                await grantAchievement({ userId: req.user._id, achievementId: 80 });

            }



            // #81. 30 дней подряд по 3 спина

            if (spinData.spinsToday === dailyFreeSpins) {

                const userRow = await getUserRowById(req.user._id);

                const data = getUserData(userRow);

                const stats = data.achievementStats && typeof data.achievementStats === 'object' ? data.achievementStats : {};

                let row = (stats?.rouletteSpinsRow30 || 0);

                const lastRowDate = stats?.lastRouletteSpinAt;

                const yesterday = new Date(now);

                yesterday.setDate(yesterday.getDate() - 1);



                if (lastRowDate && isSameLocalDay(lastRowDate, yesterday)) {

                    row += 1;

                } else if (!lastRowDate || !isSameLocalDay(lastRowDate, now)) {

                    row = 1;

                }



                await updateUserDataById(req.user._id, {

                    achievementStats: {

                        ...stats,

                        rouletteSpinsRow30: row,

                        lastRouletteSpinAt: now,

                    }

                });

                if (row >= 30) await grantAchievement({ userId: req.user._id, achievementId: 81 });

            }



            // #82. Получить звезду

            if (result.type === 'star') {

                await grantAchievement({ userId: req.user._id, achievementId: 82 });

            }

        } catch (e) {

            console.error('Roulette achievement error:', e);

        }



        spinData.lastSpinWasBonus = (result.type === 'spin');



        if (result.type === 'star') {

            spinData.lastStarWinAt = now;

            spinData.spinsSinceLastStar = 0;

        }



        if (result.type === 'spin' && !usingAdExtraSpin) {

            spinData.spinsToday = Math.max(0, spinData.spinsToday - 1);

        }



        if (usingAdExtraSpin) {

            await updateUserDataById(req.user._id, {

                fortuneBoosts: {

                    ...fortuneBoosts,

                    rouletteExtraSpins: Math.max(0, availableAdExtraSpins - 1),

                },

            });

        }



        await upsertFortuneSpin(spinData._id, spinData);



        await recordFortuneWin({

            userId: req.user._id,

            gameType: 'roulette',

            rewardType: result.type === 'sc' || result.type === 'star' || result.type === 'spin' ? result.type : 'other',

            amount: Number(result.value) || 0,

            label: String(result.label || ''),

            occurredAt: now,

            meta: {

                spinNumber: spinData.totalSpins,

                sectorIndex: originalIndex < 0 ? 0 : originalIndex,

                adOfferSpinNumber: Math.max(0, Math.floor(Number(spinData.adOfferSpinsToday) || 0)),

                usingAdExtraSpin,

                eligibleForRouletteDouble: !usingAdExtraSpin && Math.max(0, Math.floor(Number(spinData.adOfferSpinsToday) || 0)) <= dailyFreeSpins,

            },

        });



        awardRadianceForActivity({

            userId: req.user._id,

            amount: 2,

            activityType: 'fortune_spin',

            meta: { spinNumber: spinData.totalSpins, resultType: result.type, resultLabel: result.label },

            dedupeKey: `fortune_spin:${req.user._id}:${spinData.totalSpins}`,

        }).catch(() => { });



        recordActivity({

            userId: req.user._id,

            type: 'fortune_spin',

            minutes: 1,

            meta: {

                resultType: result.type,

                resultLabel: result.label,

                resultValue: Number(result.value) || 0,

            },

        }).catch(() => { });



        if (result.type === 'sc' && result.value > 0) {

            await awardFortuneSc({

                userId: req.user._id,

                amount: result.value,

                description: pickLang(userLang, 'Выигрыш в Колесе Фортуны', 'Fortune Wheel winnings'),

            });

        } else if (result.type === 'star' && result.value > 0) {

            await applyStarsDelta({

                userId: req.user._id,

                delta: result.value,

                type: 'fortune_roulette',

                description: pickLang(userLang, 'Колесо Фортуны', 'Fortune Wheel'),

                relatedEntity: spinData._id,

                occurredAt: now,

            });

        }



        let boostOffer = null;

        if (!usingAdExtraSpin && Math.max(0, Math.floor(Number(spinData.adOfferSpinsToday) || 0)) >= dailyFreeSpins) {

            boostOffer = await createAdBoostOffer({

                userId: req.user._id,

                type: 'roulette_extra_spin',

                contextKey: `roulette_extra:${req.user._id}:${getDayKey(now)}`,

                page: 'fortune/roulette',

                title: pickLang(userLang, 'Дополнительное вращение', 'Extra spin'),

                description: pickLang(userLang, 'Досмотрите видео, чтобы получить ещё одно вращение рулетки.', 'Watch the video to receive one extra roulette spin.'),

                reward: { kind: 'roulette_extra_spin' },

            }).catch(() => null);

        } else if (usingAdExtraSpin) {

            const todayRewards = await getRouletteRewardsToday(req.user._id, now);

            if (todayRewards.sc > 0 || todayRewards.stars > 0) {

                boostOffer = await createAdBoostOffer({

                    userId: req.user._id,

                    type: 'roulette_double_today',

                    contextKey: `roulette_double:${req.user._id}:${getDayKey(now)}`,

                    page: 'fortune/roulette',

                    title: pickLang(userLang, 'Удвоить выигрыш рулетки', 'Double roulette winnings'),

                    description: pickLang(userLang, 'Досмотрите видео, чтобы повторить сегодняшние выигрыши рулетки.', 'Watch the video to repeat today’s roulette winnings.'),

                    reward: {

                        kind: 'currency',

                        sc: todayRewards.sc,

                        stars: todayRewards.stars,

                        transactionType: 'roulette_ad_boost',

                        description: pickLang(userLang, 'Дополнительная награда: Фортуна (Рулетка)', 'Extra reward: Fortune (Roulette)'),

                    },

                }).catch(() => null);

            }

        }



        const countedSpinsToday = Math.max(

            Math.max(0, Math.floor(Number(spinData.spinsToday) || 0)),

            Math.max(0, Math.floor(Number(spinData.adOfferSpinsToday) || 0))

        );

        const freeSpinsLeft = Math.max(0, dailyFreeSpins - countedSpinsToday);

        const remainingAdExtraSpins = usingAdExtraSpin ? Math.max(0, availableAdExtraSpins - 1) : availableAdExtraSpins;



        res.json({

            sectorIndex: originalIndex < 0 ? 0 : originalIndex,

            result,

            spinsLeft: freeSpinsLeft + remainingAdExtraSpins,

            freeSpinsLeft,

            adExtraSpins: remainingAdExtraSpins,

            nextResetAt: nextMidnightLocal(now),

            boostOffer,

        });

    } catch (error) {

        const userLang = normalizeLang(getRequestLanguage(req));

        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });

    }

};



exports.getGlobalStats = async (req, res) => {

    try {

        // Агрегация статистики рулетки

        const allSpins = await listFortuneSpins();

        const totalSpins = allSpins.reduce((sum, s) => sum + (Number(s.totalSpins) || 0), 0);

        const activeUsers = allSpins.length;



        // Топ спиннеров

        const topSpinners = [...allSpins].sort((a, b) => (Number(b.totalSpins) || 0) - (Number(a.totalSpins) || 0)).slice(0, 5);



        // Статистика лотереи

        const allLotteries = await listLotteries();

        const totalTickets = allLotteries.reduce((sum, l) => sum + (Array.isArray(l.tickets) ? l.tickets.length : 0), 0);

        const lotteryPlayers = allLotteries.length;



        // Топ лотерейных победителей

        const topLotteryWinners = allLotteries

            .filter((l) => (Number(l.prizeSc) || 0) > 0)

            .sort((a, b) => (Number(b.prizeSc) || 0) - (Number(a.prizeSc) || 0))

            .slice(0, 5);



        // Недавние победители рулетки

        const recentSpinners = allSpins

            .filter((s) => s.lastSpinAt)

            .sort((a, b) => new Date(b.lastSpinAt).getTime() - new Date(a.lastSpinAt).getTime())

            .slice(0, 20);



        // Транзакции для статистики K

        const supabase = getSupabaseClient();

        const { data: txData } = await supabase

            .from(DOC_TABLE)

            .select('id,data')

            .eq('model', 'Transaction')

            .limit(5000);

        const transactions = (txData || []).map((r) => r.data || {});



        // K выплаченные только из рулетки

        const rouletteScIssued = transactions

            .filter((t) => t.type === 'fortune' && t.direction === 'credit')

            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);



        // K выплаченные из лотереи

        const lotteryScIssued = transactions

            .filter((t) => t.type === 'lottery' && t.direction === 'credit')

            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);



        // Максимальный выигрыш

        const fortuneMaxWin = Math.max(

            0,

            ...transactions

                .filter((t) => t.type === 'fortune' && t.direction === 'credit')

                .map((t) => Number(t.amount) || 0)

        );



        // Получаем пользователей для отображения никнеймов

        const userIds = new Set([

            ...topSpinners.map((s) => String(s.user)),

            ...recentSpinners.map((s) => String(s.user)),

            ...topLotteryWinners.map((l) => String(l.user)),

        ].filter(Boolean));



        const { data: usersData } = await supabase

            .from('users')

            .select('id,nickname')

            .in('id', Array.from(userIds));

        const userMap = new Map((usersData || []).map((u) => [String(u.id), u]));



        const topSpinnersPayload = topSpinners

            .map((row) => {

                const uid = String(row?.user);

                const userRow = userMap.get(uid);

                const nickname = userRow?.nickname || null;

                if (!nickname) return null;

                return {

                    nickname,

                    totalSpins: Number(row?.totalSpins) || 0,

                };

            })

            .filter(Boolean);



        const recentActivityPayload = recentSpinners

            .map((row) => {

                const uid = String(row?.user);

                const userRow = userMap.get(uid);

                const nickname = userRow?.nickname || null;

                if (!nickname) return null;

                return {

                    nickname,

                    lastSpinAt: row.lastSpinAt,

                    prize: row.lastPrize || pickLang(normalizeLang(getRequestLanguage(req)), 'Спин', 'Spin'),

                };

            })

            .filter(Boolean)

            .slice(0, 8);



        const topWinnersPayload = topLotteryWinners

            .map((row) => {

                const uid = String(row?.user);

                const userRow = userMap.get(uid);

                const nickname = userRow?.nickname || null;

                if (!nickname) return null;

                return {

                    nickname,

                    prize: Number(row?.prizeSc) || 0,

                };

            })

            .filter(Boolean);



        res.json({

            roulette: {

                totalSpins,

                activeUsers,

                totalScIssued: rouletteScIssued,

                topSpinners: topSpinnersPayload,

                recentActivity: recentActivityPayload,

            },

            lottery: {

                totalTickets,

                totalPrizesPaid: lotteryScIssued,

                totalDraws: lotteryPlayers,

                topWinners: topWinnersPayload,

            },

            world: {

                totalScFromLottery: lotteryScIssued,

                totalFortunePlayers: activeUsers,

                totalLotteryPlayers: lotteryPlayers,

                maxFortuneWin: fortuneMaxWin,

            }

        });

    } catch (error) {

        const userLang = normalizeLang(getRequestLanguage(req));

        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });

    }

};



exports.getUserStats = async (req, res) => {

    try {

        const userId = req.user._id;

        const spinData = await findFortuneSpinByUser(userId);

        const allTransactions = await (async () => {

            const supabase = getSupabaseClient();

            const { data } = await supabase

                .from(DOC_TABLE)

                .select('id,data')

                .eq('model', 'Transaction')

                .limit(2000);

            return (data || []).map((r) => r.data || {});

        })();



        const userTx = allTransactions.filter((t) => String(t.user) === String(userId));



        const fortuneTx = userTx.filter((t) => t.type === 'fortune');

        const fortuneEarned = fortuneTx.filter((t) => t.direction === 'credit').reduce((s, t) => s + (Number(t.amount) || 0), 0);

        const fortuneSpent = fortuneTx.filter((t) => t.direction === 'debit').reduce((s, t) => s + (Number(t.amount) || 0), 0);



        const lotteryTx = userTx.filter((t) => t.type === 'lottery');

        const lotteryEarned = lotteryTx.filter((t) => t.direction === 'credit').reduce((s, t) => s + (Number(t.amount) || 0), 0);

        const lotterySpent = lotteryTx.filter((t) => t.direction === 'debit').reduce((s, t) => s + (Number(t.amount) || 0), 0);



        const userLotteries = (await listLotteries()).filter((l) => String(l.user) === String(userId));

        const totalTickets = userLotteries.reduce((s, l) => s + (Array.isArray(l.tickets) ? l.tickets.length : 0), 0);

        const totalPrizeSc = userLotteries.reduce((s, l) => s + (Number(l.prizeSc) || 0), 0);



        const totalEarned = fortuneEarned + lotteryEarned;

        const totalSpent = fortuneSpent + lotterySpent;

        const net = totalEarned - totalSpent;



        res.json({

            roulette: {

                totalSpins: spinData?.data?.totalSpins || 0,

                lastSpinAt: spinData?.data?.lastSpinAt || null,

                scEarned: fortuneEarned,

                scSpent: fortuneSpent,

            },

            lottery: {

                totalTickets,

                totalDraws: userLotteries.length,

                scWon: lotteryEarned,

                scSpent: lotterySpent,

                totalPrizeSc,

            },

            total: {

                scEarned: totalEarned,

                scSpent: totalSpent,

                scNet: net,

            },

        });

    } catch (error) {

        const userLang = normalizeLang(getRequestLanguage(req));

        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });

    }

};



exports.getLotteryStatus = async (req, res) => {

    try {

        const fortuneConfig = await getFortuneConfig();

        const lotteryConfig = fortuneConfig?.lottery || {};

        const ticketCost = Math.max(1, Number(lotteryConfig.ticketCost) || 100);

        const maxTicketsPerDay = Math.max(1, Number(lotteryConfig.maxTicketsPerDay) || 10);



        const userId = req.user._id;

        const now = new Date();

        const drawAt = getDrawAt(now, lotteryConfig);

        const nextDrawAt = getNextDrawAt(now, lotteryConfig);

        const dayStart = startOfDayLocal(now);

        const winningNumbers = await getDailyLotteryNumbers(now);

        const lottery = await ensureUserLotteryForDay({ userId, dayStart, winningNumbers, now, drawAt });

        const tickets = Array.isArray(lottery.tickets) ? lottery.tickets : [];

        const ticketsToday = tickets.length;

        const isDrawCompleted = lottery.status === 'paid';

        const userRowForBoost = await getUserRowById(userId);

        const userBoostData = getUserData(userRowForBoost);

        const fortuneBoosts = userBoostData.fortuneBoosts && typeof userBoostData.fortuneBoosts === 'object' ? userBoostData.fortuneBoosts : {};

        const freeTickets = Math.max(0, Math.floor(Number(fortuneBoosts.lotteryFreeTickets) || 0));



        res.json({

            ticketsBought: tickets,

            ticketsToday,

            maxTicketsPerDay,

            ticketCost,

            nextDraw: nextDrawAt,

            nextDrawCountdownMs: Math.max(0, nextDrawAt.getTime() - now.getTime()),

            drawTimeLabel: formatDrawTimeLabel(lotteryConfig),

            winningNumber: isDrawCompleted ? (lottery.winningNumber || formatLotteryNumbers(winningNumbers)) : null,

            winningNumbers: isDrawCompleted ? (lottery.winningNumbers || winningNumbers) : [],

            status: lottery.status,

            prize: lottery.prizeSc || 0,

            freeTickets,

        });

    } catch (error) {

        const userLang = normalizeLang(getRequestLanguage(req));

        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });

    }

};



exports.buyLotteryTicket = async (req, res) => {

    try {

        const userLang = normalizeLang(getRequestLanguage(req));

        const fortuneConfig = await getFortuneConfig();

        const lotteryConfig = fortuneConfig?.lottery || {};

        const ticketCost = Math.max(1, Number(lotteryConfig.ticketCost) || 100);

        const maxTicketsPerDay = Math.max(1, Number(lotteryConfig.maxTicketsPerDay) || 10);



        const userId = req.user._id;

        const { ticketNumber: rawTicketNumber, numbers: rawNumbers } = req.body;

        const normalizedNumbers = normalizeTicketNumbers(rawNumbers ?? rawTicketNumber);

        if (!normalizedNumbers) {

            return res.status(400).json({

                message: pickLang(userLang, 'Выберите 7 разных чисел от 1 до 49', 'Choose 7 different numbers from 1 to 49'),

            });

        }



        const userRow = await getUserRowById(userId);

        const userData = getUserData(userRow);

        const fortuneBoosts = userData.fortuneBoosts && typeof userData.fortuneBoosts === 'object' ? userData.fortuneBoosts : {};

        const freeTickets = Math.max(0, Math.floor(Number(fortuneBoosts.lotteryFreeTickets) || 0));

        const useFreeTicket = freeTickets > 0;

        if (!useFreeTicket && (Number(userData.sc) || 0) < ticketCost) {

            return res.status(400).json({

                message: pickLang(userLang, 'Недостаточно K для покупки билета', 'Not enough K to buy a ticket'),

            });

        }



        const now = new Date();

        const drawAt = getDrawAt(now, lotteryConfig);

        if (now >= drawAt) {

            return res.status(400).json({

                message: pickLang(userLang, 'Покупка билетов закрыта до следующего дня', 'Ticket purchase is closed until the next day'),

            });

        }

        const dayStart = startOfDayLocal(now);

        const winningNumbers = await getDailyLotteryNumbers(now);

        const lottery = await ensureUserLotteryForDay({ userId, dayStart, winningNumbers, now, drawAt });



        if (lottery.status !== 'open') {

            return res.status(400).json({

                message: pickLang(userLang, 'Покупка билетов закрыта до следующего дня', 'Ticket purchase is closed until the next day'),

            });

        }



        if (!Array.isArray(lottery.tickets)) {

            lottery.tickets = [];

        }



        const ticketsToday = lottery.tickets.length;



        if (ticketsToday >= maxTicketsPerDay) {

            return res.status(400).json({

                message: pickLang(userLang, 'Лимит билетов на сегодня исчерпан', 'Daily ticket limit reached'),

            });

        }



        if (useFreeTicket) {

            await updateUserDataById(userId, {

                fortuneBoosts: {

                    ...fortuneBoosts,

                    lotteryFreeTickets: Math.max(0, freeTickets - 1),

                },

            });

        } else {

            await spendSc({

                userId,

                amount: ticketCost,

                description: pickLang(userLang, 'Покупка лотерейного билета', 'Lottery ticket purchase'),

                type: 'lottery',

            });

        }

        // Добавить билет

        const tickets = lottery.tickets || [];

        tickets.push({

            numbers: normalizedNumbers,

            ticketNumber: formatLotteryNumbers(normalizedNumbers),

            purchasedAt: now.toISOString()

        });



        await upsertLottery(lottery._id, { ...lottery, tickets });



        // Сияние за покупку билета: +3 за 1 билет (только при травме)

        try {

            const newTicket = tickets[tickets.length - 1];

            const ticketId = `${formatLotteryNumbers(normalizedNumbers)}:${now.toISOString()}`;

            awardRadianceForActivity({

                userId,

                amount: 3,

                activityType: 'lottery_ticket_buy',

                meta: { lotteryId: lottery._id, ticketId },

                dedupeKey: `lottery_ticket_buy:${ticketId}:${userId}`,

            }).catch(() => { });

        } catch (e) {

            // ignore

        }



        const updatedUser = await getUserRowById(userId);

        const updatedUserData = getUserData(updatedUser);

        const boostOffer = tickets.length < maxTicketsPerDay

            ? await createAdBoostOffer({

                userId,

                type: 'lottery_free_ticket',

                contextKey: `lottery_free:${userId}:${getDayKey(now)}`,

                page: 'fortune/lottery',

                title: pickLang(userLang, 'Бесплатный билет лотереи', 'Free lottery ticket'),

                description: pickLang(userLang, 'Досмотрите видео, чтобы получить один билет без траты K.', 'Watch the video to get one ticket without spending K.'),

                reward: { kind: 'lottery_free_ticket' },

            }).catch(() => null)

            : null;



        res.json({

            message: pickLang(userLang, 'Билет куплен!', 'Ticket purchased!'),

            ticketsBought: tickets.length,

            ticketsToday: ticketsToday + 1,

            userSc: Number(updatedUserData.sc) || 0,

            ticketNumber: formatLotteryNumbers(normalizedNumbers),

            numbers: normalizedNumbers,

            freeTicketUsed: useFreeTicket,

            freeTicketsLeft: useFreeTicket ? Math.max(0, freeTickets - 1) : freeTickets,

            boostOffer,

        });

    } catch (error) {

        const userLang = normalizeLang(getRequestLanguage(req));

        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });

    }

};



exports.getLotteryResults = async (req, res) => {

    try {

        const userLang = normalizeLang(getRequestLanguage(req));

        const { date } = req.query;

        const now = new Date();

        const todayStart = startOfDayLocal(now);

        let drawDate = todayStart;

        let lottery = null;



        if (date) {

            const requestedDate = new Date(date);

            if (Number.isNaN(requestedDate.getTime())) {

                return res.status(400).json({

                    message: pickLang(userLang, 'Некорректная дата розыгрыша', 'Invalid draw date'),

                });

            }

            drawDate = startOfDayLocal(requestedDate);

            lottery = await findLotteryByUserAndDate(req.user._id, drawDate);

        } else {

            lottery = await findLotteryByUserAndDate(req.user._id, drawDate);

        }



        if (!date && (!lottery || lottery.data.status !== 'paid')) {

            const yesterdayStart = new Date(todayStart);

            yesterdayStart.setDate(yesterdayStart.getDate() - 1);

            lottery = await findLotteryByUserAndDate(req.user._id, yesterdayStart);

        }



        if (!lottery) {

            return res.status(404).json({ message: pickLang(userLang, 'Результаты не найдены', 'Results not found') });

        }

        const lotteryData = lottery.data || lottery;

        if (lotteryData.status !== 'paid') {

            return res.status(409).json({

                message: pickLang(userLang, 'Результаты текущего розыгрыша ещё не готовы', 'Current draw results are not ready yet'),

            });

        }



        const winningNumbers = (Array.isArray(lotteryData.winningNumbers) && lotteryData.winningNumbers.length)

            ? lotteryData.winningNumbers

            : (normalizeTicketNumbers(lotteryData.winningNumber) || parseLotteryNumbers(lotteryData.winningNumber));



        res.json({

            winningNumber: lotteryData.winningNumber,

            winningNumbers,

            userTickets: (lotteryData.tickets || []).map(t => ({

                ticketNumber: t.ticketNumber,

                numbers: t.numbers,

                matches: countTicketMatches(t.numbers?.length ? t.numbers : t.ticketNumber, winningNumbers)

            })),

            prize: lotteryData.prizeSc,

            status: lotteryData.status,

            drawDate: lotteryData.drawDate,

        });

    } catch (error) {

        const userLang = normalizeLang(getRequestLanguage(req));

        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });

    }

};



// Розыгрыш лотереи (для cron)

exports.luckyDraw = async (req, res) => {

    const userId = req.user?._id?.toString?.() || '';

    const userLang = normalizeLang(getRequestLanguage(req));

    if (!userId) {

        return res.status(401).json({ message: pickLang(userLang, 'Требуется авторизация', 'Authorization required') });

    }

    if (personalLuckInFlight.has(userId)) {

        return res.status(429).json({

            message: pickLang(userLang, 'Подождите, обрабатываем предыдущий запрос', 'Please wait, your previous request is still being processed'),

        });

    }

    personalLuckInFlight.add(userId);

    try {

        const now = new Date();

        const dayStart = startOfDayLocal(now);

        const userRow = await getUserRowById(req.user._id);

        const userData = getUserData(userRow);

        const stats = userData.achievementStats && typeof userData.achievementStats === 'object' ? userData.achievementStats : {};

        const reserve = await reservePersonalLuckClaim({

            userId: req.user._id,

            now,

            fallbackLastLuckyDrawAt: stats?.lastLuckyDrawAt || null,

        });



        if (!reserve.ok) {

            return res.status(400).json({

                message: pickLang(userLang, 'Вы уже получили свою удачу сегодня', 'You have already claimed your luck today'),

            });

        }



        const amount = crypto.randomInt(1, 51);



        let creditedAmount = amount;

        try {

            const awardResult = await awardFortuneSc({

                userId: req.user._id,

                amount,

                description: pickLang(userLang, 'Личная удача', 'Personal luck'),

            });

            if (!awardResult) {

                creditedAmount = 0;

            } else if (Number.isFinite(Number(awardResult?.creditedAmount))) {

                creditedAmount = Math.max(0, Number(awardResult.creditedAmount) || 0);

            }

        } catch (e) {

            await rollbackPersonalLuckClaim({ claimId: reserve.claimId });

            throw e;

        }



        await Promise.all([

            finalizePersonalLuckClaim({

                claimId: reserve.claimId,

                amount: creditedAmount,

                rewardLabel: `${creditedAmount} K`,

                finalizedAt: now,

            }),

            updateUserDataById(req.user._id, { achievementStats: { ...stats, lastLuckyDrawAt: now } }),

        ]);



        awardRadianceForActivity({

            userId: req.user._id,

            amount: 5,

            activityType: 'personal_luck',

            meta: { day: dayStart.toISOString().slice(0, 10) },

            dedupeKey: `personal_luck:${req.user._id}:${dayStart.toISOString().slice(0, 10)}`,

        }).catch(() => { });



        const boostOffer = creditedAmount > 0 ? await createAdBoostOffer({

            userId: req.user._id,

            type: 'personal_luck_double',

            contextKey: `personal_luck_double:${req.user._id}:${getDayKey(now)}`,

            page: 'fortune',

            title: pickLang(userLang, 'Удвоить личную удачу', 'Double personal luck'),

            description: pickLang(userLang, 'Досмотрите видео, чтобы получить ещё столько же K.', 'Watch the video to receive the same K reward again.'),

            reward: {

                kind: 'currency',

                sc: creditedAmount,

                transactionType: 'personal_luck_ad_reward',

                description: pickLang(userLang, 'Дополнительная награда: Личная удача', 'Extra reward: Personal luck'),

            },

        }).catch(() => null) : null;



        res.json({ prize: `${creditedAmount} K`, amount: creditedAmount, boostOffer });

    } catch (error) {

        res.status(500).json({ message: pickLang(userLang, 'Ошибка сервера', 'Server error') });

    } finally {

        personalLuckInFlight.delete(userId);

    }

};



exports.drawLottery = async () => {

    try {

        const fortuneConfig = await getFortuneConfig();

        const lotteryConfig = fortuneConfig?.lottery || {};

        const now = new Date();

        const drawDate = startOfDayLocal(now);

        const drawAt = getDrawAt(now, lotteryConfig);

        if (now < drawAt) {

            return;

        }

        const winningNumbers = await getDailyLotteryNumbers(now);

        const drawDateStr = getDayKey(now);

        const drawLabel = formatLotteryNumbersForDisplay(winningNumbers) || formatLotteryNumbers(winningNumbers);

        const resultPath = `/fortune/lottery?drawDate=${drawDateStr}`;

        const resultUrl = `${getFrontendBaseUrl()}${resultPath}`;



        const allLotteries = await listLotteries();

        const drawDateIso = drawDate.toISOString();

        const lotteries = allLotteries.filter((l) => 

            l.drawDate === drawDateIso && (l.status === 'open' || l.status === 'closed')

        );



        const userIds = Array.from(new Set(lotteries.map((l) => String(l.user)).filter(Boolean)));

        const userMap = await getUsersByIds(userIds);



        if (lotteries.length === 0) return;



        // Обработать каждую лотерею

        for (const lottery of lotteries) {

            const uid = String(lottery?.user);

            const userRow = uid ? userMap.get(uid) : null;

            if (!uid || !userRow) {

                continue;

            }

            let totalPrize = 0;

            let maxMatches = 0;



            // Проверить билеты

            const tickets = lottery.tickets || [];

            for (const ticket of tickets) {

                const matches = countTicketMatches(ticket.numbers?.length ? ticket.numbers : ticket.ticketNumber, winningNumbers);

                const prize = getPrizeForMatches(matches, lotteryConfig);

                if (matches > maxMatches) maxMatches = matches;



                // Ачивки лотереи

                try {

                    const { grantAchievement } = require('../services/achievementService');



                    // #83. Джекпот пророка (6 из 7)

                    if (matches === 6) await grantAchievement({ userId: uid, achievementId: 83 });



                    // #84. Властелин лотереи (7 из 7)

                    if (matches === 7) await grantAchievement({ userId: uid, achievementId: 84 });



                    // #85. Двойное попадание (5+ чисел дважды)

                    if (matches >= 5) {

                        const stats = userRow.data?.achievementStats && typeof userRow.data.achievementStats === 'object' ? userRow.data.achievementStats : {};

                        const nextCount = (Number(stats.lottery5PlusMatchesCount) || 0) + 1;

                        await updateUserDataById(uid, { achievementStats: { ...stats, lottery5PlusMatchesCount: nextCount } });

                        if (nextCount >= 2) {

                            await grantAchievement({ userId: uid, achievementId: 85 });

                        }

                    }

                } catch (e) {

                    console.error('Lottery achievement error:', e);

                }



                if (prize > 0) {

                    totalPrize += prize;

                }

            }



            // Обновить лотерею

            const updatedData = {

                ...lottery,

                winningNumbers,

                winningNumber: formatLotteryNumbers(winningNumbers),

                prizeSc: totalPrize,

                status: 'paid',

            };

            delete updatedData._id;

            await upsertLottery(lottery._id, updatedData);



            // Начислить приз

            if (totalPrize > 0) {

                const userLang = normalizeLang(userRow?.language || userRow?.data?.language || 'ru');

                await awardFortuneSc({

                    userId: uid,

                    amount: totalPrize,

                    description: pickLang(userLang, 'Выигрыш в лотерею', 'Lottery winnings'),

                });

                await recordFortuneWin({

                    userId: uid,

                    gameType: 'lottery',

                    rewardType: 'sc',

                    amount: totalPrize,

                    label: `Совпадений максимум: ${maxMatches}`,

                    drawDate,

                    occurredAt: now,

                    meta: {

                        lotteryId: lottery._id,

                        winningNumber: updatedData.winningNumber,

                        winningNumbers,

                    },

                });

                await createNotification({

                    userId: uid,

                    type: 'system',

                    eventKey: 'lottery_draw_result',

                    title: {

                        ru: 'Выигрыш в лотерее',

                        en: 'Lottery winnings',

                    },

                    message: {

                        ru: `Ваш выигрыш: ${totalPrize} K. Победившие числа: ${drawLabel}.`,

                        en: `Your winnings: ${totalPrize} K. Winning numbers: ${drawLabel}.`,

                    },

                    link: resultPath,

                    io: global.io,

                });



                await emailService.sendLotteryWinEmail(

                    userRow?.email,

                    extractNicknameOrNull(userRow?.nickname),

                    {

                        prize: totalPrize,

                        winningNumber: drawLabel,

                        drawDate: drawDateStr,

                        matches: maxMatches,

                        resultUrl,

                    },

                    userLang

                ).catch((emailError) => {

                    console.error('Lottery win email error:', emailError);

                });

            }

        }



        await broadcastNotificationByPresence({

            online: {

                type: 'system',

                eventKey: 'lottery_draw_result',

                title: {

                    ru: 'Розыгрыш лотереи завершён',

                    en: 'Lottery draw completed',

                },

                message: {

                    ru: `Сегодняшние числа: ${drawLabel}. Проверь результаты.`,

                    en: `Today's numbers: ${drawLabel}. Check the results.`,

                },

                link: resultPath,

            },

            offline: {

                type: 'event',

                eventKey: 'lottery_draw_result',

                title: {

                    ru: 'Розыгрыш лотереи',

                    en: 'Lottery draw',

                },

                message: {

                    ru: `Пока тебя не было состоялся розыгрыш лотереи: ${drawLabel}.`,

                    en: `While you were away, the lottery draw took place: ${drawLabel}.`,

                },

                link: resultPath,

            },

        });



        console.log(`Лотерея разыграна: ${drawLabel}, обработано ${lotteries.length} участников`);

    } catch (error) {

        console.error('Ошибка розыгрыша лотереи:', error);

    }

};



