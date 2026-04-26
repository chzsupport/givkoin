'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { API_URL, BACKEND_STATUS_EVENT } from '@/utils/api';
import { getSiteLanguage } from '@/i18n/siteLanguage';
import ruDict from '../../messages/ru.json';
import enDict from '../../messages/en.json';

type BackendStatusContextValue = {
    backendAvailable: boolean;
    backendStatusLoading: boolean;
    backendStatusMessage: string;
    refreshBackendStatus: () => Promise<void>;
};

const BackendStatusContext = createContext<BackendStatusContextValue | undefined>(undefined);
const HEALTHCHECK_INTERVAL_MS = 45_000;
const HEALTHCHECK_HIDDEN_INTERVAL_MS = 180_000;
const HEALTHCHECK_FAILURE_INTERVAL_MS = 15_000;
const HEALTHCHECK_FAILURE_HIDDEN_INTERVAL_MS = 60_000;
const HEALTHCHECK_TIMEOUT_MS = 5_000;

function resolveNestedValue(dict: Record<string, unknown>, dottedKey: string): string | undefined {
    const parts = dottedKey.split('.');
    let current: unknown = dict;
    for (const part of parts) {
        if (!current || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return typeof current === 'string' ? current : undefined;
}

function tSystem(dottedKey: string) {
    const dict = getSiteLanguage() === 'en'
        ? (enDict as unknown as Record<string, unknown>)
        : (ruDict as unknown as Record<string, unknown>);
    return resolveNestedValue(dict, dottedKey) || dottedKey;
}

async function pingBackend(): Promise<{ ok: boolean; message: string }> {
    if (typeof window !== 'undefined' && !window.navigator.onLine) {
        return { ok: false, message: tSystem('server.no_internet') };
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), HEALTHCHECK_TIMEOUT_MS);
    try {
        const res = await fetch(`${API_URL}/health`, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'include',
            signal: controller.signal,
        });

        if (!res.ok) {
            return { ok: false, message: tSystem('server.maintenance') };
        }

        return { ok: true, message: '' };
    } catch {
        return { ok: false, message: tSystem('server.try_later') };
    } finally {
        window.clearTimeout(timeout);
    }
}

export function BackendStatusProvider({ children }: { children: ReactNode }) {
    const [backendAvailable, setBackendAvailable] = useState(true);
    const [backendStatusLoading, setBackendStatusLoading] = useState(true);
    const [backendStatusMessage, setBackendStatusMessage] = useState('');

    const refreshBackendStatus = useCallback(async () => {
        const result = await pingBackend();
        setBackendAvailable(result.ok);
        setBackendStatusMessage(result.message);
        setBackendStatusLoading(false);
    }, []);

    useEffect(() => {
        let cancelled = false;
        let timeoutId: number | null = null;

        const scheduleNext = () => {
            if (cancelled) return;
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
            const delay = backendAvailable
                ? (document.visibilityState === 'hidden'
                    ? HEALTHCHECK_HIDDEN_INTERVAL_MS
                    : HEALTHCHECK_INTERVAL_MS)
                : (document.visibilityState === 'hidden'
                    ? HEALTHCHECK_FAILURE_HIDDEN_INTERVAL_MS
                    : HEALTHCHECK_FAILURE_INTERVAL_MS);
            timeoutId = window.setTimeout(() => {
                refreshBackendStatus()
                    .catch(() => { })
                    .finally(() => {
                        scheduleNext();
                    });
            }, delay);
        };

        refreshBackendStatus()
            .catch(() => { })
            .finally(() => {
                scheduleNext();
            });

        const handleBackendStatus = (event: Event) => {
            const custom = event as CustomEvent<{ available?: boolean; reason?: string }>;
            const available = Boolean(custom.detail?.available);
            setBackendAvailable(available);
            setBackendStatusMessage(available ? '' : (custom.detail?.reason || tSystem('server.no_connection_dot')));
            setBackendStatusLoading(false);
        };

        const handleOnline = () => {
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
            refreshBackendStatus().catch(() => { });
            scheduleNext();
        };

        const handleOffline = () => {
            setBackendAvailable(false);
            setBackendStatusMessage(tSystem('server.no_internet'));
            setBackendStatusLoading(false);
        };

        const handleVisibilityChange = () => {
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
            if (document.visibilityState === 'visible') {
                refreshBackendStatus().catch(() => { });
            }
            scheduleNext();
        };

        window.addEventListener(BACKEND_STATUS_EVENT, handleBackendStatus as EventListener);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            cancelled = true;
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
            window.removeEventListener(BACKEND_STATUS_EVENT, handleBackendStatus as EventListener);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [backendAvailable, refreshBackendStatus]);

    const value = useMemo(() => ({
        backendAvailable,
        backendStatusLoading,
        backendStatusMessage,
        refreshBackendStatus,
    }), [backendAvailable, backendStatusLoading, backendStatusMessage, refreshBackendStatus]);

    return (
        <BackendStatusContext.Provider value={value}>
            {children}
        </BackendStatusContext.Provider>
    );
}

export function useBackendStatus() {
    const context = useContext(BackendStatusContext);
    if (!context) {
        throw new Error('useBackendStatus must be used within a BackendStatusProvider');
    }
    return context;
}
