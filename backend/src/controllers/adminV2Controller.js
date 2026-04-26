const { getBattleSchedulerState } = require('../services/cronJobs');
const {
  createOperationApproval,
  approveOperation,
  rejectOperation,
  listApprovals,
  serializeApproval,
} = require('../services/operationApprovalService');
const { getSupabaseClient } = require('../lib/supabaseClient');
const {
  getSettingsDefinitions,
  getSettingsValues,
  updateRegistrySettings,
} = require('../services/settingsRegistryService');
const {
  listSystemJobsWithRecentRuns,
  runSystemJob,
  getSystemJobRunByRunId,
  getSystemJobDefinition,
} = require('../services/systemJobsService');
const { logAdminAction } = require('../services/adminActionService');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';

function toId(value, depth = 0) {
  if (depth > 3) return '';
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'object') {
    if (value._id != null) return toId(value._id, depth + 1);
    if (value.id != null) return toId(value.id, depth + 1);
    if (value.value != null) return toId(value.value, depth + 1);
    if (typeof value.toString === 'function') {
      const s = value.toString();
      if (s && s !== '[object Object]') return s;
    }
  }
  return '';
}

async function getUsersByIds(ids) {
  const list = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => toId(id)).filter(Boolean)));
  if (!list.length) return new Map();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,nickname,email,role')
    .in('id', list);
  if (error) return new Map();
  return new Map((Array.isArray(data) ? data : []).map((row) => [String(row.id), row]));
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

async function listModelDocs(model) {
  const supabase = getSupabaseClient();
  const out = [];
  let from = 0;
  const size = 1000;
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
    from += data.length;
  }
  return out;
}

async function getModelDocById(model, id) {
  if (!id) return null;
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

function hydrateActor(row, usersById) {
  if (!row) return row;
  const actorId = row.actor ? String(row.actor) : '';
  const user = actorId ? usersById.get(actorId) : null;
  if (!user) return row;
  return {
    ...row,
    actor: {
      _id: user.id,
      nickname: user.nickname,
      email: user.email,
      role: user.role,
    },
  };
}

function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function operationMutationResponse({
  operationId = null,
  status = 'executed',
  requiresApproval = false,
  auditId = null,
  data = null,
  message = null,
}) {
  return {
    operationId,
    status,
    requiresApproval,
    auditId,
    ...(message ? { message } : {}),
    ...(data !== null && data !== undefined ? { data } : {}),
  };
}

exports.listApprovals = async (req, res) => {
  try {
    const { status, domain, actionType, page = 1, limit = 20 } = req.query;
    const result = await listApprovals({
      status,
      domain,
      actionType,
      page: toNumber(page, 1),
      limit: toNumber(limit, 20),
    });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

exports.createApproval = async (req, res) => {
  try {
    const {
      actionType,
      reason,
      impactPreview,
      confirmationPhrase,
      payload,
    } = req.body || {};

    const result = await createOperationApproval({
      req,
      actionType,
      reason,
      impactPreview,
      confirmationPhrase,
      payload,
    });

    res.status(201).json(operationMutationResponse({
      operationId: result.operationId,
      status: result.approval.status,
      requiresApproval: true,
      auditId: result.auditId,
      data: { approval: serializeApproval(result.approval) },
    }));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

exports.approveApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body || {};
    const result = await approveOperation({ req, id, note });
    res.json(operationMutationResponse({
      operationId: result.operationId,
      status: result.status,
      requiresApproval: result.requiresApproval,
      auditId: result.auditId,
      data: { approval: serializeApproval(result.approval) },
    }));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

exports.rejectApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const result = await rejectOperation({ req, id, reason });
    res.json(operationMutationResponse({
      operationId: result.operationId,
      status: result.status,
      requiresApproval: false,
      auditId: result.auditId,
      data: { approval: serializeApproval(result.approval) },
    }));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

exports.getAudit = async (req, res) => {
  try {
    const { actionType, entityType, actor, requestId, page = 1, limit = 50 } = req.query;
    const safePage = Math.max(1, toNumber(page, 1));
    const safeLimit = Math.max(1, Math.min(200, toNumber(limit, 50)));
    const all = await listModelDocs('AdminActionLog');
    const filtered = all.filter((row) => {
      if (actionType && String(row.actionType) !== String(actionType)) return false;
      if (entityType && String(row.entityType) !== String(entityType)) return false;
      if (actor && String(row.actor) !== String(actor)) return false;
      if (requestId && String(row.requestId) !== String(requestId)) return false;
      return true;
    });
    filtered.sort((a, b) => {
      const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
    const total = filtered.length;
    const pageRows = filtered.slice((safePage - 1) * safeLimit, (safePage - 1) * safeLimit + safeLimit);
    const actorIds = pageRows.map((row) => row?.actor).filter(Boolean);
    const usersById = await getUsersByIds(actorIds);
    const rows = pageRows.map((row) => hydrateActor(row, usersById));

    res.json({
      logs: rows,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getAuditById = async (req, res) => {
  try {
    const log = await getModelDocById('AdminActionLog', req.params.id);
    if (!log) return res.status(404).json({ message: 'Audit log not found' });
    const usersById = await getUsersByIds([log.actor]);
    res.json(hydrateActor(log, usersById));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSettingsDefinitions = async (_req, res) => {
  try {
    const definitions = await getSettingsDefinitions();
    res.json({ definitions });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSettingsValues = async (_req, res) => {
  try {
    const values = await getSettingsValues();
    res.json({ values });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.patchSettingsValues = async (req, res) => {
  try {
    const valuesPatch = req.body && typeof req.body === 'object'
      ? (req.body.values || req.body)
      : {};

    const updated = await updateRegistrySettings(valuesPatch, {
      userId: req.user?._id || null,
      description: 'Updated via /admin/v2/settings/values',
    });

    const audit = await logAdminAction({
      req,
      actionType: 'settings.update',
      entityType: 'SettingsRegistry',
      entityId: null,
      meta: { keys: updated.updated.map((row) => row.key) },
      after: updated.updated,
      severity: 'high',
    });

    res.json(operationMutationResponse({
      operationId: null,
      status: 'executed',
      requiresApproval: false,
      auditId: audit?.actionLogId || audit?.auditId || null,
      data: { updated: updated.updated },
    }));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

exports.listSystemJobs = async (req, res) => {
  try {
    const result = await listSystemJobsWithRecentRuns({
      recentLimit: Math.max(1, Math.min(200, toNumber(req.query.limit, 20))),
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.runSystemJob = async (req, res) => {
  try {
    const { job } = req.params;
    const definition = getSystemJobDefinition(job);
    if (!definition) return res.status(404).json({ message: 'Unknown system job' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const params = body.params && typeof body.params === 'object' ? body.params : {};
    if (definition.dangerous) {
      const actionType = job === 'backup_full' ? 'system.backup.create' : 'system.job.run';
      const approval = await createOperationApproval({
        req,
        actionType,
        reason: body.reason,
        impactPreview: body.impactPreview,
        confirmationPhrase: body.confirmationPhrase,
        payload: {
          jobName: job,
          params,
        },
      });

      return res.status(202).json(operationMutationResponse({
        operationId: approval.operationId,
        status: approval.approval.status,
        requiresApproval: true,
        auditId: approval.auditId,
        data: { approval: serializeApproval(approval.approval) },
      }));
    }

    const run = await runSystemJob({
      jobName: job,
      requestedBy: req.user._id,
      params,
    });

    const audit = await logAdminAction({
      req,
      actionType: 'system.job.run',
      entityType: 'SystemJobRun',
      entityId: run.runId,
      meta: { jobName: job, status: run.status },
      after: run,
      severity: definition.dangerous ? 'high' : 'normal',
    });

    res.json(operationMutationResponse({
      operationId: null,
      status: run.status,
      requiresApproval: false,
      auditId: audit?.actionLogId || audit?.auditId || null,
      data: run,
    }));
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

exports.getSystemJobRun = async (req, res) => {
  try {
    const { runId } = req.params;
    const run = await getSystemJobRunByRunId(runId);
    if (!run) return res.status(404).json({ message: 'System job run not found' });
    res.json(run);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getSystemOverview = async (_req, res) => {
  try {
    const [pending, failed] = await Promise.all([
      listApprovals({ status: 'pending', page: 1, limit: 1 }),
      listApprovals({ status: 'failed', page: 1, limit: 1 }),
    ]);
    const pendingApprovals = pending?.pagination?.total || 0;
    const failedApprovals = failed?.pagination?.total || 0;

    const allLogs = await listModelDocs('AdminActionLog');
    const critical = allLogs
      .filter((row) => String(row?.severity || '') === 'high')
      .sort((a, b) => {
        const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, 10);
    const actorIds = critical.map((row) => row?.actor).filter(Boolean);
    const usersById = await getUsersByIds(actorIds);
    const recentCriticalActions = critical.map((row) => hydrateActor(row, usersById));

    const battleScheduler = getBattleSchedulerState();
    res.json({
      incidents: {
        pendingApprovals,
        failedApprovals,
      },
      queues: {
        approvalsPending: pendingApprovals,
      },
      health: {
        battleScheduler,
      },
      criticalActions: recentCriticalActions,
      generatedAt: new Date(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
