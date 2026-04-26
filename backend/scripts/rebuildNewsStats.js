const { getSupabaseClient } = require('../src/lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
const PAGE_SIZE = 1000;

async function listAllDocs(modelName) {
  const supabase = getSupabaseClient();
  const out = [];
  let from = 0;
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', String(modelName))
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!Array.isArray(data) || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return out;
}

function normalizeStats(stats) {
  const base = stats && typeof stats === 'object' ? stats : {};
  return {
    likes: Math.max(0, Number(base.likes) || 0),
    comments: Math.max(0, Number(base.comments) || 0),
    reposts: Math.max(0, Number(base.reposts) || 0),
  };
}

async function run() {
  const supabase = getSupabaseClient();
  const posts = await listAllDocs('NewsPost');
  const interactions = await listAllDocs('NewsInteraction');

  const counts = new Map();
  for (const row of interactions) {
    const data = row?.data || {};
    const type = String(data.type || '');
    if (!['like', 'comment', 'repost'].includes(type)) continue;
    const postId = String(data.post || '');
    if (!postId) continue;
    const key = `${postId}:${type}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  let updated = 0;
  for (const row of posts) {
    const data = row?.data && typeof row.data === 'object' ? row.data : {};
    const postId = String(row.id || data._id || '');
    if (!postId) continue;
    const nextStats = normalizeStats({
      likes: counts.get(`${postId}:like`) || 0,
      comments: counts.get(`${postId}:comment`) || 0,
      reposts: counts.get(`${postId}:repost`) || 0,
    });
    const currentStats = normalizeStats(data.stats);
    const changed = nextStats.likes !== currentStats.likes
      || nextStats.comments !== currentStats.comments
      || nextStats.reposts !== currentStats.reposts;
    if (!changed) continue;

    const nextData = { ...data, stats: nextStats };
    // eslint-disable-next-line no-await-in-loop
    const { error } = await supabase
      .from(DOC_TABLE)
      .update({ data: nextData, updated_at: new Date().toISOString() })
      .eq('model', 'NewsPost')
      .eq('id', postId);
    if (error) throw new Error(error.message);
    updated += 1;
  }

  // eslint-disable-next-line no-console
  console.log(`News stats rebuild completed. Updated posts: ${updated}/${posts.length}`);
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('News stats rebuild failed:', err);
  process.exitCode = 1;
});
