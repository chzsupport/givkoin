const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

function trimString(value, maxLen = 300) {
  return String(value || '').trim().slice(0, maxLen);
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const safe = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value == null) continue;
    if (typeof value === 'number' && Number.isFinite(value)) {
      safe[key] = value;
      continue;
    }
    if (typeof value === 'boolean') {
      safe[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      safe[key] = value.slice(0, 10).map((item) => trimString(item, 120));
      continue;
    }
    if (value instanceof Date) {
      safe[key] = value.toISOString();
      continue;
    }
    if (typeof value === 'object') {
      safe[key] = JSON.parse(JSON.stringify(value));
      continue;
    }
    safe[key] = trimString(value, 500);
  }
  return safe;
}

async function insertBehaviorEvent(doc) {
  const supabase = getSupabaseClient();
  const id = `be_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const nowIso = new Date().toISOString();
  await supabase.from(DOC_TABLE).insert({
    model: 'BehaviorEvent',
    id,
    data: doc,
    created_at: nowIso,
    updated_at: nowIso,
  });
  return { ...doc, _id: id };
}

async function recordBehaviorEvent({
  userId,
  category,
  eventType,
  sessionId = '',
  path = '',
  battleId = null,
  scoreHint = 0,
  meta = {},
  occurredAt = new Date(),
}) {
  if (!userId || !category || !eventType) return null;
  const rawBattleId = battleId && typeof battleId === 'object' && battleId.toString
    ? battleId.toString()
    : String(battleId || '').trim();
  const safeBattleId = /^[a-f0-9]{24}$/i.test(rawBattleId) ? rawBattleId : null;
  try {
    return await insertBehaviorEvent({
      user: userId,
      category: trimString(category, 60),
      eventType: trimString(eventType, 120),
      sessionId: trimString(sessionId, 120),
      path: trimString(path, 512),
      battleId: safeBattleId,
      scoreHint: Number.isFinite(Number(scoreHint)) ? Math.max(0, Number(scoreHint)) : 0,
      meta: sanitizeMeta(meta),
      occurredAt: occurredAt instanceof Date ? occurredAt.toISOString() : new Date(occurredAt).toISOString(),
    });
  } catch (_error) {
    return null;
  }
}

module.exports = {
  recordBehaviorEvent,
};
