const express = require('express');
const auth = require('../middleware/auth');
const { awardRadianceForActivity } = require('../services/activityRadianceService');
const { applyStarsDelta } = require('../utils/stars');
const { getBaseRewardMultiplier, recordTransaction, awardReferralBlessingExternal } = require('../services/scService');
const { applyTreeBlessingToReward, claimTreeBlessingForUser, getTreeBlessingStatusForUser } = require('../services/treeBlessingService');
const { createAdBoostOffer } = require('../services/adBoostService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { getDocById, upsertDoc } = require('../services/documentStore');
const { getRequestLanguage } = require('../utils/requestLanguage');

const router = express.Router();

const GRATITUDE_MODEL = 'PracticeGratitudeDaily';
const GRATITUDE_COUNT = 3;
const GRATITUDE_SC_REWARD = 5;
const GRATITUDE_STARS_REWARD = 0.001;

function getDayKeyLocal(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getGratitudeDocId(userId, dayKey) {
  return `practice_gratitude:${String(userId)}:${String(dayKey)}`;
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

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function updateUserSc(userId, nextSc) {
  const supabase = getSupabaseClient();
  const currentRow = await getUserRowById(userId);
  if (!currentRow) {
    throw new Error('User not found');
  }
  const { data, error } = await supabase
    .from('users')
    .update({ data: { ...getUserData(currentRow), sc: nextSc }, updated_at: new Date().toISOString() })
    .eq('id', String(userId))
    .select('id,email,nickname,data')
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function getGratitudeDailyState(userId, dayKey) {
  const row = await getDocById(getGratitudeDocId(userId, dayKey));
  const completedIndexes = Array.isArray(row?.completedIndexes)
    ? row.completedIndexes.map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0 && value < GRATITUDE_COUNT)
    : [];
  return Array.from(new Set(completedIndexes)).sort((a, b) => a - b);
}

async function saveGratitudeDailyState(userId, dayKey, completedIndexes, now = new Date()) {
  const safeCompleted = Array.from(new Set(
    (Array.isArray(completedIndexes) ? completedIndexes : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value < GRATITUDE_COUNT)
  )).sort((a, b) => a - b);

  return upsertDoc({
    id: getGratitudeDocId(userId, dayKey),
    model: GRATITUDE_MODEL,
    data: {
      user: String(userId),
      dayKey,
      completedIndexes: safeCompleted,
    },
    createdAt: now,
    updatedAt: now,
  });
}

router.get('/gratitude/today', auth, async (req, res) => {
  try {
    const dayKey = getDayKeyLocal(new Date());
    const completedIndexes = await getGratitudeDailyState(req.user._id, dayKey);
    return res.json({
      serverDay: dayKey,
      completedIndexes,
      rewardedCount: completedIndexes.length,
      totalSlots: GRATITUDE_COUNT,
      rewards: {
        scRewardPerEntry: GRATITUDE_SC_REWARD,
        starsPerEntry: GRATITUDE_STARS_REWARD,
        radiancePerEntry: 10,
      },
    });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.get('/tree-blessing/status', auth, async (req, res) => {
  try {
    const result = await getTreeBlessingStatusForUser(req.user._id, { now: new Date() });
    if (!result) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    return res.json(result.status);
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/tree-blessing/claim', auth, async (req, res) => {
  try {
    const result = await claimTreeBlessingForUser(req.user._id, { now: new Date() });
    if (!result?.ok) {
      if (result?.code === 'active') {
        return res.status(409).json({ message: 'Благословение уже действует', status: result.status || null });
      }
      if (result?.code === 'daily_limit') {
        return res.status(429).json({ message: 'Лимит благословений на сегодня исчерпан', status: result.status || null });
      }
      if (result?.code === 'user_not_found') {
        return res.status(404).json({ message: 'Пользователь не найден' });
      }
      return res.status(500).json({ message: 'Не удалось выдать благословение' });
    }
    const boostOffer = await createAdBoostOffer({
      userId: req.user._id,
      type: 'tree_blessing_double',
      contextKey: `tree_blessing:${req.user._id}:${result.status?.activeUntil || Date.now()}`,
      page: 'practice',
      title: 'Усилить благословение Древа',
      description: 'Досмотрите видео, чтобы удвоить силу текущего благословения.',
      reward: {
        kind: 'tree_blessing_double',
      },
    }).catch(() => null);
    return res.json({ ok: true, ...result.status, boostOffer });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
});

router.post('/gratitude/complete', auth, async (req, res) => {
  try {
    const userLang = getRequestLanguage(req);
    const indexRaw = req.body?.index;
    const index = Number(indexRaw);
    if (!Number.isFinite(index) || index < 0 || index >= GRATITUDE_COUNT) {
      return res.status(400).json({ message: 'Некорректный индекс' });
    }

    const now = new Date();
    const dayKey = getDayKeyLocal(now);
    const userId = req.user._id;
    const completedIndexes = await getGratitudeDailyState(userId, dayKey);
    if (completedIndexes.includes(index)) {
      return res.json({
        ok: true,
        already: true,
        index,
        serverDay: dayKey,
        completedIndexes,
        awardedSc: 0,
        awardedStars: 0,
        radianceAward: null,
      });
    }

    const userRow = await getUserRowById(userId);
    if (!userRow) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const userData = getUserData(userRow);
    const baseMultiplier = await getBaseRewardMultiplier(userId);
    const blessingReward = await applyTreeBlessingToReward({
      userId,
      sc: GRATITUDE_SC_REWARD,
      now,
      baseMultiplier,
    });
    const awardedSc = blessingReward.sc;
    const nextSc = (Number(userData.sc) || 0) + awardedSc;
    const savedIndexes = [...completedIndexes, index];

    await saveGratitudeDailyState(userId, dayKey, savedIndexes, now);
    const starsResult = await applyStarsDelta({
      userId,
      delta: GRATITUDE_STARS_REWARD,
      type: 'gratitude_write',
      description: userLang === 'en' ? 'Gratitude' : 'Благодарность',
      relatedEntity: `${dayKey}:${index}`,
      occurredAt: now,
    });
    const updatedUser = await updateUserSc(userId, nextSc);
    await recordTransaction({
      userId,
      type: 'gratitude_write',
      direction: 'credit',
      amount: awardedSc,
      currency: 'K',
      description: userLang === 'en' ? 'Gratitude' : 'Благодарность',
      relatedEntity: `${dayKey}:${index}`,
      occurredAt: now,
    }).catch(() => null);
    awardReferralBlessingExternal({
      receiverUserId: userId,
      amount: awardedSc,
      sourceType: 'gratitude_write',
      relatedEntity: `${dayKey}:${index}`,
    }).catch(() => null);
    const radianceAward = await awardRadianceForActivity({
      userId,
      activityType: 'gratitude_write',
      meta: { index, dayKey },
      dedupeKey: `gratitude_write:${String(userId)}:${dayKey}:${index}`,
    });

    const boostOffer = await createAdBoostOffer({
      userId,
      type: 'gratitude_double',
      contextKey: `gratitude:${userId}:${dayKey}:${index}`,
      page: 'practice_gratitude',
      title: userLang === 'en' ? 'Double gratitude reward' : 'Удвоить благодарность',
      description: userLang === 'en'
        ? 'Watch the video to receive the same gratitude reward again.'
        : 'Досмотрите видео, чтобы получить такую же награду ещё раз.',
      reward: {
        kind: 'currency',
        sc: awardedSc,
        stars: GRATITUDE_STARS_REWARD,
        radiance: radianceAward?.granted || radianceAward?.amount || 0,
        radianceActivityType: 'gratitude_write',
        radianceMeta: { source: 'ad_boost', index, dayKey },
        transactionType: 'gratitude_ad_boost',
        description: userLang === 'en' ? 'Extra reward: gratitude' : 'Дополнительная награда: благодарность',
      },
    }).catch(() => null);

    return res.json({
      ok: true,
        already: false,
        index,
        serverDay: dayKey,
        completedIndexes: savedIndexes.sort((a, b) => a - b),
        awardedSc,
        awardedStars: GRATITUDE_STARS_REWARD,
        radianceAward: radianceAward && radianceAward.ok
        ? {
          activityType: 'gratitude_write',
          amount: radianceAward.granted || radianceAward.amount || 0,
          occurredAt: now.toISOString(),
        }
        : null,
      user: {
        _id: String(updatedUser?.id || userId),
        id: String(updatedUser?.id || userId),
        email: updatedUser?.email || req.user.email,
        nickname: updatedUser?.nickname || req.user.nickname,
        sc: nextSc,
        stars: Number(starsResult?.stars ?? ((Number(userData.stars) || 0) + GRATITUDE_STARS_REWARD).toFixed(3)),
      },
      boostOffer,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Practice gratitude error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

