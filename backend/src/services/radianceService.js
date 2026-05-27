const { insertDoc, listDocsByModel, updateDoc } = require('./documentStore');

const TREE_MODEL = 'Tree';
const LUMEN_TO_RADIANCE = 4; // 1 Lm = 4 Сияния

function ensurePositive(amount) {
  if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number');
  }
}

function normalizeTreeDoc(doc) {
  if (!doc) return null;
  return {
    ...doc,
    createdAt: doc.createdAt ? new Date(doc.createdAt) : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : null,
  };
}

async function getTree() {
  const trees = await listDocsByModel(TREE_MODEL, { limit: 1 });
  const existing = Array.isArray(trees) && trees.length > 0 ? trees[0] : null;

  if (existing) {
    return normalizeTreeDoc(existing);
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

  await insertDoc({ model: TREE_MODEL, id, data: newTree });

  return { ...newTree, _id: id };
}

async function saveTree(tree) {
  const id = tree._id;
  const payload = { ...tree };
  delete payload._id;
  delete payload.id;
  delete payload.createdAt;
  delete payload.updatedAt;

  await updateDoc(id, payload);
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

