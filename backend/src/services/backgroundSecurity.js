const { getSupabaseClient } = require('../lib/supabaseClient');
const { handleAuthenticatedSessionMultiAccount } = require('./multiAccountService');

const LAST_ONLINE_INTERVAL_MS = 60 * 1000; // Запись last_online раз в 60 сек
const SECURITY_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Проверка мультиаккаунта раз в 5 мин
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // Очистка устаревших записей

// Очередь юзеров для обновления last_online_at
const pendingOnlineUpdates = new Map(); // userId -> { lastIp, lastDeviceId, lastFingerprint, lastWeakFingerprint, queuedAt }

// Очередь юзеров для фоновой проверки мультиаккаунта
const pendingSecurityChecks = new Map(); // userId -> { signals, queuedAt }

let isRunning = false;
let onlineTimer = null;
let securityTimer = null;

function queueOnlineUpdate(userId, data) {
  if (!userId) return;
  pendingOnlineUpdates.set(String(userId), {
    ...data,
    queuedAt: Date.now(),
  });
}

function queueSecurityCheck(userId, signals) {
  if (!userId) return;
  pendingSecurityChecks.set(String(userId), {
    signals,
    queuedAt: Date.now(),
  });
}

async function flushOnlineUpdates() {
  if (!pendingOnlineUpdates.size) return;
  const batch = new Map(pendingOnlineUpdates);
  pendingOnlineUpdates.clear();

  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();

  for (const [userId, data] of batch) {
    try {
      const update = {
        last_online_at: nowIso,
        last_ip: data.lastIp || null,
        last_device_id: data.lastDeviceId || null,
        last_fingerprint: data.lastFingerprint || null,
      };
      // data-поле обновляем отдельно если есть
      if (data.lastWeakFingerprint || data.lastSecuritySignalCheckAt) {
        const { data: existing } = await supabase
          .from('users')
          .select('data')
          .eq('id', userId)
          .maybeSingle();
        const currentData = (existing?.data && typeof existing.data === 'object') ? existing.data : {};
        update.data = {
          ...currentData,
          ...(data.lastWeakFingerprint ? { lastWeakFingerprint: data.lastWeakFingerprint } : {}),
          ...(data.lastSecuritySignalCheckAt ? { lastSecuritySignalCheckAt: data.lastSecuritySignalCheckAt } : {}),
        };
      }
      await supabase
        .from('users')
        .update({ ...update, updated_at: nowIso })
        .eq('id', userId);
    } catch (_err) {
      // Тихо пропускаем — обновление last_online не критично
    }
  }
}

async function flushSecurityChecks() {
  if (!pendingSecurityChecks.size) return;
  const batch = new Map(pendingSecurityChecks);
  pendingSecurityChecks.clear();

  for (const [userId, data] of batch) {
    try {
      await handleAuthenticatedSessionMultiAccount({
        user: data.signals?.user || { _id: userId },
        req: data.signals?.req || null,
        signals: data.signals || {},
      });
    } catch (_err) {
      // Тихо пропускаем — фоновая проверка не должна ломать сервер
    }
  }
}

function start() {
  if (isRunning) return;
  isRunning = true;

  onlineTimer = setInterval(() => {
    flushOnlineUpdates().catch(() => {});
  }, LAST_ONLINE_INTERVAL_MS);

  securityTimer = setInterval(() => {
    flushSecurityChecks().catch(() => {});
  }, SECURITY_CHECK_INTERVAL_MS);

  // Очистка устаревших записей
  setInterval(() => {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 минут
    for (const [userId, data] of pendingOnlineUpdates) {
      if (now - data.queuedAt > maxAge) pendingOnlineUpdates.delete(userId);
    }
    for (const [userId, data] of pendingSecurityChecks) {
      if (now - data.queuedAt > maxAge) pendingSecurityChecks.delete(userId);
    }
  }, CLEANUP_INTERVAL_MS);

  console.log('[BG] Background security service started');
}

function stop() {
  isRunning = false;
  if (onlineTimer) { clearInterval(onlineTimer); onlineTimer = null; }
  if (securityTimer) { clearInterval(securityTimer); securityTimer = null; }
  console.log('[BG] Background security service stopped');
}

module.exports = {
  start,
  stop,
  queueOnlineUpdate,
  queueSecurityCheck,
  flushOnlineUpdates,
  flushSecurityChecks,
};
