const { getSupabaseClient } = require('../lib/supabaseClient');
const battleService = require('./battleService');
const battleRuntimeStore = require('./battleRuntimeStore');

const DOC_TABLE = String(process.env.SUPABASE_TABLE || 'app_documents').trim() || 'app_documents';
const RUNTIME_TABLE = 'battle_runtime_entries';

const BATTLE_RUNTIME_MODELS_WITH_PREFIX = [
  'BattleRuntimeShot',
  'BattleRuntimeHitSlot',
  'BattleRuntimeProcessedHit',
  'BattleRuntimeCooldownWindow',
  'BattleRuntimeAttendanceState',
  'BattleRuntimeFinalReport',
  'BattleRuntimeFinalSettlement',
  'BattleRuntimeFinalSummary',
];

const BATTLE_ACTION_TYPES = new Set([
  'game.battle.start_now',
  'game.battle.schedule',
  'game.battle.schedule_cancel',
  'game.battle.finish_now',
]);

function toId(value, depth = 0) {
  if (depth > 4) return '';
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    return String(value).trim();
  }
  if (typeof value === 'object') {
    if (value._id != null) return toId(value._id, depth + 1);
    if (value.id != null) return toId(value.id, depth + 1);
    if (value.value != null) return toId(value.value, depth + 1);
    if (typeof value.toString === 'function') {
      const asString = String(value.toString()).trim();
      if (asString && asString !== '[object Object]') return asString;
    }
  }
  return '';
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

function chunkArray(items, size = 200) {
  const safeSize = Math.max(1, Number(size) || 200);
  const list = Array.isArray(items) ? items : [];
  const out = [];
  for (let i = 0; i < list.length; i += safeSize) {
    out.push(list.slice(i, i + safeSize));
  }
  return out;
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
    from += data.length;
  }
  return out;
}

async function getModelDocById(model, id) {
  const safeId = toId(id);
  if (!model || !safeId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(DOC_TABLE)
    .select('id,data,created_at,updated_at')
    .eq('model', String(model))
    .eq('id', safeId)
    .maybeSingle();
  if (error || !data) return null;
  return mapDocRow(data);
}

async function deleteModelDocs(model, ids) {
  const safeIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => toId(id)).filter(Boolean)));
  if (!safeIds.length) return 0;

  const supabase = getSupabaseClient();
  let deleted = 0;
  for (const chunk of chunkArray(safeIds, 200)) {
    // eslint-disable-next-line no-await-in-loop
    const { data, error } = await supabase
      .from(DOC_TABLE)
      .delete()
      .eq('model', String(model))
      .in('id', chunk)
      .select('id');
    if (error) throw error;
    deleted += Array.isArray(data) ? data.length : 0;
  }
  return deleted;
}

async function deleteTableRowsByField(table, field, value) {
  const safeValue = toId(value);
  if (!table || !field || !safeValue) return 0;
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(String(table))
    .delete()
    .eq(String(field), safeValue);
  if (error) throw error;
  return 0;
}

async function deleteBattleRuntimeByBattleIds(battleIds = []) {
  const safeBattleIds = Array.from(new Set((Array.isArray(battleIds) ? battleIds : []).map((id) => toId(id)).filter(Boolean)));
  if (!safeBattleIds.length) return 0;

  let deleted = 0;
  for (const battleId of safeBattleIds) {
    for (const modelName of BATTLE_RUNTIME_MODELS_WITH_PREFIX) {
      // eslint-disable-next-line no-await-in-loop
      deleted += await battleRuntimeStore.deleteDocumentsByPrefix(modelName, `${battleId}:`).catch(() => 0);
    }
  }
  return deleted;
}

async function deleteBattleApprovalsByPredicate(predicate) {
  const approvals = await listModelDocs('OperationApproval', { pageSize: 2000 });
  const ids = approvals
    .filter((approval) => BATTLE_ACTION_TYPES.has(String(approval?.actionType || '').trim()))
    .filter((approval) => {
      try {
        return Boolean(predicate(approval));
      } catch (_error) {
        return false;
      }
    })
    .map((approval) => approval._id);

  return deleteModelDocs('OperationApproval', ids);
}

function approvalTouchesBattle(approval, battleId) {
  const safeBattleId = toId(battleId);
  if (!safeBattleId || !approval) return false;
  const payloadBattleId = toId(approval?.payload?.battleId);
  const resultBattleId = toId(approval?.executionResult?.battleId);
  return payloadBattleId === safeBattleId || resultBattleId === safeBattleId;
}

async function removeBattlePointersForIds(battleIds = []) {
  const safeBattleIds = new Set((Array.isArray(battleIds) ? battleIds : []).map((id) => toId(id)).filter(Boolean));
  if (!safeBattleIds.size) return;

  const [current, upcoming] = await Promise.all([
    battleRuntimeStore.getBattlePointer('current').catch(() => null),
    battleRuntimeStore.getBattlePointer('upcoming').catch(() => null),
  ]);

  if (safeBattleIds.has(toId(current?.battleId))) {
    await battleRuntimeStore.clearBattlePointer('current', current?.battleId).catch(() => {});
  }
  if (safeBattleIds.has(toId(upcoming?.battleId))) {
    await battleRuntimeStore.clearBattlePointer('upcoming', upcoming?.battleId).catch(() => {});
  }
}

async function deleteScheduledBattleTotally(battleId, reason = 'Удалено администратором', { excludeApprovalId = null } = {}) {
  const safeBattleId = toId(battleId);
  if (!safeBattleId) {
    const error = new Error('Не найден запланированный бой');
    error.status = 400;
    throw error;
  }

  const battle = await getModelDocById('Battle', safeBattleId);
  if (!battle || String(battle.status || '') !== 'scheduled') {
    const error = new Error('Запланированный бой не найден');
    error.status = 404;
    throw error;
  }

  battleService.clearBattleTransientState(safeBattleId);
  const [deletedBattles, deletedRuntime, deletedApprovals] = await Promise.all([
    deleteModelDocs('Battle', [safeBattleId]),
    deleteBattleRuntimeByBattleIds([safeBattleId]),
    deleteBattleApprovalsByPredicate((approval) => {
      if (excludeApprovalId && toId(approval?._id) === toId(excludeApprovalId)) return false;
      return approvalTouchesBattle(approval, safeBattleId);
    }),
  ]);

  await removeBattlePointersForIds([safeBattleId]);
  await battleRuntimeStore.clearBattlePointer('upcoming').catch(() => {});

  return {
    battleId: safeBattleId,
    reason: String(reason || ''),
    deletedBattles,
    deletedRuntime,
    deletedApprovals,
  };
}

async function cleanupBattleEmergency(reason = 'Аварийная очистка боёв') {
  const battles = await listModelDocs('Battle', { pageSize: 5000 });
  const targets = battles.filter((battle) => ['scheduled', 'active', 'settling'].includes(String(battle?.status || '').trim()));
  const battleIds = targets.map((battle) => toId(battle?._id)).filter(Boolean);

  for (const battleId of battleIds) {
    battleService.clearBattleTransientState(battleId);
  }
  battleService.clearAllBattleTransientState();

  const [deletedBattles, deletedRuntime, deletedApprovals] = await Promise.all([
    deleteModelDocs('Battle', battleIds),
    deleteBattleRuntimeByBattleIds(battleIds),
    deleteBattleApprovalsByPredicate((approval) => {
      const status = String(approval?.status || '').trim();
      if (status === 'executed') {
        const resultBattleId = toId(approval?.executionResult?.battleId);
        return resultBattleId ? battleIds.includes(resultBattleId) : false;
      }
      return true;
    }),
  ]);

  await Promise.all([
    battleRuntimeStore.clearBattlePointer('current').catch(() => {}),
    battleRuntimeStore.clearBattlePointer('upcoming').catch(() => {}),
    battleRuntimeStore.clearDarknessState('cycle_anchor').catch(() => {}),
  ]);

  return {
    reason: String(reason || ''),
    removedBattleIds: battleIds,
    deletedBattles,
    deletedRuntime,
    deletedApprovals,
  };
}

async function deleteEntityTotally(entityId) {
  const safeEntityId = toId(entityId);
  if (!safeEntityId) {
    const error = new Error('Сущность не найдена');
    error.status = 404;
    throw error;
  }

  const supabase = getSupabaseClient();
  const { data: entityRow, error: entityError } = await supabase
    .from('entities')
    .select('id,user_id')
    .eq('id', Number(safeEntityId))
    .maybeSingle();

  if (entityError || !entityRow) {
    const error = new Error('Сущность не найдена');
    error.status = 404;
    throw error;
  }

  const { error: deleteError } = await supabase
    .from('entities')
    .delete()
    .eq('id', Number(safeEntityId));
  if (deleteError) throw deleteError;

  if (entityRow.user_id) {
    const { data: userRow } = await supabase
      .from('users')
      .select('id,data')
      .eq('id', String(entityRow.user_id))
      .maybeSingle();

    if (userRow) {
      const nextData = {
        ...(userRow.data && typeof userRow.data === 'object' ? userRow.data : {}),
        entityId: null,
        entity: null,
      };
      await supabase
        .from('users')
        .update({ data: nextData, updated_at: new Date().toISOString() })
        .eq('id', String(entityRow.user_id));
    }
  }

  return {
    entityId: safeEntityId,
    userId: entityRow.user_id ? String(entityRow.user_id) : null,
  };
}

async function deleteWishTotally(wishId) {
  const safeWishId = toId(wishId);
  if (!safeWishId) {
    const error = new Error('Желание не найдено');
    error.status = 404;
    throw error;
  }
  const supabase = getSupabaseClient();
  const { data: existing } = await supabase
    .from('wishes')
    .select('id')
    .eq('id', safeWishId)
    .maybeSingle();
  if (!existing) {
    const error = new Error('Желание не найдено');
    error.status = 404;
    throw error;
  }
  const { error } = await supabase
    .from('wishes')
    .delete()
    .eq('id', safeWishId);
  if (error) throw error;
  return { wishId: safeWishId };
}

async function deleteQuoteTotally(quoteId) {
  const safeQuoteId = toId(quoteId);
  if (!safeQuoteId) {
    const error = new Error('Цитата не найдена');
    error.status = 404;
    throw error;
  }
  const existing = await getModelDocById('QuoteOfDay', safeQuoteId);
  if (!existing) {
    const error = new Error('Цитата не найдена');
    error.status = 404;
    throw error;
  }
  await deleteModelDocs('QuoteOfDay', [safeQuoteId]);
  return { quoteId: safeQuoteId };
}

async function deleteFeedbackMessageTotally(messageId) {
  const safeMessageId = toId(messageId);
  if (!safeMessageId) {
    const error = new Error('Сообщение не найдено');
    error.status = 404;
    throw error;
  }
  const existing = await getModelDocById('FeedbackMessage', safeMessageId);
  if (!existing) {
    const error = new Error('Сообщение не найдено');
    error.status = 404;
    throw error;
  }
  await deleteModelDocs('FeedbackMessage', [safeMessageId]);
  return { feedbackId: safeMessageId };
}

async function deleteCreativeTotally(creativeId) {
  const safeCreativeId = toId(creativeId);
  if (!safeCreativeId) {
    const error = new Error('Креатив не найден');
    error.status = 404;
    throw error;
  }
  const existing = await getModelDocById('AdCreative', safeCreativeId);
  if (!existing) {
    const error = new Error('Креатив не найден');
    error.status = 404;
    throw error;
  }
  await deleteModelDocs('AdCreative', [safeCreativeId]);
  return { creativeId: safeCreativeId };
}

async function deleteBridgeTotally(bridgeId) {
  const safeBridgeId = toId(bridgeId);
  if (!safeBridgeId) {
    const error = new Error('Мост не найден');
    error.status = 404;
    throw error;
  }
  const existing = await getModelDocById('Bridge', safeBridgeId);
  if (!existing) {
    const error = new Error('Мост не найден');
    error.status = 404;
    throw error;
  }
  await deleteModelDocs('Bridge', [safeBridgeId]);
  return { bridgeId: safeBridgeId };
}

async function deleteNewsPostTotally(postId) {
  const safePostId = toId(postId);
  if (!safePostId) {
    const error = new Error('Пост не найден');
    error.status = 404;
    throw error;
  }

  const post = await getModelDocById('NewsPost', safePostId);
  if (!post) {
    const error = new Error('Пост не найден');
    error.status = 404;
    throw error;
  }

  const [interactions, commentWindows] = await Promise.all([
    listModelDocs('NewsInteraction', { pageSize: 5000 }),
    listModelDocs('NewsCommentWindow', { pageSize: 5000 }),
  ]);

  const interactionIds = interactions
    .filter((row) => toId(row?.post) === safePostId)
    .map((row) => row._id);
  const windowIds = commentWindows
    .filter((row) => toId(row?.post) === safePostId)
    .map((row) => row._id);

  const [deletedPosts, deletedInteractions, deletedWindows] = await Promise.all([
    deleteModelDocs('NewsPost', [safePostId]),
    deleteModelDocs('NewsInteraction', interactionIds),
    deleteModelDocs('NewsCommentWindow', windowIds),
  ]);

  return {
    postId: safePostId,
    deletedPosts,
    deletedInteractions,
    deletedWindows,
  };
}

async function deleteUserTotally(userId) {
  const safeUserId = toId(userId);
  if (!safeUserId) {
    const error = new Error('Пользователь не найден');
    error.status = 404;
    throw error;
  }

  const supabase = getSupabaseClient();
  const { data: existing } = await supabase
    .from('users')
    .select('id,nickname')
    .eq('id', safeUserId)
    .maybeSingle();
  if (!existing) {
    const error = new Error('Пользователь не найден');
    error.status = 404;
    throw error;
  }

  const { data: entityRows } = await supabase
    .from('entities')
    .select('id')
    .eq('user_id', safeUserId);

  const entityIds = (Array.isArray(entityRows) ? entityRows : []).map((row) => toId(row?.id)).filter(Boolean);
  if (entityIds.length) {
    await supabase.from('entities').delete().in('id', entityIds);
  }

  const tableCleanupTasks = [
    deleteTableRowsByField('wishes', 'author_id', safeUserId),
    deleteTableRowsByField('wishes', 'executor_id', safeUserId),
    deleteTableRowsByField('referrals', 'inviter_id', safeUserId),
    deleteTableRowsByField('referrals', 'invitee_id', safeUserId),
    deleteTableRowsByField('user_sessions', 'user_id', safeUserId),
    deleteTableRowsByField('auth_events', 'user_id', safeUserId),
    deleteTableRowsByField('activity_logs', 'user_id', safeUserId),
    deleteTableRowsByField('solar_charges', 'user_id', safeUserId),
    deleteTableRowsByField('personal_luck_claims', 'user_id', safeUserId),
    deleteTableRowsByField('transactions', 'user_id', safeUserId),
  ];

  const docCleanupTasks = [
    deleteModelDocs(
      'BehaviorEvent',
      (await listModelDocs('BehaviorEvent', { pageSize: 5000 }))
        .filter((row) => toId(row?.user) === safeUserId || toId(row?.userId) === safeUserId)
        .map((row) => row._id)
    ),
    deleteModelDocs(
      'UserAchievement',
      (await listModelDocs('UserAchievement', { pageSize: 5000 }))
        .filter((row) => toId(row?.user) === safeUserId || toId(row?.userId) === safeUserId)
        .map((row) => row._id)
    ),
    deleteModelDocs(
      'Appeal',
      (await listModelDocs('Appeal', { pageSize: 5000 }))
        .filter((row) => toId(row?.complainant) === safeUserId || toId(row?.againstUser) === safeUserId)
        .map((row) => row._id)
    ),
    deleteModelDocs(
      'FeedbackMessage',
      (await listModelDocs('FeedbackMessage', { pageSize: 5000 }))
        .filter((row) => toId(row?.userId) === safeUserId)
        .map((row) => row._id)
    ),
    deleteModelDocs(
      'NewsInteraction',
      (await listModelDocs('NewsInteraction', { pageSize: 5000 }))
        .filter((row) => toId(row?.user) === safeUserId)
        .map((row) => row._id)
    ),
    deleteModelDocs(
      'NewsCommentWindow',
      (await listModelDocs('NewsCommentWindow', { pageSize: 5000 }))
        .filter((row) => toId(row?.user) === safeUserId)
        .map((row) => row._id)
    ),
    deleteModelDocs(
      'NewsViewBucket',
      (await listModelDocs('NewsViewBucket', { pageSize: 5000 }))
        .filter((row) => toId(row?.user) === safeUserId)
        .map((row) => row._id)
    ),
    deleteModelDocs(
      'RiskCase',
      (await listModelDocs('RiskCase', { pageSize: 5000 }))
        .filter((row) => toId(row?.user) === safeUserId)
        .map((row) => row._id)
    ),
    deleteModelDocs(
      'AutomationPenalty',
      (await listModelDocs('AutomationPenalty', { pageSize: 5000 }))
        .filter((row) => toId(row?.user) === safeUserId)
        .map((row) => row._id)
    ),
    deleteModelDocs(
      'OperationApproval',
      (await listModelDocs('OperationApproval', { pageSize: 5000 }))
        .filter((row) => toId(row?.createdBy) === safeUserId)
        .map((row) => row._id)
    ),
  ];

  await Promise.all([...tableCleanupTasks, ...docCleanupTasks]);

  await supabase
    .from('users')
    .delete()
    .eq('id', safeUserId);

  try {
    await supabase.auth.admin.deleteUser(safeUserId);
  } catch (_error) {
    // Если запись в auth уже удалена, чистка основной базы всё равно считается успешной.
  }

  return {
    userId: safeUserId,
    nickname: existing.nickname || null,
    deletedEntityIds: entityIds,
  };
}

module.exports = {
  deleteScheduledBattleTotally,
  cleanupBattleEmergency,
  deleteEntityTotally,
  deleteWishTotally,
  deleteQuoteTotally,
  deleteFeedbackMessageTotally,
  deleteCreativeTotally,
  deleteBridgeTotally,
  deleteNewsPostTotally,
  deleteUserTotally,
};
