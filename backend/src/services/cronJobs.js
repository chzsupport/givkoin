const cron = require('node-cron');
const battleService = require('./battleService');
const { autoResolveExpiredAppeals, clearExpiredDebuffs } = require('../controllers/appealController');
const { runQuietWatch, awardMonthlyTopReferrer } = require('./referralService');
const { runUsersQuietWatch } = require('./quietWatchService');
const { recomputeRiskCases } = require('./securityService');
const { createDailyChronicle } = require('./chronicleService');
const { drawLottery, ensureDailyLotteryNumber } = require('../controllers/fortuneController');
const { cleanupOldFortuneWins } = require('./fortuneWinLogService');
const { createNotification } = require('../controllers/notificationController');
const emailService = require('./emailService');
const { getIO } = require('../socket');
const { getFrontendBaseUrl } = require('../config/env');
const { forEachUserBatch } = require('./userBatchService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { finalizeDueCollectiveSessions } = require('./meditationRuntimeService');
const { processDueNightShiftSettlements, processPendingNightShiftFinalReviews, processStaleNightShiftClosures } = require('./nightShiftRuntimeService');
const { cleanupExpiredTranscripts } = require('./chatTranscriptService');
const battleRuntimeStore = require('./battleRuntimeStore');
const { processPendingCrystalSettlements } = require('../controllers/crystalController');
const { processOnlineEntityMoodRefresh } = require('./entityMoodService');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

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

async function updateTreeDoc(treeId, updates) {
  const supabase = getSupabaseClient();
  const { data: existing, error: loadError } = await supabase
    .from(DOC_TABLE)
    .select('id,data')
    .eq('id', treeId)
    .maybeSingle();
  if (loadError || !existing) return null;

  const newData = { ...existing.data, ...updates };
  await supabase
    .from(DOC_TABLE)
    .update({ data: newData, updated_at: new Date().toISOString() })
    .eq('id', treeId);

  return { ...newData, _id: treeId };
}

async function getBattleDoc(battleId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', 'Battle')
    .eq('id', battleId)
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

async function listBattles(filter = {}) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', 'Battle')
    .limit(200);
  if (error || !Array.isArray(data)) return [];

  return data.map(mapDocRow).filter((row) => {
    for (const [key, val] of Object.entries(filter)) {
      if (row[key] !== val) return false;
    }
    return true;
  });
}
const DURATION_SECONDS = battleService.BATTLE_NO_ENTRY_DURATION_SECONDS || 10800;
const TICK_SECONDS = battleService.TICK_SECONDS || 5;
const AUTO_BATTLE_MIN_GAP_HOURS = 48;
const AUTO_BATTLE_MAX_GAP_HOURS = 72;
const AUTO_BATTLE_WINDOW_MS = (AUTO_BATTLE_MAX_GAP_HOURS - AUTO_BATTLE_MIN_GAP_HOURS) * 60 * 60 * 1000;
const SCHEDULER_MODE = 'darkness_hidden_window_48_72';
const DARKNESS_CYCLE_STATE_KIND = 'cycle_anchor';
const schedulerState = {
  nextAutoBattleAt: null,
  lastAutoIntervalHours: null,
  schedulerMode: SCHEDULER_MODE,
};

function getBattleSchedulerState() {
  return {
    nextAutoBattleAt: null,
    lastAutoIntervalHours: null,
    schedulerMode: schedulerState.schedulerMode,
  };
}

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

function getDayStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(now = new Date()) {
  return new Date(now).toISOString().slice(0, 10);
}

function isUserOnline(userId, io) {
  if (!io?.sockets?.adapter?.rooms) return false;
  const room = io.sockets.adapter.rooms.get(`user-${userId}`);
  return Boolean(room && room.size > 0);
}

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
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
    .select('id,data')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function getLastBattleEndAt() {
  const battles = await listBattles({ status: 'finished' });
  if (battles.length === 0) return null;

  battles.sort((a, b) => {
    const aEnd = a.endsAt ? new Date(a.endsAt).getTime() : 0;
    const bEnd = b.endsAt ? new Date(b.endsAt).getTime() : 0;
    return bEnd - aEnd;
  });

  const last = battles[0];
  const t = last?.endsAt || last?.updatedAt;
  return t ? new Date(t) : null;
}

async function getLastBattleAttackAt() {
  const battles = await listBattles();
  const eligible = battles.filter((battle) => battle?.startsAt && String(battle?.status || '') !== 'scheduled');
  if (!eligible.length) return null;
  eligible.sort((a, b) => {
    const aStart = a?.startsAt ? new Date(a.startsAt).getTime() : 0;
    const bStart = b?.startsAt ? new Date(b.startsAt).getTime() : 0;
    return bStart - aStart;
  });
  const latest = eligible[0];
  return latest?.startsAt ? new Date(latest.startsAt) : null;
}

async function listRecentActivityRows({ since, types = [] }) {
  const supabase = getSupabaseClient();
  const out = [];
  let from = 0;
  const pageSize = 1000;
  const safeTypes = Array.isArray(types) ? types.map((row) => String(row || '').trim()).filter(Boolean) : [];

  while (true) {
    let query = supabase
      .from('activity_logs')
      .select('user_id,type,minutes,meta,created_at')
      .gte('created_at', new Date(since).toISOString())
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (safeTypes.length) {
      query = query.in('type', safeTypes);
    }

    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await query;
    if (error || !Array.isArray(data) || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += data.length;
  }

  return out;
}

async function buildDarknessDecisionSnapshot(now = new Date()) {
  const since72h = new Date(now.getTime() - 72 * 60 * 60 * 1000);
  const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const supabase = getSupabaseClient();
  const types = [
    'solar_collect',
    'solar_share',
    'fruit_collect',
    'tree_heal',
    'battle_participation',
    'night_shift',
    'night_shift_anomaly',
    'night_shift_hour',
    'meditation_group',
    'news_like',
    'news_comment',
    'news_repost',
    'chat_rate',
    'chat_session',
    'crystal',
  ];

  const loadAppeals = async () => {
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', 'Appeal')
      .limit(5000);
    if (error || !Array.isArray(data)) return [];
    return data.map(mapDocRow).filter(Boolean);
  };

  const [usersResult, activityRows, appeals, battles] = await Promise.all([
    supabase.from('users').select('id', { head: true, count: 'exact' }),
    listRecentActivityRows({ since: since72h, types }),
    loadAppeals(),
    listBattles(),
  ]);

  const totalUsers = Number(usersResult?.count || 0);
  const activeUsers = new Set();
  let treeWeight = 0;
  let defenseWeight = 0;
  let socialWeight = 0;
  let usefulWeight = 0;

  for (const row of (Array.isArray(activityRows) ? activityRows : [])) {
    if (row?.user_id) activeUsers.add(String(row.user_id));
    const type = String(row?.type || '').trim();
    if (type === 'solar_collect') {
      treeWeight += 2;
      usefulWeight += 2;
    } else if (type === 'solar_share') {
      treeWeight += 2.5;
      usefulWeight += 2.5;
    } else if (type === 'fruit_collect') {
      treeWeight += 1.5;
      usefulWeight += 1.5;
    } else if (type === 'tree_heal') {
      treeWeight += 3;
      defenseWeight += 3;
      usefulWeight += 3;
    } else if (type === 'battle_participation') {
      defenseWeight += 5;
      usefulWeight += 5;
    } else if (type === 'night_shift_hour') {
      defenseWeight += 6;
      usefulWeight += 6;
    } else if (type === 'night_shift_anomaly') {
      defenseWeight += 0.15;
      usefulWeight += 0.15;
    } else if (type === 'night_shift') {
      defenseWeight += 2;
      usefulWeight += 2;
    } else if (type === 'meditation_group') {
      socialWeight += 2;
      usefulWeight += 2;
    } else if (type === 'news_like') {
      socialWeight += 0.5;
      usefulWeight += 0.5;
    } else if (type === 'news_comment') {
      socialWeight += 2;
      usefulWeight += 2;
    } else if (type === 'news_repost') {
      socialWeight += 2.5;
      usefulWeight += 2.5;
    } else if (type === 'chat_rate') {
      socialWeight += 1.5;
      usefulWeight += 1.5;
    } else if (type === 'chat_session') {
      socialWeight += 2;
      usefulWeight += 2;
    } else if (type === 'crystal') {
      usefulWeight += 2;
    }
  }

  const pendingAppeals = (Array.isArray(appeals) ? appeals : []).filter((row) => String(row?.status || '') === 'pending').length;
  const recentBattles = (Array.isArray(battles) ? battles : []).filter((battle) => {
    const battleTime = battle?.startsAt ? new Date(battle.startsAt).getTime() : 0;
    return battleTime >= since7d.getTime();
  });

  let suspiciousReports = 0;
  for (const battle of recentBattles) {
    const attendance = Array.isArray(battle?.attendance) ? battle.attendance : [];
    for (const entry of attendance) {
      if (!entry?.suspicious) continue;
      const suspiciousAt = entry?.suspiciousAt ? new Date(entry.suspiciousAt).getTime() : 0;
      if (suspiciousAt >= since7d.getTime()) suspiciousReports += 1;
    }
  }

  const latestFinishedBattle = recentBattles
    .filter((battle) => String(battle?.status || '') === 'finished')
    .sort((a, b) => {
      const aTime = a?.endsAt ? new Date(a.endsAt).getTime() : 0;
      const bTime = b?.endsAt ? new Date(b.endsAt).getTime() : 0;
      return bTime - aTime;
    })[0] || null;

  const latestBattleWasLost = latestFinishedBattle
    ? Number(latestFinishedBattle.lightDamage || 0) < Number(latestFinishedBattle.darknessDamage || 0)
    : false;

  const activeRatio = totalUsers > 0 ? activeUsers.size / totalUsers : 0;
  const lifeScore = (
    clamp01(activeRatio / 0.28) * 0.55 +
    clamp01(usefulWeight / Math.max(60, totalUsers * 1.6)) * 0.45
  ) * 100;
  const treeScore = clamp01(treeWeight / Math.max(25, totalUsers * 0.7)) * 100;
  const defenseScore = clamp01(defenseWeight / Math.max(35, totalUsers * 1.1)) * 100;
  const socialScore = clamp01(socialWeight / Math.max(30, totalUsers * 1.0)) * 100;
  const orderPenalty = clamp01((pendingAppeals / Math.max(3, totalUsers * 0.015)) * 0.7 + (suspiciousReports / Math.max(2, totalUsers * 0.01)) * 0.8);
  const orderScore = (1 - orderPenalty) * 100;

  let worldHealth = lifeScore * 0.34 + treeScore * 0.2 + defenseScore * 0.22 + socialScore * 0.12 + orderScore * 0.12;
  if (latestBattleWasLost) worldHealth -= 8;

  const riskScore = Math.max(0, Math.min(100, Math.round(100 - worldHealth)));

  return {
    riskScore,
    latestBattleWasLost,
  };
}

function computeDarknessAttackChance({ riskScore, progress01, latestBattleWasLost = false }) {
  const risk = clamp01((Number(riskScore) || 0) / 100);
  const progress = clamp01(progress01);
  let chance = 0.001 + (progress * 0.01) + (risk * 0.008) + (progress * risk * 0.10);
  if (latestBattleWasLost) chance += 0.01;
  if (risk >= 0.8) chance += 0.015;
  return clamp01(chance);
}

async function getDarknessCycleAnchor(now = new Date()) {
  const lastAttackAt = await getLastBattleAttackAt();
  if (lastAttackAt) {
    await battleRuntimeStore.clearDarknessState(DARKNESS_CYCLE_STATE_KIND).catch(() => {});
    return lastAttackAt;
  }

  const existing = await battleRuntimeStore.getDarknessState(DARKNESS_CYCLE_STATE_KIND).catch(() => null);
  const storedAnchorAt = existing?.anchorAt ? new Date(existing.anchorAt) : null;
  if (storedAnchorAt && !Number.isNaN(storedAnchorAt.getTime())) {
    return storedAnchorAt;
  }

  await battleRuntimeStore.setDarknessState(DARKNESS_CYCLE_STATE_KIND, {
    anchorAt: now.toISOString(),
  }).catch(() => {});
  return now;
}

async function launchDarknessBattleNow(now = new Date()) {
  const scheduled = await battleService.scheduleBattle({
    startsAt: now,
    durationSeconds: DURATION_SECONDS,
    scheduleSource: 'auto',
    scheduledIntervalHours: null,
  });
  await battleService.startBattle(scheduled._id, {
    startsAt: now,
    scheduleSource: 'auto',
    scheduledIntervalHours: null,
  });
}

async function maybeLetDarknessChooseBattle() {
  const now = new Date();
  const active = await battleService.getCurrentBattle();
  if (active) {
    return;
  }

  const upcoming = await battleService.getUpcomingBattle();
  if (upcoming && upcoming.startsAt && new Date(upcoming.startsAt) > now) {
    return;
  }
  if (upcoming && upcoming.startsAt && new Date(upcoming.startsAt) <= now) {
    return;
  }

  const anchorAt = await getDarknessCycleAnchor(now);
  const elapsedMs = now.getTime() - anchorAt.getTime();
  const minGapMs = AUTO_BATTLE_MIN_GAP_HOURS * 60 * 60 * 1000;
  const maxGapMs = AUTO_BATTLE_MAX_GAP_HOURS * 60 * 60 * 1000;

  if (elapsedMs < minGapMs) {
    return;
  }

  if (elapsedMs >= maxGapMs) {
    await launchDarknessBattleNow(now);
    return;
  }

  const snapshot = await buildDarknessDecisionSnapshot(now);
  const progress01 = (elapsedMs - minGapMs) / AUTO_BATTLE_WINDOW_MS;
  const chance = computeDarknessAttackChance({
    riskScore: snapshot.riskScore,
    progress01,
    latestBattleWasLost: snapshot.latestBattleWasLost,
  });

  if (Math.random() < chance) {
    await launchDarknessBattleNow(now);
  }
}

async function sendDailySolarChargeReminders() {
  try {
    const now = new Date();
    const dayStart = getDayStart(now);
    const io = getIO();

    await forEachUserBatch({
      pageSize: 300,
      filter: (user) => user?.status === 'active' && Boolean(user?.emailConfirmed),
      map: (user) => ({
        _id: user._id,
        email: user.email,
        nickname: user.nickname,
        lastSolarChargeNotificationAt: user.lastSolarChargeNotificationAt,
      }),
      handler: async (users) => {
        const userIds = users.map((user) => user._id).filter(Boolean);
        if (!userIds.length) return;

        const supabase = getSupabaseClient();
        const { data: charges, error: chargeError } = await supabase
          .from('solar_charges')
          .select('user_id,last_collected_at')
          .in('user_id', userIds.map((id) => String(id)));
        if (chargeError) {
          console.error('Solar charge reminders: failed to load charges', chargeError);
        }
        const chargeByUserId = new Map(
          (Array.isArray(charges) ? charges : []).map((charge) => [String(charge.user_id), charge.last_collected_at])
        );

        for (const user of users) {
          const lastNotifiedAt = user.lastSolarChargeNotificationAt;
          if (lastNotifiedAt && new Date(lastNotifiedAt) >= dayStart) continue;

          const lastCollectedAt = chargeByUserId.get(user._id.toString());
          if (lastCollectedAt && new Date(lastCollectedAt) >= dayStart) continue;

          const userLang = (user?.language || user?.data?.language || 'ru') === 'en' ? 'en' : 'ru';

          // Reminder is evaluated page by page so we do not keep all active users in memory.
          // This matters when reminders scale to a much larger user base.
          const notification = await createNotification({
            userId: user._id,
            type: 'system',
            title: userLang === 'en' ? 'Solar charge' : 'Солнечный заряд',
            message: userLang === 'en'
              ? 'You have not collected your solar charge today yet. Claim it and get +100 Lm and +10 K.'
              : 'Сегодня вы ещё не собрали солнечный заряд. Заберите его и получите +100 Lm и +10 K.',
            link: '/tree',
            io,
          });

          if (notification?._id) {
            await updateUserDataById(user._id, {
              lastSolarChargeNotificationAt: now.toISOString(),
            });
          }

          if (user.email) {
            await emailService.sendSolarChargeReminderEmail(
              user.email,
              user.nickname || 'друг',
              userLang
            ).catch(() => { });
          }
        }
      },
    });
  } catch (err) {
    console.error('sendDailySolarChargeReminders error:', err);
  }
}

function registerCronJobs() {
  // Раз в 10 минут: Мрак сам решает, пора ли ему напасть в окне 48–72 часа.
  cron.schedule('*/10 * * * *', async () => {
    try {
      await maybeLetDarknessChooseBattle();
    } catch (err) {
      console.error('maybeLetDarknessChooseBattle cron error:', err);
    }
  });

  // Каждые 10 секунд проверяем статусы
  cron.schedule(`*/${TICK_SECONDS} * * * * *`, async () => {
    const now = new Date();
    const active = await battleService.getCurrentBattle();
    if (!active) {
      const upcoming = await battleService.getUpcomingBattle();
      const upcomingStartsAtMs = upcoming?.startsAt ? new Date(upcoming.startsAt).getTime() : NaN;
      if (upcoming && Number.isFinite(upcomingStartsAtMs) && upcomingStartsAtMs <= now.getTime()) {
        await battleService.startBattle(upcoming._id, {
          startsAt: now,
        });
      }
      return;
    }

    const activeEndsAtMs = active?.endsAt ? new Date(active.endsAt).getTime() : NaN;
    if (Number.isFinite(activeEndsAtMs) && activeEndsAtMs <= now.getTime()) {
      const finalConfig = battleService.getBattleFinalWindowConfig();
      const reportAcceptEndsAtMs = activeEndsAtMs + (finalConfig.reportAcceptSeconds * 1000);
      if (now.getTime() >= reportAcceptEndsAtMs) {
        await battleService.finalizeBattleWithReports(active._id);
      }
      return;
    }

    await battleService.processActiveBattleTick(active);
  });

  // Каждые 15 секунд: применяем уже замороженные итоги боя в основной контур,
  // но только после отложенного окна 2-5 минут.
  cron.schedule('*/15 * * * * *', async () => {
    try {
      await battleService.processDueBattleSettlements();
    } catch (err) {
      console.error('Battle settlement cron error:', err);
    }
  });

  // Раз в 5 минут: авто-аппрув просроченных апелляций и снятие дебаффов
  cron.schedule('*/5 * * * *', async () => {
    await autoResolveExpiredAppeals();
    await clearExpiredDebuffs();
  });

  // Каждую ночь: тихая проверка рефералов, которые уже прожили в системе не меньше 72 часов.
  cron.schedule('15 3 * * *', async () => {
    try {
      await runQuietWatch();
    } catch (err) {
      console.error('Referral quiet watch cron error:', err);
    }
  });

  // Каждую минуту: финализация коллективной медитации и начисление сияния после конца сессии.
  cron.schedule('* * * * *', async () => {
    try {
      await finalizeDueCollectiveSessions();
    } catch (err) {
      console.error('Collective meditation finalize cron error:', err);
    }
  });

  // Каждую минуту: добиваем историю и проверку карты по сбору осколков уже после выдачи награды.
  cron.schedule('* * * * *', async () => {
    try {
      await processPendingCrystalSettlements();
    } catch (err) {
      console.error('Crystal settlement cron error:', err);
    }
  });

  // Каждую минуту: отложенные выплаты за Ночную Смену, когда сервер уже не в пике.
  cron.schedule('* * * * *', async () => {
    try {
      await processPendingNightShiftFinalReviews();
    } catch (err) {
      console.error('Night shift final review cron error:', err);
    }
  });

  // Каждую минуту: отложенные выплаты за Ночную Смену, когда сервер уже не в пике.
  cron.schedule('* * * * *', async () => {
    try {
      const settled = await processDueNightShiftSettlements();
      if (!Array.isArray(settled) || settled.length === 0) return;
      const io = getIO();
      for (const item of settled) {
        const userLang = (item?.language || item?.data?.language || 'ru') === 'en' ? 'en' : 'ru';
        await createNotification({
          userId: item.userId,
          type: 'system',
          title: userLang === 'en' ? 'Night Shift payout' : 'Оплата за Ночную Смену',
          message: userLang === 'en'
            ? `You have been credited ${item.reward.sc} K, ${item.reward.lm} LM and ${item.reward.stars} Stars for the night shift.`
            : `Вам начислено ${item.reward.sc} K, ${item.reward.lm} LM и ${item.reward.stars} Stars за ночную смену.`,
          link: '/activity/night-shift',
          io,
        });
      }
    } catch (err) {
      console.error('Night shift settlement cron error:', err);
    }
  });

  // Каждые 5 минут: авто-закрытие зависших смен, если живой сигнал пропал или окно смены закончилось.
  cron.schedule('*/5 * * * *', async () => {
    try {
      await processStaleNightShiftClosures();
    } catch (err) {
      console.error('Night shift stale close cron error:', err);
    }
  });

  // Каждые 15 минут: удаляем временные переписки, если окно оспаривания закончилось.
  cron.schedule('*/15 * * * *', async () => {
    try {
      await cleanupExpiredTranscripts();
    } catch (err) {
      console.error('Chat transcript cleanup cron error:', err);
    }
  });

  // Автоматический пересчет риск-кейсов
  cron.schedule('*/30 * * * *', async () => {
    try {
      await recomputeRiskCases();
    } catch (err) {
      console.error('Risk cases recompute cron error:', err);
    }
  });

  // Ежедневно: пересчёт «Тихого ночного дозора» для всех пользователей
  cron.schedule('15 0 * * *', async () => {
    try {
      await runUsersQuietWatch({ limit: 5000, staleHours: 24 });
    } catch (err) {
      console.error('Users quiet watch cron error:', err);
    }
  });

  // Периодически: обновлять статус дозора для части пользователей
  cron.schedule('0 */6 * * *', async () => {
    try {
      await runUsersQuietWatch({ limit: 300, staleHours: 24 });
    } catch (err) {
      console.error('Users quiet watch periodic cron error:', err);
    }
  });

  // Ежедневно: формирование летописи (начало суток)
  cron.schedule('0 0 * * *', async () => {
    await createDailyChronicle();
  });

  // Ежедневно: подготовка суток и генерация дневного номера лотереи
  cron.schedule('0 0 * * *', async () => {
    try {
      const { generateDailyShards } = require('../controllers/crystalController');
      await generateDailyShards();
    } catch (err) {
      console.error('Crystal daily spawn cron error:', err);
    }
  });

  // Ежедневно: генерация осколков для сессии (00:01)
  cron.schedule('1 0 * * *', async () => {
    try {
      await ensureDailyLotteryNumber();
    } catch (err) {
      console.error('Lottery daily number cron error:', err);
    }
  });

  // Ежедневно: генерация осколков для сессии (00:01)
  cron.schedule('1 0 * * *', async () => {
    try {
      const { generateDailyShards } = require('../controllers/crystalController');
      await generateDailyShards(true);
    } catch (err) {
      console.error('Crystal daily session reset cron error:', err);
    }
  });

  // Ежедневно: сброс просмотров новостей (00:01)
  cron.schedule('1 0 * * *', async () => {
    try {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayKey = dateKey(yesterday);
      
      const supabase = getSupabaseClient();
      const { error: deleteError } = await supabase
        .from(DOC_TABLE)
        .delete()
        .eq('model', 'NewsViewBucket')
        .eq('data->>dateKey', yesterdayKey);

      if (deleteError) {
        console.error('News views daily reset delete error:', deleteError);
      }

      const { error: counterDeleteError } = await supabase
        .from(DOC_TABLE)
        .delete()
        .eq('model', 'NewsDailyCounter')
        .eq('data->>dateKey', yesterdayKey);

      if (counterDeleteError) {
        console.error('News daily counter cleanup error:', counterDeleteError);
      }
    } catch (err) {
      console.error('News views daily reset cron error:', err);
    }
  });

  // Каждую минуту: выпуск отложенных новостей вне открытия ленты
  cron.schedule('* * * * *', async () => {
    try {
      const { runScheduledNewsPublishSweep } = require('../controllers/newsController');
      await runScheduledNewsPublishSweep();
    } catch (err) {
      console.error('News scheduled publish sweep cron error:', err);
    }
  });

  // Каждую минуту: проверяем, пора ли запускать розыгрыш лотереи
  // (фактическое время берется из конфигурации Фортуны)
  cron.schedule('* * * * *', async () => {
    await drawLottery();
  });

  // Ежедневно: очистка журнала выигрышей Фортуны (храним 90 дней)
  cron.schedule('2 0 * * *', async () => {
    try {
      await cleanupOldFortuneWins(90);
    } catch (err) {
      console.error('Fortune win log cleanup cron error:', err);
    }
  });

  // Ежедневно: напоминание о сборе солнечного заряда
  cron.schedule('0 20 * * *', async () => {
    await sendDailySolarChargeReminders();
  });

  cron.schedule('59 23 * * *', async () => {
    try {
      const tree = await getTreeDoc();
      if (!tree || !Array.isArray(tree.injuries) || tree.injuries.length === 0) return;

      const now = new Date();
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      const dayMs = 24 * 60 * 60 * 1000;
      let changed = false;
      const injuries = [...tree.injuries];

      for (const injury of injuries) {
        const healedPct = Number(injury?.healedPercent) || 0;
        if (healedPct >= 100) continue;

        const causedAt = injury?.causedAt ? new Date(injury.causedAt) : null;
        if (!causedAt || Number.isNaN(causedAt.getTime())) continue;

        const required = injury.requiredRadiance && injury.requiredRadiance > 0
          ? Number(injury.requiredRadiance)
          : (Number(injury.severityPercent) || 0) * 1000;
        if (!injury.requiredRadiance || injury.requiredRadiance <= 0) {
          injury.requiredRadiance = required;
          changed = true;
        }

        const effectiveStart = new Date(causedAt);
        if (effectiveStart.getHours() === 23 && effectiveStart.getMinutes() === 59) {
          effectiveStart.setDate(effectiveStart.getDate() + 1);
          effectiveStart.setHours(0, 0, 0, 0);
        } else {
          effectiveStart.setHours(0, 0, 0, 0);
        }

        if (todayStart.getTime() < effectiveStart.getTime()) continue;

        const daysElapsed = Math.floor((todayStart.getTime() - effectiveStart.getTime()) / dayMs);
        const partsDue = Math.min(3, Math.max(0, daysElapsed + 1));
        if (partsDue <= 0) continue;

        const healed = Number(injury.healedRadiance) || 0;
        const target = partsDue >= 3 ? required : (required / 3) * partsDue;
        const targetRounded = Math.round(target * 1000) / 1000;
        const nextHealed = Math.max(healed, targetRounded);
        if (nextHealed > healed) {
          injury.healedRadiance = nextHealed;
          injury.healedPercent = Math.min(100, (nextHealed / required) * 100);
          changed = true;
        }

        if ((injury.healedRadiance || 0) >= required) {
          injury.healedRadiance = required;
          injury.healedPercent = 100;
          injury.debuffPercent = 0;
          changed = true;
        }
      }

      if (changed) {
        const filteredInjuries = injuries.filter((inj) => (Number(inj?.healedPercent) || 0) < 100);
        const updates = { injuries: filteredInjuries };
        if (filteredInjuries.length === 0) {
          updates.lastHealedAt = now.toISOString();
        }
        await updateTreeDoc(tree._id, updates);
      }
    } catch (err) {
      console.error('Guardian daily radiance cron error:', err);
    }
  });

  // Ежедневно: проверка и планирование плодов Древа
  cron.schedule('0 1 * * *', async () => {
    const tree = await getTreeDoc();
    if (tree) {
      const now = new Date();
      if (!tree.nextFruitAt || tree.nextFruitAt < now) {
        const days = 1;
        const updates = {
          lastFruitAt: tree.nextFruitAt,
          nextFruitAt: new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
        };
        await updateTreeDoc(tree._id, updates);
      }
    }
  });

  // Ежемесячно: лучший рефовод прошлого месяца по активным рефералам получает 5000 K.
  cron.schedule('5 0 1 * *', async () => {
    try {
      await awardMonthlyTopReferrer();
    } catch (err) {
      console.error('Monthly top referrer cron error:', err);
    }
  });

  // Хранитель/авто-лечение травм: через 72 часа травма считается излеченной
  cron.schedule('0 * * * *', async () => {
    try {
      const tree = await getTreeDoc();
      if (!tree || !Array.isArray(tree.injuries) || tree.injuries.length === 0) return;

      const now = new Date();
      const threshold = new Date(now.getTime() - 72 * 60 * 60 * 1000);
      let changed = false;
      const injuries = [...tree.injuries];

      for (const injury of injuries) {
        const causedAt = injury.causedAt ? new Date(injury.causedAt) : null;
        const required = injury.requiredRadiance && injury.requiredRadiance > 0
          ? injury.requiredRadiance
          : (injury.severityPercent || 0) * 1000;
        if (!injury.requiredRadiance || injury.requiredRadiance <= 0) {
          injury.requiredRadiance = required;
          changed = true;
        }
        if (causedAt && causedAt <= threshold) {
          injury.healedRadiance = required;
          injury.healedPercent = 100;
          injury.debuffPercent = 0;
          changed = true;
        }
      }

      if (changed) {
        const filteredInjuries = injuries.filter((inj) => (inj.healedPercent || 0) < 100);
        const updates = { injuries: filteredInjuries };
        if (filteredInjuries.length === 0) {
          updates.lastHealedAt = now.toISOString();
        }
        await updateTreeDoc(tree._id, updates);
      }
    } catch (err) {
      console.error('Keeper autoheal cron error:', err);
    }
  });

  // Каждый час: обновляем настроение сущности у людей, которые были онлайн недавно
  cron.schedule('10 * * * *', async () => {
    try {
      await processOnlineEntityMoodRefresh();
    } catch (err) {
      console.error('Entity mood hourly refresh cron error:', err);
    }
  });
}

module.exports = { registerCronJobs, getBattleSchedulerState };

