const jwt = require('jsonwebtoken');

const emailService = require('../services/emailService');

const crypto = require('crypto');

const bcrypt = require('bcryptjs');

const { getSupabaseClient } = require('../lib/supabaseClient');

const { assignBranchForNewUser } = require('../services/branchAllocationService');

const { awardRadianceForActivity } = require('../services/activityRadianceService');

const { getNumericSettingValue } = require('../services/settingsRegistryService');

const { getFrontendBaseUrl } = require('../config/env');

const { hasClaimedPersonalLuckToday } = require('../services/personalLuckService');

const logger = require('../utils/logger');

const {

  extractClientMeta,

  createUserSession,

  getTokenFromRequest,

  writeAuthEvent,

  revokeSession,

  decodeTokenUnsafe,

} = require('../services/authTrackingService');

const {

  evaluateAccessRestriction,

  isActiveRestriction,

  isUserFrozen,

  buildSignals,

  checkRegistrationAllowance,

  handlePostRegistrationMultiAccount,

  handlePostLoginMultiAccount,

  recordSignalHistory,

  lookupIpIntel,

} = require('../services/multiAccountService');

const {

  isAdminEmail,

  isAllowedUserEmail,

} = require('../utils/accountRole');

const { getMoodDiagnosticsForUser } = require('../services/entityMoodService');

const { getNewsUserCard } = require('./newsController');

const {

  JWT_SECRET,

  JWT_EXPIRE,

  issueAuthCookie,

  clearAuthCookie,

} = require('../config/auth');

const { getRequestLanguage } = require('../utils/requestLanguage');

const APP_URL = getFrontendBaseUrl();



const REFERRAL_SC_BONUS = 20;

const REFERRAL_DAILY_LIMIT = 10;

const REFERRAL_DAILY_BONUS_SC = 100;



function normalizeLang(value) {

  return value === 'en' ? 'en' : 'ru';

}



function pickLang(lang, ru, en) {

  return normalizeLang(lang) === 'en' ? en : ru;

}



function generateUserId() {

  return crypto.randomBytes(12).toString('hex');

}



async function getUserRowByEmail(email) {

  const supabase = getSupabaseClient();

  const { data, error } = await supabase

    .from('users')

    .select('*')

    .eq('email', String(email || '').trim().toLowerCase())

    .maybeSingle();

  if (error) return null;

  return data || null;

}



async function countReferralsByInviterSince({ inviterId, since }) {

  if (!inviterId || !since) return 0;

  const supabase = getSupabaseClient();

  const sinceIso = since instanceof Date ? since.toISOString() : new Date(since).toISOString();

  const { count, error } = await supabase

    .from('referrals')

    .select('id', { head: true, count: 'exact' })

    .eq('inviter_id', String(inviterId))

    .gte('created_at', sinceIso);

  if (error) return 0;

  return Math.max(0, Number(count) || 0);

}



async function countConfirmedReferralsByInviterSince({ inviterId, since }) {

  if (!inviterId || !since) return 0;

  const supabase = getSupabaseClient();

  const sinceIso = since instanceof Date ? since.toISOString() : new Date(since).toISOString();

  const { count, error } = await supabase

    .from('referrals')

    .select('id', { head: true, count: 'exact' })

    .eq('inviter_id', String(inviterId))

    .gte('confirmed_at', sinceIso);

  if (error) return 0;

  return Math.max(0, Number(count) || 0);

}



async function findReferralByInviteeId(inviteeId) {

  if (!inviteeId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await supabase

    .from('referrals')

    .select('*')

    .eq('invitee_id', String(inviteeId))

    .maybeSingle();

  if (error) return null;

  return data || null;

}



async function createReferralRow(payload) {

  const supabase = getSupabaseClient();

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase

    .from('referrals')

    .insert({

      ...payload,

      created_at: nowIso,

      updated_at: nowIso,

    })

    .select('*')

    .maybeSingle();

  if (error) return null;

  return data || null;

}



async function confirmReferral({ referralId }) {

  if (!referralId) return null;

  const supabase = getSupabaseClient();

  const nowIso = new Date().toISOString();

  const { data, error } = await supabase

    .from('referrals')

    .update({

      confirmed_at: nowIso,

      bonus_granted: false,

      status: 'pending',

      updated_at: nowIso,

    })

    .eq('id', Number(referralId))

    .select('*')

    .maybeSingle();

  if (error) return null;

  return data || null;

}



async function hasTransactionDailyReferralBonus({ userId, since }) {

  if (!userId || !since) return false;

  const supabase = getSupabaseClient();

  const sinceIso = since instanceof Date ? since.toISOString() : new Date(since).toISOString();

  const { data, error } = await supabase

    .from('transactions')

    .select('id,description')

    .eq('user_id', String(userId))

    .eq('type', 'referral')

    .eq('direction', 'credit')

    .eq('currency', 'K')

    .gte('occurred_at', sinceIso)

    .limit(100);

  if (error) return false;

  return Array.isArray(data) && data.some((row) => {

    const description = String(row?.description || '').trim();

    return description === 'Бонус за 10-го реферала за сутки'

      || description === '10th referral bonus for the day';

  });

}



async function hasReferralRewardScTransaction({ userId, referralId }) {

  if (!userId || !referralId) return false;

  const supabase = getSupabaseClient();

  const { data, error } = await supabase

    .from('transactions')

    .select('id,description')

    .eq('user_id', String(userId))

    .eq('type', 'referral')

    .eq('direction', 'credit')

    .eq('currency', 'K')

    .eq('related_entity', String(referralId))

    .limit(100);

  if (error) return false;

  return Array.isArray(data) && data.some((row) => {

    const description = String(row?.description || '').trim();

    return description.startsWith('Бонус за реферала:')

      || description.startsWith('Referral bonus:');

  });

}



async function countReferralRewardTransactionsSince({ userId, since }) {

  if (!userId || !since) return 0;

  const supabase = getSupabaseClient();

  const sinceIso = since instanceof Date ? since.toISOString() : new Date(since).toISOString();

  const { data, error } = await supabase

    .from('transactions')

    .select('description')

    .eq('user_id', String(userId))

    .eq('type', 'referral')

    .eq('direction', 'credit')

    .eq('currency', 'K')

    .gte('occurred_at', sinceIso);

  if (error) return 0;

  return Math.max(0, (Array.isArray(data) ? data : []).filter((row) => {

    const description = String(row?.description || '').trim();

    return description.startsWith('Бонус за реферала:')

      || description.startsWith('Referral bonus:');

  }).length);

}



async function getUserRowByNicknameCaseInsensitive(nickname) {

  const supabase = getSupabaseClient();

  const { data, error } = await supabase

    .from('users')

    .select('*')

    .ilike('nickname', String(nickname || '').trim())

    .maybeSingle();

  if (error) return null;

  return data || null;

}



function hasOwn(obj, key) {

  return Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);

}



function round3(value) {

  const n = Number(value);

  if (!Number.isFinite(n)) return 0;

  return Math.round(n * 1000) / 1000;

}



function isBalanceClose(current, expected, tolerance = 0.001) {

  return Math.abs(round3(current) - round3(expected)) <= tolerance;

}



function needsCoreUserDataRecovery(data = {}) {

  const safe = data && typeof data === 'object' ? data : {};

  const missingCoreBalances = !hasOwn(safe, 'sc') || !hasOwn(safe, 'lumens') || !hasOwn(safe, 'stars');

  const missingCoreMeta = !hasOwn(safe, 'lives') || !hasOwn(safe, 'complaintChips');

  const missingStats = !safe.achievementStats || typeof safe.achievementStats !== 'object';

  return missingCoreBalances || missingCoreMeta || missingStats;

}



async function calculateUserBalancesFromTransactions(userId) {

  if (!userId) {

    return { K: 0, LM: 0, STAR: 0 };

  }



  const supabase = getSupabaseClient();

  const totals = { K: 0, LM: 0, STAR: 0 };

  let from = 0;

  const pageSize = 1000;



  while (true) {

    // eslint-disable-next-line no-await-in-loop

    const { data, error } = await supabase

      .from('transactions')

      .select('direction,amount,currency,status')

      .eq('user_id', String(userId))

      .in('currency', ['K', 'LM', 'STAR'])

      .range(from, from + pageSize - 1);



    if (error || !Array.isArray(data) || !data.length) break;



    for (const row of data) {

      if (String(row?.status || 'completed') !== 'completed') continue;

      const currency = String(row?.currency || '').trim().toUpperCase();

      if (!Object.prototype.hasOwnProperty.call(totals, currency)) continue;

      const amount = Number(row?.amount) || 0;

      if (!amount) continue;

      totals[currency] += String(row?.direction || '').trim() === 'debit' ? -amount : amount;

    }



    if (data.length < pageSize) break;

    from += data.length;

  }



  return totals;

}



async function repairDamagedUserData(row) {

  if (!row?.id) return row;

  const currentData = row.data && typeof row.data === 'object' ? row.data : {};

  const needsRecovery = needsCoreUserDataRecovery(currentData);

  const shouldRepairZeroStars = !needsRecovery

    && hasOwn(currentData, 'stars')

    && round3(currentData.stars) <= 0;



  if (!needsRecovery && !shouldRepairZeroStars) {

    return row;

  }



  const tasks = [

    calculateUserBalancesFromTransactions(row.id),

  ];

  if (needsRecovery) {

    tasks.unshift(getNumericSettingValue('INITIAL_LIVES', Number(process.env.INITIAL_LIVES ?? 5) || 5));

  }



  const [initialLivesOrBalances, balancesOrNothing] = await Promise.all(tasks);

  const initialLives = needsRecovery

    ? initialLivesOrBalances

    : Number(process.env.INITIAL_LIVES ?? 5) || 5;

  const balances = needsRecovery

    ? balancesOrNothing

    : initialLivesOrBalances;



  const initialComplaintChips = Number(process.env.INITIAL_COMPLAINT_CHIPS ?? 15) || 15;

  const initialStars = row.email_confirmed ? (Number(process.env.INITIAL_STARS ?? 1) || 1) : 0;

  const initialSc = row.email_confirmed ? (Number(process.env.INITIAL_SC ?? 0) || 0) : 0;

  const initialLumens = row.email_confirmed ? (Number(process.env.INITIAL_LUMENS ?? 0) || 0) : 0;



  const expectedSc = round3(initialSc + (Number(balances?.K) || 0));

  const expectedLumens = round3(initialLumens + (Number(balances?.LM) || 0));

  const expectedStars = round3(initialStars + (Number(balances?.STAR) || 0));

  const nextData = { ...currentData };

  let shouldPersist = false;



  if (needsRecovery) {

    nextData.lives = hasOwn(currentData, 'lives') ? currentData.lives : initialLives;

    nextData.complaintChips = hasOwn(currentData, 'complaintChips') ? currentData.complaintChips : initialComplaintChips;

    nextData.sc = hasOwn(currentData, 'sc') ? currentData.sc : expectedSc;

    nextData.lumens = hasOwn(currentData, 'lumens') ? currentData.lumens : expectedLumens;

    nextData.stars = hasOwn(currentData, 'stars') ? currentData.stars : expectedStars;

    nextData.achievementStats = currentData.achievementStats && typeof currentData.achievementStats === 'object'

      ? currentData.achievementStats

      : {};

    shouldPersist = true;

  }



  if (

    shouldRepairZeroStars

    && expectedStars > round3(currentData.stars) + 0.0005

  ) {

    nextData.stars = expectedStars;

    shouldPersist = true;

  }



  if (!shouldPersist) {

    return row;

  }



  const nowIso = new Date().toISOString();

  const { data, error } = await getSupabaseClient()

    .from('users')

    .update({

      data: nextData,

      updated_at: nowIso,

    })

    .eq('id', String(row.id))

    .select('*')

    .maybeSingle();



  if (error || !data) {

    return {

      ...row,

      data: nextData,

    };

  }



  return data;

}



function buildSafeUserFromRow(row) {

  if (!row) return null;

  const extra = row.data && typeof row.data === 'object' ? row.data : {};

  return {

    ...extra,

    _id: row.id,

    id: row.id,

    email: row.email,

    role: row.role,

    nickname: row.nickname,

    status: row.status,

    emailConfirmed: Boolean(row.email_confirmed),

    emailConfirmedAt: row.email_confirmed_at,

    accessRestrictedUntil: row.access_restricted_until,

    accessRestrictionReason: row.access_restriction_reason,

    language: row.language,

    lastSeenAt: row.last_seen_at,

    lastOnlineAt: row.last_online_at,

    lastIp: row.last_ip,

    lastDeviceId: row.last_device_id,

    lastFingerprint: row.last_fingerprint,

    lastProfileKey: extra.lastProfileKey || '',

    lastClientProfile: extra.lastClientProfile || null,

    createdAt: row.created_at,

    updatedAt: row.updated_at,

  };

}



async function getUserRowById(userId) {

  if (!userId) return null;

  const supabase = getSupabaseClient();

  const { data, error } = await supabase

    .from('users')

    .select('*')

    .eq('id', String(userId))

    .maybeSingle();

  if (error) return null;

  return data || null;

}



function normalizeEmailInput(value) {

  return String(value || '').trim().toLowerCase();

}



function startOfDayLocal(date) {

  const d = new Date(date);

  d.setHours(0, 0, 0, 0);

  return d;

}



const SEED_WORDLIST = [

  'ability',

  'able',

  'about',

  'above',

  'absent',

  'absorb',

  'abstract',

  'absurd',

  'abuse',

  'access',

  'accident',

  'account',

  'accuse',

  'achieve',

  'acid',

  'acoustic',

  'acquire',

  'across',

  'act',

  'action',

  'actor',

  'actress',

  'actual',

  'adapt',

  'add',

  'addict',

  'address',

  'adjust',

  'admit',

  'adult',

  'advance',

  'advice',

  'aerobic',

  'affair',

  'afford',

  'afraid',

  'again',

  'age',

  'agent',

  'agree',

  'ahead',

  'aim',

  'air',

  'airport',

  'aisle',

  'alarm',

  'album',

  'alcohol',

  'alert',

  'alien',

  'all',

  'alley',

  'allow',

  'almost',

  'alone',

  'alpha',

  'already',

  'also',

  'alter',

  'always',

  'amateur',

  'amazing',

  'among',

  'amount',

  'amused',

  'analyst',

  'anchor',

  'ancient',

  'anger',

  'angle',

  'angry',

  'animal',

  'ankle',

  'announce',

  'annual',

  'another',

  'answer',

  'antenna',

  'antique',

  'anxiety',

  'any',

  'apart',

  'apology',

  'appear',

  'apple',

  'approve',

  'april',

  'arch',

  'arctic',

  'area',

  'arena',

  'argue',

  'arm',

  'armed',

  'armor',

  'army',

  'around',

  'arrange',

  'arrest',

  'arrive',

  'arrow',

  'art',

  'artefact',

  'artist',

  'artwork',

  'ask',

  'aspect',

  'assault',

  'asset',

  'assist',

  'assume',

  'asthma',

  'athlete',

  'atom',

  'attack',

  'attend',

  'attitude',

  'attract',

  'auction',

  'audit',

  'august',

  'aunt',

  'author',

  'auto',

  'autumn',

  'average',

  'avocado',

  'avoid',

  'awake',

  'aware',

  'away',

  'awesome',

  'awful',

  'awkward',

  'axis',

  'baby',

  'bachelor',

  'bacon',

  'badge',

  'bag',

  'balance',

  'balcony',

  'ball',

  'bamboo',

  'banana',

  'banner',

  'bar',

  'barely',

  'bargain',

  'barrel',

  'base',

  'basic',

  'basket',

  'battle',

  'beach',

  'bean',

  'beauty',

  'because',

  'become',

  'beef',

  'before',

  'begin',

  'behave',

  'behind',

  'believe',

  'below',

  'belt',

  'bench',

  'benefit',

  'best',

  'betray',

  'better',

  'between',

  'beyond',

  'bicycle',

  'bid',

  'bike',

  'bind',

  'biology',

  'bird',

  'birth',

  'bitter',

  'black',

  'blade',

  'blame',

  'blanket',

  'blast',

  'bleak',

  'bless',

  'blind',

  'blood',

  'blossom',

  'blouse',

  'blue',

  'blur',

  'blush',

  'board',

  'boat',

  'body',

  'boil',

  'bomb',

  'bone',

  'bonus',

  'book',

  'boost',

  'border',

  'boring',

  'borrow',

  'boss',

  'bottom',

  'bounce',

  'box',

  'boy',

  'bracket',

  'brain',

  'brand',

  'brass',

  'brave',

  'bread',

  'breeze',

  'brick',

  'bridge',

  'brief',

  'bright',

  'bring',

  'brisk',

  'broccoli',

  'broken',

  'bronze',

  'broom',

  'brother',

  'brown',

  'brush',

  'bubble',

  'buddy',

  'budget',

  'buffalo',

  'build',

  'bulb',

  'bulk',

  'bullet',

  'bundle',

  'bunker',

  'burden',

  'burger',

  'burst',

  'bus',

  'business',

  'busy',

  'butter',

  'buyer',

  'buzz',

  'cabbage',

  'cabin',

  'cable',

  'cactus',

  'cage',

  'cake',

  'call',

  'calm',

  'camera',

  'camp',

  'can',

  'canal',

  'cancel',

  'candy',

  'cannon',

  'canoe',

  'canvas',

  'canyon',

  'capable',

  'capital',

  'captain',

  'car',

  'carbon',

  'card',

  'cargo',

  'carpet',

  'carry',

  'cart',

  'case',

  'cash',

  'casino',

  'castle',

  'casual',

  'cat',

  'catalog',

  'catch',

  'category',

  'cattle',

  'caught',

  'cause',

  'caution',

  'cave',

  'ceiling',

  'celery',

  'cement',

  'census',

  'century',

  'cereal',

  'certain',

  'chair',

  'chalk',

  'champion',

  'change',

  'chaos',

  'chapter',

  'charge',

  'chase',

  'chat',

  'cheap',

  'check',

  'cheese',

  'chef',

  'cherry',

  'chest',

  'chicken',

  'chief',

  'child',

  'chimney',

  'choice',

  'choose',

  'chronic',

  'chuckle',

  'chunk',

  'city',

  'civil',

  'claim',

  'clap',

  'clarify',

  'claw',

  'clay',

  'clean',

  'clerk',

  'clever',

  'click',

  'client',

  'cliff',

  'climb',

  'clinic',

  'clip',

  'clock',

  'clog',

  'close',

  'cloth',

  'cloud',

  'clown',

  'club',

  'clump',

  'cluster',

  'clutch',

  'coach',

  'coast',

  'coconut',

  'code',

  'coffee',

  'coil',

  'coin',

  'collect',

  'color',

  'column',

  'combine',

  'come',

  'comfort',

  'comic',

  'common',

  'company',

  'concert',

  'conduct',

  'confirm',

  'congress',

  'connect',

  'consider',

  'control',

  'convince',

  'cook',

  'cool',

  'copper',

  'copy',

  'coral',

  'core',

  'corn',

  'correct',

  'cost',

  'cotton',

  'couch',

  'country',

  'couple',

  'course',

  'cousin',

  'cover',

  'coyote',

  'crack',

  'cradle',

  'craft',

  'cram',

  'crane',

  'crash',

  'crater',

  'crawl',

  'crazy',

  'cream',

  'credit',

  'creek',

  'crew',

  'cricket',

  'crime',

  'crisp',

  'critic',

  'crop',

  'cross',

  'crouch',

  'crowd',

  'crucial',

  'cruel',

  'cruise',

  'crumble',

  'crunch',

  'crush',

  'cry',

  'crystal',

  'cube',

  'culture',

  'cup',

  'cupboard',

  'curious',

  'current',

  'curtain',

  'curve',

  'cushion',

  'custom',

  'cute',

  'cycle',

];



const generateSeedPhrase24 = () => {

  const words = [];

  for (let i = 0; i < 24; i += 1) {

    const idx = crypto.randomInt(0, SEED_WORDLIST.length);

    words.push(SEED_WORDLIST[idx]);

  }

  return words.join(' ');

};



const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');



const generateToken = (payload, expiresIn = JWT_EXPIRE) =>

  jwt.sign(payload, JWT_SECRET, { expiresIn });



const generateReferralCode = () => {

  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  let code = '';

  for (let i = 0; i < 8; i += 1) {

    code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));

  }

  return code;

};



function buildLocalizedFrontendUrl(language, pathname, search = '') {

  const locale = normalizeLang(language);

  const base = String(APP_URL || '').replace(/\/+$/, '');

  const normalizedPath = String(pathname || '/').replace(/^\/+/, '');

  const normalizedSearch = search

    ? String(search).startsWith('?')

      ? String(search)

      : `?${String(search)}`

    : '';

  return `${base}/${locale}/${normalizedPath}${normalizedSearch}`;

}



const register = async (req, res, next) => {

  try {

    const requestedLang = normalizeLang(getRequestLanguage(req));

    const client = extractClientMeta(req);

    const accessCheck = await evaluateAccessRestriction(client);

    if (accessCheck.blocked) {

      await writeAuthEvent({

        user: null,

        email: normalizeEmailInput(req.body?.email),

        eventType: 'login_failed',

        result: 'failed',

        reason: `blocked:${accessCheck.reason || 'rule'}`,

        req,

      });

      return res.status(403).json({ message: pickLang(requestedLang, 'Доступ ограничен', 'Access is restricted') });

    }



    const {

      email,

      nickname,

      gender,

      birthDate,

      preferredGender,

      preferredAgeFrom,

      preferredAgeTo,

      referralCode, // This is the nickname of the referrer

      language,

    } = req.body;



    const normalizedEmail = normalizeEmailInput(email);

    if (!normalizedEmail) {

      return res.status(400).json({ message: pickLang(requestedLang, 'Некорректный email', 'Invalid email') });

    }

    if (!isAllowedUserEmail(normalizedEmail)) {

      return res.status(400).json({ message: pickLang(requestedLang, 'Разрешены только почты из списка проекта', 'Only project-approved emails are allowed') });

    }



    const inviteeIp = client.ip || '';

    const inviteeDeviceId = client.deviceId || '';

    const inviteeFingerprint =

      client.fingerprint ||

      crypto.createHash('sha256').update(req.headers['user-agent'] || '').digest('hex');

    const inviteeWeakFingerprint = client.weakFingerprint || '';

    const inviteeIpIntel = await lookupIpIntel(inviteeIp);

    const registrationSignals = buildSignals({

      ip: inviteeIp,

      deviceId: inviteeDeviceId,

      fingerprint: inviteeFingerprint,

      weakFingerprint: inviteeWeakFingerprint,

      profileKey: client.profileKey,

      clientProfile: client.clientProfile,

      email: normalizedEmail,

      userAgent: client.userAgent,

      ipIntel: inviteeIpIntel,

    });



    const registrationAllowance = await checkRegistrationAllowance({

      signals: registrationSignals,

      req,

      requestedEmail: normalizedEmail,

    });

    if (!registrationAllowance.allowed) {

      return res.status(429).json({

        message: pickLang(

          requestedLang,

          `Превышен лимит аккаунтов. Разрешено не более ${registrationAllowance.maxAllowed || 3} аккаунтов на один набор сигналов.`,

          `Account limit exceeded. No more than ${registrationAllowance.maxAllowed || 3} accounts are allowed for one set of signals.`

        ),

        blockedUntil: registrationAllowance.restrictedUntil,

      });

    }



    const existing = await getUserRowByEmail(normalizedEmail);

    if (existing) {

      return res.status(400).json({ message: pickLang(requestedLang, 'Пользователь с таким email уже существует', 'A user with this email already exists') });

    }



    const nick = String(nickname || '').trim();

    if (nick) {

      const existingNick = await getUserRowByNicknameCaseInsensitive(nick);

      if (existingNick) {

        return res.status(400).json({ message: pickLang(requestedLang, 'Никнейм уже занят', 'Nickname is already taken') });

      }

    }



    let referredBy;

    let referralInviter;

    let referralOverflowFrom;

    if (referralCode) {

      const referrer = await getUserRowByNicknameCaseInsensitive(referralCode.trim());

      if (referrer) {

        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

        const dailyCount = await countReferralsByInviterSince({ inviterId: referrer.id, since });

        if (dailyCount >= REFERRAL_DAILY_LIMIT) {

          const spectator = await getUserRowByEmail('spectator@gmail.com');

          if (spectator) {

            referralInviter = spectator;

            referralOverflowFrom = referrer.id;

          } else {

            referralInviter = referrer;

          }

        } else {

          referralInviter = referrer;

        }

        referredBy = referralInviter.id;

      }

    }



    const seedPhrase = generateSeedPhrase24();



    const salt = await bcrypt.genSalt(10);

    const passwordHash = await bcrypt.hash(seedPhrase, salt);



    const { treeCluster, treeBranch } = await assignBranchForNewUser({ birthDate });



    const supabase = getSupabaseClient();

    const nowIso = new Date().toISOString();

    const userId = generateUserId();

    const userData = {

      gender,

      birthDate,

      treeCluster,

      treeBranch,

      preferredGender,

      preferredAgeFrom,

      preferredAgeTo,

      referredBy,

      lives: 0,

      complaintChips: 0,

      stars: 0,

      sc: 0,

      lumens: 0,

      lastWeakFingerprint: inviteeWeakFingerprint || '',

      lastProfileKey: client.profileKey || '',

      lastClientProfile: client.clientProfile && typeof client.clientProfile === 'object'

        ? client.clientProfile

        : null,

      lastIpIntel: inviteeIpIntel || null,

    };

    const { data: createdRow, error: createError } = await supabase

      .from('users')

      .insert({

        id: userId,

        email: normalizedEmail,

        password_hash: passwordHash,

        role: 'user',

        nickname,

        status: 'pending',

        email_confirmed: false,

        email_confirmed_at: null,

        access_restricted_until: null,

        access_restriction_reason: '',

        language: language || 'ru',

        data: userData,

        last_online_at: nowIso,

        last_ip: inviteeIp || null,

        last_device_id: inviteeDeviceId || null,

        last_fingerprint: inviteeFingerprint || null,

        created_at: nowIso,

        updated_at: nowIso,

      })

      .select('*')

      .maybeSingle();

    if (createError || !createdRow) {

      return res.status(400).json({ message: pickLang(requestedLang, 'Не удалось создать пользователя', 'Failed to create user') });

    }



    if (referredBy) {

      const inviter = await supabase

        .from('users')

        .select('*')

        .eq('id', String(referredBy))

        .maybeSingle();

      const inviterRow = inviter?.data || null;

      if (inviterRow) {

        const inviterData = inviterRow.data && typeof inviterRow.data === 'object' ? inviterRow.data : {};

        let inviterReferralCode = String(inviterData.referralCode || '').trim();

        if (!inviterReferralCode) {

          let code;

          let exists = true;

          while (exists) {

            code = generateReferralCode();

            // eslint-disable-next-line no-await-in-loop

            const { data: refCheck } = await supabase

              .from('users')

              .select('id')

              .eq('data->>referralCode', String(code))

              .maybeSingle();

            exists = Boolean(refCheck);

          }

          inviterReferralCode = code;

          await supabase

            .from('users')

            .update({

              data: { ...inviterData, referralCode: inviterReferralCode },

              updated_at: new Date().toISOString(),

            })

            .eq('id', String(inviterRow.id));

        }



        await createReferralRow({

          inviter_id: inviterRow.id,

          invitee_id: createdRow.id,

          code: inviterReferralCode,

          invitee_ip: inviteeIp || null,

          invitee_fingerprint: inviteeFingerprint || null,

          bonus_granted: false,

          status: 'pending',

          check_reason: referralOverflowFrom ? `overflow_from:${String(referralOverflowFrom)}` : null,

        });

      }

    }



    await recordSignalHistory({

      userId: createdRow.id,

      eventType: 'register',

      signals: registrationSignals,

      ipIntel: inviteeIpIntel,

      meta: {

        source: 'auth_register',

        profileKey: client.profileKey || '',

        clientProfile: client.clientProfile && typeof client.clientProfile === 'object'

          ? client.clientProfile

          : null,

      },

    });



    const multiAccountResult = await handlePostRegistrationMultiAccount({

      user: buildSafeUserFromRow(createdRow),

      req,

      signals: registrationSignals,

    });

    if (multiAccountResult.frozen) {

      return res.status(403).json({

        message: pickLang(

          requestedLang,

          'Аккаунт временно заморожен из-за подозрительных действий. Проверка обычно занимает до 24 часов. Не создавайте новые аккаунты и дождитесь решения модератора.',

          'This account was temporarily frozen due to suspicious activity. The review usually takes up to 24 hours. Please do not create new accounts and wait for the moderator decision.'

        ),

        groupId: multiAccountResult.groupId,

        clusterSize: multiAccountResult.clusterSize,

      });

    }



    const token = generateToken({ userId: createdRow.id, email: createdRow.email });

    const confirmLink = buildLocalizedFrontendUrl(requestedLang, 'confirm', `token=${encodeURIComponent(token)}`);



    // Do not block registration response on SMTP latency/errors.

    emailService

      .sendConfirmationEmail(createdRow.email, createdRow.nickname, confirmLink, requestedLang)

      .then(() => {

        logger.info('[AUTH] Registration email queued/sent', {

          userId: createdRow.id,

          email: createdRow.email,

        });

      })

      .catch((error) => {

        logger.error('[AUTH] Registration email delivery failed', {

          userId: createdRow.id,

          email: createdRow.email,

          message: error?.message || 'unknown email error',

        });

      });



    return res.status(201).json({

      message: pickLang(requestedLang, 'Спасибо! Подтверждение выслано на ваш Email', 'Thanks! Confirmation has been sent to your email'),

      confirmUrl: confirmLink,

      seedPhrase,

    });

  } catch (error) {

    const requestedLang = normalizeLang(getRequestLanguage(req));

    if (error && error.code === 11000) {

      const key = (error.keyPattern && Object.keys(error.keyPattern)[0]) || '';

      if (key === 'nickname') {

        return res.status(400).json({ message: pickLang(requestedLang, 'Никнейм уже занят', 'Nickname is already taken') });

      }

      if (key === 'email') {

        return res.status(400).json({ message: pickLang(requestedLang, 'Пользователь с таким email уже существует', 'A user with this email already exists') });

      }

      return res.status(400).json({ message: pickLang(requestedLang, 'Данные уже используются', 'Data is already in use') });

    }

    return next(error);

  }

};



const login = async (req, res, next) => {

  try {

    const client = extractClientMeta(req);

    const requestedEmail = normalizeEmailInput(req.body?.email);

    const email = requestedEmail;

    const seedPhrase = String(req.body?.seedPhrase || '');

    const requestedLang = normalizeLang(getRequestLanguage(req));

    const loginIpIntel = await lookupIpIntel(client.ip || '');



    const userRow = await getUserRowByEmail(email);

    if (!userRow) {

      await writeAuthEvent({

        user: null,

        email,

        eventType: 'login_failed',

        result: 'failed',

        reason: 'user_not_found',

        req,

      });

      return res.status(401).json({ message: pickLang(requestedLang, 'Неверный email или пароль', 'Invalid email or password') });

    }



    const user = buildSafeUserFromRow(userRow);



    const isAdminAccount = user.role === 'admin';



    if (isAdminAccount && !isAdminEmail(user.email)) {

      await writeAuthEvent({

        user: user._id,

        email,

        eventType: 'login_failed',

        result: 'failed',

        reason: 'admin_email_policy_violation',

        req,

      });

      return res.status(403).json({ message: pickLang(requestedLang, 'Аккаунт администратора настроен неверно', 'Admin account is configured incorrectly') });

    }



    const accessCheck = await evaluateAccessRestriction(client);

    if (accessCheck.blocked && !isAdminAccount) {

      await writeAuthEvent({

        user: user._id,

        email,

        eventType: 'login_failed',

        result: 'failed',

        reason: `blocked:${accessCheck.reason || 'rule'}`,

        req,

      });

      return res.status(403).json({ message: pickLang(requestedLang, 'Доступ ограничен', 'Access is restricted') });

    }



    if (!isAdminAccount && (isActiveRestriction(user.accessRestrictedUntil) || isUserFrozen(user))) {

      await writeAuthEvent({

        user: user._id,

        email,

        eventType: 'multi_account_detected',

        result: 'failed',

        reason: isUserFrozen(user) ? 'multi_account_group_frozen' : 'temporary_restriction_active',

        req,

        meta: {

          restrictedUntil: user.accessRestrictedUntil,

          restrictionReason: user.accessRestrictionReason || '',

        },

      });

      return res.status(403).json({

        message: pickLang(

          requestedLang,

          isUserFrozen(user)

            ? 'Аккаунт временно заморожен из-за подозрительных действий. Проверка обычно занимает до 24 часов. Не создавайте новые аккаунты и дождитесь решения модератора.'

            : `Доступ ограничен из-за проверки мультиаккаунта. Ограничение действует до ${new Date(user.accessRestrictedUntil).toISOString()}.`,

          isUserFrozen(user)

            ? 'This account was temporarily frozen due to suspicious activity. The review usually takes up to 24 hours. Please do not create new accounts and wait for the moderator decision.'

            : `Access is restricted due to a multi-account review. The restriction is active until ${new Date(user.accessRestrictedUntil).toISOString()}.`

        ),

        blockedUntil: user.accessRestrictedUntil,

      });

    }



    if (user.accessRestrictedUntil && (!isActiveRestriction(user.accessRestrictedUntil) || isAdminAccount)) {

      await getSupabaseClient()

        .from('users')

        .update({

          access_restricted_until: null,

          access_restriction_reason: '',

          updated_at: new Date().toISOString(),

        })

        .eq('id', String(user._id));

    }



    const passwordMatch = await bcrypt.compare(seedPhrase, String(userRow.password_hash || ''));

    if (!passwordMatch) {

      await writeAuthEvent({

        user: user._id,

        email,

        eventType: 'login_failed',

        result: 'failed',

        reason: 'bad_credentials',

        req,

      });

      return res.status(401).json({ message: pickLang(requestedLang, 'Неверный email или пароль', 'Invalid email or password') });

    }



    if (!user.emailConfirmed) {

      await writeAuthEvent({

        user: user._id,

        email,

        eventType: 'login_failed',

        result: 'failed',

        reason: 'email_not_confirmed',

        req,

      });

      return res.status(403).json({ message: pickLang(requestedLang, 'Подтвердите email перед входом', 'Please confirm your email before logging in') });

    }



    if (user.status === 'banned') {

      await writeAuthEvent({

        user: user._id,

        email,

        eventType: 'login_failed',

        result: 'failed',

        reason: 'user_banned',

        req,

      });

      return res.status(403).json({ message: pickLang(requestedLang, 'Аккаунт заблокирован', 'Account is blocked') });

    }



    const loginSignals = buildSignals({

      ip: client.ip,

      deviceId: client.deviceId,

      fingerprint: client.fingerprint,

      weakFingerprint: client.weakFingerprint,

      profileKey: client.profileKey,

      clientProfile: client.clientProfile,

      email,

      userAgent: client.userAgent,

      ipIntel: loginIpIntel,

    });



    const userRuntimeData = userRow?.data && typeof userRow.data === 'object' ? userRow.data : {};

    await getSupabaseClient()

      .from('users')

      .update({

        last_online_at: new Date().toISOString(),

        last_ip: client.ip || user.lastIp || null,

        last_device_id: client.deviceId || user.lastDeviceId || null,

        last_fingerprint: client.fingerprint || user.lastFingerprint || null,

        data: {

          ...userRuntimeData,

          lastWeakFingerprint: client.weakFingerprint || userRuntimeData.lastWeakFingerprint || '',

          lastProfileKey: client.profileKey || userRuntimeData.lastProfileKey || '',

          lastClientProfile: client.clientProfile && typeof client.clientProfile === 'object'

            ? client.clientProfile

            : (userRuntimeData.lastClientProfile || null),

          lastIpIntel: loginIpIntel || userRuntimeData.lastIpIntel || null,

        },

        updated_at: new Date().toISOString(),

      })

      .eq('id', String(user._id));



    await recordSignalHistory({

      userId: user._id,

      eventType: 'login',

      signals: loginSignals,

      ipIntel: loginIpIntel,

      meta: {

        source: 'auth_login',

        profileKey: client.profileKey || '',

        clientProfile: client.clientProfile && typeof client.clientProfile === 'object'

          ? client.clientProfile

          : null,

      },

    });



    const loginMultiAccountResult = await handlePostLoginMultiAccount({

      user,

      req,

      signals: loginSignals,

    });

    if (loginMultiAccountResult?.frozen) {

      return res.status(403).json({

        message: pickLang(

          requestedLang,

          'Аккаунт временно заморожен из-за подозрительных действий. Проверка обычно занимает до 24 часов. Не создавайте новые аккаунты и дождитесь решения модератора.',

          'This account was temporarily frozen due to suspicious activity. The review usually takes up to 24 hours. Please do not create new accounts and wait for the moderator decision.'

        ),

        groupId: loginMultiAccountResult.groupId,

      });

    }



    const session = await createUserSession({ userId: user._id, req });

    if (session?.conflict) {

      await writeAuthEvent({

        user: user._id,

        email: user.email,

        eventType: 'login_failed',

        result: 'failed',

        reason: 'single_device_conflict',

        req,

      });

      clearAuthCookie(res);

      return res.status(409).json({

        message: pickLang(

          requestedLang,

          'Обнаружен вход с другого устройства. Все сеансы этого аккаунта завершены. Войдите заново только на одном устройстве.',

          'A sign-in from another device was detected. All sessions for this account were ended. Sign in again on only one device.',

        ),

      });

    }



    const sessionId = session?.session_id || session?.sessionId || '';

    if (!sessionId) {

      return res.status(500).json({

        message: pickLang(requestedLang, 'Не удалось открыть сеанс входа', 'Failed to open a login session'),

      });

    }

    const token = generateToken({ userId: user._id, email: user.email, sid: sessionId });

    const refreshedUserRow = await repairDamagedUserData((await getUserRowById(user._id)) || userRow);

    const safeUser = buildSafeUserFromRow(refreshedUserRow || userRow);



    await writeAuthEvent({

      user: user._id,

      email: user.email,

      eventType: 'login_success',

      result: 'success',

      reason: null,

      req,

      sessionId,

    });



    const existingReferral = await findReferralByInviteeId(user._id);

    if (existingReferral && existingReferral.confirmed_at && !existingReferral.bonus_granted) {

      const supabase = getSupabaseClient();

      const nowIso = new Date().toISOString();

      const { data: rewardableReferral, error: rewardableReferralError } = await supabase

        .from('referrals')

        .update({

          bonus_granted: true,

          updated_at: nowIso,

        })

        .eq('id', Number(existingReferral.id))

        .eq('bonus_granted', false)

        .select('*')

        .maybeSingle();



      if (!rewardableReferralError && rewardableReferral) {

        const { awardReferralSc, creditSc } = require('../services/scService');

        try {

          const hasReferralSc = await hasReferralRewardScTransaction({

            userId: rewardableReferral.inviter_id,

            referralId: rewardableReferral.id,

          });

          if (!hasReferralSc) {

            await awardReferralSc({

              userId: rewardableReferral.inviter_id,

              bonus: REFERRAL_SC_BONUS,

              description: pickLang(

                requestedLang,

                `Бонус за реферала: ${String(user.nickname || '')}`,

                `Referral bonus: ${String(user.nickname || '')}`,

              ),

              relatedEntity: rewardableReferral.id,

            });

          }



          await awardRadianceForActivity({

            userId: rewardableReferral.inviter_id,

            amount: 20,

            activityType: 'referral_active',

            meta: { invitee: user._id, referralId: rewardableReferral.id },

            dedupeKey: `referral_reward:${String(rewardableReferral.id)}`,

          });



          const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

          const last24RewardCount = await countReferralRewardTransactionsSince({

            userId: rewardableReferral.inviter_id,

            since: since24h,

          });

          if (last24RewardCount === REFERRAL_DAILY_LIMIT) {

            const alreadyDailyBonus = await hasTransactionDailyReferralBonus({

              userId: rewardableReferral.inviter_id,

              since: since24h,

            });

            if (!alreadyDailyBonus) {

              await creditSc({

                userId: rewardableReferral.inviter_id,

                amount: REFERRAL_DAILY_BONUS_SC,

                type: 'referral',

                description: pickLang(requestedLang, 'Бонус за 10-го реферала за сутки', '10th referral bonus for the day'),

                relatedEntity: rewardableReferral.id,

              });

            }

          }

        } catch (err) {

          console.error('Error awarding referral login bonus:', err);

          await supabase

            .from('referrals')

            .update({

              bonus_granted: false,

              updated_at: new Date().toISOString(),

            })

            .eq('id', Number(existingReferral.id));

        }

      }

    }



    issueAuthCookie(res, token);

    return res.json({ user: safeUser });

  } catch (error) {

    return next(error);

  }

};



const confirmEmail = async (req, res, next) => {

  try {

    const requestedLang = normalizeLang(getRequestLanguage(req));

    const { token } = req.query;

    if (!token) {

      return res.status(400).json({

        message: pickLang(requestedLang, 'Токен подтверждения отсутствует', 'Confirmation token is missing'),

      });

    }



    const decoded = jwt.verify(token, JWT_SECRET);

    const userRow = await getUserRowByEmail(decoded?.email || '');

    const userById = decoded?.userId

      ? await getSupabaseClient().from('users').select('*').eq('id', String(decoded.userId)).maybeSingle()

      : null;

    const row = userById?.data || userRow;



    if (!row) {

      return res.status(404).json({ message: pickLang(requestedLang, 'Пользователь не найден', 'User not found') });

    }



    const lang = requestedLang;



    if (row.email_confirmed) {

      return res.json({ message: pickLang(lang, 'Email уже подтверждён', 'Email is already confirmed') });

    }



    const nowIso = new Date().toISOString();

    const lives = await getNumericSettingValue('INITIAL_LIVES', Number(process.env.INITIAL_LIVES ?? 5) || 5);

    const complaintChips = Number(process.env.INITIAL_COMPLAINT_CHIPS ?? 15) || 15;

    const stars = Number(process.env.INITIAL_STARS ?? 1) || 1;

    const sc = Number(process.env.INITIAL_SC ?? 0) || 0;

    const lumens = Number(process.env.INITIAL_LUMENS ?? 0) || 0;



    const existingData = row.data && typeof row.data === 'object' ? row.data : {};

    let referralCodeValue = String(existingData.referralCode || '').trim();

    if (!referralCodeValue) {

      let code;

      let exists = true;

      while (exists) {

        code = generateReferralCode();

        // eslint-disable-next-line no-await-in-loop

        const { data: refCheck } = await getSupabaseClient()

          .from('users')

          .select('id')

          .eq('data->>referralCode', String(code))

          .maybeSingle();

        exists = Boolean(refCheck);

      }

      referralCodeValue = code;

    }



    await getSupabaseClient()

      .from('users')

      .update({

        email_confirmed: true,

        email_confirmed_at: nowIso,

        status: 'active',

        updated_at: nowIso,

        data: {

          ...existingData,

          lives,

          complaintChips,

          stars,

          sc,

          lumens,

          referralCode: referralCodeValue,

        },

      })

      .eq('id', String(row.id));



    // Подтверждаем реферальную связь.

    // Награды приходят позже, только после прохождения Тихого ночного дозора.

    const existingReferral = await findReferralByInviteeId(row.id);

    if (existingReferral && !existingReferral.confirmed_at) {

      await confirmReferral({ referralId: existingReferral.id });

    }



    return res.json({ message: pickLang(lang, 'Регистрация завершена! Добро пожаловать', 'Registration completed! Welcome') });

  } catch (error) {

    const requestedLang = normalizeLang(getRequestLanguage(req));

    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError') {

      return res.status(400).json({ message: pickLang(requestedLang, 'Некорректный или просроченный токен', 'Invalid or expired token') });

    }

    return next(error);

  }

};



const getMe = async (req, res, next) => {

  try {

    const baseRow = await getUserRowById(req.user?._id);

    const row = await repairDamagedUserData(baseRow);

    if (!row) {

      return res.status(404).json({ message: pickLang(getRequestLanguage(req), 'Пользователь не найден', 'User not found') });

    }

    const userObj = buildSafeUserFromRow(row);

    return res.json({ user: userObj });

  } catch (error) {

    return next(error);

  }

};



const logout = async (req, res, next) => {

  try {

    const row = await getUserRowById(req.user?._id);

    if (!row) {

      return res.status(404).json({ message: pickLang(getRequestLanguage(req), 'Пользователь не найден', 'User not found') });

    }



    const authToken = getTokenFromRequest(req);

    const unsafeDecoded = decodeTokenUnsafe(authToken);

    const sessionId = req.auth?.sid || unsafeDecoded?.sid || '';

    if (sessionId) {

      await revokeSession({

        sessionId,

        revokedBy: row.id,

        reason: 'logout',

      });

    }



    const nowIso = new Date().toISOString();

    const existingData = row.data && typeof row.data === 'object' ? row.data : {};

    await getSupabaseClient()

      .from('users')

      .update({

        updated_at: nowIso,

        data: {

          ...existingData,

          lastLogoutAt: nowIso,

        },

      })

      .eq('id', String(row.id));



    await writeAuthEvent({

      user: row.id,

      email: row.email,

      eventType: 'logout',

      result: 'success',

      req,

      sessionId,

    });

    clearAuthCookie(res);

    return res.json({ ok: true });

  } catch (error) {

    return next(error);

  }

};



const updateProfile = async (req, res, next) => {

  try {

    const requestedLang = normalizeLang(getRequestLanguage(req));

    const { gender, birthDate, preferredGender, preferredAgeFrom, preferredAgeTo, language } = req.body;

    const row = await getUserRowById(req.user?._id);

    if (!row) {

      return res.status(404).json({ message: pickLang(requestedLang, 'Пользователь не найден', 'User not found') });

    }



    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'email')) {

      return res.status(400).json({ message: pickLang(requestedLang, 'Смена почты из профиля отключена', 'Email change is disabled') });

    }



    const nowIso = new Date().toISOString();

    const existingData = row.data && typeof row.data === 'object' ? row.data : {};

    const nextData = { ...existingData };

    if (gender) nextData.gender = gender;

    if (birthDate) nextData.birthDate = birthDate;

    if (preferredGender) nextData.preferredGender = preferredGender;

    if (preferredAgeFrom !== undefined) nextData.preferredAgeFrom = preferredAgeFrom;

    if (preferredAgeTo !== undefined) nextData.preferredAgeTo = preferredAgeTo;



    const payload = {

      updated_at: nowIso,

      data: nextData,

    };

    if (language) payload.language = language;



    await getSupabaseClient()

      .from('users')

      .update(payload)

      .eq('id', String(row.id));



    const updatedRow = await getUserRowById(row.id);

    return res.json({

      message: pickLang(requestedLang, 'Профиль успешно обновлен', 'Profile updated successfully'),

      user: buildSafeUserFromRow(updatedRow || row),

    });

  } catch (error) {

    return next(error);

  }

};



const forgotPassword = async (req, res, next) => {

  try {

    const requestedLang = normalizeLang(getRequestLanguage(req));

    const email = normalizeEmailInput(req.body?.email);

    const userRow = await getUserRowByEmail(email);



    if (!userRow) {

      // To prevent email enumeration, we can return success even if user not found,

      // or return 404. For better UX in this specific app context, we'll return 404

      // as per user request "Account strictly saved for email".

      return res.status(404).json({

        message: pickLang(requestedLang, 'Пользователь с таким email не найден', 'User with this email was not found'),

      });

    }



    // Generate reset token

    const resetToken = crypto.randomBytes(32).toString('hex');

    const resetTokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');



    const nowIso = new Date().toISOString();

    const expiresAt = new Date(Date.now() + 3600000).toISOString();

    const existingData = userRow.data && typeof userRow.data === 'object' ? userRow.data : {};

    await getSupabaseClient()

      .from('users')

      .update({

        updated_at: nowIso,

        data: {

          ...existingData,

          resetPasswordTokenHash: resetTokenHash,

          resetPasswordExpiresAt: expiresAt,

        },

      })

      .eq('id', String(userRow.id));



    // Send email

    // Frontend URL for reset password page

    const resetUrl = buildLocalizedFrontendUrl(requestedLang, 'reset-password', `token=${encodeURIComponent(resetToken)}`);



    await emailService.sendPasswordRecoveryEmail(userRow.email, userRow.nickname, resetUrl, requestedLang);



    return res.json({

      message: pickLang(requestedLang, 'Ссылка для сброса пароля отправлена на email', 'Password reset link has been sent to your email'),

    });

  } catch (error) {

    return next(error);

  }

};



const resetPassword = async (req, res, next) => {

  try {

    const { token, seedPhrase } = req.body;



    const requestedLang = normalizeLang(getRequestLanguage(req));



    if (!token) {

      return res.status(400).json({ message: pickLang(requestedLang, 'Токен обязателен', 'Token is required') });

    }



    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');



    const supabase = getSupabaseClient();

    const { data: row, error } = await supabase

      .from('users')

      .select('*')

      .eq('data->>resetPasswordTokenHash', String(resetTokenHash))

      .maybeSingle();

    if (error || !row) {

      return res.status(400).json({

        message: pickLang(requestedLang, 'Неверный или истекший токен сброса пароля', 'Invalid or expired password reset token'),

      });

    }



    const data = row.data && typeof row.data === 'object' ? row.data : {};

    const expiresAtRaw = data.resetPasswordExpiresAt;

    const expiresAtMs = expiresAtRaw ? new Date(expiresAtRaw).getTime() : 0;

    if (!expiresAtMs || Date.now() > expiresAtMs) {

      return res.status(400).json({

        message: pickLang(requestedLang, 'Неверный или истекший токен сброса пароля', 'Invalid or expired password reset token'),

      });

    }



    const salt = await bcrypt.genSalt(10);

    const passwordHash = await bcrypt.hash(String(seedPhrase || ''), salt);

    const nowIso = new Date().toISOString();

    const nextData = { ...data };

    delete nextData.resetPasswordTokenHash;

    delete nextData.resetPasswordExpiresAt;



    await supabase

      .from('users')

      .update({

        password_hash: passwordHash,

        updated_at: nowIso,

        data: nextData,

      })

      .eq('id', String(row.id));



    // Log the user in immediately? Or ask to login?

    // User request: "and account can be logged in again".

    // Usually better to ask to login with new password to verify memory.

    // But we can return a token if we wanted to auto-login.

    // Let's just return success and let frontend redirect to login.



    return res.json({

      message: pickLang(requestedLang, 'Пароль успешно изменен. Теперь вы можете войти.', 'Password changed successfully. You can log in now.'),

    });

  } catch (error) {

    return next(error);

  }

};



module.exports = {

  register,

  login,

  confirmEmail,

  getMe,

  logout,

  updateProfile,

  forgotPassword,

  resetPassword,

};



