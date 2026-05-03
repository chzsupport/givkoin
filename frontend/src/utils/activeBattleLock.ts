'use client';

export type ActiveBattleLock = {
  battleId: string;
  userId: string;
  tabId: string;
  updatedAt: number;
  expiresAt: number;
};

export const ACTIVE_BATTLE_LOCK_KEY = 'givkoin_active_battle';
export const ACTIVE_BATTLE_LOCK_EVENT = 'givkoin:active-battle-lock';

const ACTIVE_BATTLE_MIN_TTL_MS = 30_000;
const ACTIVE_BATTLE_END_GRACE_MS = 10_000;
const ACTIVE_BATTLE_TAB_ID_KEY = 'givkoin_battle_tab_id';

function safeNow() {
  return Date.now();
}

function notifyActiveBattleLockChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(ACTIVE_BATTLE_LOCK_EVENT));
}

function createFallbackId() {
  return `tab_${safeNow()}_${Math.random().toString(16).slice(2)}`;
}

export function getActiveBattleTabId() {
  if (typeof window === 'undefined') return createFallbackId();

  try {
    const existing = window.sessionStorage.getItem(ACTIVE_BATTLE_TAB_ID_KEY);
    if (existing) return existing;

    const next = typeof window.crypto?.randomUUID === 'function'
      ? window.crypto.randomUUID()
      : createFallbackId();
    window.sessionStorage.setItem(ACTIVE_BATTLE_TAB_ID_KEY, next);
    return next;
  } catch {
    return createFallbackId();
  }
}

export function readActiveBattleLock(now = safeNow()): ActiveBattleLock | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(ACTIVE_BATTLE_LOCK_KEY);
    if (!raw) return null;

    const row = JSON.parse(raw) as Partial<ActiveBattleLock>;
    const battleId = String(row.battleId || '').trim();
    const userId = String(row.userId || '').trim();
    const tabId = String(row.tabId || '').trim();
    const updatedAt = Math.max(0, Math.floor(Number(row.updatedAt) || 0));
    const expiresAt = Math.max(0, Math.floor(Number(row.expiresAt) || 0));

    if (!battleId || !userId || !tabId || !expiresAt || expiresAt <= now) {
      window.localStorage.removeItem(ACTIVE_BATTLE_LOCK_KEY);
      notifyActiveBattleLockChanged();
      return null;
    }

    return { battleId, userId, tabId, updatedAt, expiresAt };
  } catch {
    try {
      window.localStorage.removeItem(ACTIVE_BATTLE_LOCK_KEY);
      notifyActiveBattleLockChanged();
    } catch {
      // ignore
    }
    return null;
  }
}

export function publishActiveBattleLock({
  battleId,
  userId,
  battleEndsAtMs,
}: {
  battleId: string;
  userId: string;
  battleEndsAtMs?: number | null;
}) {
  if (typeof window === 'undefined') return;

  const safeBattleId = String(battleId || '').trim();
  const safeUserId = String(userId || '').trim();
  if (!safeBattleId || !safeUserId) return;

  const now = safeNow();
  const endsAt = Number(battleEndsAtMs);
  const expiresAt = Number.isFinite(endsAt) && endsAt > now
    ? Math.max(now + ACTIVE_BATTLE_MIN_TTL_MS, Math.floor(endsAt) + ACTIVE_BATTLE_END_GRACE_MS)
    : now + ACTIVE_BATTLE_MIN_TTL_MS;

  const lock: ActiveBattleLock = {
    battleId: safeBattleId,
    userId: safeUserId,
    tabId: getActiveBattleTabId(),
    updatedAt: now,
    expiresAt,
  };

  try {
    window.localStorage.setItem(ACTIVE_BATTLE_LOCK_KEY, JSON.stringify(lock));
    notifyActiveBattleLockChanged();
  } catch {
    // ignore
  }
}

export function clearActiveBattleLock({
  battleId,
  userId,
}: {
  battleId?: string | null;
  userId?: string | null;
} = {}) {
  if (typeof window === 'undefined') return;

  try {
    const current = readActiveBattleLock();
    if (!current) return;

    const safeBattleId = String(battleId || '').trim();
    const safeUserId = String(userId || '').trim();
    if (safeBattleId && current.battleId !== safeBattleId) return;
    if (safeUserId && current.userId !== safeUserId) return;

    window.localStorage.removeItem(ACTIVE_BATTLE_LOCK_KEY);
    notifyActiveBattleLockChanged();
  } catch {
    // ignore
  }
}

export function subscribeActiveBattleLock(listener: () => void) {
  if (typeof window === 'undefined') return () => {};

  const onStorage = (event: StorageEvent) => {
    if (event.key === ACTIVE_BATTLE_LOCK_KEY) listener();
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener(ACTIVE_BATTLE_LOCK_EVENT, listener);

  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(ACTIVE_BATTLE_LOCK_EVENT, listener);
  };
}
