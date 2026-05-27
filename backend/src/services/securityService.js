const crypto = require('crypto');
const { recomputeRiskCases: recomputeAutomationRiskCases } = require('./automationRiskService');
const {
  getDocByModelAndId,
  insertDoc,
  listAllDocsByModel,
  listDocsByModel,
  updateDocByModel,
} = require('./documentStore');

const ACCESS_RESTRICTION_CACHE_TTL_MS = Math.max(
  1000,
  Number(process.env.ACCESS_RESTRICTION_CACHE_TTL_MS) || 30 * 1000
);

let accessRestrictionCache = {
  loadedAt: 0,
  expiresAt: 0,
  whitelist: new Map(),
  blocked: new Map(),
};

function normalizeModelDoc(doc) {
  if (!doc) return null;
  return {
    ...doc,
    createdAt: doc.createdAt ? new Date(doc.createdAt) : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : null,
  };
}

async function listModelDocs(model, { pageSize = 1000 } = {}) {
  const docs = await listAllDocsByModel(model, { pageSize });
  return docs.map(normalizeModelDoc).filter(Boolean);
}

async function listFilteredModelDocs(model, { dataEq = {}, limit = 1000 } = {}) {
  const docs = await listDocsByModel(model, {
    dataEq,
    limit: Math.max(1, Math.min(5000, Number(limit) || 1000)),
  });
  return docs.map(normalizeModelDoc).filter(Boolean);
}

async function getModelDocById(model, id) {
  if (!id) return null;
  return normalizeModelDoc(await getDocByModelAndId(model, id));
}

async function insertModelDoc(model, payload) {
  const id = payload && (payload._id || payload.id)
    ? String(payload._id || payload.id)
    : `${String(model)}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;

  const doc = payload && typeof payload === 'object' ? { ...payload } : {};
  delete doc._id;
  delete doc.id;

  try {
    return normalizeModelDoc(await insertDoc({ id, model: String(model), data: doc }));
  } catch (_error) {
    return null;
  }
}

async function updateModelDoc(model, id, patch) {
  if (!id || !patch || typeof patch !== 'object') return null;
  const existing = await getModelDocById(model, id);
  if (!existing) return null;

  const next = { ...existing, ...patch };
  delete next._id;
  delete next.id;
  delete next.createdAt;
  delete next.updatedAt;

  try {
    return normalizeModelDoc(await updateDocByModel(model, id, next));
  } catch (_error) {
    return null;
  }
}

function normalizeSignalValue(value) {
  return String(value || '').trim().toLowerCase();
}

function riskLevelByScore(score) {
  const value = Number(score) || 0;
  if (value >= 90) return 'critical';
  if (value >= 60) return 'high';
  if (value >= 30) return 'medium';
  return 'low';
}

function addSignal(set, signal) {
  const safe = String(signal || '').trim();
  if (!safe) return;
  set.add(safe);
}

function buildRuleLookupKey(ruleType, value) {
  const safeType = String(ruleType || '').trim();
  const safeValue = normalizeSignalValue(value);
  if (!safeType || !safeValue) return '';
  return `${safeType}:${safeValue}`;
}

function invalidateAccessRestrictionCache() {
  accessRestrictionCache = {
    loadedAt: 0,
    expiresAt: 0,
    whitelist: new Map(),
    blocked: new Map(),
  };
}

async function listIpRules({ ruleType, isWhitelist, isActive } = {}) {
  const dataEq = {};
  if (ruleType) dataEq.ruleType = ruleType;
  if (isWhitelist !== undefined) dataEq.isWhitelist = Boolean(isWhitelist);
  if (isActive !== undefined) dataEq.isActive = Boolean(isActive);

  const rules = (await listFilteredModelDocs('IpBlockRule', { dataEq, limit: 2000 }))
    .sort((a, b) => {
      const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 500);
  return rules;
}

async function findIpRule({ ruleType, value, isWhitelist = false }) {
  const safeType = String(ruleType || '').trim();
  const safeValue = normalizeSignalValue(value);
  if (!safeType || !safeValue) return null;
  const rows = await listFilteredModelDocs('IpBlockRule', {
    dataEq: {
      ruleType: safeType,
      value: safeValue,
      isWhitelist: Boolean(isWhitelist),
    },
    limit: 1,
  });
  return rows[0] || null;
}

async function upsertIpRule({ ruleType, value, reason, isWhitelist = false, actorId = null, expiresAt = null }) {
  const safeType = String(ruleType || '').trim();
  const safeValue = normalizeSignalValue(value);
  if (!['ip', 'device', 'fingerprint'].includes(safeType)) {
    const err = new Error('Invalid ruleType');
    err.status = 400;
    throw err;
  }
  if (!safeValue) {
    const err = new Error('value is required');
    err.status = 400;
    throw err;
  }

  const existing = await findIpRule({ ruleType: safeType, value: safeValue, isWhitelist });

  if (!existing) {
    const created = await insertModelDoc('IpBlockRule', {
      ruleType: safeType,
      value: safeValue,
      reason: String(reason || '').trim(),
      isActive: true,
      isWhitelist: Boolean(isWhitelist),
      blockedBy: actorId || null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    });
    invalidateAccessRestrictionCache();
    return created;
  }

  const saved = await updateModelDoc('IpBlockRule', existing._id, {
    reason: String(reason || existing.reason || '').trim(),
    isActive: true,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    ...(actorId ? { blockedBy: actorId } : {}),
  });
  invalidateAccessRestrictionCache();
  return saved;
}

async function disableIpRule({ ruleType, value, isWhitelist = false }) {
  const safeType = String(ruleType || '').trim();
  const safeValue = normalizeSignalValue(value);
  const existing = await findIpRule({ ruleType: safeType, value: safeValue, isWhitelist });
  if (!existing) return null;
  const saved = await updateModelDoc('IpBlockRule', existing._id, { isActive: false });
  invalidateAccessRestrictionCache();
  return saved;
}

function isRuleAlive(rule, now = new Date()) {
  if (!rule) return false;
  if (!rule.isActive) return false;
  if (rule.expiresAt && new Date(rule.expiresAt).getTime() <= now.getTime()) return false;
  return true;
}

function buildAccessRestrictionIndex(rules, now = new Date()) {
  const whitelist = new Map();
  const blocked = new Map();

  for (const rule of Array.isArray(rules) ? rules : []) {
    if (!isRuleAlive(rule, now)) continue;
    const key = buildRuleLookupKey(rule.ruleType, rule.value);
    if (!key) continue;

    if (rule.isWhitelist) {
      if (!whitelist.has(key)) whitelist.set(key, rule);
      continue;
    }

    if (!blocked.has(key)) blocked.set(key, rule);
  }

  const loadedAt = now.getTime();
  return {
    loadedAt,
    expiresAt: loadedAt + ACCESS_RESTRICTION_CACHE_TTL_MS,
    whitelist,
    blocked,
  };
}

async function getAccessRestrictionIndex(now = new Date()) {
  if (accessRestrictionCache.loadedAt && accessRestrictionCache.expiresAt > now.getTime()) {
    return accessRestrictionCache;
  }

  const rules = await listIpRules({ isActive: true });
  accessRestrictionCache = buildAccessRestrictionIndex(rules, now);
  return accessRestrictionCache;
}

async function evaluateAccessRestriction({ ip, deviceId, fingerprint }) {
  const now = new Date();
  const values = {
    ip: normalizeSignalValue(ip),
    device: normalizeSignalValue(deviceId),
    fingerprint: normalizeSignalValue(fingerprint),
  };

  const checks = [];
  if (values.ip) checks.push({ ruleType: 'ip', value: values.ip });
  if (values.device) checks.push({ ruleType: 'device', value: values.device });
  if (values.fingerprint) checks.push({ ruleType: 'fingerprint', value: values.fingerprint });

  if (!checks.length) {
    return { blocked: false, reason: '', matchedRule: null };
  }

  const index = await getAccessRestrictionIndex(now);

  for (const check of checks) {
    const whitelist = index.whitelist.get(buildRuleLookupKey(check.ruleType, check.value));
    if (whitelist) {
      return { blocked: false, reason: '', matchedRule: whitelist };
    }
  }

  for (const check of checks) {
    const blocked = index.blocked.get(buildRuleLookupKey(check.ruleType, check.value));
    if (blocked) {
      return {
        blocked: true,
        reason: blocked.reason || `Blocked by ${blocked.ruleType}`,
        matchedRule: blocked,
      };
    }
  }

  return { blocked: false, reason: '', matchedRule: null };
}

function buildSignalMaps(users) {
  const maps = {
    ip: new Map(),
    device: new Map(),
    fingerprint: new Map(),
    emailNormalized: new Map(),
    nicknameNormalized: new Map(),
  };

  for (const user of users) {
    const id = String(user._id);
    const signals = {
      ip: normalizeSignalValue(user.lastIp),
      device: normalizeSignalValue(user.lastDeviceId),
      fingerprint: normalizeSignalValue(user.lastFingerprint),
      emailNormalized: normalizeSignalValue(user.emailNormalized),
      nicknameNormalized: normalizeSignalValue(user.nicknameNormalized),
    };

    for (const [key, value] of Object.entries(signals)) {
      if (!value) continue;
      if (!maps[key].has(value)) maps[key].set(value, []);
      maps[key].get(value).push(id);
    }
  }

  return maps;
}

function collectDuplicates(map, value, selfId) {
  if (!value) return [];
  const list = map.get(value) || [];
  return list.filter((id) => String(id) !== String(selfId));
}

async function recomputeRiskCases() {
  const { repairPendingMultiAccountRiskCases } = require('./multiAccountService');
  const [automation, multiAccount] = await Promise.all([
    recomputeAutomationRiskCases(),
    repairPendingMultiAccountRiskCases(),
  ]);

  return {
    automation,
    multiAccount,
  };
}

module.exports = {
  riskLevelByScore,
  listIpRules,
  upsertIpRule,
  disableIpRule,
  evaluateAccessRestriction,
  invalidateAccessRestrictionCache,
  recomputeRiskCases,
};
