const crypto = require('crypto');
const { once } = require('events');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { getSupabaseClient } = require('../lib/supabaseClient');

const RESTORE_INSERT_BATCH = 500;

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function writeChunk(stream, chunk) {
  if (stream.write(chunk)) return;
  await once(stream, 'drain');
}

async function closeWritable(stream) {
  stream.end();
  await once(stream, 'finish');
}

async function gzipFile(sourcePath, targetPath) {
  const gzip = zlib.createGzip({ level: 9 });
  const source = fs.createReadStream(sourcePath);
  const target = fs.createWriteStream(targetPath);

  source.pipe(gzip).pipe(target);

  await Promise.all([
    once(source, 'end'),
    once(target, 'finish'),
  ]);
}

async function collectAllModelsSnapshot() {
  const TABLES = ['users', 'user_sessions', 'auth_events', 'referrals', 'transactions', 'activity_logs'];
  const snapshot = {
    generatedAt: new Date().toISOString(),
    collections: {},
  };

  const supabase = getSupabaseClient();
  for (const table of TABLES) {
    const pageSize = 1000;
    let from = 0;
    const docs = [];
    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .range(from, from + pageSize - 1);
      if (error || !Array.isArray(data) || !data.length) break;
      docs.push(...data);
      if (data.length < pageSize) break;
      from += pageSize;
    }

    snapshot.collections[table] = {
      count: docs.length,
      docs,
    };
  }

  return snapshot;
}

async function createFullBackup() {
  const runtimeDir = path.join(__dirname, '..', '..', 'runtime');
  const backupDir = path.join(runtimeDir, 'backups');
  ensureDir(backupDir);

  const backupId = crypto.randomBytes(8).toString('hex');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const jsonPath = path.join(backupDir, `backup-${stamp}-${backupId}.json`);
  const gzipPath = `${jsonPath}.gz`;
  const generatedAt = new Date().toISOString();
  const jsonStream = fs.createWriteStream(jsonPath, { encoding: 'utf8' });

  let collections = 0;
  let totalDocuments = 0;
  let wroteCollection = false;

  const TABLES = ['users', 'user_sessions', 'auth_events', 'referrals', 'transactions', 'activity_logs'];
  const supabase = getSupabaseClient();

  async function writeTableSnapshotToStream(stream, tableName) {
    await writeChunk(stream, `"${tableName}":{"docs":[`);

    let count = 0;
    let wroteDoc = false;
    const docsChunks = [];
    const pageSize = 1000;
    let from = 0;

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .range(from, from + pageSize - 1);
      if (error || !Array.isArray(data) || !data.length) break;

      for (const doc of data) {
        docsChunks.push(wroteDoc ? ',' : '');
        wroteDoc = true;
        docsChunks.push(JSON.stringify(doc));
        count += 1;

        if (docsChunks.length >= 64) {
          // eslint-disable-next-line no-await-in-loop
          await writeChunk(stream, docsChunks.join(''));
          docsChunks.length = 0;
        }
      }

      if (data.length < pageSize) break;
      from += pageSize;
    }

    if (docsChunks.length) {
      await writeChunk(stream, docsChunks.join(''));
    }
    await writeChunk(stream, `],"count":${count}}`);

    return count;
  }

  try {
    await writeChunk(jsonStream, `{"generatedAt":"${generatedAt}","collections":{`);

    for (const table of TABLES) {
      if (wroteCollection) {
        // eslint-disable-next-line no-await-in-loop
        await writeChunk(jsonStream, ',');
      }
      wroteCollection = true;
      // eslint-disable-next-line no-await-in-loop
      const count = await writeTableSnapshotToStream(jsonStream, table);
      collections += 1;
      totalDocuments += count;
    }

    await writeChunk(jsonStream, '}}');
    await closeWritable(jsonStream);
    await gzipFile(jsonPath, gzipPath);
  } catch (error) {
    jsonStream.destroy();
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath);
    if (fs.existsSync(gzipPath)) fs.unlinkSync(gzipPath);
    throw error;
  }

  const jsonStat = fs.statSync(jsonPath);
  const gzStat = fs.statSync(gzipPath);

  return {
    backupId,
    jsonPath,
    gzipPath,
    collections,
    totalDocuments,
    sizeBytes: {
      json: jsonStat.size,
      gzip: gzStat.size,
    },
  };
}

function getBackupDirectory() {
  const runtimeDir = path.join(__dirname, '..', '..', 'runtime');
  const backupDir = path.join(runtimeDir, 'backups');
  ensureDir(backupDir);
  return backupDir;
}

function parseBackupIdFromFilename(name) {
  const match = String(name || '').match(/-(?<id>[a-f0-9]{16})\.json(\.gz)?$/i);
  return match?.groups?.id || '';
}

function readBackupSnapshot(backupPath) {
  const ext = path.extname(backupPath).toLowerCase();
  const isGz = ext === '.gz';
  const raw = fs.readFileSync(backupPath);
  const payload = isGz ? zlib.gunzipSync(raw) : raw;
  return JSON.parse(payload.toString('utf8'));
}

function findBackupFileById(backupId) {
  const backupDir = getBackupDirectory();
  const files = fs.readdirSync(backupDir).filter((name) => name.endsWith('.json') || name.endsWith('.json.gz'));
  const hit = files.find((name) => parseBackupIdFromFilename(name) === String(backupId || '').trim());
  if (!hit) return null;
  return path.join(backupDir, hit);
}

async function restoreFullBackup({ backupId, backupPath } = {}) {
  const chosenPath = backupPath || findBackupFileById(backupId);
  if (!chosenPath || !fs.existsSync(chosenPath)) {
    const err = new Error('Backup file not found');
    err.status = 404;
    throw err;
  }

  const snapshot = readBackupSnapshot(chosenPath);
  const collections = snapshot?.collections && typeof snapshot.collections === 'object'
    ? snapshot.collections
    : {};

  const restored = [];
  const TABLES = ['users', 'user_sessions', 'auth_events', 'referrals', 'transactions', 'activity_logs'];
  const INSERT_ORDER = ['users', 'user_sessions', 'auth_events', 'referrals', 'transactions', 'activity_logs'];
  const DELETE_ORDER = ['activity_logs', 'transactions', 'referrals', 'auth_events', 'user_sessions', 'users'];
  const supabase = getSupabaseClient();

  const deleteAllRows = async (tableName) => {
    if (tableName === 'users') {
      const { error } = await supabase.from('users').delete().neq('id', '__never__');
      if (error) throw error;
      return;
    }
    if (tableName === 'user_sessions') {
      const { error } = await supabase.from('user_sessions').delete().neq('session_id', '__never__');
      if (error) throw error;
      return;
    }
    const { error } = await supabase.from(tableName).delete().gt('id', 0);
    if (error) throw error;
  };

  for (const table of DELETE_ORDER) {
    // eslint-disable-next-line no-await-in-loop
    await deleteAllRows(table);
  }

  for (const table of INSERT_ORDER) {
    const payload = collections[table];
    if (!payload) {
      restored.push({ modelName: table, skipped: true, reason: 'missing_in_backup' });
      continue;
    }
    const docs = Array.isArray(payload?.docs) ? payload.docs : [];

    if (docs.length > 0) {
      for (let index = 0; index < docs.length; index += RESTORE_INSERT_BATCH) {
        const batch = docs.slice(index, index + RESTORE_INSERT_BATCH);
        // eslint-disable-next-line no-await-in-loop
        const { error: insertError } = await supabase.from(table).insert(batch);
        if (insertError) throw insertError;
      }
    }

    restored.push({ modelName: table, count: docs.length });
  }

  return {
    source: chosenPath,
    backupId: backupId || parseBackupIdFromFilename(path.basename(chosenPath)) || null,
    collections: restored.length,
    restored,
    restoredAt: new Date(),
  };
}

function listBackups({ limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 100));
  const backupDir = getBackupDirectory();
  const files = fs.readdirSync(backupDir)
    .filter((name) => name.endsWith('.json') || name.endsWith('.json.gz'))
    .map((name) => {
      const fullPath = path.join(backupDir, name);
      const stat = fs.statSync(fullPath);
      return {
        fileName: name,
        backupId: parseBackupIdFromFilename(name) || null,
        fullPath,
        size: stat.size,
        createdAt: stat.birthtime || stat.mtime,
        updatedAt: stat.mtime,
        compressed: name.endsWith('.gz'),
      };
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, safeLimit);

  return files;
}

module.exports = {
  createFullBackup,
  restoreFullBackup,
  listBackups,
};
