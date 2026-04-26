'use client';

import { apiGet } from '@/utils/api';

type CacheEnvelope<T> = {
  savedAt: number;
  value: T;
};

export type CachedBridge = {
  _id: string;
  fromCountry: string;
  toCountry: string;
  status: 'building' | 'completed' | 'planning';
  currentStones: number;
  requiredStones: number;
  contributors: { user?: { _id: string; nickname: string } | null; stones: number }[];
  createdAt: string;
  updatedAt: string;
  lastContributionAt?: string;
};

export type CachedBridgeListResponse = {
  bridges: CachedBridge[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
};

export type CachedBridgeStats = {
  createdToday: number;
  stonesToday: number;
  limits: {
    newBridgesPerDay: number;
    existingBridgeStonesPerDay: number;
  };
  serverNow?: string;
};

export type CachedNewsPost = {
  _id: string;
  title: string;
  content: string;
  translations?: {
    en?: {
      title?: string;
      content?: string;
    };
  };
  publishedAt: string;
  mediaUrl?: string;
  author?: string;
  tags?: string[];
  stats?: {
    likes: number;
    comments: number;
    reposts: number;
  };
  isViewed?: boolean;
  isLiked?: boolean;
  isReposted?: boolean;
};

export type CachedNewsFeedResponse = {
  items: CachedNewsPost[];
  nextCursor?: string | null;
  hasMore?: boolean;
  viewBatchKey?: string | null;
  viewBatchKeys?: Record<string, string>;
};

export type CachedNewsLimits = {
  likesPerPost: number;
  repostsPerPost: number;
  commentsPerPost: number;
  postIntervalMinutes?: number;
};

export type CachedDailyStreakState = {
  serverDay: string;
  cycleStartDay: string | null;
  claimedDays: number[];
  missedDays: number[];
  questDoneDays: number[];
  lastSeenServerDay: string | null;
  lastWelcomeShownServerDay: string | null;
  currentDayIndex: number;
  today: {
    day: number;
    tasks: {
      energyCollected: boolean;
      bridgeStoneLaid: boolean;
      rouletteSpins3: boolean;
    };
    claim: {
      clickedToday: boolean;
    };
    quest: {
      completedToday: boolean;
    };
  };
};

const STORAGE_PREFIX = 'givkoin_session_cache';
const memoryCache = new Map<string, CacheEnvelope<unknown>>();
const inflightWarmups = new Map<string, Promise<void>>();
const warmedUsers = new Set<string>();
type WarmupTask = () => Promise<void>;
type WarmupStage = {
  delayMs: number;
  tasks: WarmupTask[];
};

function isBrowser() {
  return typeof window !== 'undefined';
}

function canRunWarmup() {
  return isBrowser() && document.visibilityState !== 'hidden' && window.navigator.onLine !== false;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function buildKey(scope: string, userId: string) {
  return `${STORAGE_PREFIX}:${scope}:${userId}`;
}

function readCache<T>(scope: string, userId: string): T | null {
  if (!isBrowser() || !userId) return null;
  const key = buildKey(scope, userId);
  const fromMemory = memoryCache.get(key);
  if (fromMemory) {
    return fromMemory.value as T;
  }

  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;
    if (!parsed || typeof parsed !== 'object' || !('value' in parsed)) return null;
    memoryCache.set(key, parsed as CacheEnvelope<unknown>);
    return parsed.value;
  } catch {
    return null;
  }
}

function writeCache<T>(scope: string, userId: string, value: T) {
  if (!isBrowser() || !userId) return;
  const key = buildKey(scope, userId);
  const envelope: CacheEnvelope<T> = {
    savedAt: Date.now(),
    value,
  };
  memoryCache.set(key, envelope as CacheEnvelope<unknown>);
  try {
    window.sessionStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // ignore session storage quota errors
  }
}

export function getCachedBridgeList(userId: string, tab: 'building' | 'my' | 'completed') {
  return readCache<CachedBridgeListResponse>(`bridges:list:${tab}`, userId);
}

export function setCachedBridgeList(userId: string, tab: 'building' | 'my' | 'completed', value: CachedBridgeListResponse) {
  writeCache(`bridges:list:${tab}`, userId, value);
}

export function getCachedBridgeStats(userId: string) {
  return readCache<CachedBridgeStats>('bridges:stats', userId);
}

export function setCachedBridgeStats(userId: string, value: CachedBridgeStats) {
  writeCache('bridges:stats', userId, value);
}

export function getCachedNewsFeed(userId: string) {
  return readCache<CachedNewsFeedResponse>('news:feed', userId);
}

export function setCachedNewsFeed(userId: string, value: CachedNewsFeedResponse) {
  writeCache('news:feed', userId, value);
}

export function getCachedNewsLimits(userId: string) {
  return readCache<CachedNewsLimits>('news:limits', userId);
}

export function setCachedNewsLimits(userId: string, value: CachedNewsLimits) {
  writeCache('news:limits', userId, value);
}

export function getCachedDailyStreakState(userId: string) {
  return readCache<CachedDailyStreakState>('daily-streak:state', userId);
}

export function setCachedDailyStreakState(userId: string, value: CachedDailyStreakState) {
  writeCache('daily-streak:state', userId, value);
}

async function runWarmupStage(stage: WarmupStage) {
  if (stage.delayMs > 0) {
    await wait(stage.delayMs);
  }

  if (!canRunWarmup()) {
    return;
  }

  await Promise.allSettled(stage.tasks.map((task) => task()));
}

async function warmupUserSession(userId: string) {
  const stages: WarmupStage[] = [
    {
      delayMs: 0,
      tasks: [
        () => apiGet<CachedDailyStreakState>('/daily-streak/state').then((data) => {
          setCachedDailyStreakState(userId, data);
        }),
      ],
    },
    {
      delayMs: 500,
      tasks: [
        () => apiGet<CachedBridgeStats>('/bridges/stats').then((data) => {
          setCachedBridgeStats(userId, data);
        }),
      ],
    },
    {
      delayMs: 700,
      tasks: [
        () => apiGet<CachedNewsFeedResponse>('/news?limit=5').then((data) => {
          setCachedNewsFeed(userId, data);
        }),
      ],
    },
    {
      delayMs: 900,
      tasks: [
        () => apiGet<CachedBridgeListResponse>('/bridges?status=building&page=1&limit=50').then((data) => {
          setCachedBridgeList(userId, 'building', data);
        }),
        () => apiGet<CachedBridgeListResponse>('/bridges/my?page=1&limit=50').then((data) => {
          setCachedBridgeList(userId, 'my', data);
        }),
      ],
    },
  ];

  for (const stage of stages) {
    await runWarmupStage(stage);
  }
}

export function scheduleUserSessionWarmup(userId: string) {
  const safeUserId = String(userId || '').trim();
  if (!isBrowser() || !safeUserId || warmedUsers.has(safeUserId)) return;

  let pending = inflightWarmups.get(safeUserId);
  if (!pending) {
    pending = Promise.resolve()
      .then(() => warmupUserSession(safeUserId))
      .catch(() => {})
      .finally(() => {
        warmedUsers.add(safeUserId);
        inflightWarmups.delete(safeUserId);
      });
    inflightWarmups.set(safeUserId, pending);
  }

  const run = () => {
    pending?.catch(() => {});
  };

  const idleCallback = (window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  }).requestIdleCallback;

  if (typeof idleCallback === 'function') {
    idleCallback(run, { timeout: 1800 });
    return;
  }

  window.setTimeout(run, 900);
}

