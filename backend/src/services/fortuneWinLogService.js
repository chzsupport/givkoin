const { deleteDoc, insertDoc, listDocsByModel } = require('./documentStore');

const RETENTION_DAYS_DEFAULT = 90;

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function insertFortuneWinLog(doc) {
  const id = `fwl_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const inserted = await insertDoc({ model: 'FortuneWinLog', id, data: doc });
  return { ...doc, _id: inserted?._id || id };
}

async function recordFortuneWin({
  userId = null,
  gameType,
  rewardType,
  amount = 0,
  label = '',
  drawDate = null,
  occurredAt = null,
  meta = {},
}) {
  if (!['roulette', 'lottery'].includes(String(gameType || ''))) return null;

  const safeRewardType = ['k', 'star', 'spin', 'other'].includes(String(rewardType || ''))
    ? String(rewardType)
    : 'other';

  return insertFortuneWinLog({
    user: userId || null,
    gameType,
    rewardType: safeRewardType,
    amount: Number.isFinite(Number(amount)) ? Number(amount) : 0,
    label: String(label || '').trim(),
    drawDate: toDate(drawDate)?.toISOString() || null,
    occurredAt: toDate(occurredAt)?.toISOString() || new Date().toISOString(),
    meta: meta && typeof meta === 'object' ? meta : {},
  });
}

async function cleanupOldFortuneWins(retentionDays = RETENTION_DAYS_DEFAULT) {
  const days = Number.isFinite(Number(retentionDays)) ? Number(retentionDays) : RETENTION_DAYS_DEFAULT;
  const threshold = new Date(Date.now() - Math.max(1, days) * 24 * 60 * 60 * 1000);
  const thresholdIso = threshold.toISOString();
  
  const data = await listDocsByModel('FortuneWinLog', {
    dataLt: { occurredAt: thresholdIso },
    limit: 5000,
  });
  
  const toDelete = data.filter((row) => {
    const occurred = row?.occurredAt;
    return occurred && occurred < thresholdIso;
  });
  
  let deletedCount = 0;
  for (const row of toDelete) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await deleteDoc(row._id);
      deletedCount++;
    } catch (_error) {
      // keep cleanup best-effort, as before
    }
  }
  
  return {
    threshold,
    deletedCount,
  };
}

module.exports = {
  RETENTION_DAYS_DEFAULT,
  recordFortuneWin,
  cleanupOldFortuneWins,
};

