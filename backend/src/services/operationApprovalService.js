const crypto = require('crypto');
const { getOperationMeta } = require('../config/operationRegistry');
const { logAdminAction } = require('./adminActionService');
const { runSystemJob } = require('./systemJobsService');
const battleService = require('./battleService');
const { deleteScheduledBattleTotally } = require('./adminCleanupService');
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

async function insertModelDoc(model, payload) {
  const supabase = getSupabaseClient();
  const id = payload && (payload._id || payload.id)
    ? String(payload._id || payload.id)
    : `${String(model)}_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;

  const doc = payload && typeof payload === 'object' ? { ...payload } : {};
  delete doc._id;
  delete doc.id;

  const { data, error } = await supabase
    .from(DOC_TABLE)
    .insert({ id, model: String(model), data: doc })
    .select('id,data,created_at,updated_at')
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

async function updateModelDoc(model, id, patch) {
  if (!id || !patch || typeof patch !== 'object') return null;
  const supabase = getSupabaseClient();

  const current = await getModelDocById(model, id);
  if (!current) return null;

  const next = { ...current, ...patch };
  delete next._id;
  delete next.id;
  delete next.createdAt;
  delete next.updatedAt;

  const { data, error } = await supabase
    .from(DOC_TABLE)
    .update({ data: next })
    .eq('model', String(model))
    .eq('id', String(id))
    .select('id,data,created_at,updated_at')
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
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

function getUserData(row) {
  return row?.data && typeof row.data === 'object' ? row.data : {};
}

async function getUserRowById(userId) {
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('users')
    .select('id,status,data')
    .eq('id', String(userId))
    .maybeSingle();
  if (error) return null;
  return data || null;
}

async function updateUserById(userId, payload) {
  if (!userId || !payload || typeof payload !== 'object') return false;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from('users')
    .update({ ...payload, updated_at: nowIso })
    .eq('id', String(userId));
  return !error;
}

async function updateUserDataById(userId, patch) {
  if (!userId || !patch || typeof patch !== 'object') return null;
  const row = await getUserRowById(userId);
  if (!row) return null;
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();
  const existing = getUserData(row);
  const next = { ...existing, ...patch };
  const { data, error } = await supabase
    .from('users')
    .update({ data: next, updated_at: nowIso })
    .eq('id', String(userId))
    .select('id,status,data')
    .maybeSingle();
  if (error) return null;
  return data || null;
}

function buildOperationId() {
  return `op_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

function serializeApproval(approval) {
  if (!approval) return null;
  const doc = approval;
  return {
    id: doc._id,
    operationId: doc.operationId,
    domain: doc.domain,
    actionType: doc.actionType,
    status: doc.status,
    reason: doc.reason || '',
    impactPreview: doc.impactPreview || '',
    confirmationPhrase: doc.confirmationPhrase || '',
    payload: doc.payload || {},
    requiresSecondApproval: Boolean(doc.requiresSecondApproval),
    createdBy: doc.createdBy || null,
    approvals: Array.isArray(doc.approvals) ? doc.approvals : [],
    approvedAt: doc.approvedAt || null,
    executedAt: doc.executedAt || null,
    executionResult: doc.executionResult || null,
    executionError: doc.executionError || null,
    auditId: doc.auditId || null,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null,
  };
}

function ensureConfirmationPhraseMatches(actionType, providedPhrase) {
  const operationMeta = getOperationMeta(actionType);
  if (!operationMeta?.confirmationPhrase) return;
  if (String(providedPhrase || '').trim() === operationMeta.confirmationPhrase) return;
  const err = new Error('Invalid confirmationPhrase for operation');
  err.status = 400;
  throw err;
}

async function createOperationApproval({
  req,
  actorId,
  actionType,
  reason,
  impactPreview,
  confirmationPhrase,
  payload = {},
}) {
  if (!actionType) {
    const err = new Error('actionType is required');
    err.status = 400;
    throw err;
  }

  const meta = getOperationMeta(actionType);
  if (!meta) {
    const err = new Error(`Unsupported actionType: ${actionType}`);
    err.status = 400;
    throw err;
  }

  const safeReason = String(reason || '').trim();
  if (!safeReason) {
    const err = new Error('reason is required');
    err.status = 400;
    throw err;
  }

  const safeImpactPreview = String(impactPreview || '').trim();
  if (!safeImpactPreview) {
    const err = new Error('impactPreview is required');
    err.status = 400;
    throw err;
  }

  ensureConfirmationPhraseMatches(actionType, confirmationPhrase);

  const createdBy = actorId || req?.user?._id;
  if (!createdBy) {
    const err = new Error('Actor is required');
    err.status = 401;
    throw err;
  }

  const operationId = buildOperationId();
  const approval = await insertModelDoc('OperationApproval', {
    operationId,
    domain: meta.domain,
    actionType,
    status: 'pending',
    reason: safeReason,
    impactPreview: safeImpactPreview,
    confirmationPhrase: String(confirmationPhrase || '').trim(),
    payload: payload && typeof payload === 'object' ? payload : {},
    requiresSecondApproval: Boolean(meta.requiresSecondApproval),
    createdBy,
    approvals: [],
  });
  if (!approval) {
    const err = new Error('Failed to create approval');
    err.status = 500;
    throw err;
  }

  const audit = await logAdminAction({
    req,
    actorId: createdBy,
    actionType: 'approval.create',
    entityType: 'OperationApproval',
    entityId: approval._id,
    after: serializeApproval(approval),
    meta: {
      operationId: approval.operationId,
      actionType: approval.actionType,
      domain: approval.domain,
    },
    severity: meta.dangerous ? 'high' : 'normal',
  });

  return {
    approval,
    auditId: audit?.actionLogId || audit?.auditId || null,
    requiresApproval: true,
    operationId: approval.operationId,
  };
}

async function executeApprovalOperation({ approval, req }) {
  if (!approval) return { ok: false, error: 'Approval is required' };

  if (approval.actionType === 'users.status.update') {
    const userId = approval.payload?.userId;
    const nextStatus = String(approval.payload?.status || '').trim();
    const allowedStatuses = new Set(['active', 'banned', 'pending']);

    if (!userId) return { ok: false, error: 'payload.userId is required' };
    if (!allowedStatuses.has(nextStatus)) {
      return { ok: false, error: 'payload.status must be one of active|banned|pending' };
    }

    const userRow = await getUserRowById(userId);
    if (!userRow) return { ok: false, error: 'User not found' };

    const before = { status: userRow.status };
    const ok = await updateUserById(userId, { status: nextStatus });
    if (!ok) return { ok: false, error: 'Failed to update user status' };

    return {
      ok: true,
      result: {
        userId: String(userId),
        before,
        after: { status: nextStatus },
      },
    };
  }

  if (approval.actionType === 'users.resources.adjust') {
    const userId = approval.payload?.userId;
    if (!userId) return { ok: false, error: 'payload.userId is required' };

    const rawUpdates = approval.payload?.updates && typeof approval.payload.updates === 'object'
      ? approval.payload.updates
      : {};
    const allowedKeys = ['k', 'lives', 'stars', 'lumens', 'complaintChips'];
    const normalized = {};

    for (const key of allowedKeys) {
      if (rawUpdates[key] === undefined || rawUpdates[key] === null || rawUpdates[key] === '') continue;
      const nextValue = Number(rawUpdates[key]);
      if (!Number.isFinite(nextValue)) {
        return { ok: false, error: `payload.updates.${key} must be a finite number` };
      }
      normalized[key] = nextValue;
    }

    if (!Object.keys(normalized).length) {
      return { ok: false, error: 'payload.updates must include at least one valid numeric field' };
    }

    const userRow = await getUserRowById(userId);
    if (!userRow) return { ok: false, error: 'User not found' };
    const data = getUserData(userRow);

    const before = {};
    const after = {};
    const patch = {};
    for (const [key, value] of Object.entries(normalized)) {
      before[key] = data[key];
      patch[key] = value;
      after[key] = value;
    }

    const saved = await updateUserDataById(userId, patch);
    if (!saved) return { ok: false, error: 'Failed to update user resources' };

    return {
      ok: true,
      result: {
        userId: String(userId),
        before,
        after,
      },
    };
  }

  if (approval.actionType === 'game.battle.start_now') {
    const active = await battleService.getCurrentBattle();
    if (active) return { ok: false, error: 'Сейчас уже идет бой' };

    const durationSecondsRaw = Number(approval.payload?.durationSeconds);
    const durationLocked = Number.isFinite(durationSecondsRaw) && durationSecondsRaw > 0;
    const durationSeconds = durationLocked
      ? durationSecondsRaw
      : battleService.BATTLE_NO_ENTRY_DURATION_SECONDS;
    const now = new Date();

    const upcoming = await battleService.getUpcomingBattle();
    const battle = upcoming
      ? await battleService.startBattle(upcoming._id, {
        startsAt: now,
        durationSeconds,
        durationLocked,
        scheduleSource: 'admin_force',
        scheduledIntervalHours: null,
      })
      : await (async () => {
        const scheduled = await battleService.scheduleBattle({
          startsAt: now,
          durationSeconds,
          durationLocked,
          scheduleSource: 'admin_force',
          scheduledIntervalHours: null,
        });
        return battleService.startBattle(scheduled._id, {
          startsAt: now,
          durationSeconds,
          durationLocked,
          scheduleSource: 'admin_force',
          scheduledIntervalHours: null,
        });
      })();

    return {
      ok: true,
      result: {
        battleId: String(battle._id),
        startsAt: battle.startsAt,
        endsAt: battle.endsAt,
        durationSeconds: battle.durationSeconds,
      },
    };
  }

  if (approval.actionType === 'game.battle.schedule') {
    const cancelScheduled = Boolean(approval.payload?.cancelScheduled);
    const requestedBattleId = String(approval.payload?.battleId || '').trim();

    if (cancelScheduled) {
      if (!requestedBattleId) {
        return { ok: false, error: 'payload.battleId is required for schedule cancellation' };
      }
      return {
        ok: true,
        result: await deleteScheduledBattleTotally(
          requestedBattleId,
          'Удалено через подтвержденную операцию',
          { excludeApprovalId: approval._id }
        ),
      };
    }

    const startsAtRaw = approval.payload?.startsAt;
    if (!startsAtRaw) {
      return { ok: false, error: 'payload.startsAt is required' };
    }

    const startsAt = new Date(startsAtRaw);
    if (Number.isNaN(startsAt.getTime())) {
      return { ok: false, error: 'payload.startsAt must be a valid date' };
    }
    if (startsAt <= new Date()) {
      return { ok: false, error: 'payload.startsAt must be in the future' };
    }

    const active = await battleService.getCurrentBattle();
    if (active) return { ok: false, error: 'Нельзя планировать, пока идет бой' };

    const durationSecondsRaw = Number(approval.payload?.durationSeconds);
    const durationLocked = Number.isFinite(durationSecondsRaw) && durationSecondsRaw > 0;
    const durationSeconds = durationLocked
      ? durationSecondsRaw
      : battleService.BATTLE_NO_ENTRY_DURATION_SECONDS;

    let battle = null;

    if (requestedBattleId) {
      battle = await battleService.getBattleById(requestedBattleId);
      if (!battle || String(battle.status || '') !== 'scheduled') {
        return { ok: false, error: 'Запланированный бой не найден' };
      }
    } else {
      battle = await battleService.getUpcomingBattle();
    }

    if (battle) {
      battle = await battleService.updateScheduledBattle(battle._id, {
        startsAt,
        durationSeconds,
        durationLocked,
        scheduleSource: 'admin_schedule',
        scheduledIntervalHours: null,
      });
    } else {
      battle = await battleService.scheduleBattle({
        startsAt,
        durationSeconds,
        durationLocked,
        scheduleSource: 'admin_schedule',
        scheduledIntervalHours: null,
      });
    }

    return {
      ok: true,
      result: {
        battleId: String(battle._id),
        startsAt: battle.startsAt,
        endsAt: battle.endsAt,
        durationSeconds: battle.durationSeconds,
      },
    };
  }

  if (approval.actionType === 'game.battle.schedule_cancel') {
    const battleId = String(approval.payload?.battleId || '').trim();
    if (!battleId) {
      return { ok: false, error: 'payload.battleId is required' };
    }
    return {
      ok: true,
      result: await deleteScheduledBattleTotally(
        battleId,
        'Удалено через подтвержденную операцию',
        { excludeApprovalId: approval._id }
      ),
    };
  }

  if (approval.actionType === 'game.battle.finish_now') {
    const active = await battleService.getCurrentBattle();
    if (!active) return { ok: false, error: 'Сейчас нет активного боя' };

    const finishedBattle = await battleService.forceFinishBattleNow(active._id);
    return {
      ok: true,
      result: {
        battleId: String(finishedBattle._id),
        status: finishedBattle.status,
        startsAt: finishedBattle.startsAt,
        endsAt: finishedBattle.endsAt,
      },
    };
  }

  if (approval.actionType === 'system.backup.create') {
    const jobRun = await runSystemJob({
      jobName: 'backup_full',
      requestedBy: req?.user?._id || approval.createdBy,
      params: {
        source: 'approval',
        operationId: approval.operationId,
      },
      relatedApproval: approval._id,
    });
    return { ok: true, result: { jobRun } };
  }

  if (approval.actionType === 'system.job.run') {
    const jobName = String(approval.payload?.jobName || '').trim();
    if (!jobName) {
      return { ok: false, error: 'payload.jobName is required for system.job.run' };
    }
    const jobRun = await runSystemJob({
      jobName,
      requestedBy: req?.user?._id || approval.createdBy,
      params: approval.payload?.params || {},
      relatedApproval: approval._id,
    });
    return { ok: true, result: { jobRun } };
  }

  return { ok: false, error: `No executor registered for ${approval.actionType}` };
}

function hasApprovedByUser(approval, actorId) {
  if (!approval || !actorId) return false;
  const actor = String(actorId);
  return (approval.approvals || []).some((entry) => String(entry?.approver || '') === actor);
}

async function approveOperation({ req, id, note = '' }) {
  const approval = await getModelDocById('OperationApproval', id);
  if (!approval) {
    const err = new Error('Approval not found');
    err.status = 404;
    throw err;
  }
  if (!['pending', 'approved'].includes(approval.status)) {
    const err = new Error(`Approval is not actionable (status: ${approval.status})`);
    err.status = 409;
    throw err;
  }

  const actorId = req?.user?._id;
  if (!actorId) {
    const err = new Error('Actor is required');
    err.status = 401;
    throw err;
  }

  if (hasApprovedByUser(approval, actorId)) {
    const err = new Error('You already approved this operation');
    err.status = 409;
    throw err;
  }

  const previous = serializeApproval(approval);
  const nextApprovals = [
    ...(Array.isArray(approval.approvals) ? approval.approvals : []),
    {
      approver: actorId,
      approvedAt: new Date(),
      note: String(note || '').trim(),
    },
  ];

  const uniqueApproversCount = new Set(
    nextApprovals.map((entry) => String(entry?.approver || ''))
  ).size;
  // Single-approval policy also applies to legacy approvals
  // that were created when a second admin confirmation was required.
  const requiredApprovals = 1;
  const enoughApprovals = uniqueApproversCount >= requiredApprovals;

  if (!enoughApprovals) {
    const saved = await updateModelDoc('OperationApproval', approval._id, {
      approvals: nextApprovals,
      status: 'pending',
    });
    if (!saved) {
      const err = new Error('Failed to update approval');
      err.status = 500;
      throw err;
    }

    const audit = await logAdminAction({
      req,
      actionType: 'approval.partial_approved',
      entityType: 'OperationApproval',
      entityId: approval._id,
      before: previous,
      after: serializeApproval(saved),
      meta: {
        operationId: saved.operationId,
        approvalsCount: uniqueApproversCount,
        requiredApprovals,
      },
      severity: 'high',
    });

    return {
      approval: saved,
      operationId: saved.operationId,
      status: saved.status,
      requiresApproval: true,
      executed: false,
      auditId: audit?.actionLogId || audit?.auditId || null,
    };
  }

  let approvalAfterApprove = await updateModelDoc('OperationApproval', approval._id, {
    approvals: nextApprovals,
    status: 'approved',
    approvedAt: new Date(),
  });
  if (!approvalAfterApprove) {
    const err = new Error('Failed to update approval');
    err.status = 500;
    throw err;
  }

  let executionAuditId = null;
  try {
    const execution = await executeApprovalOperation({ approval: approvalAfterApprove, req });
    if (!execution.ok) {
      approvalAfterApprove = await updateModelDoc('OperationApproval', approvalAfterApprove._id, {
        status: 'failed',
        executionError: execution.error || 'Execution failed',
        executedAt: new Date(),
      });
    } else {
      approvalAfterApprove = await updateModelDoc('OperationApproval', approvalAfterApprove._id, {
        status: 'executed',
        executionResult: execution.result || {},
        executedAt: new Date(),
      });
    }
    if (!approvalAfterApprove) {
      const err = new Error('Failed to finalize approval');
      err.status = 500;
      throw err;
    }

    const execAudit = await logAdminAction({
      req,
      actionType: approvalAfterApprove.status === 'executed' ? 'approval.executed' : 'approval.execution_failed',
      entityType: 'OperationApproval',
      entityId: approvalAfterApprove._id,
      before: previous,
      after: serializeApproval(approvalAfterApprove),
      meta: {
        operationId: approvalAfterApprove.operationId,
        actionType: approvalAfterApprove.actionType,
      },
      severity: 'high',
    });
    executionAuditId = execAudit?.actionLogId || execAudit?.auditId || null;
  } catch (error) {
    approvalAfterApprove = await updateModelDoc('OperationApproval', approvalAfterApprove._id, {
      status: 'failed',
      executionError: error?.message || 'Execution failed',
      executedAt: new Date(),
    });

    const failedAudit = await logAdminAction({
      req,
      actionType: 'approval.execution_failed',
      entityType: 'OperationApproval',
      entityId: approvalAfterApprove?._id || id,
      before: previous,
      after: serializeApproval(approvalAfterApprove),
      meta: {
        operationId: approvalAfterApprove?.operationId,
        actionType: approvalAfterApprove?.actionType,
        error: error?.message || String(error),
      },
      severity: 'high',
    });
    executionAuditId = failedAudit?.actionLogId || failedAudit?.auditId || null;
  }

  return {
    approval: approvalAfterApprove,
    operationId: approvalAfterApprove.operationId,
    status: approvalAfterApprove.status,
    requiresApproval: false,
    executed: approvalAfterApprove.status === 'executed',
    auditId: executionAuditId,
  };
}

async function rejectOperation({ req, id, reason = '' }) {
  const approval = await getModelDocById('OperationApproval', id);
  if (!approval) {
    const err = new Error('Approval not found');
    err.status = 404;
    throw err;
  }

  if (approval.status === 'executed') {
    const err = new Error('Executed operation cannot be rejected');
    err.status = 409;
    throw err;
  }

  const previous = serializeApproval(approval);
  const saved = await updateModelDoc('OperationApproval', approval._id, {
    status: 'failed',
    executionError: String(reason || 'Rejected by moderator').trim(),
    executedAt: new Date(),
  });
  if (!saved) {
    const err = new Error('Failed to update approval');
    err.status = 500;
    throw err;
  }

  const audit = await logAdminAction({
    req,
    actionType: 'approval.rejected',
    entityType: 'OperationApproval',
    entityId: saved._id,
    before: previous,
    after: serializeApproval(saved),
    meta: {
      operationId: saved.operationId,
      reason: saved.executionError,
    },
    severity: 'high',
  });

  return {
    approval: saved,
    operationId: saved.operationId,
    status: saved.status,
    requiresApproval: false,
    executed: false,
    auditId: audit?.actionLogId || audit?.auditId || null,
  };
}

async function listApprovals({ status, domain, actionType, page = 1, limit = 20 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 20));
  const safePage = Math.max(1, Number(page) || 1);
  const all = await listModelDocs('OperationApproval');
  const filtered = all.filter((row) => {
    if (status && String(row.status) !== String(status)) return false;
    if (domain && String(row.domain) !== String(domain)) return false;
    if (actionType && String(row.actionType) !== String(actionType)) return false;
    return true;
  });
  filtered.sort((a, b) => {
    const aTime = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
    const bTime = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
    return bTime - aTime;
  });
  const total = filtered.length;
  const rows = filtered.slice((safePage - 1) * safeLimit, (safePage - 1) * safeLimit + safeLimit);

  return {
    approvals: rows.map((row) => serializeApproval(row)),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit),
    },
  };
}

module.exports = {
  serializeApproval,
  createOperationApproval,
  approveOperation,
  rejectOperation,
  listApprovals,
};

