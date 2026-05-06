const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

const RETENTION_DAYS_DEFAULT = 90;

function toDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function insertFortuneWinLog(doc) {
  const supabase = getSupabaseClient();
  const id = `fwl_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const nowIso = new Date().toISOString();
  await supabase.from(DOC_TABLE).insert({
    model: 'FortuneWinLog',
    id,
    data: doc,
    created_at: nowIso,
    updated_at: nowIso,
  });
  return { ...doc, _id: id };
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
  
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data')
    .eq('model', 'FortuneWinLog')
    .limit(5000);
  
  if (error || !Array.isArray(data)) {
    return { threshold, deletedCount: 0 };
  }
  
  const toDelete = data.filter((row) => {
    const occurred = row.data?.occurredAt;
    return occurred && occurred < thresholdIso;
  });
  
  let deletedCount = 0;
  for (const row of toDelete) {
    const { error: delError } = await supabase.from(DOC_TABLE).delete().eq('id', row.id);
    if (!delError) deletedCount++;
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

