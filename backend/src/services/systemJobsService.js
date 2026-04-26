const crypto = require('crypto');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { createFullBackup, restoreFullBackup } = require('./backupService');
const { clearCacheByZone } = require('./cacheService');
const { cleanupBattleEmergency } = require('./adminCleanupService');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
const JOB_MODEL = 'SystemJobRun';

const SYSTEM_JOB_DEFINITIONS = {
  backup_full: {
    jobName: 'backup_full',
    title: 'Полный бэкап данных',
    dangerous: true,
    handler: async ({ addLog }) => {
      addLog('info', 'Preparing full backup snapshot');
      const result = await createFullBackup();
      addLog('info', 'Backup archive created', {
        backupId: result.backupId,
        gzipPath: result.gzipPath,
      });
      return result;
    },
  },
  backup_restore: {
    jobName: 'backup_restore',
    title: 'Восстановление из бэкапа',
    dangerous: true,
    handler: async ({ params, addLog }) => {
      const backupId = String(params?.backupId || '').trim();
      const backupPath = String(params?.backupPath || '').trim();
      if (!backupId && !backupPath) {
        const err = new Error('backupId or backupPath is required');
        err.status = 400;
        throw err;
      }
      addLog('info', 'Starting restore', { backupId: backupId || null, backupPath: backupPath || null });
      const result = await restoreFullBackup({
        backupId: backupId || null,
        backupPath: backupPath || null,
      });
      addLog('info', 'Restore completed', { backupId: result.backupId, collections: result.collections });
      return result;
    },
  },
  cache_clear: {
    jobName: 'cache_clear',
    title: 'Очистка кэша',
    dangerous: false,
    handler: async ({ params, addLog }) => {
      const zone = String(params?.zone || 'system').trim().toLowerCase();
      addLog('info', 'Clearing cache', { zone });
      const result = clearCacheByZone(zone);
      addLog('info', 'Cache cleared', result);
      return result;
    },
  },
  battle_cleanup_emergency: {
    jobName: 'battle_cleanup_emergency',
    title: 'Аварийная очистка зависших боёв',
    dangerous: true,
    handler: async ({ params, addLog }) => {
      const reason = String(params?.reason || 'Аварийная очистка зависших боёв').trim();
      addLog('info', 'Starting emergency battle cleanup', { reason });
      const result = await cleanupBattleEmergency(reason);
      addLog('info', 'Emergency battle cleanup completed', result);
      return result;
    },
  },
};

function buildRunId() {
  return `run_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function getSystemJobDefinition(jobName) {
  const key = String(jobName || '').trim();
  return SYSTEM_JOB_DEFINITIONS[key] || null;
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

function serializeRun(run) {
  if (!run) return null;
  const doc = run;
  return {
    runId: doc.runId,
    jobName: doc.jobName,
    status: doc.status,
    requestedBy: doc.requestedBy || null,
    relatedApproval: doc.relatedApproval || null,
    params: doc.params || {},
    result: doc.result || null,
    error: doc.error || null,
    startedAt: doc.startedAt || null,
    finishedAt: doc.finishedAt || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
    logs: Array.isArray(doc.logs) ? doc.logs : [],
  };
}

async function insertJobRun(doc) {
  const supabase = getSupabaseClient();
  const id = doc.runId || buildRunId();
  const payload = { ...doc };
  delete payload._id;
  delete payload.id;

  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .insert({
      model: JOB_MODEL,
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

async function updateJobRun(runId, patch) {
  const supabase = getSupabaseClient();
  const { data: existing, error: readErr } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', JOB_MODEL)
    .eq('id', String(runId))
    .maybeSingle();

  if (readErr || !existing) return null;

  const current = existing.data && typeof existing.data === 'object' ? existing.data : {};
  const next = { ...current, ...patch };
  delete next._id;
  delete next.id;
  delete next.createdAt;
  delete next.updatedAt;

  const { data, error } = await supabase
    .from(DOC_TABLE)
    .update({ data: next, updated_at: new Date().toISOString() })
    .eq('model', JOB_MODEL)
    .eq('id', String(runId))
    .select('id,data,created_at,updated_at')
    .maybeSingle();

  if (error || !data) return null;
  return mapDocRow(data);
}

async function runSystemJob({ jobName, requestedBy, params = {}, relatedApproval = null }) {
  const definition = getSystemJobDefinition(jobName);
  if (!definition) {
    const err = new Error(`Unknown system job: ${jobName}`);
    err.status = 404;
    throw err;
  }
  if (!requestedBy) {
    const err = new Error('requestedBy is required');
    err.status = 400;
    throw err;
  }

  const runId = buildRunId();
  const run = await insertJobRun({
    runId,
    jobName: definition.jobName,
    status: 'running',
    requestedBy,
    relatedApproval,
    params,
    startedAt: new Date().toISOString(),
    logs: [],
  });

  if (!run) {
    throw new Error('Failed to create system job run');
  }

  const localLogs = [];
  const addLog = (level, message, meta = null) => {
    localLogs.push({
      at: new Date().toISOString(),
      level: level === 'warn' || level === 'error' ? level : 'info',
      message: String(message || ''),
      meta,
    });
  };

  try {
    const result = await definition.handler({ params, addLog, runId, requestedBy });
    const updated = await updateJobRun(runId, {
      status: 'completed',
      result,
      finishedAt: new Date().toISOString(),
      logs: localLogs,
    });
    return serializeRun(updated || { ...run, status: 'completed', result, finishedAt: new Date().toISOString(), logs: localLogs });
  } catch (error) {
    await updateJobRun(runId, {
      status: 'failed',
      error: error?.message || 'System job failed',
      finishedAt: new Date().toISOString(),
      logs: localLogs.length ? localLogs : [],
    });
    throw error;
  }
}

async function getSystemJobRunByRunId(runId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', JOB_MODEL)
    .eq('id', String(runId))
    .maybeSingle();

  if (error || !data) return null;
  return serializeRun(mapDocRow(data));
}

async function listSystemJobRuns({ limit = 20, status, jobName } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 20));
  const supabase = getSupabaseClient();

  let query = supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', JOB_MODEL)
    .order('created_at', { ascending: false })
    .limit(safeLimit);

  // Загружаем все и фильтруем в JS (фильтрация по jsonb-полям)
  const { data, error } = await query;
  if (error || !Array.isArray(data)) return [];

  let runs = data.map(mapDocRow).filter(Boolean);

  if (status) {
    runs = runs.filter((r) => r.status === status);
  }
  if (jobName) {
    runs = runs.filter((r) => r.jobName === jobName);
  }

  return runs.slice(0, safeLimit).map(serializeRun);
}

async function listSystemJobsWithRecentRuns({ recentLimit = 10 } = {}) {
  const jobs = Object.values(SYSTEM_JOB_DEFINITIONS).map((def) => ({
    jobName: def.jobName,
    title: def.title,
    dangerous: Boolean(def.dangerous),
  }));

  const recentRuns = await listSystemJobRuns({ limit: recentLimit });
  return { jobs, recentRuns };
}

module.exports = {
  SYSTEM_JOB_DEFINITIONS,
  getSystemJobDefinition,
  runSystemJob,
  getSystemJobRunByRunId,
  listSystemJobRuns,
  listSystemJobsWithRecentRuns,
};
