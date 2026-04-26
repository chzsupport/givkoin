const { getSupabaseClient } = require('../lib/supabaseClient');

function toInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function normalizeCurrency(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'STAR' || raw === 'STARS') return 'STAR';
  return 'K';
}

function normalizeDirection(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'debit') return 'debit';
  return 'credit';
}

function mapTransactionRow(row) {
  return {
    _id: String(row?.id || ''),
    type: String(row?.type || ''),
    direction: String(row?.direction || 'credit'),
    currency: normalizeCurrency(row?.currency),
    amount: Number(row?.amount) || 0,
    description: row?.description ? String(row.description) : '',
    relatedEntity: row?.related_entity ? String(row.related_entity) : '',
    occurredAt: row?.occurred_at || row?.created_at || null,
  };
}

async function listUserTransactions({ userId, currency, direction, limit, offset }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('transactions')
    .select('id,type,direction,amount,currency,description,related_entity,occurred_at,created_at')
    .eq('user_id', String(userId))
    .eq('currency', normalizeCurrency(currency))
    .eq('direction', normalizeDirection(direction))
    .order('occurred_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (error || !Array.isArray(data)) return [];
  return data.map(mapTransactionRow);
}

async function getUserTransactionsTotal({ userId, currency, direction }) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('transactions')
    .select('amount')
    .eq('user_id', String(userId))
    .eq('currency', normalizeCurrency(currency))
    .eq('direction', normalizeDirection(direction))
    .limit(10000);

  if (error || !Array.isArray(data)) return 0;
  return data.reduce((sum, row) => sum + (Number(row?.amount) || 0), 0);
}

exports.getHistory = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Требуется авторизация' });

    const limit = Math.min(200, Math.max(1, toInt(req.query?.limit, 50)));
    const offset = toInt(req.query?.offset, 0);
    const currency = normalizeCurrency(req.query?.currency);
    const direction = normalizeDirection(req.query?.direction);
    const items = await listUserTransactions({ userId, currency, direction, limit, offset });

    return res.json({
      items,
      limit,
      offset,
      currency,
      direction,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

exports.getTotalEarned = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) return res.status(401).json({ message: 'Требуется авторизация' });

    const currency = normalizeCurrency(req.query?.currency);
    const direction = normalizeDirection(req.query?.direction);
    const total = await getUserTransactionsTotal({ userId, currency, direction });

    return res.json({ total, currency, direction });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

