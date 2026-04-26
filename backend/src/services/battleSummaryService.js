const { grantAchievement } = require('./achievementService');
const { createNotification } = require('../controllers/notificationController');
const { getSupabaseClient } = require('../lib/supabaseClient');
const battleRuntimeStore = require('./battleRuntimeStore');
const { computeBattleRewardSc } = require('../utils/battleReward');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
const BATTLE_SUMMARY_DETAILS_BATCH_SIZE = Math.max(1, parseInt(process.env.BATTLE_SUMMARY_DETAILS_BATCH_SIZE || '25', 10) || 25);
const BATTLE_SUMMARY_DETAILS_BATCH_DELAY_MS = Math.max(0, parseInt(process.env.BATTLE_SUMMARY_DETAILS_BATCH_DELAY_MS || '120', 10) || 120);
const BATTLE_SETTLEMENT_BATCH_SIZE = Math.max(1, parseInt(process.env.BATTLE_SETTLEMENT_BATCH_SIZE || '10', 10) || 10);
const BATTLE_SETTLEMENT_BATCH_DELAY_MS = Math.max(0, parseInt(process.env.BATTLE_SETTLEMENT_BATCH_DELAY_MS || '200', 10) || 200);

const battleSummaryDetailLocks = new Set();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray(items, size) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeSize = Math.max(1, Math.floor(Number(size) || 1));
  const out = [];
  for (let index = 0; index < safeItems.length; index += safeSize) {
    out.push(safeItems.slice(index, index + safeSize));
  }
  return out;
}

function mapBattleRow(row) {
  if (!row) return null;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return {
    ...data,
    _id: data._id || row.id,
    createdAt: data.createdAt || row.created_at || null,
    updatedAt: data.updatedAt || row.updated_at || null,
  };
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

function normalizeLang(value) {
  return value === 'en' ? 'en' : 'ru';
}

async function getUserLanguagesByIds(ids = []) {
  const safe = Array.from(new Set((Array.isArray(ids) ? ids : [])
    .map((v) => String(v || '').trim())
    .filter(Boolean)));
  if (!safe.length) return new Map();

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,language,data')
    .in('id', safe);
  if (error || !Array.isArray(data)) return new Map();

  const map = new Map();
  for (const row of data) {
    const userData = getUserData(row);
    map.set(String(row.id), normalizeLang(row?.language || userData?.language || 'ru'));
  }
  return map;
}

function emitReadyBattleSummaries(rows = []) {
  try {
    const { getIO } = require('../socket');
    const io = typeof getIO === 'function' ? getIO() : null;
    if (!io) return;
    for (const row of rows) {
      const userId = String(row?.userId || '').trim();
      if (!userId || !row?.summary) continue;
      io.to(`user-${userId}`).emit('battle:summary-ready', {
        ok: true,
        ...row.summary,
      });
    }
  } catch (_error) {
    // Тихо пропускаем, если сокеты ещё не поднялись.
  }
}

async function getBattleDocById(battleId) {
  if (!battleId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', 'Battle')
    .eq('id', String(battleId))
    .maybeSingle();
  if (error || !data) return null;
  return mapBattleRow(data);
}

async function updateBattleDocById(battleId, nextBattle) {
  if (!battleId || !nextBattle) return null;
  const payloadDoc = { ...(nextBattle && typeof nextBattle === 'object' ? nextBattle : {}) };
  delete payloadDoc._id;
  delete payloadDoc.id;
  delete payloadDoc.createdAt;
  delete payloadDoc.updatedAt;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .update({ data: payloadDoc })
    .eq('model', 'Battle')
    .eq('id', String(battleId))
    .select('id,data,created_at,updated_at')
    .maybeSingle();
  if (error || !data) return null;
  return mapBattleRow(data);
}

async function getUsersByIds(ids = []) {
  const userIds = [...new Set((Array.isArray(ids) ? ids : []).map((value) => String(value || '').trim()).filter(Boolean))];
  if (!userIds.length) return [];

  const supabase = getSupabaseClient();
  const out = [];
  for (const batch of chunkArray(userIds, 400)) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('users')
      .select('id,email,nickname,data')
      .in('id', batch);
    if (error || !Array.isArray(data)) continue;
    out.push(...data);
  }
  return out;
}

async function getUserRowById(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,email,nickname,data')
    .eq('id', String(userId))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function updateUserDataById(userId, patch) {
  if (!userId || !patch || typeof patch !== 'object') return null;
  const row = await getUserRowById(userId);
  if (!row) return null;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const existing = getUserData(row);
  const next = { ...existing, ...patch };
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: nowIso })
    .eq('id', String(userId))
    .select('id,data,email,nickname')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function buildBattleResult(lightDamage, darknessDamage) {
  if (lightDamage === darknessDamage) return 'draw';
  return lightDamage > darknessDamage ? 'light' : 'dark';
}

function buildIndexedAttendance(battle, usersById) {
  const attendance = Array.isArray(battle?.attendance) ? battle.attendance : [];
  const indexed = attendance.map((row, index) => {
    const userId = String(row?.user || '').trim();
    const userDoc = usersById.get(userId) || null;
    return {
      row,
      index,
      userId,
      damage: Math.max(0, Number(row?.damage) || 0),
      nickname: String(userDoc?.nickname || 'Игрок'),
      treeBranch: userDoc?.treeBranch ? String(userDoc.treeBranch) : null,
    };
  });

  const sorted = [...indexed].sort((left, right) => {
    const diff = right.damage - left.damage;
    if (diff !== 0) return diff;
    return left.index - right.index;
  });

  const rankByUserId = new Map();
  sorted.forEach((item, idx) => {
    if (item.userId && !rankByUserId.has(item.userId)) {
      rankByUserId.set(item.userId, idx + 1);
    }
  });

  const branchStats = new Map();
  for (const item of indexed) {
    if (!item.treeBranch) continue;
    const prev = branchStats.get(item.treeBranch) || { count: 0, damage: 0 };
    prev.count += 1;
    prev.damage += item.damage;
    branchStats.set(item.treeBranch, prev);
  }

  indexed.forEach((item) => {
    item.row.finalRank = item.userId ? rankByUserId.get(item.userId) || null : null;
    if (!item.treeBranch) {
      item.row.finalBranchAvgDamageOther = null;
      return;
    }
    const branch = branchStats.get(item.treeBranch) || { count: 0, damage: 0 };
    const othersCount = Math.max(0, branch.count - 1);
    item.row.finalBranchAvgDamageOther = othersCount > 0
      ? (branch.damage - item.damage) / othersCount
      : null;
  });

  const top = sorted[0] || null;
  return {
    indexed,
    bestPlayer: top
      ? {
          nickname: top.nickname,
          damage: top.damage,
          userId: top.userId,
        }
      : null,
  };
}

async function buildExistingAchievementsMap(userIds = []) {
  const targetIds = new Set((Array.isArray(userIds) ? userIds : []).map((id) => String(id || '').trim()).filter(Boolean));
  const result = new Map();
  if (!targetIds.size) return result;

  const supabase = getSupabaseClient();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .select('id,data')
      .eq('model', 'UserAchievement')
      .range(from, from + pageSize - 1);
    if (error || !Array.isArray(data) || !data.length) break;

    for (const row of data) {
      const payload = row?.data && typeof row.data === 'object' ? row.data : {};
      const userId = String(payload.user || '').trim();
      if (!targetIds.has(userId)) continue;
      const achievementId = Number(payload.achievementId);
      if (!Number.isFinite(achievementId) || achievementId <= 0) continue;
      if (!result.has(userId)) result.set(userId, new Set());
      result.get(userId).add(achievementId);
    }

    if (data.length < pageSize) break;
    from += data.length;
  }

  return result;
}

async function buildRecentAppealsCountMap(userIds = []) {
  const targetIds = new Set((Array.isArray(userIds) ? userIds : []).map((id) => String(id || '').trim()).filter(Boolean));
  const result = new Map();
  if (!targetIds.size) return result;

  const supabase = getSupabaseClient();
  const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  let from = 0;
  const pageSize = 1000;
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .select('id,data,created_at')
      .eq('model', 'Appeal')
      .gte('created_at', thirtyDaysAgoIso)
      .range(from, from + pageSize - 1);
    if (error || !Array.isArray(data) || !data.length) break;

    for (const row of data) {
      const payload = row?.data && typeof row.data === 'object' ? row.data : {};
      const userId = String(payload.againstUser || '').trim();
      if (!targetIds.has(userId)) continue;
      if (String(payload.status || '') === 'rejected') continue;
      result.set(userId, (result.get(userId) || 0) + 1);
    }

    if (data.length < pageSize) break;
    from += data.length;
  }

  return result;
}

async function buildActiveReferralCountMap(userIds = [], attendanceUserIds = []) {
  const inviterIds = [...new Set((Array.isArray(userIds) ? userIds : []).map((id) => String(id || '').trim()).filter(Boolean))];
  const attendanceSet = new Set((Array.isArray(attendanceUserIds) ? attendanceUserIds : []).map((id) => String(id || '').trim()).filter(Boolean));
  const result = new Map();
  if (!inviterIds.length || !attendanceSet.size) return result;

  const supabase = getSupabaseClient();
  for (const batch of chunkArray(inviterIds, 300)) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('referrals')
      .select('inviter_id,invitee_id')
      .in('inviter_id', batch)
      .eq('status', 'active');
    if (error || !Array.isArray(data)) continue;
    for (const row of data) {
      const inviterId = String(row?.inviter_id || '').trim();
      const inviteeId = String(row?.invitee_id || '').trim();
      if (!inviterId || !inviteeId || !attendanceSet.has(inviteeId)) continue;
      result.set(inviterId, (result.get(inviterId) || 0) + 1);
    }
  }

  return result;
}

function buildAchievementPreview({
  battle,
  entry,
  userRow,
  attendanceCount,
  lightDamage,
  darknessDamage,
  existingAchievements = null,
  activeReferralCount = 0,
  recentAppealsCount = 0,
}) {
  const userData = getUserData(userRow);
  const stats = userData.achievementStats && typeof userData.achievementStats === 'object'
    ? userData.achievementStats
    : {};
  const existingSet = existingAchievements instanceof Set ? existingAchievements : new Set();
  const awardedAchievements = [];
  const maybeAdd = (achievementId, shouldGrant) => {
    if (!shouldGrant) return;
    const id = Number(achievementId);
    if (!Number.isFinite(id) || id <= 0) return;
    if (existingSet.has(id)) return;
    if (!awardedAchievements.includes(id)) {
      awardedAchievements.push(id);
    }
  };

  const currentLumens = Math.max(
    0,
    Math.floor(
      entry?.lumensAtBattleStart == null
        ? (Number(userData.lumens) || 0)
        : (
          (Number(entry.lumensAtBattleStart) || 0)
          + (Number(entry?.lumensGainedTotal) || 0)
          - (Number(entry?.lumensSpentTotal) || 0)
        ),
    ),
  );
  const userDamage = Math.max(0, Number(entry?.damage) || 0);
  const userRank = entry?.finalRank == null ? null : Number(entry.finalRank);
  const userNonBaseWeaponHits = Number(entry?.nonBaseWeaponHits) || 0;
  const userWeakZoneHits = Number(entry?.weakZoneHits) || 0;
  const userNonWeakZoneHits = Number(entry?.nonWeakZoneHits) || 0;
  const userWeapon2Hits = Number(entry?.weapon2Hits) || 0;
  const userWeapon3Hits = Number(entry?.weapon3Hits) || 0;
  const userMaxClickGapMs = Number(entry?.maxClickGapMs) || 0;
  const userTotalShots = Number(entry?.totalShots) || 0;
  const userTotalHits = Number(entry?.totalHits) || 0;
  const userLumensAtBattleStart = entry?.lumensAtBattleStart == null ? null : Number(entry.lumensAtBattleStart);
  const userLumensSpentWeapon3First2Min = Number(entry?.lumensSpentWeapon3First2Min) || 0;
  const userLumensSpentOtherFirst2Min = Number(entry?.lumensSpentOtherFirst2Min) || 0;
  const userCrystalsCollected = Number(entry?.crystalsCollected) || 0;
  const userLumensSpentTotal = Number(entry?.lumensSpentTotal) || 0;
  const userDamageAfterZeroLumens = Number(entry?.damageAfterZeroLumens) || 0;
  const branchAvgDamageOther = entry?.finalBranchAvgDamageOther == null ? null : Number(entry.finalBranchAvgDamageOther);
  const weapon1Hits = userTotalHits - userWeapon2Hits - userWeapon3Hits;
  const voiceAttempts = Number(entry?.voiceCommandsTotalAttempts) || 0;
  const voiceSuccess = Number(entry?.voiceCommandsSuccess) || 0;
  const totalBattlesParticipated = (Number(stats.totalBattlesParticipated) || 0) + 1;
  const nowTime = new Date();
  const joinedAt = entry?.enteredAt
    ? new Date(entry.enteredAt)
    : (entry?.joinedAt ? new Date(entry.joinedAt) : null);
  const battleStartsAt = battle.startsAt ? new Date(battle.startsAt) : null;
  const inFromStart = joinedAt && battleStartsAt && joinedAt.getTime() <= (battleStartsAt.getTime() + 61000);
  const earningSc = computeBattleRewardSc({ damage: userDamage });
  const totalCrystals = (Number(stats.totalCrystalsCollected) || 0) + userCrystalsCollected;
  const battleWon = lightDamage > darknessDamage;
  const minutesInBattle = Math.max(
    0,
    Math.round(
      (
        new Date(battle.endsAt || battle.updatedAt || Date.now()).getTime()
        - new Date(entry?.enteredAt || entry?.joinedAt || battle.startsAt || Date.now()).getTime()
      ) / 60000,
    ),
  );
  const totalMinInBattles = ((Number(stats.totalHoursInBattles) || 0) * 60) + minutesInBattle;

  maybeAdd(1, userDamage >= 1);
  maybeAdd(2, userDamage >= 100001);
  maybeAdd(3, userDamage >= 500001);
  maybeAdd(4, userDamage >= 1000001);
  maybeAdd(5, userDamage > 0 && userNonBaseWeaponHits === 0);
  maybeAdd(6, userDamage > 0 && userWeakZoneHits >= 10 && userNonWeakZoneHits === 0);
  maybeAdd(7, userWeapon2Hits >= 10);
  maybeAdd(8, userWeapon3Hits >= 5);
  maybeAdd(9, userDamage > 0 && userMaxClickGapMs <= 3000);
  maybeAdd(
    10,
    userLumensAtBattleStart != null
      && userLumensAtBattleStart > 0
      && userLumensSpentWeapon3First2Min >= userLumensAtBattleStart
      && userLumensSpentOtherFirst2Min === 0,
  );
  maybeAdd(12, userDamage > 0 && userRank != null && userRank <= 100 && userNonBaseWeaponHits === 0);
  maybeAdd(13, weapon1Hits >= 10 && userWeapon2Hits >= 10 && userWeapon3Hits >= 10);
  maybeAdd(14, userDamage > 0 && branchAvgDamageOther != null && userDamage >= branchAvgDamageOther * 2);
  maybeAdd(15, userTotalShots > 0 && userTotalShots === userTotalHits);
  maybeAdd(16, userDamage >= 10000 && userTotalHits > 0 && userTotalHits === userWeapon2Hits);
  maybeAdd(17, userTotalHits > 0 && userTotalHits === userWeapon3Hits);
  maybeAdd(18, userDamageAfterZeroLumens >= 200001);
  maybeAdd(19, userLumensAtBattleStart === 72000);
  maybeAdd(20, (userLumensAtBattleStart || 0) > 10 && currentLumens === 0);
  maybeAdd(21, userCrystalsCollected >= 10);
  maybeAdd(22, userCrystalsCollected > 0 && currentLumens >= 72000);
  maybeAdd(23, userCrystalsCollected > 0 && Number(entry?.comboMultiplier) >= 2);
  maybeAdd(24, userLumensSpentTotal >= 10000);
  maybeAdd(25, userLumensSpentTotal >= 50000);
  maybeAdd(26, !!entry?.exitedAndReturnedWithSolarCharge);
  maybeAdd(27, !!entry?.receivedGiftInBattle);
  maybeAdd(31, (entry?.heldComboX2MaxDuration || 0) >= 120);
  maybeAdd(32, userTotalHits >= 500 && userMaxClickGapMs <= 3000);
  maybeAdd(33, userTotalHits >= 1000 && userMaxClickGapMs <= 3000);
  maybeAdd(34, (entry?.phoenixStage || 0) >= 3);
  maybeAdd(35, !!entry?.reachedX1_5InFirst30s);
  maybeAdd(36, voiceAttempts > 0 && voiceSuccess === voiceAttempts);
  maybeAdd(37, (entry?.voiceCommandsSilenceSuccess || 0) >= 5);
  maybeAdd(38, (entry?.voiceCommandsAttackSuccess || 0) >= 5);
  maybeAdd(39, (entry?.voiceCommandsConsecutive || 0) >= 10);
  maybeAdd(40, userTotalHits > 0 && !entry?.shotOutsideWeakZone);
  maybeAdd(44, totalCrystals >= 50);
  maybeAdd(46, attendanceCount >= 1001);
  maybeAdd(47, attendanceCount >= 10001);
  maybeAdd(50, activeReferralCount >= 5);
  maybeAdd(52, totalBattlesParticipated >= 5);
  maybeAdd(53, totalBattlesParticipated >= 25);
  maybeAdd(54, totalBattlesParticipated >= 100);
  maybeAdd(55, nowTime.getHours() >= 0 && nowTime.getHours() < 6);
  maybeAdd(56, nowTime.getDay() === 0 || nowTime.getDay() === 6);
  maybeAdd(57, !!inFromStart);
  maybeAdd(58, !!inFromStart);
  maybeAdd(59, earningSc >= 100);
  maybeAdd(60, earningSc >= 1200);
  maybeAdd(62, userDamage === 0 && userTotalShots === 0);
  maybeAdd(64, battleWon && recentAppealsCount === 0);
  maybeAdd(67, !!battle.isShrunken);
  maybeAdd(89, attendanceCount >= 500 && userRank != null && userRank <= 10);
  maybeAdd(91, totalMinInBattles >= 600);
  if ((Number(stats.totalChatMinutes) || 0) >= 600 && (Number(stats.totalBridgeStones) || 0) >= 20 && totalBattlesParticipated >= 2) {
    maybeAdd(92, true);
  }

  const nextAchievementStats = {
    ...stats,
    totalDamage: (Number(stats.totalDamage) || 0) + userDamage,
    totalBattlesParticipated,
    totalBattlesWon: (Number(stats.totalBattlesWon) || 0) + (battleWon ? 1 : 0),
    totalCrystalsCollected: (Number(stats.totalCrystalsCollected) || 0) + userCrystalsCollected,
    totalHoursInBattles: (Number(stats.totalHoursInBattles) || 0) + (minutesInBattle / 60),
    maxComboReached: Math.max(Number(stats.maxComboReached) || 0, Number(entry?.comboHits) || 0),
    lastBattleFinishedAt: new Date().toISOString(),
    lastBattleWon: battleWon,
    lastBattleScEarned: earningSc,
    sharesAfterLastBattle: 0,
  };

  return {
    awardedAchievements,
    nextAchievementStats,
  };
}

async function persistBattleSummarySettlements(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return;

  for (const batch of chunkArray(rows, BATTLE_SETTLEMENT_BATCH_SIZE)) {
    // eslint-disable-next-line no-await-in-loop
    const languageByUserId = await getUserLanguagesByIds(batch.map((row) => row?.userId));
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(batch.map(async (row) => {
      const userId = String(row?.userId || '').trim();
      if (!userId) return;

      if (row?.nextAchievementStats && typeof row.nextAchievementStats === 'object') {
        await updateUserDataById(userId, {
          achievementStats: row.nextAchievementStats,
        }).catch(() => null);
      }

      let grantedAny = false;
      for (const achievementId of Array.isArray(row?.awardedAchievements) ? row.awardedAchievements : []) {
        // eslint-disable-next-line no-await-in-loop
        const granted = await grantAchievement({
          userId,
          achievementId,
          meta: { battleId: String(row?.battleId || '') },
        }).catch(() => null);
        grantedAny = grantedAny || Boolean(granted?.granted);
      }

      if (grantedAny) {
        const userLang = languageByUserId.get(userId) || 'ru';
        await createNotification({
          userId,
          type: 'game',
          eventKey: 'achievement_earned',
          title: userLang === 'en' ? 'Achievement earned' : 'Получено достижение',
          message: userLang === 'en' ? 'You earned a new achievement in battle.' : 'Вы получили новое достижение в бою.',
          link: '/activity/achievements',
          io: global.io,
        }).catch(() => null);
      }
    }));

    if (BATTLE_SETTLEMENT_BATCH_DELAY_MS > 0) {
      // eslint-disable-next-line no-await-in-loop
      await sleep(BATTLE_SETTLEMENT_BATCH_DELAY_MS);
    }
  }
}

const BATTLE_SUMMARY_LINE_ORDER = [
  'user_damage',
  'reward_sc',
  'duration',
  'best_player',
  'achievements',
  'injury',
  'result',
  'total_dark_damage',
  'total_light_damage',
];

function normalizeSummaryLocale(value) {
  return value === 'en' ? 'en' : 'ru';
}

function getSummaryLocaleCode(locale) {
  return normalizeSummaryLocale(locale) === 'en' ? 'en-US' : 'ru-RU';
}

function buildSummaryLocalizedText(ru, en) {
  const safeRu = ru == null ? '' : String(ru);
  const safeEn = en == null ? '' : String(en);
  return {
    ru: safeRu || safeEn,
    en: safeEn || safeRu,
  };
}

function buildSummaryLocalizedNullableText(ru, en) {
  const safeRu = ru == null ? '' : String(ru);
  const safeEn = en == null ? '' : String(en);
  if (!safeRu && !safeEn) {
    return null;
  }
  return {
    ru: safeRu || safeEn || null,
    en: safeEn || safeRu || null,
  };
}

function formatSummaryNumber(value, locale = 'ru') {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString(getSummaryLocaleCode(locale));
}

function formatSummaryDate(dateLike, locale = 'ru') {
  const date = new Date(dateLike || Date.now());
  return new Intl.DateTimeFormat(getSummaryLocaleCode(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function formatSummaryTime(dateLike, locale = 'ru') {
  const date = new Date(dateLike || Date.now());
  return new Intl.DateTimeFormat(getSummaryLocaleCode(locale), {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function buildBattleSummaryIntroText(battle, locale = 'ru') {
  const safeLocale = normalizeSummaryLocale(locale);
  const when = battle?.endsAt || battle?.updatedAt || battle?.createdAt || new Date().toISOString();
  if (safeLocale === 'en') {
    return `Today, ${formatSummaryDate(when, safeLocale)} at ${formatSummaryTime(when, safeLocale)}, Darkness attacked the world of GIVKOIN. The Tree, as always, took the blow upon itself. By the efforts of the Keeper and the fighters, the following results were achieved:`;
  }
  return `Сегодня ${formatSummaryDate(when, safeLocale)} в ${formatSummaryTime(when, safeLocale)} Мрак совершил нападение на мир GIVKOIN. Древо, как и всегда, приняло удар на себя. Силами Хранителя и бойцов получены следующие результаты:`;
}

function resolveBattleSummaryPersonalDataSource(entry) {
  const explicitSource = String(entry?.personalDataSource || '').trim();
  if (explicitSource === 'final_report' || explicitSource === 'last_heartbeat' || explicitSource === 'none') {
    return explicitSource;
  }
  if (entry?.finalReportAt && entry?.finalReportHasPayload !== false) return 'final_report';
  if (entry?.lastClientSyncAt || entry?.reported) return 'last_heartbeat';
  return 'none';
}

function buildBattleSummaryPersonalDataSourceLabel(source, locale = 'ru') {
  const safeLocale = normalizeSummaryLocale(locale);
  if (safeLocale === 'en') {
    if (source === 'final_report') {
      return 'Personal data was taken from the last accepted final report.';
    }
    if (source === 'last_heartbeat') {
      return 'Personal data was taken from the last confirmed minute snapshot.';
    }
    return 'No personal battle data was found. A zero participation total is shown.';
  }
  if (source === 'final_report') {
    return 'Личные данные взяты из последнего принятого финального пакета.';
  }
  if (source === 'last_heartbeat') {
    return 'Личные данные взяты из последнего подтверждённого минутного среза.';
  }
  return 'Личных боевых данных не найдено. Показан нулевой итог участия.';
}

function buildBattleSummaryLine({
  key,
  labelByLocale,
  state = 'pending',
  valueTextByLocale = null,
  errorTextByLocale = null,
}) {
  const safeLabelByLocale = buildSummaryLocalizedText(
    labelByLocale?.ru,
    labelByLocale?.en,
  );
  const safeValueTextByLocale = buildSummaryLocalizedNullableText(
    valueTextByLocale?.ru ?? null,
    valueTextByLocale?.en ?? null,
  );
  const safeErrorTextByLocale = buildSummaryLocalizedNullableText(
    errorTextByLocale?.ru ?? null,
    errorTextByLocale?.en ?? null,
  );
  return {
    key: String(key || '').trim(),
    label: safeLabelByLocale.ru,
    labelByLocale: safeLabelByLocale,
    state: String(state || 'pending') === 'ready' ? 'ready' : (String(state || 'pending') === 'error' ? 'error' : 'pending'),
    valueText: safeValueTextByLocale?.ru ?? null,
    valueTextByLocale: safeValueTextByLocale,
    errorText: safeErrorTextByLocale?.ru ?? null,
    errorTextByLocale: safeErrorTextByLocale,
  };
}

function buildBattleSummaryAchievementsText(awardedAchievements = [], locale = 'ru') {
  const ids = Array.isArray(awardedAchievements)
    ? awardedAchievements.map((id) => Number(id)).filter((id) => Number.isFinite(id))
    : [];
  if (!ids.length) {
    return normalizeSummaryLocale(locale) === 'en' ? 'Not earned' : 'Не получены';
  }
  return ids.map((id) => `#${id}`).join(', ');
}

function buildBattleSummaryInjuryText(result, injury, locale = 'ru') {
  const safeLocale = normalizeSummaryLocale(locale);
  if (result !== 'dark' || !injury?.branchName) {
    return safeLocale === 'en' ? 'None' : 'Нет';
  }
  if (safeLocale === 'en') {
    return `Branch ${String(injury.branchName)}: ${formatSummaryNumber(injury.requiredRadiance, safeLocale)} Radiance, weakening ${Math.max(0, Math.floor(Number(injury.debuffPercent) || 0))}%`;
  }
  return `Ветвь ${String(injury.branchName)}: ${formatSummaryNumber(injury.requiredRadiance, safeLocale)} Сияния, ослабление ${Math.max(0, Math.floor(Number(injury.debuffPercent) || 0))}%`;
}

function buildBattleSummaryResultText(result, locale = 'ru') {
  const safeLocale = normalizeSummaryLocale(locale);
  if (safeLocale === 'en') {
    if (result === 'dark') return 'Defeat';
    if (result === 'draw') return 'Draw';
    if (result === 'light') return 'Victory';
    return null;
  }
  if (result === 'dark') return 'Поражение';
  if (result === 'draw') return 'Ничья';
  if (result === 'light') return 'Победа';
  return null;
}

function buildBattleSummaryLines({
  battle,
  entry,
  result = null,
  lightDamage = null,
  darknessDamage = null,
  attendanceCount = null,
  bestPlayer = null,
  awardedAchievements = null,
  injury = null,
  detailReady = false,
}) {
  const userDamage = Math.max(0, Number(entry?.damage) || 0);
  const rewardSc = computeBattleRewardSc({ damage: userDamage });
  const durationSeconds = Number.isFinite(Number(battle?.durationSeconds))
    ? Math.max(0, Math.floor(Number(battle.durationSeconds) || 0))
    : null;
  const lines = new Map();

  lines.set('user_damage', buildBattleSummaryLine({
    key: 'user_damage',
    labelByLocale: { ru: 'Личный урон', en: 'Personal damage' },
    state: 'ready',
    valueTextByLocale: {
      ru: formatSummaryNumber(userDamage, 'ru'),
      en: formatSummaryNumber(userDamage, 'en'),
    },
  }));
  lines.set('reward_sc', buildBattleSummaryLine({
    key: 'reward_sc',
    labelByLocale: { ru: 'Заработок в K', en: 'Earned K' },
    state: 'ready',
    valueTextByLocale: {
      ru: `${formatSummaryNumber(rewardSc, 'ru')} K`,
      en: `${formatSummaryNumber(rewardSc, 'en')} K`,
    },
  }));
  lines.set('duration', buildBattleSummaryLine({
    key: 'duration',
    labelByLocale: { ru: 'Длительность боя', en: 'Battle duration' },
    state: durationSeconds == null ? 'pending' : 'ready',
    valueTextByLocale: durationSeconds == null ? null : {
      ru: `${formatSummaryNumber(durationSeconds, 'ru')} сек`,
      en: `${formatSummaryNumber(durationSeconds, 'en')} sec`,
    },
  }));
  lines.set('best_player', buildBattleSummaryLine({
    key: 'best_player',
    labelByLocale: { ru: 'Лучший игрок', en: 'Top player' },
    state: detailReady ? 'ready' : 'pending',
    valueTextByLocale: detailReady
      ? {
        ru: bestPlayer?.nickname
          ? `${String(bestPlayer.nickname)}${attendanceCount != null ? ` из ${formatSummaryNumber(attendanceCount, 'ru')}` : ''}`
          : 'Не определён',
        en: bestPlayer?.nickname
          ? `${String(bestPlayer.nickname)}${attendanceCount != null ? ` out of ${formatSummaryNumber(attendanceCount, 'en')}` : ''}`
          : 'Not set',
      }
      : null,
  }));
  lines.set('achievements', buildBattleSummaryLine({
    key: 'achievements',
    labelByLocale: { ru: 'Достижения', en: 'Achievements' },
    state: detailReady ? 'ready' : 'pending',
    valueTextByLocale: detailReady
      ? {
        ru: buildBattleSummaryAchievementsText(awardedAchievements, 'ru'),
        en: buildBattleSummaryAchievementsText(awardedAchievements, 'en'),
      }
      : null,
  }));
  lines.set('injury', buildBattleSummaryLine({
    key: 'injury',
    labelByLocale: { ru: 'Травма', en: 'Injury' },
    state: detailReady ? 'ready' : 'pending',
    valueTextByLocale: detailReady
      ? {
        ru: buildBattleSummaryInjuryText(result, injury, 'ru'),
        en: buildBattleSummaryInjuryText(result, injury, 'en'),
      }
      : null,
  }));
  lines.set('result', buildBattleSummaryLine({
    key: 'result',
    labelByLocale: { ru: 'Победа или Поражение', en: 'Outcome' },
    state: detailReady && buildBattleSummaryResultText(result, 'ru') ? 'ready' : 'pending',
    valueTextByLocale: detailReady
      ? {
        ru: buildBattleSummaryResultText(result, 'ru'),
        en: buildBattleSummaryResultText(result, 'en'),
      }
      : null,
  }));
  lines.set('total_dark_damage', buildBattleSummaryLine({
    key: 'total_dark_damage',
    labelByLocale: { ru: 'Общий урон Мрака', en: 'Total Darkness damage' },
    state: detailReady && Number.isFinite(Number(darknessDamage)) ? 'ready' : 'pending',
    valueTextByLocale: detailReady && Number.isFinite(Number(darknessDamage))
      ? {
        ru: formatSummaryNumber(darknessDamage, 'ru'),
        en: formatSummaryNumber(darknessDamage, 'en'),
      }
      : null,
  }));
  lines.set('total_light_damage', buildBattleSummaryLine({
    key: 'total_light_damage',
    labelByLocale: { ru: 'Общий урон Света', en: 'Total Light damage' },
    state: detailReady && Number.isFinite(Number(lightDamage)) ? 'ready' : 'pending',
    valueTextByLocale: detailReady && Number.isFinite(Number(lightDamage))
      ? {
        ru: formatSummaryNumber(lightDamage, 'ru'),
        en: formatSummaryNumber(lightDamage, 'en'),
      }
      : null,
  }));

  return BATTLE_SUMMARY_LINE_ORDER.map((key) => lines.get(key));
}

function buildBattleSummarySnapshot({
  battle,
  entry,
  result = null,
  lightDamage = null,
  darknessDamage = null,
  attendanceCount = null,
  bestPlayer = null,
  awardedAchievements = null,
  injury = null,
  detailReady = false,
  updatedAt = new Date(),
}) {
  const userDamage = Math.max(0, Number(entry?.damage) || 0);
  const rewardSc = computeBattleRewardSc({ damage: userDamage });
  const safeAttendanceCount = Number.isFinite(Number(attendanceCount))
    ? Math.max(0, Math.floor(Number(attendanceCount) || 0))
    : null;
  const safeLightDamage = Number.isFinite(Number(lightDamage))
    ? Math.max(0, Math.floor(Number(lightDamage) || 0))
    : null;
  const safeDarknessDamage = Number.isFinite(Number(darknessDamage))
    ? Math.max(0, Math.floor(Number(darknessDamage) || 0))
    : null;
  const durationSeconds = Number.isFinite(Number(battle?.durationSeconds))
    ? Math.max(0, Math.floor(Number(battle.durationSeconds) || 0))
    : null;
  const personalDataSource = resolveBattleSummaryPersonalDataSource(entry);
  const lines = buildBattleSummaryLines({
    battle,
    entry,
    result,
    lightDamage: safeLightDamage,
    darknessDamage: safeDarknessDamage,
    attendanceCount: safeAttendanceCount,
    bestPlayer,
    awardedAchievements,
    injury,
    detailReady,
  });
  const isComplete = lines.every((line) => line?.state === 'ready');
  const updatedAtIso = updatedAt instanceof Date ? updatedAt.toISOString() : new Date(updatedAt || Date.now()).toISOString();

  return {
    battleId: String(battle?._id || ''),
    introText: buildBattleSummaryIntroText(battle, 'ru'),
    introTextByLocale: {
      ru: buildBattleSummaryIntroText(battle, 'ru'),
      en: buildBattleSummaryIntroText(battle, 'en'),
    },
    screenStage: isComplete ? 'done' : 'streaming',
    isComplete,
    detailsPending: !isComplete,
    detailsRetryAfterMs: isComplete ? 0 : Math.max(1000, BATTLE_SUMMARY_DETAILS_BATCH_DELAY_MS * 10 || 3000),
    detailsReadyAt: isComplete ? updatedAtIso : null,
    updatedAt: updatedAtIso,
    personalDataSource,
    personalDataSourceLabel: buildBattleSummaryPersonalDataSourceLabel(personalDataSource, 'ru'),
    personalDataSourceLabelByLocale: {
      ru: buildBattleSummaryPersonalDataSourceLabel(personalDataSource, 'ru'),
      en: buildBattleSummaryPersonalDataSourceLabel(personalDataSource, 'en'),
    },
    userDamage,
    rewardSc,
    durationSeconds,
    totalLightDamage: isComplete ? safeLightDamage : null,
    totalDarkDamage: isComplete ? safeDarknessDamage : null,
    attendanceCount: isComplete ? safeAttendanceCount : null,
    result: isComplete ? (result || null) : null,
    bestPlayer: isComplete && bestPlayer?.nickname
      ? { nickname: String(bestPlayer.nickname) }
      : null,
    injury: isComplete && result === 'dark' ? (injury || null) : null,
    awardedAchievements: isComplete && Array.isArray(awardedAchievements)
      ? awardedAchievements.map((id) => Number(id)).filter((id) => Number.isFinite(id))
      : [],
    lines,
  };
}

async function publishBattleSummary({
  battle,
  userId,
  entry,
  result = null,
  lightDamage = null,
  darknessDamage = null,
  attendanceCount = null,
  bestPlayer = null,
  awardedAchievements = null,
  injury = null,
  detailReady = false,
  updatedAt = new Date(),
  persist = false,
} = {}) {
  const safeBattleId = String(battle?._id || '').trim();
  const safeUserId = String(userId || '').trim();
  if (!safeBattleId || !safeUserId || !battle) return null;

  const summary = buildBattleSummarySnapshot({
    battle,
    entry,
    result,
    lightDamage,
    darknessDamage,
    attendanceCount,
    bestPlayer,
    awardedAchievements,
    injury,
    detailReady,
    updatedAt,
  });

  if (persist) {
    await battleRuntimeStore.upsertFinalSummary({
      battleId: safeBattleId,
      userId: safeUserId,
      summary,
    }).catch(() => null);
  }

  emitReadyBattleSummaries([{ userId: safeUserId, summary }]);
  return summary;
}

async function prepareBattleSummaryDetails(battleId) {
  const safeBattleId = String(battleId || '').trim();
  if (!safeBattleId || battleSummaryDetailLocks.has(safeBattleId)) return false;

  battleSummaryDetailLocks.add(safeBattleId);
  try {
    const battle = await getBattleDocById(safeBattleId);
    if (!battle || String(battle.status || '') !== 'finished') return false;

    const attendance = Array.isArray(battle.attendance) ? [...battle.attendance] : [];
    if (!attendance.length) return true;

    const attendanceIds = attendance.map((row) => String(row?.user || '').trim()).filter(Boolean);
    const users = await getUsersByIds(attendanceIds);
    const usersById = new Map(
      users.map((row) => {
        const data = getUserData(row);
        return [String(row.id), {
          ...row,
          email: row.email || data.email || null,
          nickname: row.nickname || data.nickname || null,
          treeBranch: data.treeBranch || null,
        }];
      }),
    );
    const existingAchievementsMap = await buildExistingAchievementsMap(attendanceIds);
    const recentAppealsCountMap = await buildRecentAppealsCountMap(attendanceIds);
    const activeReferralCountMap = await buildActiveReferralCountMap(attendanceIds, attendanceIds);

    const lightDamage = Math.max(0, Number(battle.lightDamage) || 0);
    const darknessDamage = Math.max(0, Number(battle.darknessDamage) || 0);
    const attendanceCount = Math.max(
      0,
      Number(battle.uniqueAttendanceCount) || Number(battle.attendanceCount) || attendance.length,
    );
    const result = buildBattleResult(lightDamage, darknessDamage);
    const { bestPlayer } = buildIndexedAttendance({ ...battle, attendance }, usersById);
    const savedBestPlayer = bestPlayer
      ? { userId: bestPlayer.userId, nickname: bestPlayer.nickname }
      : null;

    const settlementRows = [];
    const attendanceBatches = chunkArray(attendance.map((entry, index) => ({ entry, index })), BATTLE_SUMMARY_DETAILS_BATCH_SIZE);

    for (const batch of attendanceBatches) {
      const summaryRows = [];
      for (const item of batch) {
        const index = Number(item?.index);
        const entry = item?.entry || {};
        const userId = String(entry?.user || '').trim();
        if (!Number.isFinite(index)) {
          continue;
        }
        if (!userId) {
          attendance[index] = entry;
          continue;
        }

        // eslint-disable-next-line no-await-in-loop
        const userRow = usersById.get(userId) || await getUserRowById(userId);
        if (!userRow) {
          attendance[index] = entry;
          continue;
        }

        const preview = buildAchievementPreview({
          battle,
          entry,
          userRow,
          attendanceCount,
          lightDamage,
          darknessDamage,
          existingAchievements: existingAchievementsMap.get(userId) || new Set(),
          activeReferralCount: activeReferralCountMap.get(userId) || 0,
          recentAppealsCount: recentAppealsCountMap.get(userId) || 0,
        });
        const awardedAchievements = Array.isArray(entry?.awardedAchievements)
          ? Array.from(new Set([
              ...entry.awardedAchievements.map((id) => Number(id)).filter((id) => Number.isFinite(id)),
              ...preview.awardedAchievements,
            ]))
          : preview.awardedAchievements;

        const summary = buildBattleSummarySnapshot({
          battle,
          entry,
          result,
          lightDamage,
          darknessDamage,
          attendanceCount,
          bestPlayer: savedBestPlayer && savedBestPlayer.nickname
            ? { nickname: savedBestPlayer.nickname }
            : null,
          awardedAchievements,
          injury: result === 'dark' ? (battle.injury || null) : null,
          detailReady: true,
        });

        entry.summarySettlementAppliedAt = new Date().toISOString();
        entry.awardedAchievements = awardedAchievements;
        entry.summarySnapshot = summary;
        attendance[index] = entry;

        settlementRows.push({
          userId,
          battleId: safeBattleId,
          awardedAchievements,
          nextAchievementStats: preview.nextAchievementStats,
        });
        summaryRows.push({
          userId,
          summary,
        });
      }

      // eslint-disable-next-line no-await-in-loop
      await Promise.all(summaryRows.map((row) => battleRuntimeStore.upsertFinalSummary({
        battleId: safeBattleId,
        userId: row.userId,
        summary: row.summary,
      }).catch(() => null)));

      emitReadyBattleSummaries(summaryRows);

      if (BATTLE_SUMMARY_DETAILS_BATCH_DELAY_MS > 0) {
        // eslint-disable-next-line no-await-in-loop
        await sleep(BATTLE_SUMMARY_DETAILS_BATCH_DELAY_MS);
      }
    }

    await updateBattleDocById(safeBattleId, {
      ...battle,
      attendance,
      summaryTopPlayer: savedBestPlayer,
    }).catch(() => null);

    setTimeout(() => {
      persistBattleSummarySettlements(settlementRows).catch((error) => {
        console.error('persistBattleSummarySettlements error', error);
      });
    }, 0);

    return true;
  } catch (error) {
    console.error('prepareBattleSummaryDetails error', error);
    return false;
  } finally {
    battleSummaryDetailLocks.delete(safeBattleId);
  }
}

async function prepareBattleSummaries(battleId) {
  const battle = await getBattleDocById(battleId);
  if (!battle || String(battle.status || '') !== 'finished') return battle;

  setTimeout(() => {
    prepareBattleSummaryDetails(battleId).catch((error) => {
      console.error('prepareBattleSummaryDetails timer error', error);
    });
  }, 0);

  return battle;
}

module.exports = {
  buildBattleSummarySnapshot,
  publishBattleSummary,
  prepareBattleSummaries,
};

