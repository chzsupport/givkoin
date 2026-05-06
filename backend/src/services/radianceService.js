const { getSupabaseClient } = require('../lib/supabaseClient');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
const TREE_MODEL = 'Tree';
const LUMEN_TO_RADIANCE = 4; // 1 Lm = 4 Сияния

function ensurePositive(amount) {
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }
}

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

async function getTree() {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', TREE_MODEL)
    .limit(1)
    .maybeSingle();

  if (!error && data) {
    return mapDocRow(data);
  }

  // Дерево не найдено — создаём новое
  const id = `tree_${Date.now()}`;
  const newTree = {
    stage: 1,
    healthPercent: 100,
    radianceTotal: 0,
    injuries: [],
    lastGrowthAt: null,
    lastHealedAt: null,
    lastFruitAt: null,
    nextFruitAt: null,
  };

  await supabase.from(DOC_TABLE).insert({
    model: TREE_MODEL,
    id,
    data: newTree,
  });

  return { ...newTree, _id: id };
}

async function saveTree(tree) {
  const supabase = getSupabaseClient();
  const id = tree._id;
  const payload = { ...tree };
  delete payload._id;
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;

  await supabase
    .from(DOC_TABLE)
    .update({ data: payload, updated_at: new Date().toISOString() })
    .eq('model', TREE_MODEL)
    .eq('id', String(id));
}

function resetInjuryRuntimeCaches() {
  try {
    require('./kService').__resetInjuryDebuffCache?.();
  } catch (e) {
    // ignore
  }
  try {
    require('./kService').__resetInjuryDebuffCache?.();
  } catch (e) {
    // ignore
  }
  try {
    require('./branchAllocationService').__resetInjuredBranchesCache?.();
  } catch (e) {
    // ignore
  }
}

function normalizeInjury(injury) {
  const required = injury.requiredRadiance && injury.requiredRadiance > 0 ? injury.requiredRadiance : injury.severityPercent * 1000;
  if (!injury.requiredRadiance || injury.requiredRadiance <= 0) {
    injury.requiredRadiance = required;
  }
  if (injury.healedRadiance === undefined) {
    injury.healedRadiance = 0;
  }
  if (injury.healedPercent === undefined) {
    injury.healedPercent = 0;
  }
  return required;
}

function applyRadianceToInjuries(tree, amount) {
  let remaining = amount;
  if (!Array.isArray(tree.injuries) || tree.injuries.length === 0) return remaining;

  for (const injury of tree.injuries) {
    if (remaining <= 0) break;
    const required = normalizeInjury(injury);
    const need = Math.max(0, required - (injury.healedRadiance || 0));
    if (need <= 0) continue;
    const portion = Math.min(need, remaining);
    injury.healedRadiance = (injury.healedRadiance || 0) + portion;
    injury.healedPercent = Math.min(100, (injury.healedRadiance / required) * 100);
    if (injury.healedRadiance >= required) {
      injury.healedRadiance = required;
      injury.healedPercent = 100;
      injury.debuffPercent = 0;
    }
    remaining -= portion;
  }

  tree.injuries = tree.injuries.filter((injury) => {
    const required = normalizeInjury(injury);
    return (injury.healedRadiance || 0) < required;
  });

  if (tree.injuries.length === 0) {
    tree.lastHealedAt = new Date().toISOString();
  }

  return remaining;
}

async function addRadiance(amount, { source = 'k', meta } = {}) {
  ensurePositive(amount);
  const tree = await getTree();
  const injuriesBefore = Array.isArray(tree.injuries) ? tree.injuries.length : 0;
  const leftover = applyRadianceToInjuries(tree, amount);
  const injuriesAfter = Array.isArray(tree.injuries) ? tree.injuries.length : 0;
  const toPool = Math.max(0, leftover);
  tree.radianceTotal = (tree.radianceTotal || 0) + toPool;
  await saveTree(tree);
  if (injuriesAfter !== injuriesBefore) {
    resetInjuryRuntimeCaches();
  }
  return { tree, consumed: amount - leftover, addedToPool: toPool, source, meta };
}

async function addRadianceFromK({ amount, source = 'k', meta }) {
  return addRadiance(amount, { source, meta });
}

async function addRadianceFromLumens({ lumens, source = 'lumens', meta }) {
  ensurePositive(lumens);
  const amount = lumens * LUMEN_TO_RADIANCE;
  return addRadiance(amount, { source, meta: { ...(meta || {}), lumens } });
}

async function getRadianceState() {
  const tree = await getTree();
  return {
    radianceTotal: tree.radianceTotal || 0,
    injuries: tree.injuries || [],
    lastGrowthAt: tree.lastGrowthAt,
    lastHealedAt: tree.lastHealedAt,
    stage: tree.stage,
    healthPercent: tree.healthPercent,
  };
}

module.exports = {
  addRadiance,
  addRadianceFromK,
  addRadianceFromLumens,
  getRadianceState,
};

