const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

function mapDocRow(row) {
  if (!row) return null;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return {
    ...data,
    _id: String(row.id),
    createdAt: row.created_at ? new Date(row.created_at) : (data.createdAt || null),
    updatedAt: row.updated_at ? new Date(row.updated_at) : (data.updatedAt || null),
  };
}

async function getTreeDoc() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', 'Tree')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

async function snapshotTree() {
  const tree = await getTreeDoc();
  if (!tree) {
    return {
      stage: 1,
      healthPercent: 100,
      radianceTotal: 0,
      injuriesActive: 0,
      lastHealedAt: null,
      lastGrowthAt: null,
    };
  }
  return {
    stage: tree.stage || 1,
    healthPercent: tree.healthPercent ?? 100,
    radianceTotal: tree.radianceTotal || 0,
    injuriesActive: Array.isArray(tree.injuries) ? tree.injuries.filter((i) => (i.severityPercent || 0) > 0).length : 0,
    lastHealedAt: tree.lastHealedAt || null,
    lastGrowthAt: tree.lastGrowthAt || null,
  };
}

async function snapshotBattles({ from, to }) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', 'Battle')
    .order('created_at', { ascending: false })
    .limit(100);

  const { data, error } = await query;
  if (error || !Array.isArray(data)) return [];

  let battles = data.map(mapDocRow).filter((b) => b.status === 'finished');

  if (from) {
    battles = battles.filter((b) => {
      const ends = b.endsAt ? new Date(b.endsAt) : null;
      return ends && ends >= from;
    });
  }
  if (to) {
    battles = battles.filter((b) => {
      const ends = b.endsAt ? new Date(b.endsAt) : null;
      return ends && ends <= to;
    });
  }

  battles.sort((a, b) => {
    const aEnd = a.endsAt ? new Date(a.endsAt).getTime() : 0;
    const bEnd = b.endsAt ? new Date(b.endsAt).getTime() : 0;
    return bEnd - aEnd;
  });

  return battles.slice(0, 5).map((b) => ({
    battleId: b._id,
    status: b.status,
    lightDamage: b.lightDamage || 0,
    darknessDamage: b.darknessDamage || 0,
    attendanceCount: b.attendanceCount || 0,
    endedAt: b.endsAt || b.updatedAt || b.createdAt,
  }));
}

function buildSummary(treeSnapshot, battlesSnapshot) {
  const totalLight = battlesSnapshot.reduce((acc, b) => acc + (b.lightDamage || 0), 0);
  const totalDark = battlesSnapshot.reduce((acc, b) => acc + (b.darknessDamage || 0), 0);
  const attendance = battlesSnapshot.reduce((acc, b) => acc + (b.attendanceCount || 0), 0);
  const battlePart =
    battlesSnapshot.length > 0
      ? `Бои: ${battlesSnapshot.length}, урон Света ${totalLight}, урон Мрака ${totalDark}, явка ${attendance}.`
      : 'Сегодня боёв не было.';
  const injuriesText =
    treeSnapshot.injuriesActive > 0
      ? `Активных травм: ${treeSnapshot.injuriesActive}.`
      : 'Травм не обнаружено.';
  return `Стадия Древа: ${treeSnapshot.stage}, здоровье ${treeSnapshot.healthPercent}%. Сияние: ${treeSnapshot.radianceTotal}. ${injuriesText} ${battlePart}`;
}

async function findChronicleByDate(date) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', 'Chronicle')
    .limit(500);
  if (error || !Array.isArray(data)) return null;

  const rows = data.map(mapDocRow).filter((row) => {
    const rowDate = row.date ? new Date(row.date) : null;
    if (!rowDate) return false;
    const targetDate = new Date(date);
    return rowDate.getTime() === targetDate.getTime();
  });

  return rows[0] || null;
}

async function insertChronicleDoc(doc) {
  const supabase = getSupabaseClient();
  const id = `chronicle_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const payload = { ...doc };
  delete payload._id;

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .insert({
      model: 'Chronicle',
      id,
      data: payload,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id,data,created_at,updated_at')
    .maybeSingle();

  if (error || !data) return null;
  return mapDocRow(data);
}

async function createDailyChronicle(date = new Date()) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const existing = await findChronicleByDate(startOfDay);
  if (existing) return existing;

  const treeSnapshot = await snapshotTree();
  const battlesSnapshot = await snapshotBattles({ from: startOfDay, to: endOfDay });
  const summary = buildSummary(treeSnapshot, battlesSnapshot);

  return insertChronicleDoc({
    date: startOfDay.toISOString(),
    ...treeSnapshot,
    battles: battlesSnapshot,
    summary,
  });
}

async function getChronicle(date = new Date()) {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return findChronicleByDate(day);
}

async function listChronicle(limit = 7) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', 'Chronicle')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !Array.isArray(data)) return [];
  return data.map(mapDocRow);
}

module.exports = {
  createDailyChronicle,
  getChronicle,
  listChronicle,
};
