const { insertDoc, listDocsByModel } = require('./documentStore');

function normalizeDoc(doc) {
  if (!doc) return null;
  return {
    ...doc,
    createdAt: doc.createdAt ? new Date(doc.createdAt) : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : null,
  };
}

async function getTreeDoc() {
  const rows = await listDocsByModel('Tree', {
    limit: 1,
    orderBy: 'created_at',
    ascending: false,
  });
  return normalizeDoc(rows[0] || null);
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
  let battles = await listDocsByModel('Battle', {
    limit: 100,
    orderBy: 'created_at',
    ascending: false,
  });
  battles = battles.map(normalizeDoc).filter((b) => b.status === 'finished');

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
  const targetDate = new Date(date);
  if (Number.isNaN(targetDate.getTime())) return null;
  const rows = await listDocsByModel('Chronicle', {
    dataEq: {
      date: targetDate.toISOString(),
    },
    limit: 1,
  });
  return normalizeDoc(rows[0] || null);
}

async function insertChronicleDoc(doc) {
  const id = `chronicle_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  const payload = { ...doc };
  delete payload._id;

  try {
    return normalizeDoc(await insertDoc({ model: 'Chronicle', id, data: payload }));
  } catch (_error) {
    return null;
  }
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
  const rows = await listDocsByModel('Chronicle', {
    limit,
    orderBy: 'created_at',
    ascending: false,
  });
  return rows.map(normalizeDoc).filter(Boolean);
}

module.exports = {
  createDailyChronicle,
  getChronicle,
  listChronicle,
};
