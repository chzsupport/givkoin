const { getSupabaseClient } = require('../lib/supabaseClient');

// Чёрный список забаненных юзеров — живёт в памяти сервера
// Админка добавляет бан → юзер выкидывается мгновенно через сокет
const bannedSet = new Set();

// Загрузка текущих забаненных из базы при старте сервера
async function loadBannedUsers() {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('status', 'banned');
    if (!error && Array.isArray(data)) {
      data.forEach(row => bannedSet.add(String(row.id)));
    }
    console.log(`[BAN] Loaded ${bannedSet.size} banned users into memory`);
  } catch (_err) {
    console.error('[BAN] Failed to load banned users');
  }
}

function isBanned(userId) {
  return bannedSet.has(String(userId));
}

function addBan(userId) {
  bannedSet.add(String(userId));
  console.log(`[BAN] User ${userId} added to blacklist`);
}

function removeBan(userId) {
  bannedSet.delete(String(userId));
  console.log(`[BAN] User ${userId} removed from blacklist`);
}

// Подписка на изменения в таблице users через Supabase Realtime (если доступно)
// Если Realtime нет — обновление через админку вручную
let realtimeChannel = null;

function subscribeToBanChanges() {
  try {
    const supabase = getSupabaseClient();
    if (!supabase.channel) return; // Realtime не поддерживается

    realtimeChannel = supabase
      .channel('ban-watcher')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'users',
      }, (payload) => {
        const id = String(payload?.new?.id || '');
        const status = String(payload?.new?.status || '');
        if (status === 'banned') addBan(id);
        else removeBan(id);
      })
      .subscribe();
    console.log('[BAN] Subscribed to realtime ban changes');
  } catch (_err) {
    console.log('[BAN] Realtime not available, using manual ban updates');
  }
}

function unsubscribeFromBanChanges() {
  if (realtimeChannel) {
    try {
      const supabase = getSupabaseClient();
      supabase.removeChannel(realtimeChannel);
    } catch (_err) {}
    realtimeChannel = null;
  }
}

// Функция для мгновенного выкидывания юзера через сокет
// Вызывается из админского маршрута бана
function forceLogoutUser(io, userId) {
  if (!io || !userId) return;
  addBan(userId);
  // Рассылаем всем сокетам — если юзер подключён, он получит и выйдет
  io.emit('force_logout', { userId, reason: 'banned' });
  console.log(`[BAN] Force logout sent for user ${userId}`);
}

module.exports = {
  loadBannedUsers,
  isBanned,
  addBan,
  removeBan,
  forceLogoutUser,
  subscribeToBanChanges,
  unsubscribeFromBanChanges,
};
