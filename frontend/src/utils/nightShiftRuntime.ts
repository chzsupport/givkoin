import { normalizeSitePath } from '@/utils/sitePath';

export type NightShiftWindowAnomaly = {
    id: string;
    sectorId: string;
    sectorName: string;
    sectorUrl: string;
    spawnAt: string;
};

export type NightShiftResolvedAnomaly = {
    anomalyId: string;
    pagePath: string;
    clearedAt: string;
};

export type NightShiftWindowReport = {
    index: number;
    startedAt: string;
    endedAt: string;
    anomalies: NightShiftWindowAnomaly[];
    resolvedAnomalies: NightShiftResolvedAnomaly[];
    sentAt?: string | null;
};

export type NightShiftLocalRuntime = {
    shiftSessionId: string;
    startTime: string;
    totalPageHits: Record<string, number>;
    windows: Record<string, NightShiftWindowReport>;
};

type NightShiftStatusLike = {
    isServing?: boolean;
    sessionId?: string | null;
    startTime?: string | null;
    currentWindow?: Partial<NightShiftWindowReport> | null;
};

export const NIGHT_SHIFT_WINDOW_SECONDS = 5 * 60;

const STORAGE_KEY = 'givkoin_night_shift_runtime_v4';
const RUNTIME_EVENT = 'givkoin_night_shift_runtime_changed';

function isBrowser() {
    return typeof window !== 'undefined';
}

function toIso(value: number | string | Date) {
    return new Date(value).toISOString();
}

function normalizePageHits(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    const next: Record<string, number> = {};
    for (const [pagePath, rawCount] of Object.entries(value)) {
        const rawPath = String(pagePath || '').trim();
        if (!rawPath) continue;
        const key = normalizeSitePath(rawPath);
        const count = Math.max(0, Math.floor(Number(rawCount) || 0));
        if (!count) continue;
        next[key] = count;
    }

    return next;
}

function mergePageHits(
    left: Record<string, number> | null | undefined,
    right: Record<string, number> | null | undefined
) {
    const next = { ...(left || {}) };
    const rhs = normalizePageHits(right);
    for (const [pagePath, count] of Object.entries(rhs)) {
        next[pagePath] = (Number(next[pagePath]) || 0) + count;
    }
    return next;
}

function normalizeWindowAnomaly(value: unknown): NightShiftWindowAnomaly | null {
    if (!value || typeof value !== 'object') return null;
    const row = value as Partial<NightShiftWindowAnomaly>;
    const id = String(row.id || '').trim();
    const sectorId = String(row.sectorId || '').trim();
    const sectorName = String(row.sectorName || '').trim();
    const rawSectorUrl = String(row.sectorUrl || '').trim();
    const sectorUrl = rawSectorUrl ? normalizeSitePath(rawSectorUrl) : '';
    const spawnAt = row.spawnAt ? String(row.spawnAt) : '';
    if (!id || !sectorId || !sectorName || !sectorUrl || !spawnAt) return null;
    if (Number.isNaN(new Date(spawnAt).getTime())) return null;

    return {
        id,
        sectorId,
        sectorName,
        sectorUrl,
        spawnAt,
    };
}

function normalizeResolvedAnomaly(value: unknown): NightShiftResolvedAnomaly | null {
    if (!value || typeof value !== 'object') return null;
    const row = value as Partial<NightShiftResolvedAnomaly>;
    const anomalyId = String(row.anomalyId || '').trim();
    const rawPagePath = String(row.pagePath || '').trim();
    const pagePath = rawPagePath ? normalizeSitePath(rawPagePath) : '';
    const clearedAt = row.clearedAt ? String(row.clearedAt) : '';
    if (!anomalyId || !pagePath || !clearedAt) return null;
    if (Number.isNaN(new Date(clearedAt).getTime())) return null;
    return {
        anomalyId,
        pagePath,
        clearedAt,
    };
}

function normalizeWindowReport(value: unknown): NightShiftWindowReport | null {
    if (!value || typeof value !== 'object') return null;
    const row = value as Partial<NightShiftWindowReport>;
    const startedAt = row.startedAt ? String(row.startedAt) : '';
    const endedAt = row.endedAt ? String(row.endedAt) : '';
    if (!startedAt || !endedAt) return null;

    const startedAtMs = new Date(startedAt).getTime();
    const endedAtMs = new Date(endedAt).getTime();
    if (Number.isNaN(startedAtMs) || Number.isNaN(endedAtMs) || endedAtMs <= startedAtMs) return null;

    const anomalies = Array.isArray(row.anomalies)
        ? row.anomalies.map(normalizeWindowAnomaly).filter(Boolean) as NightShiftWindowAnomaly[]
        : [];
    const resolvedAnomalies = Array.isArray(row.resolvedAnomalies)
        ? row.resolvedAnomalies.map(normalizeResolvedAnomaly).filter(Boolean) as NightShiftResolvedAnomaly[]
        : [];

    const uniqueResolved = Array.from(
        new Map(resolvedAnomalies.map((item) => [item.anomalyId, item])).values()
    );

    return {
        index: Math.max(0, Math.floor(Number(row.index) || 0)),
        startedAt,
        endedAt,
        anomalies,
        resolvedAnomalies: uniqueResolved,
        sentAt: row.sentAt ? String(row.sentAt) : null,
    };
}

function normalizeWindows(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

    const next: Record<string, NightShiftWindowReport> = {};
    for (const [key, rawWindow] of Object.entries(value)) {
        const normalized = normalizeWindowReport(rawWindow);
        if (!normalized) continue;
        next[String(key)] = normalized;
    }
    return next;
}

export function normalizeNightShiftRuntime(value: Partial<NightShiftLocalRuntime> | null | undefined): NightShiftLocalRuntime | null {
    if (!value?.shiftSessionId || !value?.startTime) return null;
    if (Number.isNaN(new Date(value.startTime).getTime())) return null;

    return {
        shiftSessionId: String(value.shiftSessionId),
        startTime: String(value.startTime),
        totalPageHits: normalizePageHits(value.totalPageHits),
        windows: normalizeWindows(value.windows),
    };
}

export function readNightShiftRuntime(): NightShiftLocalRuntime | null {
    if (!isBrowser()) return null;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return normalizeNightShiftRuntime(JSON.parse(raw));
    } catch {
        return null;
    }
}

export function writeNightShiftRuntime(runtime: NightShiftLocalRuntime | null) {
    if (!isBrowser()) return;
    const normalized = normalizeNightShiftRuntime(runtime);

    if (!normalized) {
        window.localStorage.removeItem(STORAGE_KEY);
        window.dispatchEvent(new CustomEvent(RUNTIME_EVENT, { detail: { runtime: null } }));
        return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(RUNTIME_EVENT, { detail: { runtime: normalized } }));
}

export function clearNightShiftRuntime() {
    writeNightShiftRuntime(null);
}

export function subscribeNightShiftRuntime(listener: (runtime: NightShiftLocalRuntime | null) => void) {
    if (!isBrowser()) {
        return () => { };
    }

    const handleRuntimeEvent = (event: Event) => {
        const custom = event as CustomEvent<{ runtime?: NightShiftLocalRuntime | null }>;
        listener(normalizeNightShiftRuntime(custom.detail?.runtime || null));
    };

    const handleStorage = (event: StorageEvent) => {
        if (event.key !== STORAGE_KEY) return;
        listener(readNightShiftRuntime());
    };

    window.addEventListener(RUNTIME_EVENT, handleRuntimeEvent as EventListener);
    window.addEventListener('storage', handleStorage);

    return () => {
        window.removeEventListener(RUNTIME_EVENT, handleRuntimeEvent as EventListener);
        window.removeEventListener('storage', handleStorage);
    };
}

function mergeWindowIntoRuntime(runtime: NightShiftLocalRuntime, windowPlan: Partial<NightShiftWindowReport> | null | undefined) {
    const normalizedWindow = normalizeWindowReport(windowPlan);
    if (!normalizedWindow) return runtime;

    const key = String(normalizedWindow.index);
    const existing = runtime.windows[key];
    const mergedResolved = Array.from(
        new Map(
            [
                ...(existing?.resolvedAnomalies || []),
                ...normalizedWindow.resolvedAnomalies,
            ].map((item) => [item.anomalyId, item])
        ).values()
    );

    return {
        ...runtime,
        windows: {
            ...runtime.windows,
            [key]: {
                ...normalizedWindow,
                resolvedAnomalies: mergedResolved,
                sentAt: existing?.sentAt || normalizedWindow.sentAt || null,
            },
        },
    };
}

export function hydrateRuntimeFromStatus(status: NightShiftStatusLike, existingRuntime: NightShiftLocalRuntime | null = null): NightShiftLocalRuntime | null {
    if (!status?.isServing || !status?.sessionId || !status?.startTime) return null;

    const normalizedExisting = existingRuntime && existingRuntime.shiftSessionId === String(status.sessionId)
        ? normalizeNightShiftRuntime(existingRuntime)
        : null;

    const baseRuntime = normalizeNightShiftRuntime({
        shiftSessionId: String(status.sessionId),
        startTime: String(status.startTime),
        totalPageHits: normalizedExisting?.totalPageHits || {},
        windows: normalizedExisting?.windows || {},
    });

    if (!baseRuntime) return null;
    return mergeWindowIntoRuntime(baseRuntime, status.currentWindow || null);
}

export function mergeNightShiftWindow(runtime: NightShiftLocalRuntime | null, windowPlan: Partial<NightShiftWindowReport> | null | undefined) {
    const normalized = normalizeNightShiftRuntime(runtime);
    if (!normalized) return null;
    return mergeWindowIntoRuntime(normalized, windowPlan);
}

export function getCurrentNightShiftAnomaly(runtime: NightShiftLocalRuntime | null, nowMs = Date.now()) {
    const normalized = normalizeNightShiftRuntime(runtime);
    if (!normalized) return null;

    const windows = Object.values(normalized.windows).sort((left, right) => left.index - right.index);
    let nextAtMs: number | null = null;

    for (const window of windows) {
        const startMs = new Date(window.startedAt).getTime();
        const endMs = new Date(window.endedAt).getTime();
        if (Number.isNaN(startMs) || Number.isNaN(endMs)) continue;

        if (nowMs < startMs) {
            const firstUpcoming = window.anomalies[0];
            const firstUpcomingMs = firstUpcoming ? new Date(firstUpcoming.spawnAt).getTime() : startMs;
            nextAtMs = nextAtMs == null ? firstUpcomingMs : Math.min(nextAtMs, firstUpcomingMs);
            continue;
        }

        if (nowMs >= endMs) continue;

        const resolvedIds = new Set(window.resolvedAnomalies.map((item) => item.anomalyId));
        const unresolved = window.anomalies
            .filter((item) => !resolvedIds.has(item.id))
            .sort((left, right) => new Date(left.spawnAt).getTime() - new Date(right.spawnAt).getTime());

        const current = unresolved.find((item) => new Date(item.spawnAt).getTime() <= nowMs);
        if (current) {
            return {
                isActive: true,
                nextAtMs: new Date(current.spawnAt).getTime(),
                anomaly: {
                    index: window.index,
                    id: current.id,
                    sectorId: current.sectorId,
                    sectorName: current.sectorName,
                    sectorUrl: current.sectorUrl,
                    spawnAtMs: new Date(current.spawnAt).getTime(),
                },
            };
        }

        const upcoming = unresolved[0];
        if (upcoming) {
            return {
                isActive: false,
                nextAtMs: new Date(upcoming.spawnAt).getTime(),
                anomaly: null,
            };
        }
    }

    return {
        isActive: false,
        nextAtMs,
        anomaly: null,
    };
}

export function recordNightShiftAnomaly(
    runtime: NightShiftLocalRuntime | null,
    anomalyId: string,
    pagePath: string,
    atMs = Date.now()
) {
    const normalized = normalizeNightShiftRuntime(runtime);
    if (!normalized) return null;

    const safeAnomalyId = String(anomalyId || '').trim();
    const rawPagePath = String(pagePath || '').trim();
    const safePagePath = rawPagePath ? normalizeSitePath(rawPagePath) : '';
    if (!safeAnomalyId || !safePagePath) return normalized;

    let changed = false;
    const nextWindows: Record<string, NightShiftWindowReport> = { ...normalized.windows };

    for (const [key, window] of Object.entries(normalized.windows)) {
        const anomaly = window.anomalies.find((item) => item.id === safeAnomalyId);
        if (!anomaly) continue;
        if (window.resolvedAnomalies.some((item) => item.anomalyId === safeAnomalyId)) {
            return normalized;
        }
        const spawnAtMs = new Date(anomaly.spawnAt).getTime();
        const windowEndMs = new Date(window.endedAt).getTime();
        if ((Number.isFinite(spawnAtMs) && atMs < spawnAtMs) || (Number.isFinite(windowEndMs) && atMs > windowEndMs)) {
            return normalized;
        }

        nextWindows[key] = {
            ...window,
            resolvedAnomalies: [
                ...window.resolvedAnomalies,
                {
                    anomalyId: safeAnomalyId,
                    pagePath: safePagePath,
                    clearedAt: toIso(atMs),
                },
            ],
        };
        changed = true;
        break;
    }

    if (!changed) return normalized;

    return {
        ...normalized,
        totalPageHits: mergePageHits(normalized.totalPageHits, { [safePagePath]: 1 }),
        windows: nextWindows,
    };
}

export function getNextPendingHeartbeatWindow(runtime: NightShiftLocalRuntime | null, nowMs = Date.now()) {
    const normalized = normalizeNightShiftRuntime(runtime);
    if (!normalized) return null;

    const due = Object.values(normalized.windows)
        .filter((window) => !window.sentAt && new Date(window.endedAt).getTime() <= nowMs)
        .sort((left, right) => left.index - right.index);

    return due[0] || null;
}

export function markNightShiftWindowSent(runtime: NightShiftLocalRuntime | null, index: number, sentAt = new Date().toISOString()) {
    const normalized = normalizeNightShiftRuntime(runtime);
    if (!normalized) return null;

    const key = String(index);
    const existing = normalized.windows[key];
    if (!existing) return normalized;

    return {
        ...normalized,
        windows: {
            ...normalized.windows,
            [key]: {
                ...existing,
                sentAt,
            },
        },
    };
}

export function getNightShiftSummary(runtime: NightShiftLocalRuntime | null, endedAtMs = Date.now()) {
    const normalized = normalizeNightShiftRuntime(runtime);
    if (!normalized) return null;

    const startedAtMs = new Date(normalized.startTime).getTime();
    if (Number.isNaN(startedAtMs)) return null;

    let totalAnomalies = 0;
    for (const window of Object.values(normalized.windows)) {
        totalAnomalies += window.resolvedAnomalies.length;
    }

    return {
        startedAt: normalized.startTime,
        endedAt: toIso(endedAtMs),
        totalDurationSeconds: Math.max(0, Math.floor((endedAtMs - startedAtMs) / 1000)),
        totalAnomalies,
        pageHits: { ...normalized.totalPageHits },
        windowReports: Object.values(normalized.windows)
            .sort((left, right) => left.index - right.index)
            .map((window) => ({
                index: window.index,
                startedAt: window.startedAt,
                endedAt: window.endedAt,
                resolvedAnomalies: [...window.resolvedAnomalies],
            })),
    };
}

export function getHourCheckpointForWindow(runtime: NightShiftLocalRuntime | null, windowIndex: number) {
    const normalized = normalizeNightShiftRuntime(runtime);
    const safeWindowIndex = Math.max(0, Math.floor(Number(windowIndex) || 0));
    if (!normalized) return null;
    if (((safeWindowIndex + 1) % 12) !== 0) return null;

    const hourIndex = Math.floor(safeWindowIndex / 12);
    let anomalyCount = 0;

    for (const window of Object.values(normalized.windows)) {
        const currentHourIndex = Math.floor(window.index / 12);
        if (currentHourIndex !== hourIndex) continue;
        anomalyCount += window.resolvedAnomalies.length;
    }

    return {
        hourIndex,
        anomalyCount,
    };
}

export function getCurrentHourAnomalies(runtime: NightShiftLocalRuntime | null, nowMs = Date.now()) {
    const normalized = normalizeNightShiftRuntime(runtime);
    if (!normalized) return 0;

    const startMs = new Date(normalized.startTime).getTime();
    if (Number.isNaN(startMs)) return 0;

    const hourIndex = Math.max(0, Math.floor((nowMs - startMs) / (60 * 60 * 1000)));
    let total = 0;

    for (const window of Object.values(normalized.windows)) {
        const windowHourIndex = Math.max(0, Math.floor((new Date(window.startedAt).getTime() - startMs) / (60 * 60 * 1000)));
        if (windowHourIndex !== hourIndex) continue;
        total += window.resolvedAnomalies.length;
    }

    return total;
}

