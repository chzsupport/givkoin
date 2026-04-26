const { getSupabaseClient } = require('../lib/supabaseClient');

const USER_SCAN_BATCH = Math.max(1, Number(process.env.USER_SCAN_BATCH || 500) || 500);

async function readUserPage({ from = 0, limit = USER_SCAN_BATCH } = {}) {
  const safeFrom = Math.max(0, Number(from) || 0);
  const safeLimit = Math.max(1, Number(limit) || USER_SCAN_BATCH);

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,data,language')
    .order('id', { ascending: true })
    .range(safeFrom, safeFrom + safeLimit - 1);
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map((row) => ({
    id: row?.id,
    data: row?.data || {},
    language: row?.language || null,
    createdAt: null,
    updatedAt: null,
  }));
}

function normalizeUserRow(row) {
  const data = row?.data && typeof row.data === 'object' ? row.data : {};
  return {
    ...data,
    _id: data._id || row?.id || null,
    language: row?.language || data?.language || null,
  };
}

async function forEachUserBatch({
  pageSize = USER_SCAN_BATCH,
  filter = null,
  map = null,
  handler,
} = {}) {
  if (typeof handler !== 'function') {
    throw new Error('forEachUserBatch requires handler');
  }

  const safePageSize = Math.max(1, Number(pageSize) || USER_SCAN_BATCH);
  let from = 0;
  let totalMatched = 0;

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const rows = await readUserPage({ from, limit: safePageSize });
    if (!rows.length) break;

    const batch = [];
    for (const row of rows) {
      const user = normalizeUserRow(row);
      if (typeof filter === 'function' && !filter(user)) continue;
      totalMatched += 1;
      batch.push(typeof map === 'function' ? map(user) : user);
    }

    if (batch.length) {
      // eslint-disable-next-line no-await-in-loop
      await handler(batch);
    }

    if (rows.length < safePageSize) break;
    from += rows.length;
  }

  return totalMatched;
}

module.exports = {
  USER_SCAN_BATCH,
  forEachUserBatch,
};
