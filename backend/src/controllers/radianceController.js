const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function mapEarningRow(row) {
  const data = row?.data && typeof row.data === 'object' ? row.data : {};
  return {
    _id: String(row.id),
    amount: Number(data.amount) || 0,
    activityType: String(data.activityType || ''),
    meta: data.meta && typeof data.meta === 'object' ? data.meta : {},
    occurredAt: data.occurredAt || row.created_at || null,
  };
}

async function listRadianceEarnings(userId, limit, offset) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at', { count: 'exact' })
    .eq('model', 'RadianceEarning')
    .eq('data->>user', String(userId))
    .order('data->>occurredAt', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error || !Array.isArray(data)) return [];
  return data.map(mapEarningRow);
}

async function getTotalRadianceEarned(userId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('data')
    .eq('model', 'RadianceEarning')
    .eq('data->>user', String(userId))
    .limit(10000);

  if (error || !Array.isArray(data)) return 0;
  return data.reduce((sum, row) => sum + (Number(row?.data?.amount) || 0), 0);
}

exports.getHistory = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Требуется авторизация' });

    const limit = Math.min(200, Math.max(1, toInt(req.query?.limit, 50)));
    const offset = toInt(req.query?.offset, 0);
    const items = await listRadianceEarnings(userId, limit, offset);
    return res.json({ items, limit, offset });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getTotalEarned = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Требуется авторизация' });

    const total = await getTotalRadianceEarned(userId);
    return res.json({ total });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
