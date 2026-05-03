'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/context/I18nContext';
import {
  readActiveBattleLock,
  subscribeActiveBattleLock,
  type ActiveBattleLock,
} from '@/utils/activeBattleLock';
import { normalizeSitePath, pathStartsWith } from '@/utils/sitePath';

type ActiveBattleContextType = {
  activeBattle: ActiveBattleLock | null;
  checkActiveBattle: () => void;
};

const ActiveBattleContext = createContext<ActiveBattleContextType | undefined>(undefined);
const ACTIVE_BATTLE_LOCK_RECHECK_MS = 2000;

export function ActiveBattleProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { localePath } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const cleanPathname = normalizeSitePath(pathname || '/');
  const userId = String(user?._id || user?.id || '').trim();
  const [activeBattle, setActiveBattle] = useState<ActiveBattleLock | null>(null);

  const readUserBattleLock = useCallback(() => {
    if (!userId) return null;
    const lock = readActiveBattleLock();
    if (!lock || lock.userId !== userId) return null;
    return lock;
  }, [userId]);

  const syncActiveBattle = useCallback(() => {
    const lock = readUserBattleLock();
    setActiveBattle(lock);

    if (!lock) return;
    if (pathStartsWith(cleanPathname, '/battle')) return;

    router.replace(localePath('/battle'));
  }, [cleanPathname, localePath, readUserBattleLock, router]);

  useEffect(() => {
    syncActiveBattle();
  }, [syncActiveBattle]);

  useEffect(() => {
    const unsubscribe = subscribeActiveBattleLock(syncActiveBattle);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncActiveBattle();
      }
    };

    const interval = window.setInterval(syncActiveBattle, ACTIVE_BATTLE_LOCK_RECHECK_MS);
    window.addEventListener('focus', syncActiveBattle);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      unsubscribe();
      window.clearInterval(interval);
      window.removeEventListener('focus', syncActiveBattle);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [syncActiveBattle]);

  const value = useMemo(
    () => ({ activeBattle, checkActiveBattle: syncActiveBattle }),
    [activeBattle, syncActiveBattle],
  );

  return (
    <ActiveBattleContext.Provider value={value}>
      {children}
    </ActiveBattleContext.Provider>
  );
}

export function useActiveBattle() {
  const context = useContext(ActiveBattleContext);
  if (context === undefined) {
    throw new Error('useActiveBattle must be used within an ActiveBattleProvider');
  }
  return context;
}
