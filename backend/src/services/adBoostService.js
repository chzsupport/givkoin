const crypto = require('crypto');
const axios = require('axios');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { getDocById, upsertDoc, updateDoc, mapDocRow } = require('./documentStore');
const { loadActiveAdCreative } = require('../controllers/adController');
const { creditSc, recordTransaction } = require('./scService');
const { applyStarsDelta } = require('../utils/stars');
const { awardRadianceForActivity } = require('./activityRadianceService');
const { __resetTreeBlessingRuntimeState } = require('./treeBlessingService');
const { SHOP_ITEMS_BY_KEY, localizeShopItem } = require('../config/shopCatalog');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
const OFFER_MODEL = 'AdBoostOffer';
const WATCH_MODEL = 'AdBoostWatch';
const OFFER_TTL_MS = Math.max(5 * 60 * 1000, Number(process.env.AD_BOOST_OFFER_TTL_MS) || 30 * 60 * 1000);
const WATCH_TTL_MS = Math.max(60 * 1000, Number(process.env.AD_BOOST_WATCH_TTL_MS) || 15 * 60 * 1000);
const BOOST_PLACEHOLDER_ENABLED = String(process.env.AD_BOOST_PLACEHOLDER_DISABLED || '').trim().toLowerCase() !== 'true';
const BOOST_PLACEHOLDER_MEDIA_URL = String(process.env.AD_BOOST_PLACEHOLDER_MEDIA_URL || '/ready.mp4').trim() || '/ready.mp4';
const BOOST_PLACEHOLDER_CREATIVE_ID = 'internal_vast_placeholder';
const REFERRAL_MANUAL_STEP_COUNT = 3;
const REFERRAL_MANUAL_PERCENT = 5;
const REFERRAL_MANUAL_HOURS = 24;

const SHOP_RANDOM_ITEM_KEYS = Object.freeze([
  'boost_battle_accuracy',
  'boost_battle_economy',
  'boost_weak_zone_focus',
  'boost_chat_key',
  'boost_solar_focus',
  'boost_referral_blessing',
  'entity_food_light',
  'entity_food_meal',
  'entity_food_week',
]);

function hashKey(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 24);
}

function buildOfferId(userId, type, contextKey) {
  return `ad_boost_offer:${hashKey(`${userId}:${type}:${contextKey}`)}`;
}

function buildWatchId() {
  return `ad_boost_watch:${Date.now()}:${Math.random().toString(16).slice(2, 10)}`;
}

function toIso(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizePage(page) {
  const value = String(page || '').trim();
  return value || 'all';
}

function isExpired(iso, now = new Date()) {
  if (!iso) return false;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) && ms <= now.getTime();
}

function stripDocMeta(doc) {
  if (!doc || typeof doc !== 'object') return {};
  const { _id, createdAt, updatedAt, ...data } = doc;
  return data;
}

async function updateDocIfStatus(doc, expectedStatus, patch, now = new Date()) {
  if (!doc?._id || !expectedStatus) return null;
  const supabase = getSupabaseClient();
  const nextData = {
    ...stripDocMeta(doc),
    ...(patch && typeof patch === 'object' ? patch : {}),
  };
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .update({
      data: nextData,
      updated_at: now.toISOString(),
    })
    .eq('id', String(doc._id))
    .eq('data->>status', String(expectedStatus))
    .select('id,model,data,created_at,updated_at')
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

function offerToClient(offer) {
  if (!offer || offer.status !== 'pending') return null;
  if (isExpired(offer.expiresAt)) return null;
  return {
    id: offer._id,
    type: offer.type,
    title: offer.title,
    description: offer.description,
    page: offer.page,
    expiresAt: offer.expiresAt,
  };
}

async function getUserRowById(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,language,data')
    .eq('id', String(userId))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function updateUserDataById(userId, patch) {
  const row = await getUserRowById(userId);
  if (!row) return null;
  const supabase = getSupabaseClient();
  const next = { ...getUserData(row), ...(patch && typeof patch === 'object' ? patch : {}) };
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: new Date().toISOString() })
    .eq('id', String(userId))
    .select('id,email,nickname,language,data')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function insertWarehouseItem({ userId, itemKey, sourceOfferId }) {
  const item = SHOP_ITEMS_BY_KEY[itemKey];
  if (!item) return null;
  const localized = localizeShopItem(item, 'ru');
  const supabase = getSupabaseClient();
  const id = `wi_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const nowIso = new Date().toISOString();
  const doc = {
    user: String(userId),
    itemKey: item.key,
    category: item.category,
    title: localized.title,
    description: localized.description,
    priceSc: Number(item.priceSc) || 0,
    status: 'stored',
    purchasedAt: nowIso,
    source: 'ad_boost',
    sourceOfferId,
  };
  await supabase.from(DOC_TABLE).insert({
    model: 'WarehouseItem',
    id,
    data: doc,
    created_at: nowIso,
    updated_at: nowIso,
  });
  return { ...doc, _id: id };
}

async function createAdBoostOffer({
  userId,
  type,
  contextKey,
  page = 'all',
  title,
  description,
  reward,
  ttlMs = OFFER_TTL_MS,
}) {
  const safeUserId = String(userId || '').trim();
  const safeType = String(type || '').trim();
  const safeContextKey = String(contextKey || '').trim();
  if (!safeUserId || !safeType || !safeContextKey || !reward) return null;

  const id = buildOfferId(safeUserId, safeType, safeContextKey);
  const existing = await getDocById(id);
  if (existing?.status === 'completed') return null;

  const now = new Date();
  const doc = {
    user: safeUserId,
    type: safeType,
    contextKey: safeContextKey,
    page: normalizePage(page),
    title: String(title || 'Подарок за видео'),
    description: String(description || 'Досмотрите видео до конца, чтобы получить награду.'),
    reward,
    status: 'pending',
    createdAt: existing?.createdAt || now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };

  const saved = await upsertDoc({
    id,
    model: OFFER_MODEL,
    data: doc,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  return offerToClient(saved);
}

function readXmlUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function collectTagValues(xml, tagName) {
  const values = [];
  const re = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  let match = re.exec(xml);
  while (match) {
    values.push(readXmlUrl(match[1]));
    match = re.exec(xml);
  }
  return values.filter(Boolean);
}

function collectTracking(xml, eventName) {
  const values = [];
  const re = new RegExp(`<Tracking\\b[^>]*event=["']${eventName}["'][^>]*>([\\s\\S]*?)<\\/Tracking>`, 'gi');
  let match = re.exec(xml);
  while (match) {
    values.push(readXmlUrl(match[1]));
    match = re.exec(xml);
  }
  return values.filter(Boolean);
}

function parseVastXml(xml) {
  const source = String(xml || '');
  const mediaFiles = [];
  const re = /<MediaFile\b([^>]*)>([\s\S]*?)<\/MediaFile>/gi;
  let match = re.exec(source);
  while (match) {
    const attrs = match[1] || '';
    mediaFiles.push({
      url: readXmlUrl(match[2]),
      type: (attrs.match(/\btype=["']([^"']+)["']/i)?.[1] || '').toLowerCase(),
      delivery: (attrs.match(/\bdelivery=["']([^"']+)["']/i)?.[1] || '').toLowerCase(),
      width: Number(attrs.match(/\bwidth=["']([^"']+)["']/i)?.[1] || 0) || 0,
    });
    match = re.exec(source);
  }

  const preferred = mediaFiles
    .filter((item) => item.url)
    .sort((a, b) => {
      const aMp4 = a.type.includes('mp4') ? 1 : 0;
      const bMp4 = b.type.includes('mp4') ? 1 : 0;
      if (aMp4 !== bMp4) return bMp4 - aMp4;
      return (b.width || 0) - (a.width || 0);
    })[0] || null;

  return {
    mediaUrl: preferred?.url || '',
    mediaType: preferred?.type || '',
    tracking: {
      impression: collectTagValues(source, 'Impression'),
      start: collectTracking(source, 'start'),
      firstQuartile: collectTracking(source, 'firstQuartile'),
      midpoint: collectTracking(source, 'midpoint'),
      thirdQuartile: collectTracking(source, 'thirdQuartile'),
      complete: collectTracking(source, 'complete'),
      error: collectTracking(source, 'error'),
    },
    wrapperUrls: collectTagValues(source, 'VASTAdTagURI'),
  };
}

function mergeTracking(base = {}, extra = {}) {
  const merged = { ...base };
  for (const [key, values] of Object.entries(extra || {})) {
    merged[key] = [
      ...(Array.isArray(merged[key]) ? merged[key] : []),
      ...(Array.isArray(values) ? values : []),
    ].filter(Boolean);
  }
  return merged;
}

async function fetchVastXml(url) {
  try {
    const response = await axios.get(url, {
      timeout: 8000,
      responseType: 'text',
      headers: { 'User-Agent': 'GIVKOIN-VAST-Boost/1.0' },
    });
    return String(response.data || '');
  } catch (_error) {
    return '';
  }
}

async function resolveVastPayload(creative) {
  const content = String(creative?.content || '').trim();
  if (!content) return null;
  const seenUrls = new Set();

  const resolveContent = async (value, depth = 0) => {
    const source = String(value || '').trim();
    if (!source) return { vastUrl: '', vastXml: '', mediaUrl: '', mediaType: '', tracking: {} };

    const isXml = source.startsWith('<');
    const vastUrl = isXml ? '' : source;
    if (vastUrl) seenUrls.add(vastUrl);
    const vastXml = isXml ? source : await fetchVastXml(source);
    const parsed = vastXml ? parseVastXml(vastXml) : { mediaUrl: '', mediaType: '', tracking: {}, wrapperUrls: [] };

    if (!parsed.mediaUrl && depth < 3) {
      const wrapperUrl = (parsed.wrapperUrls || []).find((url) => url && !seenUrls.has(url));
      if (wrapperUrl) {
        const nested = await resolveContent(wrapperUrl, depth + 1);
        return {
          ...nested,
          vastUrl: vastUrl || nested.vastUrl,
          vastXml: nested.vastXml || vastXml,
          tracking: mergeTracking(parsed.tracking, nested.tracking),
        };
      }
    }

    return { vastUrl, vastXml, ...parsed };
  };

  return resolveContent(content, 0);
}

function buildPlaceholderVastPayload() {
  return {
    vastUrl: '',
    vastXml: '',
    mediaUrl: BOOST_PLACEHOLDER_MEDIA_URL,
    mediaType: 'video/mp4',
    tracking: {},
    placeholder: true,
  };
}

async function startAdBoost({ userId, offerId }) {
  const offer = await getDocById(offerId);
  if (!offer || String(offer.user) !== String(userId)) {
    const error = new Error('Предложение не найдено');
    error.statusCode = 404;
    throw error;
  }
  if (offer.status !== 'pending' || isExpired(offer.expiresAt)) {
    const error = new Error('Предложение уже недоступно');
    error.statusCode = 400;
    throw error;
  }

  const creative = await loadActiveAdCreative(offer.page || 'all', 'rewarded_vast', new Date(), 'vast').catch(() => null);
  let vast = creative?._id ? await resolveVastPayload(creative).catch(() => null) : null;
  let creativeId = creative?._id || '';

  if (!vast?.mediaUrl && BOOST_PLACEHOLDER_ENABLED) {
    vast = buildPlaceholderVastPayload();
    creativeId = creativeId || BOOST_PLACEHOLDER_CREATIVE_ID;
  }

  if (!vast?.mediaUrl) {
    const error = new Error('VAST реклама не настроена');
    error.statusCode = 400;
    throw error;
  }

  const sessionId = buildWatchId();
  const now = new Date();
  const session = {
    user: String(userId),
    offerId: String(offerId),
    creativeId: String(creativeId),
    status: 'started',
    startedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + WATCH_TTL_MS).toISOString(),
  };
  await upsertDoc({ id: sessionId, model: WATCH_MODEL, data: session, createdAt: now, updatedAt: now });
  return {
    sessionId,
    creativeId,
    vast,
  };
}

async function grantCurrencyReward({ userId, reward, offerId, now = new Date() }) {
  const result = {};
  const sc = Number(reward.sc) || 0;
  const lumens = Number(reward.lumens ?? reward.lm) || 0;
  const stars = Number(reward.stars) || 0;

  if (sc > 0) {
    const updated = await creditSc({
      userId,
      amount: sc,
      type: reward.transactionType || 'ad_boost',
      description: reward.description || 'Дополнительная награда за просмотр',
      relatedEntity: offerId,
      skipDebuff: true,
      skipBlessing: true,
      skipMood: true,
    });
    result.sc = updated?.sc;
  }

  if (lumens > 0) {
    const userRow = await getUserRowById(userId);
    const data = getUserData(userRow);
    const nextLumens = (Number(data.lumens) || 0) + lumens;
    await updateUserDataById(userId, { lumens: nextLumens });
    await recordTransaction({
      userId,
      type: reward.transactionType || 'ad_boost',
      direction: 'credit',
      amount: lumens,
      currency: 'LM',
      description: reward.description || 'Дополнительная награда за просмотр',
      relatedEntity: offerId,
      occurredAt: now,
    }).catch(() => null);
    result.lumens = nextLumens;
  }

  if (stars > 0) {
    const starsResult = await applyStarsDelta({
      userId,
      delta: stars,
      skipDebuff: true,
      type: reward.transactionType || 'ad_boost',
      description: reward.description || 'Дополнительная награда за просмотр',
      relatedEntity: offerId,
      occurredAt: now,
    });
    result.stars = starsResult?.stars;
  }

  if (Number(reward.radiance) > 0 && reward.radianceActivityType) {
    await awardRadianceForActivity({
      userId,
      amount: Number(reward.radiance),
      activityType: reward.radianceActivityType,
      meta: { ...(reward.radianceMeta || {}), offerId },
      dedupeKey: `ad_boost:${offerId}:radiance`,
    }).catch(() => null);
  }

  return result;
}

async function grantShopRandomItem({ userId, offerId }) {
  const keys = SHOP_RANDOM_ITEM_KEYS.filter((key) => SHOP_ITEMS_BY_KEY[key]);
  const itemKey = keys[Math.floor(Math.random() * keys.length)];
  const item = await insertWarehouseItem({ userId, itemKey, sourceOfferId: offerId });
  return { item };
}

async function applyWarehouseUpgrade({ userId, reward }) {
  const itemKey = String(reward.itemKey || '');
  const userRow = await getUserRowById(userId);
  const userData = getUserData(userRow);
  const shopBoosts = userData.shopBoosts && typeof userData.shopBoosts === 'object' ? userData.shopBoosts : {};
  const now = new Date();

  if (itemKey === 'boost_battle_accuracy') {
    shopBoosts.battleDamage = { ...(shopBoosts.battleDamage || {}), bonusPercent: 20, adBoosted: true };
  } else if (itemKey === 'boost_battle_economy') {
    shopBoosts.battleLumensDiscount = { ...(shopBoosts.battleLumensDiscount || {}), discountPercent: 30, adBoosted: true };
  } else if (itemKey === 'boost_weak_zone_focus') {
    shopBoosts.weakZoneDamage = { ...(shopBoosts.weakZoneDamage || {}), bonusPercent: 55, adBoosted: true };
  } else if (itemKey === 'boost_chat_key') {
    shopBoosts.chatSc = { ...(shopBoosts.chatSc || {}), bonusPercent: 30, adBoosted: true };
  } else if (itemKey === 'boost_solar_focus') {
    shopBoosts.solarExtraLmAmount = 25;
    shopBoosts.solarFocusAdBoosted = true;
  } else if (itemKey === 'boost_referral_blessing') {
    shopBoosts.referralBlessingPercent = 10;
    shopBoosts.referralBlessingAdBoosted = true;
  } else if (itemKey.startsWith('entity_food_')) {
    const supabase = getSupabaseClient();
    const { data: entityRow } = await supabase
      .from('entities')
      .select('*')
      .eq('user_id', String(userId))
      .maybeSingle();
    if (entityRow?.id) {
      const currentMs = entityRow.satiety_until ? new Date(entityRow.satiety_until).getTime() : now.getTime();
      const baseMs = Number.isFinite(currentMs) && currentMs > now.getTime() ? currentMs : now.getTime();
      await supabase
        .from('entities')
        .update({
          satiety_until: new Date(baseMs + 12 * 60 * 60 * 1000).toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', Number(entityRow.id));
    }
  }

  await updateUserDataById(userId, { shopBoosts });
  return { shopBoosts };
}

async function grantRouletteExtraSpin({ userId }) {
  const userRow = await getUserRowById(userId);
  const data = getUserData(userRow);
  const fortuneBoosts = data.fortuneBoosts && typeof data.fortuneBoosts === 'object' ? data.fortuneBoosts : {};
  await updateUserDataById(userId, {
    fortuneBoosts: {
      ...fortuneBoosts,
      rouletteExtraSpins: Math.max(0, Number(fortuneBoosts.rouletteExtraSpins) || 0) + 1,
    },
  });
  return { rouletteExtraSpins: Math.max(0, Number(fortuneBoosts.rouletteExtraSpins) || 0) + 1 };
}

async function grantLotteryFreeTicket({ userId }) {
  const userRow = await getUserRowById(userId);
  const data = getUserData(userRow);
  const fortuneBoosts = data.fortuneBoosts && typeof data.fortuneBoosts === 'object' ? data.fortuneBoosts : {};
  await updateUserDataById(userId, {
    fortuneBoosts: {
      ...fortuneBoosts,
      lotteryFreeTickets: Math.max(0, Number(fortuneBoosts.lotteryFreeTickets) || 0) + 1,
    },
  });
  return { lotteryFreeTickets: Math.max(0, Number(fortuneBoosts.lotteryFreeTickets) || 0) + 1 };
}

async function grantTreeBlessingDouble({ userId }) {
  const userRow = await getUserRowById(userId);
  const data = getUserData(userRow);
  const shopBoosts = data.shopBoosts && typeof data.shopBoosts === 'object' ? data.shopBoosts : {};
  shopBoosts.practiceTreeBlessingPercent = 20;
  shopBoosts.practiceTreeBlessingAdBoosted = true;
  await updateUserDataById(userId, { shopBoosts });
  __resetTreeBlessingRuntimeState();
  return { shopBoosts };
}

function normalizeReferralManualSteps(value) {
  const raw = Array.isArray(value) ? value : [];
  return Array.from(new Set(raw
    .map((step) => Math.floor(Number(step) || 0))
    .filter((step) => step >= 1 && step <= REFERRAL_MANUAL_STEP_COUNT)))
    .sort((a, b) => a - b);
}

async function grantReferralManualStep({ userId, reward }) {
  const step = Math.floor(Number(reward.step) || 0);
  if (step < 1 || step > REFERRAL_MANUAL_STEP_COUNT) {
    const error = new Error('Некорректный шаг');
    error.statusCode = 400;
    throw error;
  }

  const userRow = await getUserRowById(userId);
  const userData = getUserData(userRow);
  const shopBoosts = userData.shopBoosts && typeof userData.shopBoosts === 'object' ? userData.shopBoosts : {};
  const now = new Date();
  const activeUntilMs = shopBoosts.referralBlessingUntil ? new Date(shopBoosts.referralBlessingUntil).getTime() : 0;
  const manualState = shopBoosts.referralManualBoost && typeof shopBoosts.referralManualBoost === 'object'
    ? shopBoosts.referralManualBoost
    : {};
  const cycleKey = String(reward.cycleKey || manualState.cycleKey || '').trim() || `manual-referrals:${Date.now()}`;

  const watchedSteps = String(manualState.cycleKey || '') === cycleKey
    ? normalizeReferralManualSteps(manualState.watchedSteps)
    : [];
  if (!watchedSteps.includes(step)) {
    watchedSteps.push(step);
    watchedSteps.sort((a, b) => a - b);
  }

  const completed = watchedSteps.length >= REFERRAL_MANUAL_STEP_COUNT;
  let activeUntil = Number.isFinite(activeUntilMs) && activeUntilMs > now.getTime()
    ? new Date(activeUntilMs)
    : null;

  if (completed && !activeUntil) {
    activeUntil = new Date(now.getTime() + REFERRAL_MANUAL_HOURS * 60 * 60 * 1000);
    shopBoosts.referralBlessingUntil = activeUntil.toISOString();
    shopBoosts.referralBlessingPercent = REFERRAL_MANUAL_PERCENT;
    shopBoosts.referralBlessingAdBoosted = true;
  }

  shopBoosts.referralManualBoost = {
    cycleKey,
    watchedSteps,
    completed,
    percent: REFERRAL_MANUAL_PERCENT,
    completedAt: completed ? (manualState.completedAt || now.toISOString()) : null,
    activeUntil: activeUntil ? activeUntil.toISOString() : null,
  };

  const updatedUser = await updateUserDataById(userId, { shopBoosts });
  const updatedData = getUserData(updatedUser);
  return {
    shopBoosts: updatedData.shopBoosts || shopBoosts,
    referralManualBoost: {
      watchedSteps,
      completed,
      active: Boolean(activeUntil && activeUntil.getTime() > now.getTime()),
      activeUntil: activeUntil ? activeUntil.toISOString() : null,
      percent: REFERRAL_MANUAL_PERCENT,
    },
  };
}

async function grantFruitLikeRandom({ userId, offerId }) {
  const roll = Math.floor(Math.random() * 3);
  const reward = {
    kind: 'currency',
    transactionType: 'attendance_ad_boost',
    description: 'Дополнительная награда: Посещаемость',
  };
  if (roll === 0) {
    reward.sc = Math.floor(Math.random() * 41) + 10;
  } else if (roll === 1) {
    reward.stars = 0.005;
  } else {
    reward.lumens = Math.floor(Math.random() * 41) + 10;
  }
  return grantCurrencyReward({ userId, reward, offerId });
}

async function applyOfferReward(offer) {
  const reward = offer?.reward && typeof offer.reward === 'object' ? offer.reward : {};
  const kind = String(reward.kind || 'currency');
  if (kind === 'shop_random_item') return grantShopRandomItem({ userId: offer.user, offerId: offer._id });
  if (kind === 'warehouse_upgrade') return applyWarehouseUpgrade({ userId: offer.user, reward });
  if (kind === 'roulette_extra_spin') return grantRouletteExtraSpin({ userId: offer.user });
  if (kind === 'lottery_free_ticket') return grantLotteryFreeTicket({ userId: offer.user });
  if (kind === 'tree_blessing_double') return grantTreeBlessingDouble({ userId: offer.user });
  if (kind === 'referral_manual_step') return grantReferralManualStep({ userId: offer.user, reward });
  if (kind === 'fruit_like_random') return grantFruitLikeRandom({ userId: offer.user, offerId: offer._id });
  return grantCurrencyReward({ userId: offer.user, reward, offerId: offer._id });
}

async function completeAdBoost({ userId, sessionId }) {
  const session = await getDocById(sessionId);
  if (!session || String(session.user) !== String(userId)) {
    const error = new Error('Просмотр не найден');
    error.statusCode = 404;
    throw error;
  }
  if (session.status === 'completed') {
    const error = new Error('Это предложение уже засчитано');
    error.statusCode = 400;
    throw error;
  }
  if (session.status !== 'started' || isExpired(session.expiresAt)) {
    const error = new Error('Просмотр уже недоступен');
    error.statusCode = 400;
    throw error;
  }

  const offer = await getDocById(session.offerId);
  if (!offer || String(offer.user) !== String(userId)) {
    const error = new Error('Предложение не найдено');
    error.statusCode = 404;
    throw error;
  }
  if (offer.status === 'completed') {
    const error = new Error('Это предложение уже получено');
    error.statusCode = 400;
    throw error;
  }
  if (offer.status !== 'pending' || isExpired(offer.expiresAt)) {
    const error = new Error('Предложение уже недоступно');
    error.statusCode = 400;
    throw error;
  }

  const now = new Date();
  const claimedOffer = await updateDocIfStatus(offer, 'pending', {
    status: 'processing',
    processingAt: now.toISOString(),
    watchSessionId: session._id,
  }, now);
  if (!claimedOffer) {
    const error = new Error('Это предложение уже обрабатывается');
    error.statusCode = 400;
    throw error;
  }

  let result;
  try {
    result = await applyOfferReward(claimedOffer);
  } catch (error) {
    await updateDoc(claimedOffer._id, {
      ...stripDocMeta(claimedOffer),
      status: 'failed',
      failedAt: new Date().toISOString(),
      error: error?.message || 'reward_failed',
    }).catch(() => null);
    throw error;
  }
  await updateDoc(session._id, {
    ...stripDocMeta(session),
    status: 'completed',
    completedAt: now.toISOString(),
  });
  await updateDoc(claimedOffer._id, {
    ...stripDocMeta(claimedOffer),
    status: 'completed',
    completedAt: now.toISOString(),
    watchSessionId: session._id,
    result,
  });
  return {
    ok: true,
    offerType: offer.type,
    title: offer.title,
    result,
  };
}

module.exports = {
  createAdBoostOffer,
  completeAdBoost,
  offerToClient,
  parseVastXml,
  startAdBoost,
  SHOP_RANDOM_ITEM_KEYS,
};
