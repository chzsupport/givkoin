const { createClient } = require('@supabase/supabase-js');
const logger = require('../utils/logger');

const TABLE_NAME = process.env.SUPABASE_TABLE || 'app_documents';
const PAGE_SIZE = 1000;

let supabase = null;
let readyChecked = false;
let readyPromise = null;

function deepClone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function isSafeJsonPathPart(part) {
  return typeof part === 'string' && /^[A-Za-z0-9_]+$/.test(part);
}

function buildJsonbTextExpr(path) {
  const raw = String(path || '').trim();
  if (!raw) throw new Error('[DB] JSON filter requires a path');

  const parts = raw.split('.').map((p) => p.trim()).filter(Boolean);
  if (!parts.length) throw new Error('[DB] JSON filter requires a path');
  if (!parts.every(isSafeJsonPathPart)) {
    throw new Error(`[DB] Unsafe JSON path: "${raw}"`);
  }

  if (parts.length === 1) return `data->>${parts[0]}`;
  let expr = 'data';
  for (let i = 0; i < parts.length - 1; i += 1) expr += `->${parts[i]}`;
  expr += `->>${parts[parts.length - 1]}`;
  return expr;
}

function applyListFilters(query, filters) {
  const list = Array.isArray(filters) ? filters : [];
  let q = query;

  for (const filter of list) {
    const kind = String(filter?.kind || '').trim();
    const op = String(filter?.op || '').trim();
    const value = filter?.value;

    let field;
    if (kind === 'column') {
      const col = String(filter?.column || '').trim();
      if (!col || !['id', 'created_at', 'updated_at'].includes(col)) {
        throw new Error(`[DB] Unsupported column filter: "${col}"`);
      }
      field = col;
    } else if (kind === 'data') {
      field = buildJsonbTextExpr(filter?.path);
    } else {
      throw new Error(`[DB] Unsupported filter kind: "${kind}"`);
    }

    if (op === 'eq') {
      q = value === null ? q.is(field, null) : q.eq(field, value);
      continue;
    }

    if (op === 'is') {
      q = q.is(field, value);
      continue;
    }

    if (op === 'in') {
      const values = Array.isArray(value) ? value : [];
      if (values.length === 0) return { query: q, empty: true };
      q = q.in(field, values);
      continue;
    }

    if (op === 'gte') {
      q = q.gte(field, value);
      continue;
    }

    if (op === 'gt') {
      q = q.gt(field, value);
      continue;
    }

    if (op === 'lte') {
      q = q.lte(field, value);
      continue;
    }

    if (op === 'lt') {
      q = q.lt(field, value);
      continue;
    }

    throw new Error(`[DB] Unsupported filter operator: "${op}"`);
  }

  return { query: q, empty: false };
}

function getSupabaseClient() {
  if (supabase) return supabase;

  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required');
  }

  supabase = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return supabase;
}

async function ensureStoreReady() {
  if (readyChecked) return;
  if (readyPromise) return readyPromise;

  readyPromise = (async () => {
    const client = getSupabaseClient();
    const { error } = await client.from(TABLE_NAME).select('id', { head: true, count: 'exact' }).limit(1);
    if (!error) {
      logger.info('[DB] Supabase document store is ready', { table: TABLE_NAME });
      readyChecked = true;
      readyPromise = null;
      return;
    }

    const bootstrapSql =
      `create table if not exists public.${TABLE_NAME} (` +
      'model text not null,' +
      'id text not null,' +
      'data jsonb not null,' +
      'created_at timestamptz not null default now(),' +
      'updated_at timestamptz not null default now(),' +
      'primary key (model, id)' +
      ');' +
      `create index if not exists ${TABLE_NAME}_model_idx on public.${TABLE_NAME}(model);` +
      `create index if not exists ${TABLE_NAME}_model_created_at_idx on public.${TABLE_NAME}(model, created_at desc);` +
      `create index if not exists ${TABLE_NAME}_model_updated_at_idx on public.${TABLE_NAME}(model, updated_at desc);`;

    const message =
      `[DB] Supabase table "${TABLE_NAME}" is unavailable. ` +
      `Create it in SQL Editor with:\n${bootstrapSql}`;
    readyPromise = null;
    throw new Error(`${message}\nDetails: ${error.message}`);
  })();

  return readyPromise;
}

async function listDocuments(modelName) {
  const rows = [];
  let from = 0;

  while (true) {
    // eslint-disable-next-line no-await-in-loop
    const batch = await listDocumentsPage(modelName, { from, limit: PAGE_SIZE });
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function listDocumentsPage(
  modelName,
  {
    from = 0,
    limit = PAGE_SIZE,
    orderBy = 'id',
    ascending = true,
    thenOrderBy = null,
    thenAscending = true,
    filters = null,
  } = {}
) {
  const client = getSupabaseClient();
  const model = String(modelName || '').trim();
  if (!model) return [];

  const safeFrom = Math.max(0, Number(from) || 0);
  const safeLimit = Math.max(1, Number(limit) || PAGE_SIZE);
  const safeOrderBy = String(orderBy || 'id').trim() || 'id';
  const safeAscending = Boolean(ascending);
  const safeThenOrderBy = thenOrderBy ? String(thenOrderBy).trim() : null;
  const safeThenAscending = Boolean(thenAscending);

  let query = client.from(TABLE_NAME).select('id, data, created_at, updated_at').eq('model', model);

  const filtered = applyListFilters(query, filters);
  if (filtered.empty) return [];
  query = filtered.query;

  query = query.order(safeOrderBy, { ascending: safeAscending });
  if (safeThenOrderBy) {
    query = query.order(safeThenOrderBy, { ascending: safeThenAscending });
  }

  const { data, error } = await query.range(safeFrom, safeFrom + safeLimit - 1);

  if (error) {
    throw new Error(`[DB] Failed to read model "${model}": ${error.message}`);
  }

  const batch = Array.isArray(data) ? data : [];
  return batch.map((row) => ({
    id: String(row.id),
    data: deepClone(row.data || {}),
    createdAt: row.created_at ? new Date(row.created_at) : null,
    updatedAt: row.updated_at ? new Date(row.updated_at) : null,
  }));
}

async function countDocumentsExact(modelName) {
  const client = getSupabaseClient();
  const model = String(modelName || '').trim();
  if (!model) return 0;

  const { count, error } = await client
    .from(TABLE_NAME)
    .select('id', { head: true, count: 'exact' })
    .eq('model', model);

  if (error) {
    throw new Error(`[DB] Failed to count model "${model}": ${error.message}`);
  }

  return Math.max(0, Number(count) || 0);
}

async function countDocumentsWhere(modelName, { filters = null } = {}) {
  const client = getSupabaseClient();
  const model = String(modelName || '').trim();
  if (!model) return 0;

  let query = client.from(TABLE_NAME).select('id', { head: true, count: 'exact' }).eq('model', model);

  const filtered = applyListFilters(query, filters);
  if (filtered.empty) return 0;
  query = filtered.query;

  const { count, error } = await query;
  if (error) {
    throw new Error(`[DB] Failed to count model "${model}": ${error.message}`);
  }

  return Math.max(0, Number(count) || 0);
}

async function getDocument(modelName, id) {
  const client = getSupabaseClient();
  const model = String(modelName || '').trim();
  const docId = String(id || '').trim();
  if (!model || !docId) return null;

  const { data, error } = await client
    .from(TABLE_NAME)
    .select('id, data, created_at, updated_at')
    .eq('model', model)
    .eq('id', docId)
    .maybeSingle();

  if (error) {
    throw new Error(`[DB] Failed to read "${model}/${docId}": ${error.message}`);
  }

  if (!data) return null;
  return {
    id: String(data.id),
    data: deepClone(data.data || {}),
    createdAt: data.created_at ? new Date(data.created_at) : null,
    updatedAt: data.updated_at ? new Date(data.updated_at) : null,
  };
}

async function upsertDocument(modelName, id, data, opts = {}) {
  const client = getSupabaseClient();
  const model = String(modelName || '').trim();
  const docId = String(id || '').trim();
  if (!model || !docId) {
    throw new Error('[DB] upsertDocument requires model and id');
  }

  const nowIso = new Date().toISOString();
  const createdAtIso = opts.createdAt ? new Date(opts.createdAt).toISOString() : nowIso;
  const updatedAtIso = opts.updatedAt ? new Date(opts.updatedAt).toISOString() : nowIso;

  const payload = {
    model,
    id: docId,
    data: deepClone(data || {}),
    created_at: createdAtIso,
    updated_at: updatedAtIso,
  };

  const { error } = await client.from(TABLE_NAME).upsert(payload, {
    onConflict: 'model,id',
    ignoreDuplicates: false,
  });

  if (error) {
    throw new Error(`[DB] Failed to upsert "${model}/${docId}": ${error.message}`);
  }
}

async function insertDocument(modelName, id, data, opts = {}) {
  const client = getSupabaseClient();
  const model = String(modelName || '').trim();
  const docId = String(id || '').trim();
  if (!model || !docId) {
    throw new Error('[DB] insertDocument requires model and id');
  }

  const nowIso = new Date().toISOString();
  const createdAtIso = opts.createdAt ? new Date(opts.createdAt).toISOString() : nowIso;
  const updatedAtIso = opts.updatedAt ? new Date(opts.updatedAt).toISOString() : nowIso;

  const payload = {
    model,
    id: docId,
    data: deepClone(data || {}),
    created_at: createdAtIso,
    updated_at: updatedAtIso,
  };

  const { error } = await client.from(TABLE_NAME).insert(payload);
  if (error) {
    const wrapped = new Error(`[DB] Failed to insert "${model}/${docId}": ${error.message}`);
    wrapped.code = error.code || '';
    wrapped.details = error;
    throw wrapped;
  }
}

async function deleteDocument(modelName, id) {
  const client = getSupabaseClient();
  const model = String(modelName || '').trim();
  const docId = String(id || '').trim();
  if (!model || !docId) return;

  const { error } = await client.from(TABLE_NAME).delete().eq('model', model).eq('id', docId);
  if (error) {
    throw new Error(`[DB] Failed to delete "${model}/${docId}": ${error.message}`);
  }
}

module.exports = {
  ensureStoreReady,
  getSupabaseClient,
  getDocument,
  listDocuments,
  listDocumentsPage,
  countDocumentsExact,
  countDocumentsWhere,
  insertDocument,
  upsertDocument,
  deleteDocument,
};
