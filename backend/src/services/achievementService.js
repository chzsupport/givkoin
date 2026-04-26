const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

async function listUserAchievementsDocs(userId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
        .from(DOC_TABLE)
        .select('id,data,created_at,updated_at')
        .eq('model', 'UserAchievement')
        .limit(500);
    if (error || !Array.isArray(data)) return [];
    return data.filter((row) => String(row.data?.user) === String(userId));
}

async function insertUserAchievement(doc) {
    const supabase = getSupabaseClient();
    const id = `ua_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    await supabase.from(DOC_TABLE).insert({
        model: 'UserAchievement',
        id,
        data: doc,
        created_at: nowIso,
        updated_at: nowIso,
    });
    return { ...doc, _id: id };
}

async function grantAchievement({ userId, achievementId, meta = null, earnedAt = new Date() }) {
  if (!userId) throw new Error('userId is required');
  const id = Number(achievementId);
  if (!Number.isFinite(id) || id <= 0) throw new Error('achievementId is invalid');

  try {
    const existing = await listUserAchievementsDocs(userId);
    const alreadyHas = existing.some((row) => row.data?.achievementId === id);
    if (alreadyHas) return { granted: false, doc: null };

    const doc = await insertUserAchievement({
      user: userId,
      achievementId: id,
      earnedAt: earnedAt instanceof Date ? earnedAt.toISOString() : earnedAt,
      meta,
    });

    try {
      const { awardRadianceForActivity } = require('./activityRadianceService');
      await awardRadianceForActivity({
        userId,
        activityType: 'achievement_any',
        meta: { achievementId: id },
        dedupeKey: `achievement_any:${userId}:${id}`,
      });
    } catch (e) {
      // ignore
    }

    // Автоматическая выдача ачивок №99 (95+ ачивок) и №100 (все 99 ачивок)
    if (id < 99) {
      const allUserAchievements = await listUserAchievementsDocs(userId);
      const count = allUserAchievements.filter((row) => row.data?.achievementId < 99).length;

      if (count >= 95) {
        await grantAchievement({ userId, achievementId: 99, meta: { triggerId: id, count } });
      }

      if (count === 99) {
        await grantAchievement({ userId, achievementId: 100, meta: { triggerId: id, count } });
      }
    }

    return { granted: true, doc };
  } catch (err) {
    throw err;
  }
}

async function listUserAchievements({ userId }) {
  if (!userId) throw new Error('userId is required');
  const docs = await listUserAchievementsDocs(userId);
  return docs
    .map((row) => ({ achievementId: row.data?.achievementId, earnedAt: row.data?.earnedAt }))
    .sort((a, b) => (a.achievementId || 0) - (b.achievementId || 0));
}

module.exports = {
  grantAchievement,
  listUserAchievements,
};
