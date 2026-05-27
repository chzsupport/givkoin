const { insertDoc, listDocsByModel } = require('./documentStore');

function isDuplicateInsertError(error) {
  if (!error) return false;
  if (String(error.code || '').trim() === '23505') return true;
  return /duplicate key/i.test(String(error.message || ''));
}

function normalizeAchievementDocPart(value) {
  return String(value == null ? '' : value)
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 120);
}

function buildUserAchievementDocId({ userId, achievementId }) {
  return `ua_${normalizeAchievementDocPart(userId)}_${Math.max(0, Math.floor(Number(achievementId) || 0))}`;
}

async function listUserAchievementsDocs(userId) {
    const safeUserId = String(userId || '').trim();
    if (!safeUserId) return [];
    const rows = await listDocsByModel('UserAchievement', {
        limit: 5000,
        dataEq: { user: safeUserId },
    });
    return rows.filter((row) => String(row?.user) === safeUserId);
}

async function insertUserAchievement(doc) {
    const id = buildUserAchievementDocId({
      userId: doc?.user,
      achievementId: doc?.achievementId,
    });
    try {
      await insertDoc({ model: 'UserAchievement', id, data: doc });
    } catch (error) {
      if (isDuplicateInsertError(error)) {
        return { ...doc, _id: id, alreadyExists: true };
      }
      throw error;
    }
    return { ...doc, _id: id };
}

async function grantAchievement({ userId, achievementId, meta = null, earnedAt = new Date() }) {
  if (!userId) throw new Error('userId is required');
  const id = Number(achievementId);
  if (!Number.isFinite(id) || id <= 0) throw new Error('achievementId is invalid');

  try {
    const existing = await listUserAchievementsDocs(userId);
    const alreadyHas = existing.some((row) => Number(row?.achievementId) === id);
    if (alreadyHas) return { granted: false, doc: null };

    const doc = await insertUserAchievement({
      user: userId,
      achievementId: id,
      earnedAt: earnedAt instanceof Date ? earnedAt.toISOString() : earnedAt,
      meta,
    });
    if (doc?.alreadyExists) return { granted: false, doc: null };

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
      const count = allUserAchievements.filter((row) => Number(row?.achievementId) < 99).length;

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
    .map((row) => ({ achievementId: row.achievementId, earnedAt: row.earnedAt }))
    .sort((a, b) => (a.achievementId || 0) - (b.achievementId || 0));
}

module.exports = {
  grantAchievement,
  listUserAchievements,
};
