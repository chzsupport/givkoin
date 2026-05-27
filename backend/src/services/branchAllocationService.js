const { getSupabaseClient } = require('../lib/supabaseClient');
const { insertDoc, listDocsByModel, updateDocByModel } = require('./documentStore');

const CLUSTERS = ['young', 'adult', 'experienced', 'wise'];
const INITIAL_BRANCHES_PER_CLUSTER = 10;
const BRANCH_BATCH_SIZE = 10;

let injuredBranchesCache = { at: 0, set: null };
const INJURED_BRANCHES_CACHE_TTL_MS = 30 * 1000;

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

function buildTreeBranchDataEq(filter = {}) {
  const dataEq = {};
  for (const [key, value] of Object.entries(filter || {})) {
    if (!key || value === undefined || value === null) continue;
    dataEq[key] = String(value);
  }
  return dataEq;
}

async function listTreeBranches(filter = {}) {
  const rows = await listDocsByModel('TreeBranch', {
    limit: 1000,
    dataEq: buildTreeBranchDataEq(filter),
  });
  return rows.map(normalizeDoc).filter(Boolean);
}

async function insertTreeBranches(docs) {
  await Promise.all(docs.map((doc) => insertDoc({
    model: 'TreeBranch',
    id: doc.branchId || `branch_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    data: doc,
  })));
}

async function updateTreeBranch(branchId, update) {
  const rows = await listDocsByModel('TreeBranch', {
    limit: 1,
    dataEq: { branchId: String(branchId) },
  });
  const row = rows[0] || null;
  if (!row) return null;

  const newData = { ...row, ...update };
  delete newData._id;
  delete newData.createdAt;
  delete newData.updatedAt;

  try {
    const saved = await updateDocByModel('TreeBranch', row._id, newData);
    return normalizeDoc(saved) || { ...newData, _id: row._id };
  } catch (_error) {
    return { ...newData, _id: row._id };
  }
}

function padOrdinal(n, width = 6) {
  const raw = String(Math.max(0, Number(n) || 0));
  return raw.padStart(width, '0');
}

function computeTreeClusterByBirthDate(birthDate) {
  if (!birthDate) return null;
  const d = new Date(birthDate);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age -= 1;
  if (!Number.isFinite(age) || age < 0) return null;

  if (age >= 18 && age <= 25) return 'young';
  if (age >= 26 && age <= 35) return 'adult';
  if (age >= 36 && age <= 51) return 'experienced';
  if (age >= 52) return 'wise';
  return null;
}

function computeBranchCapacityByClusterSize(clusterUsersCount) {
  const n = Math.max(0, Number(clusterUsersCount) || 0);
  if (n >= 10000) return 1000;
  if (n >= 1000) return 100;
  return 10;
}

function makeBranchId(cluster, ordinal) {
  return `${cluster}-${padOrdinal(ordinal)}`;
}

async function ensureInitialBranchesForCluster(cluster) {
  if (!cluster) return;
  const rows = await listTreeBranches({ cluster });
  if (rows.length > 0) return;

  const docs = [];
  for (let i = 1; i <= INITIAL_BRANCHES_PER_CLUSTER; i += 1) {
    docs.push({ cluster, ordinal: i, branchId: makeBranchId(cluster, i), usersCount: 0 });
  }
  await insertTreeBranches(docs).catch(() => { });
}

async function getActiveInjuredBranchesSet() {
  const now = Date.now();
  if (injuredBranchesCache.set && now - injuredBranchesCache.at < INJURED_BRANCHES_CACHE_TTL_MS) {
    return injuredBranchesCache.set;
  }

  const set = new Set();
  try {
    const tree = await getTreeDoc();
    const injuries = Array.isArray(tree?.injuries) ? tree.injuries : [];
    for (const inj of injuries) {
      if (!inj?.branchName) continue;
      const healed = Number(inj?.healedPercent) || 0;
      if (healed >= 100) continue;
      const p = Number(inj?.debuffPercent) || 0;
      if (!(p > 0)) continue;
      set.add(String(inj.branchName));
    }
  } catch (e) {
    // ignore
  }

  injuredBranchesCache = { at: now, set };
  return set;
}

async function ensureInitialBranchesForAllClusters() {
  for (const c of CLUSTERS) {
    // eslint-disable-next-line no-await-in-loop
    await ensureInitialBranchesForCluster(c);
  }
}

async function addNextBranchBatch(cluster) {
  const rows = await listTreeBranches({ cluster });
  const maxOrdinal = rows.reduce((max, r) => Math.max(max, Number(r.ordinal) || 0), 0);
  const start = maxOrdinal + 1;

  const docs = [];
  for (let i = start; i < start + BRANCH_BATCH_SIZE; i += 1) {
    docs.push({ cluster, ordinal: i, branchId: makeBranchId(cluster, i), usersCount: 0 });
  }

  await insertTreeBranches(docs).catch(() => { });
}

async function findAndUpdateBranch(cluster, capacity, injuredSet, excludeInjured) {
  const rows = await listTreeBranches({ cluster });
  let candidates = rows.filter((r) => (Number(r.usersCount) || 0) < capacity);

  if (excludeInjured && injuredSet && injuredSet.size > 0) {
    candidates = candidates.filter((r) => !injuredSet.has(r.branchId));
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const uA = Number(a.usersCount) || 0;
    const uB = Number(b.usersCount) || 0;
    if (uA !== uB) return uA - uB;
    return (Number(a.ordinal) || 0) - (Number(b.ordinal) || 0);
  });

  const chosen = candidates[0];
  return updateTreeBranch(chosen.branchId, { usersCount: (Number(chosen.usersCount) || 0) + 1 });
}

async function assignBranchForNewUser({ birthDate }) {
  const cluster = computeTreeClusterByBirthDate(birthDate);
  if (!cluster) {
    return { treeCluster: null, treeBranch: null };
  }

  await ensureInitialBranchesForCluster(cluster);

  const supabase = getSupabaseClient();
  const { count, error } = await supabase
    .from('users')
    .select('id', { head: true, count: 'exact' })
    .eq('role', 'user')
    .not('email', 'ilike', '%@admin.%')
    .not('email', 'ilike', '%@admin')
    .eq('data->>treeCluster', String(cluster));
  const clusterUsersCount = !error ? Math.max(0, Number(count) || 0) : 0;
  const capacity = computeBranchCapacityByClusterSize(clusterUsersCount);

  const injuredSet = await getActiveInjuredBranchesSet();

  let updated = await findAndUpdateBranch(cluster, capacity, injuredSet, true);
  if (!updated) {
    updated = await findAndUpdateBranch(cluster, capacity, injuredSet, false);
  }

  if (!updated) {
    await addNextBranchBatch(cluster);
    updated = await findAndUpdateBranch(cluster, capacity, injuredSet, true);
    if (!updated) {
      updated = await findAndUpdateBranch(cluster, capacity, injuredSet, false);
    }
  }

  if (!updated?.branchId) {
    return { treeCluster: cluster, treeBranch: makeBranchId(cluster, 1) };
  }

  return { treeCluster: cluster, treeBranch: String(updated.branchId) };
}

function __resetInjuredBranchesCache() {
  injuredBranchesCache = { at: 0, set: null };
}

module.exports = {
  CLUSTERS,
  computeTreeClusterByBirthDate,
  computeBranchCapacityByClusterSize,
  ensureInitialBranchesForAllClusters,
  assignBranchForNewUser,
  __resetInjuredBranchesCache,
};
