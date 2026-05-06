const { getSupabaseClient } = require('../lib/supabaseClient');
const { awardRadianceForActivity } = require('./activityRadianceService');
const { getNumericSettingValue } = require('./settingsRegistryService');
const {
  getTreeBlessingRewardMultiplierForUser,
  __resetTreeBlessingRuntimeState,
} = require('./treeBlessingService');
const {
  CHAT_K_PER_HOUR: DEFAULT_CHAT_K_PER_HOUR,
  CHAT_MINUTES_PER_DAY_CAP: DEFAULT_CHAT_MINUTES_PER_DAY_CAP,
} = require('../config/constants');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

const CHAT_NEW_PARTNER_HOURS_WINDOW = 72;
const CHAT_MINUTES_BEFORE_HOUR_START = 5;

const REFERRAL_BLESSING_PERCENT = 5;
const GLOBAL_K_DEBUFF_CACHE_TTL_MS = Math.max(1000, Number(process.env.GLOBAL_K_DEBUFF_CACHE_TTL_MS) || 5 * 1000);
const USER_K_MULTIPLIER_CACHE_TTL_MS = Math.max(1000, Number(process.env.USER_K_MULTIPLIER_CACHE_TTL_MS) || 5 * 1000);
const CREDIT_K_MOOD_CACHE_TTL_MS = Math.max(1000, Number(process.env.CREDIT_K_MOOD_CACHE_TTL_MS) || 5 * 1000);
const TREE_INJURY_REWARD_DEBUFF_PERCENT = 50;

let globalCpDebuffCache = { expiresAt: 0, value: 1 };
let globalCpDebuffInflight = null;
const userKMultiplierCache = new Map();
const userKMultiplierInflight = new Map();
const creditKMoodMultiplierCache = new Map();
const creditKMoodMultiplierInflight = new Map();

function round3(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

function toMultiplier(percent) {
  const p = Number(percent) || 0;
  return Math.max(0, 1 - p / 100);
}

function ensurePositive(amount) {
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }
}

async function getUserRowById(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,data')
    .eq('id', String(userId))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function getUserDataFromRow(row) {
  if (!row) return {};
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return data;
}

async function updateUserDataById(userId, patch) {
  if (!userId || !patch || typeof patch !== 'object') return null;
  const supabase = getSupabaseClient();
  const row = await getUserRowById(userId);
  if (!row) return null;
  const nowIso = new Date().toISOString();
  const existingData = getUserDataFromRow(row);
  const nextData = { ...existingData, ...patch };
  const { data, error } = await supabase
    .from('users')
    .update({ data: nextData, updated_at: nowIso })
    .eq('id', String(userId))
    .select('id,data')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function createTransaction({
  userId,
  type,
  direction,
  amount,
  description,
  relatedEntity,
  currency = 'K',
  occurredAt = new Date(),
}) {
  const supabase = getSupabaseClient();
  const safeOccurredAt = occurredAt instanceof Date ? occurredAt : new Date(occurredAt);
  const nowIso = Number.isNaN(safeOccurredAt.getTime())
    ? new Date().toISOString()
    : safeOccurredAt.toISOString();
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: String(userId),
      type: String(type),
      direction: String(direction),
      amount: Number(amount),
      currency: String(currency || 'K'),
      description: description ? String(description) : null,
      related_entity: relatedEntity ? String(relatedEntity) : null,
      status: 'completed',
      occurred_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function getChatEconomyRuntime() {
  const [chatKPerHour, chatMinutesPerDayCap] = await Promise.all([
    getNumericSettingValue('CHAT_K_PER_HOUR', DEFAULT_CHAT_K_PER_HOUR),
    getNumericSettingValue('CHAT_MINUTES_PER_DAY_CAP', DEFAULT_CHAT_MINUTES_PER_DAY_CAP),
  ]);

  return {
    chatKPerHour: Number.isFinite(chatKPerHour) ? chatKPerHour : DEFAULT_CHAT_K_PER_HOUR,
    chatMinutesPerDayCap: Number.isFinite(chatMinutesPerDayCap)
      ? chatMinutesPerDayCap
      : DEFAULT_CHAT_MINUTES_PER_DAY_CAP,
  };
}

function moodMultiplier(mood) {
  if (mood === 'happy') return 1.05;
  if (mood === 'sad') return 0.95;
  return 1;
}

function isSated(entity, now = new Date()) {
  if (!entity?.satietyUntil) return false;
  return new Date(entity.satietyUntil).getTime() > now.getTime();
}

function getRuntimeCacheKey(value) {
  if (!value) return '';
  return typeof value === 'string' ? value : String(value);
}

function cleanupExpiredRuntimeEntries(map, nowMs = Date.now()) {
  if (!map || map.size < 500) return;
  for (const [key, entry] of map.entries()) {
    if (!entry || entry.expiresAt <= nowMs) {
      map.delete(key);
    }
  }
}

function getCachedRuntimeValue(map, key, nowMs = Date.now()) {
  if (!key) return null;
  const entry = map.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= nowMs) {
    map.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedRuntimeValue(map, key, value, expiresAt) {
  if (!key) return value;
  map.set(key, { value, expiresAt });
  return value;
}

function getRuntimeCacheExpiry(nowMs, ttlMs, boundary = null) {
  let expiresAt = nowMs + ttlMs;
  if (boundary) {
    const boundaryMs = new Date(boundary).getTime();
    if (Number.isFinite(boundaryMs)) {
      expiresAt = Math.min(expiresAt, boundaryMs);
    }
  }
  return expiresAt > nowMs ? expiresAt : nowMs + 1;
}

async function maybeAwardReferralBlessing({ receiverUserId, creditedAmount, sourceType, relatedEntity }) {
  try {
    if (!receiverUserId) return;
    if (!creditedAmount || creditedAmount <= 0) return;
    if (sourceType === 'referral_blessing') return;

    const receiverRow = await getUserRowById(receiverUserId);
    const receiverData = getUserDataFromRow(receiverRow);
    const inviterId = receiverData?.referredBy;
    if (!inviterId) return;

    const inviterRow = await getUserRowById(inviterId);
    const inviterData = getUserDataFromRow(inviterRow);
    const until = inviterData?.shopBoosts?.referralBlessingUntil
      ? new Date(inviterData.shopBoosts.referralBlessingUntil)
      : null;
    if (!until || until.getTime() <= Date.now()) return;

    const percent = Math.max(REFERRAL_BLESSING_PERCENT, Number(inviterData?.shopBoosts?.referralBlessingPercent) || REFERRAL_BLESSING_PERCENT);
    const bonus = round3((Number(creditedAmount) || 0) * (percent / 100));
    if (!(bonus > 0)) return;

    await creditK({
      userId: inviterId,
      amount: bonus,
      type: 'referral_blessing',
      description: 'Дополнительная награда: Благословение рефералов',
      relatedEntity: relatedEntity || receiverUserId,
    });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('maybeAwardReferralBlessing error', e);
  }
}

async function getUserKDebuffMultiplier(userId) {
  const cacheKey = getRuntimeCacheKey(userId);
  const cached = getCachedRuntimeValue(userKMultiplierCache, cacheKey);
  if (cached !== null) return cached;

  const inflight = cacheKey ? userKMultiplierInflight.get(cacheKey) : null;
  if (inflight) return inflight;

  const promise = (async () => {
    const nowMs = Date.now();
    cleanupExpiredRuntimeEntries(userKMultiplierCache, nowMs);

    try {
      const row = await getUserRowById(userId);
      const data = getUserDataFromRow(row);
      if (!row) {
        return setCachedRuntimeValue(userKMultiplierCache, cacheKey, 1, nowMs + USER_K_MULTIPLIER_CACHE_TTL_MS);
      }

      const now = new Date(nowMs);
      const penaltyActive = Boolean(data.debuffActiveUntil && new Date(data.debuffActiveUntil) > now);
      const penaltyPercent = penaltyActive ? (Number(data.debuffPercent) || 0) : 0;
      const injuryPercent = await getUserInjuryDebuffPercent();
      const value = toMultiplier(penaltyPercent) * toMultiplier(injuryPercent);
      const expiresAt = getRuntimeCacheExpiry(
        nowMs,
        USER_K_MULTIPLIER_CACHE_TTL_MS,
        penaltyActive ? data.debuffActiveUntil : null
      );
      return setCachedRuntimeValue(userKMultiplierCache, cacheKey, value, expiresAt);
    } catch (e) {
      return setCachedRuntimeValue(userKMultiplierCache, cacheKey, 1, nowMs + USER_K_MULTIPLIER_CACHE_TTL_MS);
    }
  })().finally(() => {
    if (cacheKey) {
      userKMultiplierInflight.delete(cacheKey);
    }
  });

  if (cacheKey) {
    userKMultiplierInflight.set(cacheKey, promise);
  }

  return promise;
}

let injuryDebuffCache = { at: 0, percent: null };
const INJURY_DEBUFF_CACHE_TTL_MS = 30 * 1000;

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

async function getTreeDoc() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', 'Tree')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

async function getCurrentInjuryDebuffPercent() {
  const now = Date.now();
  if (injuryDebuffCache.percent !== null && now - injuryDebuffCache.at < INJURY_DEBUFF_CACHE_TTL_MS) {
    return injuryDebuffCache.percent;
  }
  let percent = 0;
  try {
    const tree = await getTreeDoc();
    const injuries = Array.isArray(tree?.injuries) ? tree.injuries : [];
    const hasActiveInjury = injuries.some((inj) => {
      const healed = Number(inj?.healedPercent) || 0;
      return healed < 100;
    });
    percent = hasActiveInjury ? TREE_INJURY_REWARD_DEBUFF_PERCENT : 0;
  } catch (e) {
    // ignore
  }
  injuryDebuffCache = { at: now, percent };
  return percent;
}

async function getUserInjuryDebuffPercent() {
  return getCurrentInjuryDebuffPercent();
}

async function getUserRewardDebuffMultiplier(userId) {
  return getUserKDebuffMultiplier(userId);
}

async function getBattleDamageMultiplier() {
  return 1;
}

function combineBaseAndBlessingMultipliers(baseMultiplier, blessingMultiplier) {
  const base = Math.max(0, Number(baseMultiplier) || 0);
  const blessing = Math.max(1, Number(blessingMultiplier) || 1);
  return base + Math.max(0, blessing - 1);
}

async function getBaseRewardMultiplier(userId) {
  const [mGlobal, mUser] = await Promise.all([
    getGlobalKDebuffMultiplier(),
    getUserRewardDebuffMultiplier(userId),
  ]);
  return mGlobal * mUser;
}

async function getTotalRewardMultiplier(userId) {
  const [baseMultiplier, blessingMultiplier] = await Promise.all([
    getBaseRewardMultiplier(userId),
    getTreeBlessingRewardMultiplierForUser(userId),
  ]);
  return combineBaseAndBlessingMultipliers(baseMultiplier, blessingMultiplier);
}

async function getActiveBattleWithGlobalDebuff() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', 'Battle')
    .limit(100);
  if (error || !Array.isArray(data)) return null;

  const battles = data.map(mapDocRow).filter((b) => b.status === 'active' && b.globalDebuffActive === true);
  return battles[0] || null;
}

async function getGlobalKDebuffMultiplier() {
  const nowMs = Date.now();
  if (globalCpDebuffCache.expiresAt > nowMs) {
    return globalCpDebuffCache.value;
  }
  if (globalCpDebuffInflight) {
    return globalCpDebuffInflight;
  }

  globalCpDebuffInflight = (async () => {
    try {
      const battle = await getActiveBattleWithGlobalDebuff();
      const p = Number(battle?.globalDebuffPercent) || 0;
      const value = battle ? Math.max(0, 1 - p / 100) : 1;
      globalCpDebuffCache = {
        value,
        expiresAt: nowMs + GLOBAL_K_DEBUFF_CACHE_TTL_MS,
      };
      return value;
    } catch (e) {
      globalCpDebuffCache = {
        value: 1,
        expiresAt: nowMs + GLOBAL_K_DEBUFF_CACHE_TTL_MS,
      };
      return 1;
    }
  })().finally(() => {
    globalCpDebuffInflight = null;
  });

  return globalCpDebuffInflight;
}

async function getCreditKMoodMultiplier(userId) {
  const cacheKey = getRuntimeCacheKey(userId);
  const cached = getCachedRuntimeValue(creditKMoodMultiplierCache, cacheKey);
  if (cached !== null) return cached;

  const inflight = cacheKey ? creditKMoodMultiplierInflight.get(cacheKey) : null;
  if (inflight) return inflight;

  const promise = (async () => {
    const nowMs = Date.now();
    cleanupExpiredRuntimeEntries(creditKMoodMultiplierCache, nowMs);

    try {
      const supabase = getSupabaseClient();
      const { data: entityRow, error } = await supabase
        .from('entities')
        .select('mood,satiety_until')
        .eq('user_id', String(userId))
        .maybeSingle();
      if (error || !entityRow?.mood) {
        return setCachedRuntimeValue(creditKMoodMultiplierCache, cacheKey, 1, nowMs + CREDIT_K_MOOD_CACHE_TTL_MS);
      }

      const now = new Date(nowMs);
      const entity = { satietyUntil: entityRow.satiety_until };
      const happyAndSated = entityRow.mood === 'happy' && isSated(entity, now);
      const effectiveMood = happyAndSated ? 'happy' : (entityRow.mood === 'happy' ? 'neutral' : entityRow.mood);
      const value = moodMultiplier(effectiveMood);
      const expiresAt = getRuntimeCacheExpiry(
        nowMs,
        CREDIT_K_MOOD_CACHE_TTL_MS,
        happyAndSated ? entityRow.satiety_until : null
      );
      return setCachedRuntimeValue(creditKMoodMultiplierCache, cacheKey, value, expiresAt);
    } catch (e) {
      return setCachedRuntimeValue(creditKMoodMultiplierCache, cacheKey, 1, nowMs + CREDIT_K_MOOD_CACHE_TTL_MS);
    }
  })().finally(() => {
    if (cacheKey) {
      creditKMoodMultiplierInflight.delete(cacheKey);
    }
  });

  if (cacheKey) {
    creditKMoodMultiplierInflight.set(cacheKey, promise);
  }

  return promise;
}

async function creditK({
  userId,
  amount,
  type = 'other',
  description,
  relatedEntity,
  skipDebuff = false,
  skipBlessing = false,
  skipMood = false,
}) {
  ensurePositive(amount);
  const blessingPromise = skipBlessing ? Promise.resolve(1) : getTreeBlessingRewardMultiplierForUser(userId);
  const [mGlobal, mUser, mBlessing] = skipDebuff
    ? await Promise.all([Promise.resolve(1), Promise.resolve(1), blessingPromise])
    : await Promise.all([
      getGlobalKDebuffMultiplier(),
      getUserKDebuffMultiplier(userId),
      blessingPromise,
    ]);
  const rewardMultiplier = skipDebuff
    ? mBlessing
    : combineBaseAndBlessingMultipliers(mGlobal * mUser, mBlessing);
  let debuffedAmountRaw = amount * rewardMultiplier;
  if (!(debuffedAmountRaw > 0)) return null;

  if (!skipMood) {
    debuffedAmountRaw *= await getCreditKMoodMultiplier(userId);
  }

  const debuffedAmount = round3(debuffedAmountRaw);
  if (!(debuffedAmount > 0)) return null;

  const row = await getUserRowById(userId);
  if (!row) throw new Error('User not found');
  const data = getUserDataFromRow(row);
  const nextK = round3((Number(data.k) || 0) + debuffedAmount);
  const updated = await updateUserDataById(userId, { k: nextK });
  if (!updated) throw new Error('User not found');
  const updatedData = getUserDataFromRow(updated);

  await createTransaction({ userId, type, direction: 'credit', amount: debuffedAmount, description, relatedEntity });
  await maybeAwardReferralBlessing({ receiverUserId: userId, creditedAmount: debuffedAmount, sourceType: type, relatedEntity });
  return {
    ...updated,
    ...updatedData,
    k: nextK,
    creditedAmount: debuffedAmount,
    requestedAmount: round3(amount),
  };
}

async function debitK({ userId, amount, type = 'other', description, relatedEntity }) {
  ensurePositive(amount);

  const row = await getUserRowById(userId);
  if (!row) throw new Error('User not found');
  const data = getUserDataFromRow(row);
  const current = Number(data.k) || 0;
  if (current < amount) {
    throw new Error('Недостаточно K');
  }

  const nextK = round3(current - amount);
  const updated = await updateUserDataById(userId, { k: nextK });
  if (!updated) throw new Error('User not found');
  const updatedData = getUserDataFromRow(updated);

  await createTransaction({ userId, type, direction: 'debit', amount, description, relatedEntity });
  return {
    ...updated,
    ...updatedData,
    k: nextK,
  };
}

async function spendK({ userId, amount, type = 'other', description, relatedEntity }) {
  return debitK({ userId, amount, type, description, relatedEntity });
}

function calculateChatK({
  durationMinutes,
  alreadyCreditedMinutes = 0,
  ratePerHour = DEFAULT_CHAT_K_PER_HOUR,
  minutesCap = DEFAULT_CHAT_MINUTES_PER_DAY_CAP,
}) {
  if (!durationMinutes || durationMinutes <= 0) return 0;
  const effectiveMinutes = Math.max(
    0,
    Math.min(durationMinutes, minutesCap - Math.max(0, alreadyCreditedMinutes))
  );
  return Math.floor((effectiveMinutes / 60) * ratePerHour);
}

async function awardChatK({ userId, durationMinutes, alreadyCreditedMinutes = 0, relatedEntity, description }) {
  const economy = await getChatEconomyRuntime();
  const amount = calculateChatK({
    durationMinutes,
    alreadyCreditedMinutes,
    ratePerHour: economy.chatKPerHour,
    minutesCap: economy.chatMinutesPerDayCap,
  });
  if (amount <= 0) return null;
  const user = await creditK({
    userId,
    amount,
    type: 'chat',
    relatedEntity,
    description: description || 'Награда за общение',
  });
  return { amount, user };
}

async function awardReferralK({ userId, bonus = 20, description = 'Бонус за реферала', relatedEntity }) {
  return creditK({ userId, amount: bonus, type: 'referral', description, relatedEntity });
}

async function awardBattleK({ userId, amount, relatedEntity, description = 'Участие в бою', skipDebuff = false }) {
  return creditK({ userId, amount, type: 'battle', description, relatedEntity, skipDebuff });
}

async function awardFortuneK({ userId, amount, relatedEntity, description = 'Фортуна' }) {
  return creditK({ userId, amount, type: 'fortune', description, relatedEntity });
}

function ensureTwoParticipants(chat) {
  const ids = (chat?.participants || []).map(p => (p?.user ? p.user : p).toString());
  return Array.from(new Set(ids)).filter(Boolean).length === 2;
}

function mapChatRow(row) {
  if (!row) return null;
  return {
    _id: row.id,
    participants: Array.isArray(row.participants) ? row.participants : [],
    status: row.status,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    endedAt: row.ended_at ? new Date(row.ended_at) : null,
    duration: Number(row.duration || 0),
    kAwarded: Boolean(row.k_awarded),
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  };
}

async function getChatById(chatId) {
  if (!chatId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('id', String(chatId))
    .maybeSingle();
  if (error) return null;
  return mapChatRow(data);
}

async function markChatKAwarded(chatId) {
  if (!chatId) return;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  await supabase
    .from('chats')
    .update({ k_awarded: true, updated_at: nowIso })
    .eq('id', String(chatId));
}

async function upsertChatHistory(userId, partnerId, at) {
  const row = await getUserRowById(userId);
  if (!row) return;
  const data = getUserDataFromRow(row);
  const history = Array.isArray(data.chatHistory) ? [...data.chatHistory] : [];
  const pid = String(partnerId);
  const atIso = at instanceof Date ? at.toISOString() : new Date(at).toISOString();
  const idx = history.findIndex((h) => String(h?.partnerId) === pid);
  if (idx >= 0) {
    history[idx] = { ...history[idx], partnerId: pid, lastChatAt: atIso };
  } else {
    history.push({ partnerId: pid, lastChatAt: atIso });
  }
  await updateUserDataById(userId, { chatHistory: history });
}

async function getLastChatAt(userId, partnerId) {
  const row = await getUserRowById(userId);
  if (!row) return null;
  const data = getUserDataFromRow(row);
  const history = Array.isArray(data.chatHistory) ? data.chatHistory : [];
  const pid = String(partnerId);
  const entry = history.find((h) => String(h?.partnerId) === pid);
  return entry?.lastChatAt ? new Date(entry.lastChatAt) : null;
}

async function getCreditedMinutesLast24h({ userId, ratePerHour }) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const supabase = getSupabaseClient();
  const { data: tx, error } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', String(userId))
    .eq('type', 'chat')
    .eq('direction', 'credit')
    .eq('currency', 'K')
    .gte('occurred_at', since.toISOString());
  if (error || !Array.isArray(tx)) return 0;
  const totalK = tx.reduce((sum, t) => sum + (Number(t?.amount) || 0), 0);
  if (!ratePerHour) return 0;
  return (totalK / ratePerHour) * 60;
}

async function awardChatRewardsForChat(chatId) {
  const chat = await getChatById(chatId);
  if (!chat || chat.kAwarded) return null;
  if (!ensureTwoParticipants(chat)) return null;
  if (chat.status !== 'ended' && chat.status !== 'complained') return null;

  const endedAt = chat.endedAt ? new Date(chat.endedAt) : new Date();
  const durationMinutesTotal = (chat.duration || 0) / 60;

  const [a, b] = chat.participants.map(p => (p?.user ? p.user : p));

  // IMPORTANT: read previous chat history BEFORE we update it
  const windowSince = new Date(endedAt.getTime() - CHAT_NEW_PARTNER_HOURS_WINDOW * 60 * 60 * 1000);
  const [lastAWithB, lastBWithA] = await Promise.all([
    getLastChatAt(a, b),
    getLastChatAt(b, a),
  ]);

  const [userA, userB] = await Promise.all([
    getUserRowById(a),
    getUserRowById(b),
  ]);
  if (!userA || !userB) return null;

  const userAData = getUserDataFromRow(userA);
  const userBData = getUserDataFromRow(userB);

  const areFriends =
    Array.isArray(userAData.friends) && userAData.friends.some(id => id.toString() === b.toString()) &&
    Array.isArray(userBData.friends) && userBData.friends.some(id => id.toString() === a.toString());

  const isNewPair = !areFriends && (!lastAWithB || lastAWithB < windowSince) && (!lastBWithA || lastBWithA < windowSince);
  const paidMinutesTotal = Math.max(
    0,
    durationMinutesTotal - (areFriends ? 0 : CHAT_MINUTES_BEFORE_HOUR_START)
  );
  const billableHours = Math.floor(paidMinutesTotal / 60);

  if (billableHours <= 0) {
    await Promise.all([
      upsertChatHistory(a, b, endedAt),
      upsertChatHistory(b, a, endedAt),
    ]);
    await markChatKAwarded(chatId);
    return { awarded: false, reason: 'short', billableHours: 0, areFriends, isNewPair };
  }

  // Сияние за полный час общения считается отдельной матрицей, независимо от K-наград.
  try {
    if (billableHours > 0) {
      await awardRadianceForActivity({
        userId: a,
        activityType: 'chat_1h',
        meta: { chatId, hours: billableHours },
        dedupeKey: `chat_1h:${chatId}:${a}`,
        units: billableHours,
      });
      await awardRadianceForActivity({
        userId: b,
        activityType: 'chat_1h',
        meta: { chatId, hours: billableHours },
        dedupeKey: `chat_1h:${chatId}:${b}`,
        units: billableHours,
      });
    }
  } catch (e) {
    // ignore
  }

  const economy = await getChatEconomyRuntime();
  const ratePerHour = (areFriends || isNewPair) ? economy.chatKPerHour : 0;
  const description = areFriends ? 'Награда за общение (друзья)' : 'Награда за общение (новый собеседник)';

  if (ratePerHour <= 0) {
    // Update chat history regardless of rewards
    await Promise.all([
      upsertChatHistory(a, b, endedAt),
      upsertChatHistory(b, a, endedAt),
    ]);
    await markChatKAwarded(chatId);
    return { awarded: false, reason: 'not_new', billableHours };
  }

  // Cap: max 10 paid hours (600 minutes) per 24h
  const [alreadyMinutesA, alreadyMinutesB] = await Promise.all([
    getCreditedMinutesLast24h({ userId: a, ratePerHour: economy.chatKPerHour }),
    getCreditedMinutesLast24h({ userId: b, ratePerHour: economy.chatKPerHour }),
  ]);
  const minutesCap = economy.chatMinutesPerDayCap;
  const remainingMinutesA = Math.max(0, minutesCap - alreadyMinutesA);
  const remainingMinutesB = Math.max(0, minutesCap - alreadyMinutesB);
  const effectivePaidMinutes = Math.min(paidMinutesTotal, remainingMinutesA, remainingMinutesB);
  const effectiveHours = Math.floor(effectivePaidMinutes / 60);

  if (effectiveHours <= 0) {
    // Update chat history regardless of rewards
    await Promise.all([
      upsertChatHistory(a, b, endedAt),
      upsertChatHistory(b, a, endedAt),
    ]);
    await markChatKAwarded(chatId);
    return { awarded: false, reason: 'cap', billableHours };
  }

  const baseAmount = round3(ratePerHour * effectiveHours);
  const shouldBoostA = Boolean(userAData?.shopBoosts?.chatK?.pending);
  const shouldBoostB = Boolean(userBData?.shopBoosts?.chatK?.pending);
  const chatBoostPercentA = Math.max(25, Number(userAData?.shopBoosts?.chatK?.bonusPercent) || 25);
  const chatBoostPercentB = Math.max(25, Number(userBData?.shopBoosts?.chatK?.bonusPercent) || 25);

  const bonusA = shouldBoostA ? round3(baseAmount * (chatBoostPercentA / 100)) : 0;
  const bonusB = shouldBoostB ? round3(baseAmount * (chatBoostPercentB / 100)) : 0;

  await creditK({
    userId: a,
    amount: baseAmount,
    type: 'chat',
    description,
    relatedEntity: chatId,
  });
  await creditK({
    userId: b,
    amount: baseAmount,
    type: 'chat',
    description,
    relatedEntity: chatId,
  });
  if (bonusA > 0) {
    await creditK({
      userId: a,
      amount: bonusA,
      type: 'chat_boost',
      description: 'Дополнительная награда: Ключ взаимопонимания',
      relatedEntity: chatId,
      skipDebuff: true,
      skipBlessing: true,
      skipMood: true,
    });
  }
  if (bonusB > 0) {
    await creditK({
      userId: b,
      amount: bonusB,
      type: 'chat_boost',
      description: 'Дополнительная награда: Ключ взаимопонимания',
      relatedEntity: chatId,
      skipDebuff: true,
      skipBlessing: true,
      skipMood: true,
    });
  }

  if (shouldBoostA) {
    const row = await getUserRowById(a);
    if (row) {
      const data = getUserDataFromRow(row);
      const shopBoosts = data.shopBoosts && typeof data.shopBoosts === 'object' ? data.shopBoosts : {};
      const chatK = shopBoosts.chatK && typeof shopBoosts.chatK === 'object' ? shopBoosts.chatK : {};
      if (chatK.pending === true) {
        await updateUserDataById(a, {
          shopBoosts: {
            ...shopBoosts,
            chatK: {
              ...chatK,
              pending: false,
              chatId,
              activatedAt: endedAt instanceof Date ? endedAt.toISOString() : String(endedAt),
            },
          },
        });
      }
    }
  }
  if (shouldBoostB) {
    const row = await getUserRowById(b);
    if (row) {
      const data = getUserDataFromRow(row);
      const shopBoosts = data.shopBoosts && typeof data.shopBoosts === 'object' ? data.shopBoosts : {};
      const chatK = shopBoosts.chatK && typeof shopBoosts.chatK === 'object' ? shopBoosts.chatK : {};
      if (chatK.pending === true) {
        await updateUserDataById(b, {
          shopBoosts: {
            ...shopBoosts,
            chatK: {
              ...chatK,
              pending: false,
              chatId,
              activatedAt: endedAt instanceof Date ? endedAt.toISOString() : String(endedAt),
            },
          },
        });
      }
    }
  }

  // Update chat history after we made the decision (so "new" is based on previous interactions)
  await Promise.all([
    upsertChatHistory(a, b, endedAt),
    upsertChatHistory(b, a, endedAt),
  ]);

  await markChatKAwarded(chatId);
  return { awarded: true, ratePerHour, hours: effectiveHours, areFriends, isNewPair };
}

async function awardReferralBlessingExternal({ receiverUserId, amount, sourceType, relatedEntity }) {
  return maybeAwardReferralBlessing({ receiverUserId, creditedAmount: amount, sourceType, relatedEntity });
}

function __resetKServiceRuntimeState() {
  injuryDebuffCache = { at: 0, percent: null };
  globalCpDebuffCache = { expiresAt: 0, value: 1 };
  globalCpDebuffInflight = null;
  userKMultiplierCache.clear();
  userKMultiplierInflight.clear();
  creditKMoodMultiplierCache.clear();
  creditKMoodMultiplierInflight.clear();
  __resetTreeBlessingRuntimeState();
}

function __resetInjuryDebuffCache() {
  injuryDebuffCache = { at: 0, percent: null };
}

module.exports = {
  creditK,
  debitK,
  spendK,
  awardChatK,
  awardReferralK,
  awardBattleK,
  awardFortuneK,
  calculateChatK,
  awardChatRewardsForChat,
  awardReferralBlessingExternal,
  getUserRewardDebuffMultiplier,
  getBaseRewardMultiplier,
  getTotalRewardMultiplier,
  getBattleDamageMultiplier,
  recordTransaction: createTransaction,
  __resetKServiceRuntimeState,
  __resetInjuryDebuffCache,
};

