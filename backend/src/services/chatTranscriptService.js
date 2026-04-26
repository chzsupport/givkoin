const fs = require('fs/promises');
const path = require('path');
const { getSupabaseClient } = require('../lib/supabaseClient');
const { getDocById, listDocsByModel, toIso, upsertDoc } = require('./documentStore');

const STATE_MODEL = 'ChatTranscriptState';
const TRANSCRIPT_DIR = path.resolve(__dirname, '../../tmp/chat-transcripts');
const BUFFER_FLUSH_INTERVAL_MS = 10 * 1000;
const BUFFER_FLUSH_MESSAGE_COUNT = 5;

const transcriptBuffers = new Map();
const transcriptStateCache = new Map();
const transcriptStateInflight = new Map();
let transcriptDirReady = null;

function buildStateDocId(chatId) {
  return `chat_transcript_state:${String(chatId)}`;
}

function buildTranscriptPath(chatId) {
  return path.join(TRANSCRIPT_DIR, `${String(chatId)}.jsonl`);
}

async function ensureTranscriptDir() {
  if (!transcriptDirReady) {
    transcriptDirReady = fs.mkdir(TRANSCRIPT_DIR, { recursive: true })
      .catch((error) => {
        transcriptDirReady = null;
        throw error;
      });
  }
  await transcriptDirReady;
}

function cloneState(state) {
  if (!state || typeof state !== 'object') return state;
  return { ...state };
}

function getCachedTranscriptState(chatId) {
  const cached = transcriptStateCache.get(String(chatId));
  return cached ? cloneState(cached) : null;
}

function setCachedTranscriptState(chatId, state) {
  const key = String(chatId);
  if (!state) {
    transcriptStateCache.delete(key);
    return null;
  }
  const cloned = cloneState(state);
  transcriptStateCache.set(key, cloned);
  return cloneState(cloned);
}

async function loadTranscriptState(chatId, { force = false } = {}) {
  const key = String(chatId);
  if (!force) {
    const cached = getCachedTranscriptState(key);
    if (cached) return cached;
    const inflight = transcriptStateInflight.get(key);
    if (inflight) return inflight;
  }

  const promise = getDocById(buildStateDocId(key))
    .then((state) => setCachedTranscriptState(key, state))
    .finally(() => {
      transcriptStateInflight.delete(key);
    });

  transcriptStateInflight.set(key, promise);
  return promise;
}

async function getTranscriptState(chatId) {
  return loadTranscriptState(chatId);
}

function getBuffer(chatId) {
  const key = String(chatId);
  const existing = transcriptBuffers.get(key);
  if (existing) return existing;
  const next = {
    messages: [],
    timeoutId: null,
    filePath: null,
    lastActivityAt: null,
    lastMessageAt: null,
  };
  transcriptBuffers.set(key, next);
  return next;
}

function clearBufferTimer(chatId) {
  const buffer = transcriptBuffers.get(String(chatId));
  if (!buffer?.timeoutId) return;
  clearTimeout(buffer.timeoutId);
  buffer.timeoutId = null;
}

async function writeState(chatId, patch, now = new Date()) {
  const existing = await loadTranscriptState(chatId);
  const data = {
    chatId: String(chatId),
    mode: 'temp_file',
    filePath: buildTranscriptPath(chatId),
    status: 'active',
    autoResolveAt: null,
    persistedAt: null,
    ...existing,
    ...patch,
  };
  const saved = await upsertDoc({
    id: buildStateDocId(chatId),
    model: STATE_MODEL,
    data,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  });
  return setCachedTranscriptState(chatId, saved);
}

async function ensureTranscriptState(chatId) {
  await ensureTranscriptDir();
  const existing = await loadTranscriptState(chatId);
  if (existing) return existing;
  return writeState(chatId, { filePath: buildTranscriptPath(chatId), status: 'active' });
}

async function touchChatActivity(chatId, patch = {}, now = new Date()) {
  const nowIso = toIso(now);
  await ensureTranscriptState(chatId);
  return writeState(chatId, {
    lastActivityAt: nowIso,
    ...patch,
  }, now);
}

async function flushBufferedMessages(chatId) {
  const key = String(chatId);
  const buffer = transcriptBuffers.get(key);
  clearBufferTimer(key);
  if (!buffer || !Array.isArray(buffer.messages) || buffer.messages.length === 0) {
    return { flushed: 0 };
  }

  const state = await ensureTranscriptState(chatId);
  const filePath = buffer.filePath || state.filePath || buildTranscriptPath(chatId);
  const lines = buffer.messages.map((message) => `${JSON.stringify(message)}\n`).join('');
  const lastMessage = buffer.messages[buffer.messages.length - 1];
  const lastActivityAt = buffer.lastActivityAt || toIso(lastMessage?.createdAt || new Date());
  const lastMessageAt = buffer.lastMessageAt || toIso(lastMessage?.createdAt || new Date());

  await ensureTranscriptDir();
  await fs.appendFile(filePath, lines, 'utf8');
  buffer.messages = [];
  buffer.filePath = filePath;
  buffer.lastActivityAt = null;
  buffer.lastMessageAt = null;

  await writeState(chatId, {
    filePath,
    status: state.status || 'active',
    lastActivityAt,
    lastMessageAt,
  }, new Date());

  return { flushed: lines.length > 0 ? 1 : 0 };
}

function scheduleBufferFlush(chatId) {
  const buffer = getBuffer(chatId);
  if (buffer.timeoutId) return;
  buffer.timeoutId = setTimeout(() => {
    flushBufferedMessages(chatId).catch(() => { });
  }, BUFFER_FLUSH_INTERVAL_MS);
}

function parseTranscriptLine(line) {
  try {
    return JSON.parse(line);
  } catch (_error) {
    return null;
  }
}

function parseTranscriptLines(lines = []) {
  return lines
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .map((line) => parseTranscriptLine(line))
    .filter(Boolean);
}

async function readTailLines(filePath, limit = 500) {
  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 500));
  const handle = await fs.open(filePath, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.size) return [];

    let position = stat.size;
    let newlineCount = 0;
    const chunkSize = 64 * 1024;
    const chunks = [];

    while (position > 0 && newlineCount <= safeLimit) {
      const readSize = Math.min(chunkSize, position);
      position -= readSize;
      const buffer = Buffer.alloc(readSize);
      const { bytesRead } = await handle.read(buffer, 0, readSize, position);
      if (!bytesRead) break;
      const chunk = buffer.subarray(0, bytesRead);
      chunks.unshift(chunk);
      for (let index = 0; index < bytesRead; index += 1) {
        if (chunk[index] === 10) {
          newlineCount += 1;
        }
      }
    }

    const raw = Buffer.concat(chunks).toString('utf8');
    return raw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-safeLimit);
  } finally {
    await handle.close();
  }
}

async function appendMessage(chatId, message) {
  const now = new Date();
  const state = await ensureTranscriptState(chatId);
  const buffer = getBuffer(chatId);
  buffer.filePath = state.filePath || buildTranscriptPath(chatId);
  buffer.messages.push(message);
  buffer.lastActivityAt = toIso(now);
  buffer.lastMessageAt = toIso(message.createdAt || now);

  if (buffer.messages.length >= BUFFER_FLUSH_MESSAGE_COUNT) {
    await flushBufferedMessages(chatId);
    return;
  }

  scheduleBufferFlush(chatId);
}

async function readTempMessages(chatId, { since, limit = 500, tailOnly = false } = {}) {
  const state = await getTranscriptState(chatId);
  const filePath = state?.filePath || buildTranscriptPath(chatId);
  try {
    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 500));
    const lines = tailOnly && !since
      ? await readTailLines(filePath, safeLimit)
      : (await fs.readFile(filePath, 'utf8'))
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    const parsed = parseTranscriptLines(lines);
    if (!since) {
      return tailOnly ? parsed.slice(-safeLimit) : parsed;
    }

    const sinceDate = new Date(since);
    return parsed
      .filter((msg) => {
        const createdAt = new Date(msg.createdAt || 0);
        if (Number.isNaN(createdAt.getTime())) return true;
        return createdAt > sinceDate;
      })
      .slice(-safeLimit);
  } catch (_error) {
    return [];
  }
}

function listBufferedMessages(chatId) {
  const buffer = transcriptBuffers.get(String(chatId));
  if (!buffer || !Array.isArray(buffer.messages)) return [];
  return [...buffer.messages];
}

async function listPersistentMessages(chatId, { since, limit = 500 } = {}) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('chat_messages')
    .select('*')
    .eq('chat_id', String(chatId));
  if (since) {
    query = query.gt('created_at', new Date(since).toISOString());
  }
  const { data, error } = await query
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(1000, Number(limit) || 500)));
  if (error || !Array.isArray(data)) return [];
  return data.map((row) => ({
    _id: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    originalText: row.original_text,
    translatedText: row.translated_text,
    originalLang: row.original_lang,
    targetLang: row.target_lang,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

async function listMessages(chatId, { since, limit = 500 } = {}) {
  const state = await getTranscriptState(chatId);
  if (state?.persistedAt) {
    return listPersistentMessages(chatId, { since, limit });
  }

  if (!state) {
    return listPersistentMessages(chatId, { since, limit });
  }

  const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 500));
  const tempMessages = await readTempMessages(chatId, {
    since,
    limit: safeLimit,
    tailOnly: !since,
  });
  const bufferedMessages = listBufferedMessages(chatId);
  const combined = [...tempMessages, ...bufferedMessages];
  if (!since) {
    return combined.slice(-safeLimit);
  }
  const sinceDate = new Date(since);
  return combined
    .filter((msg) => {
      const createdAt = new Date(msg.createdAt || 0);
      if (Number.isNaN(createdAt.getTime())) return true;
      return createdAt > sinceDate;
    })
    .slice(-safeLimit);
}

async function captureSnapshot(chatId, limit = 50) {
  const messages = await listMessages(chatId, { limit });
  return messages
    .slice(-Math.max(1, Math.min(200, Number(limit) || 50)))
    .map((message) => ({
      sender: String(message.senderId || 'unknown'),
      content: String(message.originalText || message.translatedText || ''),
      sentAt: message.createdAt || null,
    }));
}

async function persistTranscript(chatId) {
  const state = await ensureTranscriptState(chatId);
  if (state.persistedAt) return { persisted: false, reason: 'already_persisted' };
  await flushBufferedMessages(chatId);

  const messages = await readTempMessages(chatId);
  if (messages.length) {
    const supabase = getSupabaseClient();
    const payload = messages.map((message) => ({
      id: String(message._id),
      chat_id: String(chatId),
      sender_id: String(message.senderId),
      original_text: String(message.originalText || ''),
      translated_text: message.translatedText || null,
      original_lang: message.originalLang || null,
      target_lang: message.targetLang || null,
      status: message.status || 'sent',
      created_at: toIso(message.createdAt || new Date()),
      updated_at: toIso(message.updatedAt || message.createdAt || new Date()),
    }));
    await supabase.from('chat_messages').upsert(payload, { onConflict: 'id' });
  }

  try {
    await fs.unlink(state.filePath || buildTranscriptPath(chatId));
  } catch (_error) {
    // ignore missing file
  }

  await writeState(chatId, {
    status: 'persisted',
    persistedAt: new Date().toISOString(),
  });

  return { persisted: true, messages: messages.length };
}

async function markForAppeal(chatId, autoResolveAt) {
  await persistTranscript(chatId);
  await writeState(chatId, {
    status: 'complaint_pending',
    autoResolveAt: autoResolveAt ? toIso(autoResolveAt) : null,
  });
}

async function cleanupTranscript(chatId) {
  clearBufferTimer(chatId);
  transcriptBuffers.delete(String(chatId));
  const state = await ensureTranscriptState(chatId);
  try {
    await fs.unlink(state.filePath || buildTranscriptPath(chatId));
  } catch (_error) {
    // ignore missing file
  }
  await writeState(chatId, {
    status: 'deleted',
    autoResolveAt: null,
  });
}

async function cleanupExpiredTranscripts(now = new Date()) {
  const rows = await listDocsByModel(STATE_MODEL, { limit: 2000 });
  const nowMs = now.getTime();
  let cleaned = 0;

  for (const row of rows) {
    if (row.persistedAt) continue;
    if (row.status !== 'complaint_pending') continue;
    const autoResolveAtMs = row.autoResolveAt ? new Date(row.autoResolveAt).getTime() : null;
    if (autoResolveAtMs == null || Number.isNaN(autoResolveAtMs) || autoResolveAtMs > nowMs) continue;
    await cleanupTranscript(row.chatId);
    cleaned += 1;
  }

  return { cleaned };
}

module.exports = {
  appendMessage,
  captureSnapshot,
  cleanupExpiredTranscripts,
  cleanupTranscript,
  ensureTranscriptState,
  flushBufferedMessages,
  getTranscriptState,
  listMessages,
  markForAppeal,
  persistTranscript,
  touchChatActivity,
};
