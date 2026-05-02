const { getSupabaseClient } = require('../lib/supabaseClient');

const RUNTIME_TABLE = 'battle_runtime_entries';
const runtimeHotCache = new Map();

function buildRuntimeHotCacheKey(modelName, id) {
  const model = String(modelName || '').trim();
  const docId = String(id || '').trim();
  if (!model || !docId) return '';
  return `${model}::${docId}`;
}

function cloneRuntimeHotCacheRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: String(row.id || ''),
    data: row.data && typeof row.data === 'object'
      ? JSON.parse(JSON.stringify(row.data))
      : (row.data || {}),
    createdAt: row.createdAt ? new Date(row.createdAt) : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
  };
}

function parseRuntimeHotCacheExpiryMs(row) {
  if (!row || typeof row !== 'object') return NaN;
  const direct = row.expiresAt instanceof Date ? row.expiresAt.getTime() : new Date(row.expiresAt || '').getTime();
  if (Number.isFinite(direct)) return direct;
  const nested = row.data?.expiresAt ? new Date(row.data.expiresAt).getTime() : NaN;
  return Number.isFinite(nested) ? nested : NaN;
}

function getRuntimeHotCacheRow(modelName, id, nowMs = Date.now()) {
  const key = buildRuntimeHotCacheKey(modelName, id);
  if (!key) return null;
  const cached = runtimeHotCache.get(key);
  if (!cached) return null;
  if (Number.isFinite(cached.expiresAtMs) && cached.expiresAtMs <= nowMs) {
    runtimeHotCache.delete(key);
    return null;
  }
  return cloneRuntimeHotCacheRow(cached.row);
}

function setRuntimeHotCacheRow(modelName, id, row) {
  const key = buildRuntimeHotCacheKey(modelName, id);
  if (!key || !row) return;
  runtimeHotCache.set(key, {
    row: cloneRuntimeHotCacheRow(row),
    expiresAtMs: parseRuntimeHotCacheExpiryMs(row),
  });
}

function deleteRuntimeHotCacheRow(modelName, id) {
  const key = buildRuntimeHotCacheKey(modelName, id);
  if (!key) return;
  runtimeHotCache.delete(key);
}

function deleteRuntimeHotCacheRowsByPrefix(modelName, idPrefix) {
  const model = String(modelName || '').trim();
  const prefix = String(idPrefix || '').trim();
  if (!model || !prefix) return;
  const keyPrefix = `${model}::${prefix}`;
  for (const key of Array.from(runtimeHotCache.keys())) {
    if (key.startsWith(keyPrefix)) {
      runtimeHotCache.delete(key);
    }
  }
}

function listRuntimeHotCacheRows(modelName, { idPrefix = '', limit = 5000, nowMs = Date.now() } = {}) {
  const model = String(modelName || '').trim();
  const prefix = String(idPrefix || '').trim();
  if (!model) return [];

  const keyPrefix = `${model}::`;
  const out = [];

  for (const [key, entry] of runtimeHotCache.entries()) {
    if (!key.startsWith(keyPrefix)) continue;
    if (Number.isFinite(entry.expiresAtMs) && entry.expiresAtMs <= nowMs) {
      runtimeHotCache.delete(key);
      continue;
    }

    const row = cloneRuntimeHotCacheRow(entry.row);
    const rowId = normalizeIdPart(row?.id);
    if (!row || !rowId) continue;
    if (prefix && !rowId.startsWith(prefix)) continue;
    out.push(row);
  }

  return out.slice(0, Math.max(1, Math.min(5000, Number(limit) || 5000)));
}

function warnRuntimeStore(action, error) {
  const message = error?.message || String(error || 'unknown error');
  console.warn(`[battleRuntimeStore] ${action}: ${message}`);
}

async function getDocument(modelName, id) {
  const model = String(modelName || '').trim();
  const docId = String(id || '').trim();
  if (!model || !docId) return null;

  const cached = getRuntimeHotCacheRow(model, docId);
  if (cached) {
    return cached;
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from(RUNTIME_TABLE)
    .select('model,id,data,expires_at,created_at,updated_at')
    .eq('model', model)
    .eq('id', docId)
    .maybeSingle();
  if (error) {
    warnRuntimeStore(`getDocument(${model}/${docId})`, error);
    return null;
  }
  if (!data) return null;
  const row = {
    id: String(data.id),
    data: data.data || {},
    createdAt: data.created_at ? new Date(data.created_at) : null,
    updatedAt: data.updated_at ? new Date(data.updated_at) : null,
    expiresAt: data.expires_at ? new Date(data.expires_at) : null,
  };
  setRuntimeHotCacheRow(model, docId, row);
  return row;
}

async function insertDocument(modelName, id, data, opts = {}) {
  const model = String(modelName || '').trim();
  const docId = String(id || '').trim();
  if (!model || !docId) throw new Error('[DB] insertDocument requires model and id');

  const nowIso = new Date().toISOString();
  const createdAtIso = opts.createdAt ? new Date(opts.createdAt).toISOString() : nowIso;
  const updatedAtIso = opts.updatedAt ? new Date(opts.updatedAt).toISOString() : nowIso;
  const expiresAtIso = data?.expiresAt ? new Date(data.expiresAt).toISOString() : null;
  const existing = getRuntimeHotCacheRow(model, docId);
  if (existing) {
    const duplicateError = new Error(`[DB] Failed to insert "${model}/${docId}": duplicate cached runtime document`);
    duplicateError.code = '23505';
    throw duplicateError;
  }

  setRuntimeHotCacheRow(model, docId, {
    id: docId,
    data: data || {},
    createdAt: new Date(createdAtIso),
    updatedAt: new Date(updatedAtIso),
    expiresAt: expiresAtIso ? new Date(expiresAtIso) : null,
  });

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(RUNTIME_TABLE)
    .insert({
      model,
      id: docId,
      data: data || {},
      expires_at: expiresAtIso,
      created_at: createdAtIso,
      updated_at: updatedAtIso,
    });
  if (error) {
    const wrapped = new Error(`[DB] Failed to insert "${model}/${docId}": ${error.message}`);
    wrapped.code = error.code || '';
    wrapped.details = error;
    if (isDuplicateInsertError(wrapped)) {
      throw wrapped;
    }
    warnRuntimeStore(`insertDocument(${model}/${docId})`, wrapped);
  }
}

async function upsertDocument(modelName, id, data, opts = {}) {
  const model = String(modelName || '').trim();
  const docId = String(id || '').trim();
  if (!model || !docId) throw new Error('[DB] upsertDocument requires model and id');

  const nowIso = new Date().toISOString();
  const createdAtIso = opts.createdAt ? new Date(opts.createdAt).toISOString() : nowIso;
  const updatedAtIso = opts.updatedAt ? new Date(opts.updatedAt).toISOString() : nowIso;
  const expiresAtIso = data?.expiresAt ? new Date(data.expiresAt).toISOString() : null;
  const existing = getRuntimeHotCacheRow(model, docId);
  setRuntimeHotCacheRow(model, docId, {
    id: docId,
    data: data || {},
    createdAt: existing?.createdAt ? new Date(existing.createdAt) : new Date(createdAtIso),
    updatedAt: new Date(updatedAtIso),
    expiresAt: expiresAtIso ? new Date(expiresAtIso) : null,
  });

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(RUNTIME_TABLE)
    .upsert({
      model,
      id: docId,
      data: data || {},
      expires_at: expiresAtIso,
      created_at: createdAtIso,
      updated_at: updatedAtIso,
    }, {
      onConflict: 'model,id',
      ignoreDuplicates: false,
    });
  if (error) {
    warnRuntimeStore(`upsertDocument(${model}/${docId})`, error);
  }
}

async function deleteDocument(modelName, id) {
  const model = String(modelName || '').trim();
  const docId = String(id || '').trim();
  if (!model || !docId) return;
  deleteRuntimeHotCacheRow(model, docId);
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from(RUNTIME_TABLE)
    .delete()
    .eq('model', model)
    .eq('id', docId);
  if (error) {
    warnRuntimeStore(`deleteDocument(${model}/${docId})`, error);
  }
}

async function deleteDocumentsByPrefix(modelName, idPrefix, { limit = 1000 } = {}) {
  const model = String(modelName || '').trim();
  const prefix = String(idPrefix || '').trim();
  if (!model || !prefix) return 0;

  const supabase = getSupabaseClient();
  const safeLimit = Math.max(1, Math.min(5000, Number(limit) || 1000));
  let deletedTotal = 0;
  deleteRuntimeHotCacheRowsByPrefix(model, prefix);

  while (true) {
    const { data, error } = await supabase
      .from(RUNTIME_TABLE)
      .select('id')
      .eq('model', model)
      .like('id', `${prefix}%`)
      .limit(safeLimit);

    if (error || !Array.isArray(data) || !data.length) {
      if (error) {
        warnRuntimeStore(`deleteDocumentsByPrefix(${model}/${prefix})`, error);
      }
      break;
    }

    const ids = data
      .map((row) => String(row?.id || '').trim())
      .filter(Boolean);

    if (!ids.length) {
      break;
    }

    const { error: deleteError } = await supabase
      .from(RUNTIME_TABLE)
      .delete()
      .eq('model', model)
      .in('id', ids);

    if (deleteError) {
      warnRuntimeStore(`deleteDocumentsByPrefix(${model}/${prefix})`, deleteError);
      break;
    }

    ids.forEach((id) => deleteRuntimeHotCacheRow(model, id));
    deletedTotal += ids.length;

    if (ids.length < safeLimit) {
      break;
    }
  }
  return deletedTotal;
}

const RUNTIME_MODELS = Object.freeze({
  shot: 'BattleRuntimeShot',
  hitSlot: 'BattleRuntimeHitSlot',
  processedHit: 'BattleRuntimeProcessedHit',
  cooldownWindow: 'BattleRuntimeCooldownWindow',
  attendanceState: 'BattleRuntimeAttendanceState',
  finalReport: 'BattleRuntimeFinalReport',
  finalSettlement: 'BattleRuntimeFinalSettlement',
  finalSummary: 'BattleRuntimeFinalSummary',
  pointer: 'BattleRuntimePointer',
  darknessState: 'BattleRuntimeDarknessState',
});

const CLEANUP_INTERVAL_MS = 60 * 1000;
const CLEANUP_BATCH_LIMIT = 200;

let lastCleanupAtMs = 0;

function normalizeIdPart(value) {
  return String(value == null ? '' : value).trim();
}

function buildRuntimeId(parts) {
  return parts.map((part) => normalizeIdPart(part)).join(':');
}

function normalizeWorldPoint(raw) {
  const x = Number(raw?.x);
  const y = Number(raw?.y);
  const z = Number(raw?.z);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return null;
  }
  return { x, y, z };
}

function parseMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
    const asDate = new Date(value).getTime();
    if (Number.isFinite(asDate)) return asDate;
  }
  return NaN;
}

function toIsoString(ms) {
  const safeMs = Number.isFinite(ms) ? ms : Date.now();
  return new Date(safeMs).toISOString();
}

function isDuplicateInsertError(error) {
  if (!error) return false;
  if (String(error.code || '').trim() === '23505') return true;
  return /duplicate key/i.test(String(error.message || ''));
}

function getExpiryMs(data) {
  return parseMs(data?.expiresAt);
}

function mergeRuntimePayloads(rows = [], { limit = 5000 } = {}) {
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const payload = row?.data && typeof row.data === 'object' ? row.data : row;
    if (!payload || typeof payload !== 'object') continue;
    const rowId = normalizeIdPart(row?.id || payload._id || payload.id);
    if (rowId && seen.has(rowId)) continue;
    const expiresAtMs = getExpiryMs(payload);
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) continue;
    if (rowId) seen.add(rowId);
    out.push(payload);
    if (out.length >= limit) break;
  }
  return out;
}

async function loadActiveRuntimeData(modelName, id, nowMs = Date.now()) {
  const row = await getDocument(modelName, id);
  if (!row) return null;

  const expiresAtMs = getExpiryMs(row.data);
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
    await deleteDocument(modelName, id).catch(() => {});
    return null;
  }

  return row.data || null;
}

async function claimExpiringUniqueDocument({
  modelName,
  id,
  data,
  expiresAtMs,
  createdAtMs = Date.now(),
}) {
  const payload = {
    ...(data || {}),
    expiresAt: toIsoString(expiresAtMs),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await insertDocument(modelName, id, payload, {
        createdAt: new Date(createdAtMs),
        updatedAt: new Date(createdAtMs),
      });
      return { created: true, data: payload };
    } catch (error) {
      if (!isDuplicateInsertError(error)) {
        throw error;
      }

      const existing = await getDocument(modelName, id);
      if (!existing) {
        continue;
      }

      const expiresMs = getExpiryMs(existing.data);
      if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) {
        await deleteDocument(modelName, id).catch(() => {});
        continue;
      }

      return { created: false, data: existing.data || null };
    }
  }

  return {
    created: false,
    data: await loadActiveRuntimeData(modelName, id),
  };
}

function buildShotDocId({ battleId, userId, shotId }) {
  return buildRuntimeId([battleId, userId, shotId]);
}

function buildProcessedHitDocId({ battleId, userId, processedHitId }) {
  return buildRuntimeId([battleId, userId, processedHitId]);
}

function buildHitSlotDocId({ battleId, userId, shotId, slotIndex }) {
  return buildRuntimeId([battleId, userId, shotId, 'slot', slotIndex]);
}

function buildCooldownWindowIds({ battleId, userId, weaponId, atMs, minGapMs }) {
  const gapMs = Math.max(1, Math.round(Number(minGapMs) || 0));
  const halfGapMs = Math.max(1, Math.floor(gapMs / 2));
  const primaryBucket = Math.floor(atMs / gapMs);
  const secondaryBucket = Math.floor((atMs + halfGapMs) / gapMs);
  const ids = [
    buildRuntimeId([battleId, userId, weaponId, 'cooldown', 'a', primaryBucket]),
    buildRuntimeId([battleId, userId, weaponId, 'cooldown', 'b', secondaryBucket]),
  ];
  return Array.from(new Set(ids));
}

function buildAttendanceStateDocId({ battleId, userId }) {
  return buildRuntimeId([battleId, userId, 'attendance']);
}

function buildFinalReportDocId({ battleId, userId }) {
  return buildRuntimeId([battleId, userId, 'final']);
}

function buildFinalSettlementDocId({ battleId }) {
  return buildRuntimeId([battleId, 'settlement']);
}

function buildFinalSummaryDocId({ battleId, userId }) {
  return buildRuntimeId([battleId, userId, 'summary']);
}

function buildBattlePointerDocId(kind) {
  return buildRuntimeId(['battle-pointer', normalizeIdPart(kind)]);
}

function buildDarknessStateDocId(kind) {
  return buildRuntimeId(['battle-darkness', normalizeIdPart(kind)]);
}

async function getFinalReport({ battleId, userId }) {
  if (!battleId || !userId) return null;
  return loadActiveRuntimeData(RUNTIME_MODELS.finalReport, buildFinalReportDocId({ battleId, userId }));
}

async function upsertFinalReport({ battleId, userId, report, ttlMs = 2 * 60 * 60 * 1000 }) {
  if (!battleId || !userId) return null;
  const expiresAtMs = Date.now() + Math.max(60 * 1000, Number(ttlMs) || 0);
  await upsertDocument(RUNTIME_MODELS.finalReport, buildFinalReportDocId({ battleId, userId }), {
    ...(report || {}),
    expiresAt: toIsoString(expiresAtMs),
  });
  return report || null;
}

async function listFinalReportsByBattle({ battleId, limit = 5000 } = {}) {
  const safeBattleId = normalizeIdPart(battleId);
  if (!safeBattleId) return [];

  const client = getSupabaseClient();
  const out = [];
  let from = 0;
  const pageSize = Math.max(1, Math.min(1000, Number(limit) || 5000));

  while (out.length < limit) {
    const { data, error } = await client
      .from(RUNTIME_TABLE)
      .select('id,data,expires_at')
      .eq('model', RUNTIME_MODELS.finalReport)
      .like('id', `${safeBattleId}:%:final`)
      .range(from, from + pageSize - 1);

    if (error || !Array.isArray(data) || !data.length) {
      if (error) {
        warnRuntimeStore(`listFinalReportsByBattle(${safeBattleId})`, error);
      }
      break;
    }

    for (const row of data) {
      const payload = row?.data && typeof row.data === 'object' ? row.data : null;
      if (!payload) continue;
      const expiresAtMs = getExpiryMs(payload);
      if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) continue;
      out.push({ id: String(row?.id || ''), data: payload });
      if (out.length >= limit) break;
    }

    if (data.length < pageSize) {
      break;
    }

    from += data.length;
  }

  const cached = listRuntimeHotCacheRows(RUNTIME_MODELS.finalReport, {
    idPrefix: `${safeBattleId}:`,
    limit,
  });
  return mergeRuntimePayloads([
    ...cached,
    ...out,
  ], { limit });
}

async function getFinalSettlement({ battleId }) {
  if (!battleId) return null;
  return loadActiveRuntimeData(RUNTIME_MODELS.finalSettlement, buildFinalSettlementDocId({ battleId }));
}

async function upsertFinalSettlement({ battleId, settlement, ttlMs = 24 * 60 * 60 * 1000 }) {
  if (!battleId) return null;
  const expiresAtMs = Date.now() + Math.max(5 * 60 * 1000, Number(ttlMs) || 0);
  await upsertDocument(RUNTIME_MODELS.finalSettlement, buildFinalSettlementDocId({ battleId }), {
    ...(settlement || {}),
    battleId: normalizeIdPart(battleId),
    expiresAt: toIsoString(expiresAtMs),
  });
  return settlement || null;
}

async function deleteFinalSettlement({ battleId }) {
  if (!battleId) return;
  await deleteDocument(RUNTIME_MODELS.finalSettlement, buildFinalSettlementDocId({ battleId }));
}

async function getFinalSummary({ battleId, userId }) {
  if (!battleId || !userId) return null;
  return loadActiveRuntimeData(RUNTIME_MODELS.finalSummary, buildFinalSummaryDocId({ battleId, userId }));
}

async function upsertFinalSummary({ battleId, userId, summary, ttlMs = 14 * 24 * 60 * 60 * 1000 }) {
  if (!battleId || !userId) return null;
  const expiresAtMs = Date.now() + Math.max(30 * 60 * 1000, Number(ttlMs) || 0);
  await upsertDocument(RUNTIME_MODELS.finalSummary, buildFinalSummaryDocId({ battleId, userId }), {
    ...(summary || {}),
    battleId: normalizeIdPart(battleId),
    userId: normalizeIdPart(userId),
    expiresAt: toIsoString(expiresAtMs),
  });
  return summary || null;
}

async function listFinalSummariesByBattle({ battleId, limit = 5000 } = {}) {
  const safeBattleId = normalizeIdPart(battleId);
  if (!safeBattleId) return [];

  const client = getSupabaseClient();
  const out = [];
  let from = 0;
  const pageSize = Math.max(1, Math.min(1000, Number(limit) || 5000));

  while (out.length < limit) {
    const { data, error } = await client
      .from(RUNTIME_TABLE)
      .select('id,data,expires_at')
      .eq('model', RUNTIME_MODELS.finalSummary)
      .like('id', `${safeBattleId}:%:summary`)
      .range(from, from + pageSize - 1);

    if (error || !Array.isArray(data) || !data.length) {
      if (error) {
        warnRuntimeStore(`listFinalSummariesByBattle(${safeBattleId})`, error);
      }
      break;
    }

    for (const row of data) {
      const payload = row?.data && typeof row.data === 'object' ? row.data : null;
      if (!payload) continue;
      const expiresAtMs = getExpiryMs(payload);
      if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) continue;
      out.push({ id: String(row?.id || ''), data: payload });
      if (out.length >= limit) break;
    }

    if (data.length < pageSize) {
      break;
    }

    from += data.length;
  }

  const cached = listRuntimeHotCacheRows(RUNTIME_MODELS.finalSummary, {
    idPrefix: `${safeBattleId}:`,
    limit,
  });
  return mergeRuntimePayloads([
    ...cached,
    ...out,
  ], { limit });
}

async function listDueFinalSettlements({ nowMs = Date.now(), limit = 200 } = {}) {
  const supabase = getSupabaseClient();
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
  const { data: rows, error } = await supabase
    .from(RUNTIME_TABLE)
    .select('model,id,data,expires_at,created_at,updated_at')
    .eq('model', RUNTIME_MODELS.finalSettlement)
    .limit(safeLimit);
  if (error || !Array.isArray(rows)) {
    if (error) {
      warnRuntimeStore('listDueFinalSettlements', error);
    }
  }

  const dbRows = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      ...(row?.data || {}),
      _id: String(row?.id || ''),
      expiresAt: row?.expires_at ? new Date(row.expires_at) : null,
      createdAt: row?.created_at ? new Date(row.created_at) : null,
      updatedAt: row?.updated_at ? new Date(row.updated_at) : null,
    }))
    .filter((row) => {
      const dueAtMs = parseMs(row?.dueAt);
      const expiresAtMs = parseMs(row?.expiresAt);
      if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) return false;
      return Number.isFinite(dueAtMs) && dueAtMs <= nowMs;
    });
  const cachedRows = listRuntimeHotCacheRows(RUNTIME_MODELS.finalSettlement, { limit: safeLimit, nowMs })
    .map((row) => ({
      ...(row?.data || {}),
      _id: String(row?.id || ''),
      expiresAt: row?.expiresAt ? new Date(row.expiresAt) : null,
      createdAt: row?.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row?.updatedAt ? new Date(row.updatedAt) : null,
    }))
    .filter((row) => {
      const dueAtMs = parseMs(row?.dueAt);
      const expiresAtMs = parseMs(row?.expiresAt);
      if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) return false;
      return Number.isFinite(dueAtMs) && dueAtMs <= nowMs;
    });

  return mergeRuntimePayloads([
    ...cachedRows.map((row) => ({ id: row._id, data: row })),
    ...dbRows.map((row) => ({ id: row._id, data: row })),
  ], { limit: safeLimit });
}

async function getBattlePointer(kind) {
  const safeKind = normalizeIdPart(kind);
  if (!safeKind) return null;
  return loadActiveRuntimeData(RUNTIME_MODELS.pointer, buildBattlePointerDocId(safeKind));
}

async function setBattlePointer(kind, battleId) {
  const safeKind = normalizeIdPart(kind);
  if (!safeKind) return null;
  const safeBattleId = normalizeIdPart(battleId);
  if (!safeBattleId) {
    await deleteDocument(RUNTIME_MODELS.pointer, buildBattlePointerDocId(safeKind)).catch(() => {});
    return null;
  }

  const payload = {
    kind: safeKind,
    battleId: safeBattleId,
  };

  await upsertDocument(RUNTIME_MODELS.pointer, buildBattlePointerDocId(safeKind), payload, {
    updatedAt: new Date(),
  });

  return payload;
}

async function clearBattlePointer(kind, expectedBattleId = null) {
  const safeKind = normalizeIdPart(kind);
  if (!safeKind) return;
  if (expectedBattleId) {
    const current = await getBattlePointer(safeKind);
    if (!current || normalizeIdPart(current.battleId) !== normalizeIdPart(expectedBattleId)) {
      return;
    }
  }
  await deleteDocument(RUNTIME_MODELS.pointer, buildBattlePointerDocId(safeKind)).catch(() => {});
}

async function getDarknessState(kind) {
  const safeKind = normalizeIdPart(kind);
  if (!safeKind) return null;
  return loadActiveRuntimeData(RUNTIME_MODELS.darknessState, buildDarknessStateDocId(safeKind));
}

async function setDarknessState(kind, patch = {}) {
  const safeKind = normalizeIdPart(kind);
  if (!safeKind) return null;
  const current = await getDarknessState(safeKind);
  const payload = {
    ...(current && typeof current === 'object' ? current : {}),
    ...(patch && typeof patch === 'object' ? patch : {}),
    kind: safeKind,
  };
  await upsertDocument(RUNTIME_MODELS.darknessState, buildDarknessStateDocId(safeKind), payload, {
    updatedAt: new Date(),
  });
  return payload;
}

async function clearDarknessState(kind) {
  const safeKind = normalizeIdPart(kind);
  if (!safeKind) return;
  await deleteDocument(RUNTIME_MODELS.darknessState, buildDarknessStateDocId(safeKind)).catch(() => {});
}

async function getShotMeta({ battleId, userId, shotId }) {
  if (!battleId || !userId || !shotId) return null;
  return loadActiveRuntimeData(RUNTIME_MODELS.shot, buildShotDocId({ battleId, userId, shotId }));
}

async function createShotMeta({
  battleId,
  userId,
  shotId,
  weaponId,
  atMs = Date.now(),
  penalty = false,
  charged = false,
  aimWorldPoint = null,
  ttlMs = 60000,
}) {
  if (!battleId || !userId || !shotId) {
    return { created: false, shotMeta: null };
  }

  const safeAtMs = Number.isFinite(Number(atMs)) ? Math.min(Date.now(), Number(atMs)) : Date.now();
  const payload = {
    battleId: normalizeIdPart(battleId),
    userId: normalizeIdPart(userId),
    shotId: normalizeIdPart(shotId),
    weaponId: Number.isFinite(Number(weaponId)) ? Number(weaponId) : null,
    at: safeAtMs,
    penalty: Boolean(penalty),
    charged: Boolean(charged),
    aimWorldPoint: normalizeWorldPoint(aimWorldPoint),
  };

  const result = await claimExpiringUniqueDocument({
    modelName: RUNTIME_MODELS.shot,
    id: buildShotDocId({ battleId, userId, shotId }),
    data: payload,
    expiresAtMs: safeAtMs + Math.max(1000, Number(ttlMs) || 60000),
    createdAtMs: safeAtMs,
  });

  return {
    created: result.created,
    shotMeta: result.data || payload,
  };
}

async function updateShotMeta({
  battleId,
  userId,
  shotId,
  patch = {},
  baseShotMeta = null,
}) {
  if (!battleId || !userId || !shotId) return null;

  const id = buildShotDocId({ battleId, userId, shotId });
  const currentData = baseShotMeta || await getShotMeta({ battleId, userId, shotId });
  if (!currentData) return null;

  const expiresAtMs = getExpiryMs(currentData);
  if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
    await deleteDocument(RUNTIME_MODELS.shot, id).catch(() => {});
    return null;
  }

  const nextAimWorldPoint = normalizeWorldPoint(patch.aimWorldPoint);
  const nextData = {
    ...currentData,
    ...patch,
    aimWorldPoint: nextAimWorldPoint || currentData.aimWorldPoint || null,
    expiresAt: currentData.expiresAt || toIsoString(Date.now() + 60000),
  };

  await upsertDocument(RUNTIME_MODELS.shot, id, nextData, {
    updatedAt: new Date(),
  });

  return nextData;
}

async function claimShotCooldown({
  battleId,
  userId,
  weaponId,
  atMs = Date.now(),
  minGapMs,
}) {
  if (!battleId || !userId) return true;

  const safeAtMs = Number.isFinite(Number(atMs)) ? Number(atMs) : Date.now();
  const safeMinGapMs = Math.max(1, Math.round(Number(minGapMs) || 0));
  if (!safeMinGapMs) return true;

  const ids = buildCooldownWindowIds({
    battleId,
    userId,
    weaponId,
    atMs: safeAtMs,
    minGapMs: safeMinGapMs,
  });

  const createdIds = [];

  for (const id of ids) {
    const result = await claimExpiringUniqueDocument({
      modelName: RUNTIME_MODELS.cooldownWindow,
      id,
      data: {
        battleId: normalizeIdPart(battleId),
        userId: normalizeIdPart(userId),
        weaponId: Number(weaponId),
        at: safeAtMs,
      },
      expiresAtMs: safeAtMs + safeMinGapMs + 2000,
      createdAtMs: safeAtMs,
    });

    if (!result.created) {
      for (const createdId of createdIds) {
        await deleteDocument(RUNTIME_MODELS.cooldownWindow, createdId).catch(() => {});
      }
      return false;
    }

    createdIds.push(id);
  }

  return true;
}

async function claimProcessedHit({
  battleId,
  userId,
  processedHitId,
  expiresAtMs = Date.now() + 60000,
}) {
  if (!battleId || !userId || !processedHitId) return false;

  const result = await claimExpiringUniqueDocument({
    modelName: RUNTIME_MODELS.processedHit,
    id: buildProcessedHitDocId({ battleId, userId, processedHitId }),
    data: {
      battleId: normalizeIdPart(battleId),
      userId: normalizeIdPart(userId),
      processedHitId: normalizeIdPart(processedHitId),
    },
    expiresAtMs,
  });

  return Boolean(result.created);
}

async function reserveAcceptedHitSlot({
  battleId,
  userId,
  shotId,
  processedHitId,
  maxSlots,
  expiresAtMs = Date.now() + 60000,
}) {
  if (!battleId || !userId || !shotId) return false;

  const safeMaxSlots = Math.max(1, Math.round(Number(maxSlots) || 0));

  for (let slotIndex = 1; slotIndex <= safeMaxSlots; slotIndex += 1) {
    const result = await claimExpiringUniqueDocument({
      modelName: RUNTIME_MODELS.hitSlot,
      id: buildHitSlotDocId({ battleId, userId, shotId, slotIndex }),
      data: {
        battleId: normalizeIdPart(battleId),
        userId: normalizeIdPart(userId),
        shotId: normalizeIdPart(shotId),
        processedHitId: normalizeIdPart(processedHitId),
        slotIndex,
      },
      expiresAtMs,
    });

    if (result.created) {
      return true;
    }

    if (normalizeIdPart(result.data?.processedHitId) === normalizeIdPart(processedHitId)) {
      return true;
    }
  }

  return false;
}

async function getAttendanceState({ battleId, userId }) {
  if (!battleId || !userId) return null;
  return loadActiveRuntimeData(
    RUNTIME_MODELS.attendanceState,
    buildAttendanceStateDocId({ battleId, userId })
  );
}

async function upsertAttendanceState({
  battleId,
  userId,
  state,
  ttlMs = 3 * 60 * 60 * 1000,
}) {
  if (!battleId || !userId || !state || typeof state !== 'object') {
    return null;
  }

  const id = buildAttendanceStateDocId({ battleId, userId });
  const payload = {
    battleId: normalizeIdPart(battleId),
    userId: normalizeIdPart(userId),
    ...(state || {}),
    expiresAt: toIsoString(Date.now() + Math.max(60 * 1000, Number(ttlMs) || 3 * 60 * 60 * 1000)),
  };

  await upsertDocument(RUNTIME_MODELS.attendanceState, id, payload, {
    updatedAt: new Date(),
  });

  return payload;
}

async function createAttendanceStateIfAbsent({
  battleId,
  userId,
  state,
  ttlMs = 3 * 60 * 60 * 1000,
}) {
  if (!battleId || !userId || !state || typeof state !== 'object') {
    return { created: false, state: null };
  }

  const safeBattleId = normalizeIdPart(battleId);
  const safeUserId = normalizeIdPart(userId);
  const expiresAtMs = Date.now() + Math.max(60 * 1000, Number(ttlMs) || 3 * 60 * 60 * 1000);
  const payload = {
    battleId: safeBattleId,
    userId: safeUserId,
    ...(state || {}),
  };

  const result = await claimExpiringUniqueDocument({
    modelName: RUNTIME_MODELS.attendanceState,
    id: buildAttendanceStateDocId({ battleId: safeBattleId, userId: safeUserId }),
    data: payload,
    expiresAtMs,
    createdAtMs: Date.now(),
  });

  return {
    created: Boolean(result?.created),
    state: result?.data || payload,
  };
}

async function deleteAttendanceState({ battleId, userId }) {
  if (!battleId || !userId) return;
  await deleteDocument(
    RUNTIME_MODELS.attendanceState,
    buildAttendanceStateDocId({ battleId, userId })
  ).catch(() => {});
}

async function listAttendanceStatesByBattle({ battleId, limit = 5000 } = {}) {
  const safeBattleId = normalizeIdPart(battleId);
  if (!safeBattleId) return [];

  const client = getSupabaseClient();
  const out = [];
  let from = 0;
  const pageSize = Math.max(1, Math.min(1000, Number(limit) || 5000));

  while (out.length < limit) {
    const { data, error } = await client
      .from(RUNTIME_TABLE)
      .select('id,data,expires_at')
      .eq('model', RUNTIME_MODELS.attendanceState)
      .like('id', `${safeBattleId}:%:attendance`)
      .range(from, from + pageSize - 1);

    if (error || !Array.isArray(data) || !data.length) {
      if (error) {
        warnRuntimeStore(`listAttendanceStatesByBattle(${safeBattleId})`, error);
      }
      break;
    }

    for (const row of data) {
      const payload = row?.data && typeof row.data === 'object' ? row.data : null;
      if (!payload) continue;
      const expiresAtMs = getExpiryMs(payload);
      if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) continue;
      out.push({ id: String(row?.id || ''), data: payload });
      if (out.length >= limit) break;
    }

    if (data.length < pageSize) {
      break;
    }

    from += data.length;
  }

  const cached = listRuntimeHotCacheRows(RUNTIME_MODELS.attendanceState, {
    idPrefix: `${safeBattleId}:`,
    limit,
  });
  return mergeRuntimePayloads([
    ...cached,
    ...out,
  ], { limit });
}

async function cleanupModelByUpdatedBefore({ modelName, beforeMs, limit = CLEANUP_BATCH_LIMIT }) {
  const safeModel = String(modelName || '').trim();
  if (safeModel) {
    for (const [key, entry] of runtimeHotCache.entries()) {
      if (!key.startsWith(`${safeModel}::`)) continue;
      const updatedAtMs = parseMs(entry?.row?.updatedAt || entry?.row?.data?.updatedAt);
      if (Number.isFinite(updatedAtMs) && updatedAtMs < beforeMs) {
        runtimeHotCache.delete(key);
      }
    }
  }

  const client = getSupabaseClient();
  const beforeIso = toIsoString(beforeMs);

  const { data, error } = await client
    .from(RUNTIME_TABLE)
    .select('id')
    .eq('model', modelName)
    .lt('updated_at', beforeIso)
    .order('updated_at', { ascending: true })
    .limit(limit);

  if (error || !Array.isArray(data) || !data.length) {
    return 0;
  }

  const ids = data
    .map((row) => normalizeIdPart(row?.id))
    .filter(Boolean);

  if (!ids.length) {
    return 0;
  }

  const { error: deleteError } = await client
    .from(RUNTIME_TABLE)
    .delete()
    .eq('model', modelName)
    .in('id', ids);

  if (deleteError) {
    return 0;
  }

  ids.forEach((id) => deleteRuntimeHotCacheRow(modelName, id));

  return ids.length;
}

async function maybeCleanupExpiredEntries(nowMs = Date.now()) {
  if (nowMs - lastCleanupAtMs < CLEANUP_INTERVAL_MS) {
    return 0;
  }

  lastCleanupAtMs = nowMs;

  const deletedCounts = await Promise.all([
    cleanupModelByUpdatedBefore({
      modelName: RUNTIME_MODELS.cooldownWindow,
      beforeMs: nowMs - 5 * 60 * 1000,
    }),
    cleanupModelByUpdatedBefore({
      modelName: RUNTIME_MODELS.shot,
      beforeMs: nowMs - 10 * 60 * 1000,
    }),
    cleanupModelByUpdatedBefore({
      modelName: RUNTIME_MODELS.hitSlot,
      beforeMs: nowMs - 10 * 60 * 1000,
    }),
    cleanupModelByUpdatedBefore({
      modelName: RUNTIME_MODELS.processedHit,
      beforeMs: nowMs - 15 * 60 * 1000,
    }),
    cleanupModelByUpdatedBefore({
      modelName: RUNTIME_MODELS.attendanceState,
      beforeMs: nowMs - 6 * 60 * 60 * 1000,
    }),
    cleanupModelByUpdatedBefore({
      modelName: RUNTIME_MODELS.finalSettlement,
      beforeMs: nowMs - 24 * 60 * 60 * 1000,
    }),
    cleanupModelByUpdatedBefore({
      modelName: RUNTIME_MODELS.finalSummary,
      beforeMs: nowMs - 15 * 24 * 60 * 60 * 1000,
    }),
  ]).catch(() => [0, 0, 0, 0, 0, 0]);

  return deletedCounts.reduce((sum, value) => sum + Number(value || 0), 0);
}

module.exports = {
  getShotMeta,
  createShotMeta,
  updateShotMeta,
  claimShotCooldown,
  claimProcessedHit,
  reserveAcceptedHitSlot,
  getAttendanceState,
  upsertAttendanceState,
  createAttendanceStateIfAbsent,
  deleteAttendanceState,
  listAttendanceStatesByBattle,
  getFinalReport,
  upsertFinalReport,
  listFinalReportsByBattle,
  getFinalSettlement,
  upsertFinalSettlement,
  deleteFinalSettlement,
  getFinalSummary,
  upsertFinalSummary,
  listFinalSummariesByBattle,
  listDueFinalSettlements,
  getBattlePointer,
  setBattlePointer,
  clearBattlePointer,
  getDarknessState,
  setDarknessState,
  clearDarknessState,
  deleteDocumentsByPrefix,
  maybeCleanupExpiredEntries,
};
