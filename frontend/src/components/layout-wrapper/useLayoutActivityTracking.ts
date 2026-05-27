'use client';

import { useCallback, useEffect, useRef } from 'react';
import { apiPost, apiPostKeepalive } from '@/utils/api';
import {
    classifyNavigation,
    normalizeTrackedPath,
} from '@/components/layout-wrapper/layoutWrapperRules';

type UseLayoutActivityTrackingParams = {
    pathname: string | null;
    userId?: string;
};

export function useLayoutActivityTracking({ pathname, userId }: UseLayoutActivityTrackingParams) {
    const lastPageViewRef = useRef<{ path: string; at: number } | null>(null);
    const pageSessionRef = useRef<{ path: string; startedAt: number; sent: boolean } | null>(null);
    const lastNavigationIntentRef = useRef<{ path: string; at: number } | null>(null);
    const recentPathsRef = useRef<string[]>([]);

    const startPageSession = useCallback((path: string) => {
        pageSessionRef.current = {
            path: normalizeTrackedPath(path),
            startedAt: Date.now(),
            sent: false,
        };
    }, []);

    const flushPageSession = useCallback((useKeepalive: boolean) => {
        const current = pageSessionRef.current;
        if (!current || current.sent) return;

        const elapsedMs = Date.now() - current.startedAt;
        current.sent = true;
        pageSessionRef.current = null;

        if (elapsedMs < 1000) return;

        const payload = {
            page: current.path,
            placement: 'page_session',
            eventType: 'session',
            durationSeconds: Math.round(elapsedMs / 1000),
        };

        const request = useKeepalive
            ? apiPostKeepalive('/ads/impression', payload)
            : apiPost('/ads/impression', payload);
        Promise.resolve(request).catch(() => { });
    }, []);

    useEffect(() => {
        if (!userId || !pathname) return;

        const now = Date.now();
        const last = lastPageViewRef.current;
        const normalizedPathname = normalizeTrackedPath(pathname);
        if (last && last.path === normalizedPathname && now - last.at < 10_000) return;

        const previousPath = recentPathsRef.current.length
            ? recentPathsRef.current[recentPathsRef.current.length - 1]
            : '';
        const navigationMeta = classifyNavigation(
            normalizedPathname,
            previousPath,
            lastNavigationIntentRef.current,
            recentPathsRef.current,
        );
        lastPageViewRef.current = { path: normalizedPathname, at: now };
        apiPost('/activity/page-view', {
            path: normalizedPathname,
            ...navigationMeta,
        }).catch(() => { });

        recentPathsRef.current = [...recentPathsRef.current, normalizedPathname].slice(-8);
        if (navigationMeta.viaUiClick) {
            lastNavigationIntentRef.current = null;
        }
    }, [pathname, userId]);

    useEffect(() => {
        const handleDocumentClick = (event: MouseEvent) => {
            const target = event.target as Element | null;
            if (!target) return;
            const anchor = target.closest('a[href]');
            if (!anchor) return;
            const href = anchor.getAttribute('href') || '';
            if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
            if (!href.startsWith('/')) return;
            lastNavigationIntentRef.current = {
                path: normalizeTrackedPath(href),
                at: Date.now(),
            };
        };

        document.addEventListener('click', handleDocumentClick, true);
        return () => document.removeEventListener('click', handleDocumentClick, true);
    }, []);

    useEffect(() => {
        if (!pathname) return;

        flushPageSession(false);
        startPageSession(pathname);

        return () => {
            flushPageSession(true);
        };
    }, [flushPageSession, pathname, startPageSession]);

    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') {
                flushPageSession(true);
                return;
            }
            if (document.visibilityState === 'visible' && pathname && !pageSessionRef.current) {
                startPageSession(pathname);
            }
        };

        const handlePageHide = () => {
            flushPageSession(true);
        };

        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('pagehide', handlePageHide);
        window.addEventListener('beforeunload', handlePageHide);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('pagehide', handlePageHide);
            window.removeEventListener('beforeunload', handlePageHide);
        };
    }, [flushPageSession, pathname, startPageSession]);

    useEffect(() => {
        if (!userId) return;

        let leaveSent = false;
        const sendLeave = () => {
            if (leaveSent) return;
            leaveSent = true;
            apiPostKeepalive('/activity/leave', {});
        };

        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') {
                sendLeave();
            } else {
                leaveSent = false;
            }
        };

        const handlePageHide = () => sendLeave();

        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('pagehide', handlePageHide);
        window.addEventListener('beforeunload', handlePageHide);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('pagehide', handlePageHide);
            window.removeEventListener('beforeunload', handlePageHide);
        };
    }, [userId]);
}
