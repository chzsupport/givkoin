const crypto = require('crypto');
const { insertDoc, listAllDocsByModel } = require('./documentStore');

function generateObjectId() {
  return crypto.randomBytes(12).toString('hex');
}

async function listModelDocs(modelName, { pageSize = 1000 } = {}) {
  return listAllDocsByModel(modelName, { pageSize });
}

async function insertModelDoc(modelName, doc) {
  const id = String(doc?._id || generateObjectId());
  const payload = { ...(doc && typeof doc === 'object' ? doc : {}) };
  payload._id = id;
  delete payload.id;

  return insertDoc({ model: String(modelName), id, data: payload });
}

const MODERATION_RULES_CACHE_TTL_MS = Math.max(
  1000,
  Number(process.env.MODERATION_RULES_CACHE_TTL_MS) || 30 * 1000
);

let moderationRulesCache = {
  loadedAt: 0,
  expiresAt: 0,
  rules: [],
};

const ACTION_WEIGHT = {
  flag: 1,
  hide: 2,
  mute: 3,
  block: 4,
};

function sanitizeText(value) {
  return String(value || '').trim();
}

function buildSafeRegex(pattern, flags = 'i') {
  try {
    return new RegExp(pattern, flags);
  } catch (_error) {
    return null;
  }
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compileBadWordMatchers(pattern) {
  return String(pattern || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((word) => ({
      word,
      re: buildSafeRegex(`(^|\\W)${escapeRegExp(word)}(\\W|$)`, 'i'),
    }))
    .filter((item) => item.re);
}

function compileBlockedDomains(pattern) {
  return String(pattern || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function compileModerationRule(rule) {
  const compiled = {
    ...rule,
    _scopeSet: new Set(Array.isArray(rule?.scopes) ? rule.scopes : []),
  };

  if (compiled.type === 'bad_word') {
    compiled._badWordMatchers = compileBadWordMatchers(compiled.pattern);
  } else if (compiled.type === 'blocked_domain') {
    compiled._domains = compileBlockedDomains(compiled.pattern);
  } else if (compiled.type === 'spam_pattern') {
    compiled._regex = buildSafeRegex(String(compiled.pattern || ''), 'i');
  }

  return compiled;
}

function invalidateModerationRulesCache() {
  moderationRulesCache = {
    loadedAt: 0,
    expiresAt: 0,
    rules: [],
  };
}

function findRuleMatch(rule, text, lowerText = '') {
  const content = sanitizeText(text);
  if (!content) return null;

  if (rule.type === 'bad_word') {
    const matchers = Array.isArray(rule._badWordMatchers)
      ? rule._badWordMatchers
      : compileBadWordMatchers(rule.pattern);
    for (const matcher of matchers) {
      if (matcher.re.test(content)) {
        return matcher.word;
      }
    }
    return null;
  }

  if (rule.type === 'blocked_domain') {
    const domains = Array.isArray(rule._domains) ? rule._domains : compileBlockedDomains(rule.pattern);
    const lower = lowerText || content.toLowerCase();
    return domains.find((domain) => lower.includes(domain)) || null;
  }

  if (rule.type === 'spam_pattern') {
    const re = rule._regex || buildSafeRegex(String(rule.pattern || ''), 'i');
    if (!re) return null;
    const m = content.match(re);
    return m?.[0] || null;
  }

  return null;
}

function resolveFinalAction(matches) {
  if (!matches.length) return 'flag';
  let best = 'flag';
  for (const row of matches) {
    const action = row.action || 'flag';
    if ((ACTION_WEIGHT[action] || 1) > (ACTION_WEIGHT[best] || 1)) {
      best = action;
    }
  }
  return best;
}

function allowedByScope(rule, scope) {
  if (!rule) return false;
  const scopeSet = rule._scopeSet instanceof Set
    ? rule._scopeSet
    : new Set(Array.isArray(rule.scopes) ? rule.scopes : []);
  if (!scopeSet.size) return true;
  return scopeSet.has('all') || scopeSet.has(scope);
}

function buildModerationRulesCache(rules, now = new Date()) {
  const loadedAt = now.getTime();
  return {
    loadedAt,
    expiresAt: loadedAt + MODERATION_RULES_CACHE_TTL_MS,
    rules: (Array.isArray(rules) ? rules : []).map(compileModerationRule),
  };
}

async function getCompiledModerationRules(now = new Date()) {
  if (moderationRulesCache.loadedAt && moderationRulesCache.expiresAt > now.getTime()) {
    return moderationRulesCache.rules;
  }

  const all = await listModelDocs('ModerationRule', { pageSize: 2000 });
  const rules = (Array.isArray(all) ? all : [])
    .filter((row) => Boolean(row?.isEnabled))
    .sort((a, b) => {
      const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, 1000)
    .map((row) => ({
      _id: row._id,
      type: row.type,
      pattern: row.pattern,
      action: row.action,
      scopes: row.scopes,
      flagOnly: row.flagOnly,
      isException: row.isException,
      isEnabled: row.isEnabled,
      createdAt: row.createdAt,
    }));

  moderationRulesCache = buildModerationRulesCache(rules, now);
  return moderationRulesCache.rules;
}

async function evaluateModeration({
  text,
  scope,
  userId = null,
  entityType = '',
  entityId = '',
  context = null,
}) {
  const now = new Date();
  const safeText = sanitizeText(text);
  if (!safeText) {
    return {
      matched: false,
      action: 'flag',
      blocked: false,
      hits: [],
    };
  }

  const lowerSafeText = safeText.toLowerCase();
  const rules = await getCompiledModerationRules(now);
  const matches = [];
  const hitPayloads = [];

  for (const rule of rules) {
    if (!allowedByScope(rule, scope)) continue;
    const matchedValue = findRuleMatch(rule, safeText, lowerSafeText);
    if (!matchedValue) continue;
    if (rule.isException) continue;

    const action = rule.flagOnly ? 'flag' : (rule.action || 'flag');
    matches.push({ rule, matchedValue, action });

    hitPayloads.push({
      rule: rule._id,
      ruleType: rule.type,
      scope,
      user: userId || null,
      entityType: String(entityType || ''),
      entityId: String(entityId || ''),
      action,
      status: 'open',
      contentPreview: safeText.slice(0, 300),
      matchedValue: String(matchedValue || '').slice(0, 200),
      context: context || null,
    });
  }

  if (!matches.length) {
    return {
      matched: false,
      action: 'flag',
      blocked: false,
      hits: [],
    };
  }

  const createdHits = await Promise.all(
    hitPayloads.map((payload) => insertModelDoc('ModerationHit', payload))
  );

  const finalAction = resolveFinalAction(matches);
  const blocked = ['hide', 'mute', 'block'].includes(finalAction);

  return {
    matched: true,
    action: finalAction,
    blocked,
    hits: createdHits,
    matchedRules: matches.map((item) => ({
      ruleId: item.rule._id,
      action: item.action,
      matchedValue: item.matchedValue,
      type: item.rule.type,
    })),
  };
}

module.exports = {
  evaluateModeration,
  invalidateModerationRulesCache,
};
