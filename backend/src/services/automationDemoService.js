const { getSupabaseClient } = require('../lib/supabaseClient');
const { recomputeRiskCases } = require('./automationRiskService');
const {
  normalizeDemoTag,
  seedLegitTimerUserScenario,
  seedSuspiciousAutomationClusterScenario,
} = require('../../testUtils/automationScenarioFactory');

const DOC_TABLE = process.env.SUPABASE_TABLE || 'app_documents';

function mapDocRow(row) {
  if (!row) return null;
  const data = row.data && typeof row.data === 'object' ? row.data : {};
  return {
    ...data,
    _id: String(row.id),
    createdAt: row.created_at ? new Date(row.created_at) : data.createdAt || null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : data.updatedAt || null,
  };
}

async function listModelDocs(model, { pageSize = 1000 } = {}) {
  const supabase = getSupabaseClient();
  const out = [];
  let from = 0;
  const size = Math.max(1, Math.min(2000, Number(pageSize) || 1000));
  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .select('id,data,created_at,updated_at')
      .eq('model', String(model))
      .range(from, from + size - 1);
    if (error || !Array.isArray(data) || data.length === 0) break;
    out.push(...data.map(mapDocRow).filter(Boolean));
    if (data.length < size) break;
    from += size;
  }
  return out;
}

async function getModelDocById(model, id) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', String(model))
    .eq('id', String(id))
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

async function findOneModelDoc(model, predicate) {
  const rows = await listModelDocs(model);
  const pick = typeof predicate === 'function' ? rows.find(predicate) : rows[0];
  return pick || null;
}

async function insertModelDoc(model, id, data) {
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const { data: row, error } = await supabase
    .from(DOC_TABLE)
    .insert({
      model: String(model),
      id: String(id),
      data: data && typeof data === 'object' ? data : {},
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select('id,data,created_at,updated_at')
    .maybeSingle();
  if (error || !row) return null;
  return mapDocRow(row);
}

async function updateModelDoc(model, id, patch) {
  const supabase = getSupabaseClient();
  const existing = await getModelDocById(model, id);
  if (!existing) return null;
  const nowIso = new Date().toISOString();
  const next = { ...(existing || {}), ...(patch && typeof patch === 'object' ? patch : {}) };
  delete next._id;
  const { data: row, error } = await supabase
    .from(DOC_TABLE)
    .update({ data: next, updated_at: nowIso })
    .eq('model', String(model))
    .eq('id', String(id))
    .select('id,data,created_at,updated_at')
    .maybeSingle();
  if (error || !row) return null;
  return mapDocRow(row);
}

async function deleteModelDocs(model, ids) {
  const list = Array.from(new Set((Array.isArray(ids) ? ids : []).map(normalizeId).filter(Boolean)));
  if (!list.length) return;
  const supabase = getSupabaseClient();
  await supabase
    .from(DOC_TABLE)
    .delete()
    .eq('model', String(model))
    .in('id', list);
}

function normalizeId(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value).trim();
  }
  if (typeof value === 'object') {
    if (value._id !== undefined) return normalizeId(value._id);
    if (value.id !== undefined) return normalizeId(value.id);
    if (typeof value.toString === 'function') {
      const asString = String(value.toString()).trim();
      if (asString && asString !== '[object Object]') return asString;
    }
  }
  return '';
}

function toDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function buildDefaultTag() {
  return normalizeDemoTag(`run-${new Date().toISOString().replace(/[:.]/g, '-')}`);
}

function summarizeRiskCase(row) {
  if (!row) return null;
  return {
    id: normalizeId(row._id),
    user: normalizeId(row.user),
    riskScore: Number(row.riskScore || 0),
    riskLevel: row.riskLevel || 'low',
    status: row.status || 'open',
    signals: Array.isArray(row.signals) ? row.signals : [],
    updatedAt: row.updatedAt || null,
  };
}

async function collectRiskCasesByUserIds(userIds) {
  const safeIds = (Array.isArray(userIds) ? userIds : []).map(normalizeId).filter(Boolean);
  if (!safeIds.length) return [];
  const rows = await listModelDocs('RiskCase');
  return rows
    .filter((row) => safeIds.includes(normalizeId(row?.user)))
    .sort((a, b) => {
      const left = Number(b?.riskScore || 0) - Number(a?.riskScore || 0);
      if (left !== 0) return left;
      return new Date(b?.updatedAt || 0).getTime() - new Date(a?.updatedAt || 0).getTime();
    });
}

function matchesDemoUser(user, tag) {
  const safeTag = normalizeDemoTag(tag);
  if (!safeTag) return false;
  const email = String(user?.email || '').toLowerCase();
  const nickname = String(user?.nickname || '').toLowerCase();
  return (
    email.includes(`.auto-demo.${safeTag}@`) ||
    nickname.includes(`auto_demo_${safeTag.replace(/-/g, '_')}`)
  );
}

async function collectMatchingDemoUserIds(tag) {
  const ids = [];
  const supabase = getSupabaseClient();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from('users')
      .select('id,email,nickname')
      .range(from, from + pageSize - 1);
    if (error || !Array.isArray(data) || !data.length) break;

    data.forEach((row) => {
      const user = {
        _id: row?.id,
        email: row?.email,
        nickname: row?.nickname,
      };
      if (matchesDemoUser(user, tag)) {
        const userId = normalizeId(user._id);
        if (userId) ids.push(userId);
      }
    });

    if (data.length < pageSize) break;
    from += pageSize;
  }
  return ids;
}

function summarizeRun(run) {
  if (!run) return null;
  return {
    id: normalizeId(run._id),
    tag: run.tag,
    status: run.status,
    seededAt: run.seededAt,
    cleanedAt: run.cleanedAt,
    baseNow: run.baseNow,
    users: Array.isArray(run.users)
      ? run.users.map((row) => ({
        role: row.role || 'user',
        user: row.user && typeof row.user === 'object' ? normalizeId(row.user._id || row.user.id || row.user) : normalizeId(row.user),
        email: row.user && typeof row.user === 'object' ? String(row.user.email || row.email || '') : String(row.email || ''),
        nickname: row.user && typeof row.user === 'object' ? String(row.user.nickname || row.nickname || '') : String(row.nickname || ''),
      }))
      : [],
    battleIds: Array.isArray(run.battleIds) ? run.battleIds.map(normalizeId) : [],
    riskCaseIds: Array.isArray(run.riskCaseIds) ? run.riskCaseIds.map(normalizeId) : [],
    penaltyIds: Array.isArray(run.penaltyIds) ? run.penaltyIds.map(normalizeId) : [],
    summary: run.summary || {},
    cleanupSummary: run.cleanupSummary || {},
    createdBy: run.createdBy && typeof run.createdBy === 'object'
      ? {
        id: normalizeId(run.createdBy._id),
        email: run.createdBy.email || '',
        nickname: run.createdBy.nickname || '',
      }
      : normalizeId(run.createdBy),
    cleanedBy: run.cleanedBy && typeof run.cleanedBy === 'object'
      ? {
        id: normalizeId(run.cleanedBy._id),
        email: run.cleanedBy.email || '',
        nickname: run.cleanedBy.nickname || '',
      }
      : normalizeId(run.cleanedBy),
  };
}

async function findLiveUserIdsForRun(run) {
  const fromRun = (Array.isArray(run?.users) ? run.users : [])
    .map((row) => normalizeId(row?.user))
    .filter(Boolean);

  if (fromRun.length) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .in('id', fromRun);
    if (!error) {
      const liveIds = (Array.isArray(data) ? data : []).map((row) => normalizeId(row?.id)).filter(Boolean);
      if (liveIds.length) return liveIds;
    }
  }

  return collectMatchingDemoUserIds(run?.tag);
}

async function listAutomationDemoRuns({ limit = 20 } = {}) {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const cleanedRows = (await listModelDocs('AutomationDemoRun')).filter((row) => String(row?.status) === 'cleaned');
  await deleteModelDocs('AutomationDemoRun', cleanedRows.map((r) => normalizeId(r?._id)));

  const rows = (await listModelDocs('AutomationDemoRun'))
    .filter((row) => String(row?.status) === 'active')
    .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())
    .slice(0, safeLimit);

  const safeRows = Array.isArray(rows) ? rows : [];
  const runsWithState = await Promise.all(safeRows.map(async (row) => ({
    row,
    liveUserIds: await findLiveUserIdsForRun(row),
  })));

  const staleRunIds = runsWithState
    .filter(({ liveUserIds }) => !liveUserIds.length)
    .map(({ row }) => normalizeId(row?._id))
    .filter(Boolean);

  if (staleRunIds.length) {
    await deleteModelDocs('AutomationDemoRun', staleRunIds);
  }

  return runsWithState
    .filter(({ liveUserIds }) => liveUserIds.length)
    .map(({ row, liveUserIds }) => {
      const summary = summarizeRun(row);
      const liveSet = new Set(liveUserIds);
      summary.users = (Array.isArray(summary?.users) ? summary.users : []).filter((user) => {
        const userId = normalizeId(user?.user);
        return !userId || liveSet.has(userId);
      });
      return summary;
    });
}

async function seedAutomationDemo({ actorId = null, tag = '', baseNow = null } = {}) {
  const safeTag = normalizeDemoTag(tag || buildDefaultTag());
  if (!safeTag) {
    const err = new Error('Некорректный tag demo-сценария');
    err.status = 400;
    throw err;
  }

  const existing = await findOneModelDoc(
    'AutomationDemoRun',
    (row) => String(row?.tag) === String(safeTag) && String(row?.status) === 'active'
  );
  if (existing) {
    const err = new Error('Demo-сценарий с таким tag уже активен');
    err.status = 400;
    throw err;
  }

  const safeBaseNow = toDate(baseNow) || new Date();
  const legit = await seedLegitTimerUserScenario({ baseNow: safeBaseNow, tag: safeTag });
  const suspicious = await seedSuspiciousAutomationClusterScenario({ baseNow: safeBaseNow, tag: safeTag });
  const recompute = await recomputeRiskCases();

  const userIds = [legit.user, ...suspicious.users].map((user) => normalizeId(user?._id)).filter(Boolean);
  const riskCases = await collectRiskCasesByUserIds(userIds);
  const legitCase = riskCases.find((row) => normalizeId(row?.user) === normalizeId(legit.user?._id)) || null;
  const mainCase =
    riskCases.find((row) => normalizeId(row?.user) === normalizeId(suspicious.mainUser?._id)) || null;

  const runId = crypto.randomBytes(12).toString('hex');
  const run = await insertModelDoc('AutomationDemoRun', runId, {
    tag: safeTag,
    status: 'active',
    createdBy: actorId || null,
    seededAt: new Date(),
    baseNow: safeBaseNow,
    users: [
      {
        role: 'legit',
        user: legit.user?._id || null,
        email: legit.user?.email || '',
        nickname: legit.user?.nickname || '',
      },
      {
        role: 'suspicious_main',
        user: suspicious.mainUser?._id || null,
        email: suspicious.mainUser?.email || '',
        nickname: suspicious.mainUser?.nickname || '',
      },
      {
        role: 'suspicious_worker',
        user: suspicious.workerA?._id || null,
        email: suspicious.workerA?.email || '',
        nickname: suspicious.workerA?.nickname || '',
      },
      {
        role: 'suspicious_worker',
        user: suspicious.workerB?._id || null,
        email: suspicious.workerB?.email || '',
        nickname: suspicious.workerB?.nickname || '',
      },
    ],
    battleIds: Array.from(new Set([...legit.battleIds, ...suspicious.battleIds].map((id) => normalizeId(id)).filter(Boolean))),
    riskCaseIds: riskCases.map((row) => normalizeId(row?._id)).filter(Boolean),
    penaltyIds: recompute.penalties.map((row) => normalizeId(row?._id)).filter(Boolean),
    summary: {
      tag: safeTag,
      recompute,
      legitCase: summarizeRiskCase(legitCase),
      suspiciousCase: summarizeRiskCase(mainCase),
    },
  });

  return {
    run: summarizeRun(run),
    recompute,
    users: {
      legit: {
        id: normalizeId(legit.user?._id),
        email: legit.user?.email || '',
        nickname: legit.user?.nickname || '',
      },
      suspicious: suspicious.users.map((user) => ({
        id: normalizeId(user?._id),
        email: user?.email || '',
        nickname: user?.nickname || '',
      })),
    },
    riskCases: riskCases.map(summarizeRiskCase),
    legitCase: summarizeRiskCase(legitCase),
    mainCase: summarizeRiskCase(mainCase),
  };
}

async function findRunForCleanup({ runId = '', tag = '' } = {}) {
  if (runId) return getModelDocById('AutomationDemoRun', runId);
  const safeTag = normalizeDemoTag(tag);
  if (safeTag) {
    const rows = (await listModelDocs('AutomationDemoRun'))
      .filter((row) => String(row?.tag) === String(safeTag))
      .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
    return rows[0] || null;
  }
  const rows = (await listModelDocs('AutomationDemoRun'))
    .filter((row) => String(row?.status) === 'active')
    .sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
  return rows[0] || null;
}

async function findUserIdsForRun(run) {
  const fromRun = (Array.isArray(run?.users) ? run.users : [])
    .map((row) => normalizeId(row?.user))
    .filter(Boolean);
  if (fromRun.length) return fromRun;

  return collectMatchingDemoUserIds(run?.tag);
}

async function cleanupAutomationDemo({ actorId = null, runId = '', tag = '' } = {}) {
  const run = await findRunForCleanup({ runId, tag });
  if (!run) {
    const err = new Error('Demo-сценарий не найден');
    err.status = 404;
    throw err;
  }

  if (run.status === 'cleaned') {
    const snapshot = summarizeRun(run);
    await deleteModelDocs('AutomationDemoRun', [run._id]);
    return {
      run: snapshot,
      alreadyCleaned: true,
      removed: true,
      summary: run.cleanupSummary || {},
    };
  }

  const userIds = await findUserIdsForRun(run);
  if (!userIds.length) {
    const patch = {
      status: 'cleaned',
      cleanedAt: new Date(),
      cleanedBy: actorId || null,
      cleanupSummary: {
        deletedUsers: 0,
        deletedBattles: 0,
        deletedRiskCases: 0,
        deletedPenalties: 0,
        note: 'Пользователи demo-сценария уже отсутствовали в базе',
      },
    };
    const updated = await updateModelDoc('AutomationDemoRun', run._id, patch);
    const snapshot = summarizeRun(updated || { ...run, ...patch });
    await deleteModelDocs('AutomationDemoRun', [run._id]);
    return {
      run: snapshot,
      alreadyCleaned: false,
      removed: true,
      summary: patch.cleanupSummary,
    };
  }

  const battleIds = [];
  const [riskCases, penalties, battles] = await Promise.all([
    listModelDocs('RiskCase').then((rows) => rows.filter((row) => userIds.includes(normalizeId(row?.user)))),
    listModelDocs('AutomationPenalty').then((rows) => rows.filter((row) => userIds.includes(normalizeId(row?.user)))),
    listModelDocs('Battle').then((rows) => rows.filter((row) => {
      const attendance = Array.isArray(row?.attendance) ? row.attendance : [];
      return attendance.some((item) => userIds.includes(normalizeId(item?.user)));
    })),
  ]);

  const deletionResults = await Promise.all([
    (async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('activity_logs')
        .delete()
        .in('user_id', userIds);
      if (error) throw error;
      return { deletedCount: 0 };
    })(),
    (async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('user_sessions')
        .delete()
        .in('user_id', userIds);
      if (error) throw error;
      return { deletedCount: 0 };
    })(),
    (async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('transactions')
        .delete()
        .in('user_id', userIds);
      if (error) throw error;
      return { deletedCount: 0 };
    })(),
    (async () => {
      const rows = await listModelDocs('BehaviorEvent');
      const ids = rows.filter((row) => userIds.includes(normalizeId(row?.user))).map((row) => normalizeId(row?._id)).filter(Boolean);
      await deleteModelDocs('BehaviorEvent', ids);
      return { deletedCount: ids.length };
    })(),
    (async () => {
      const rows = await listModelDocs('UserAchievement');
      const ids = rows.filter((row) => userIds.includes(normalizeId(row?.user))).map((row) => normalizeId(row?._id)).filter(Boolean);
      await deleteModelDocs('UserAchievement', ids);
      return { deletedCount: ids.length };
    })(),
    (async () => {
      const rows = await listModelDocs('AutomationPenalty');
      const ids = rows.filter((row) => userIds.includes(normalizeId(row?.user))).map((row) => normalizeId(row?._id)).filter(Boolean);
      await deleteModelDocs('AutomationPenalty', ids);
      return { deletedCount: ids.length };
    })(),
    (async () => {
      const rows = await listModelDocs('RiskCase');
      const ids = rows.filter((row) => userIds.includes(normalizeId(row?.user))).map((row) => normalizeId(row?._id)).filter(Boolean);
      await deleteModelDocs('RiskCase', ids);
      return { deletedCount: ids.length };
    })(),
    (async () => {
      const supabase = getSupabaseClient();
      const { error } = await supabase
        .from('users')
        .delete()
        .in('id', userIds);
      if (error) throw error;
      return { deletedCount: 0 };
    })(),
  ]);

  const uniqBattleIds = Array.from(new Set(battleIds.map(normalizeId).filter(Boolean)));
  if (uniqBattleIds.length) {
    await deleteModelDocs('Battle', uniqBattleIds);
  }
  const deletedBattles = uniqBattleIds.length;

  const recompute = await recomputeRiskCases();
  const summary = {
    deletedActivityLogs: Number(deletionResults[0]?.deletedCount) || 0,
    deletedSessions: Number(deletionResults[1]?.deletedCount) || 0,
    deletedTransactions: Number(deletionResults[2]?.deletedCount) || 0,
    deletedBehaviorEvents: Number(deletionResults[3]?.deletedCount) || 0,
    deletedAchievements: Number(deletionResults[4]?.deletedCount) || 0,
    deletedPenalties: Number(deletionResults[5]?.deletedCount) || 0,
    deletedRiskCases: Number(deletionResults[6]?.deletedCount) || 0,
    deletedUsers: Number(deletionResults[7]?.deletedCount) || 0,
    deletedBattles,
    penaltyIds: (Array.isArray(penalties) ? penalties : []).map((row) => normalizeId(row?._id)).filter(Boolean),
    riskCaseIds: (Array.isArray(riskCases) ? riskCases : []).map((row) => normalizeId(row?._id)).filter(Boolean),
    recompute,
  };

  const patch = {
    status: 'cleaned',
    cleanedAt: new Date(),
    cleanedBy: actorId || null,
    penaltyIds: summary.penaltyIds,
    riskCaseIds: summary.riskCaseIds,
    cleanupSummary: summary,
  };
  const updated = await updateModelDoc('AutomationDemoRun', run._id, patch);
  const snapshot = summarizeRun(updated || { ...run, ...patch });
  await deleteModelDocs('AutomationDemoRun', [run._id]);

  return {
    run: snapshot,
    alreadyCleaned: false,
    removed: true,
    summary,
  };
}

module.exports = {
  listAutomationDemoRuns,
  seedAutomationDemo,
  cleanupAutomationDemo,
};
