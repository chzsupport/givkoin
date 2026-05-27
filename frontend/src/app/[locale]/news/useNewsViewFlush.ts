import { useEffect, type MutableRefObject } from 'react';
import { apiPost, apiPostKeepalive } from '@/utils/api';
import { VIEW_BATCH_INTERVAL_MS } from './newsPageData';

export function useNewsViewFlush({
    currentReadPostIdRef,
    pendingViewIdsRef,
    userId,
    viewBatchKeyByPostIdRef,
    viewFlushInFlightRef,
    viewedStorageKey,
}: {
    currentReadPostIdRef: MutableRefObject<string | null>;
    pendingViewIdsRef: MutableRefObject<Set<string>>;
    userId: string | undefined;
    viewBatchKeyByPostIdRef: MutableRefObject<Record<string, string>>;
    viewFlushInFlightRef: MutableRefObject<boolean>;
    viewedStorageKey: string;
}) {
    useEffect(() => {
        pendingViewIdsRef.current.clear();
        if (!userId || typeof window === 'undefined') return undefined;

        const flushViews = async (useKeepalive = false) => {
            if (viewFlushInFlightRef.current) return;
            const ids = Array.from(pendingViewIdsRef.current);
            if (ids.length === 0) return;

            const groups = new Map<string, string[]>();
            const idsWithoutKey: string[] = [];
            ids.forEach((id) => {
                const viewBatchKey = viewBatchKeyByPostIdRef.current[id];
                if (!viewBatchKey) {
                    idsWithoutKey.push(id);
                    return;
                }
                const existing = groups.get(viewBatchKey) || [];
                existing.push(id);
                groups.set(viewBatchKey, existing);
            });
            if (groups.size === 0) return;

            viewFlushInFlightRef.current = true;
            pendingViewIdsRef.current.clear();
            idsWithoutKey.forEach((id) => pendingViewIdsRef.current.add(id));
            try {
                for (const [viewBatchKey, groupedIds] of groups.entries()) {
                    try {
                        if (useKeepalive) {
                            await apiPostKeepalive('/news/views', {
                                postIds: groupedIds,
                                viewBatchKey,
                                lastReadPostId: currentReadPostIdRef.current,
                            });
                        } else {
                            await apiPost('/news/views', {
                                postIds: groupedIds,
                                viewBatchKey,
                                lastReadPostId: currentReadPostIdRef.current,
                            });
                        }
                    } catch {
                        groupedIds.forEach((id) => pendingViewIdsRef.current.add(id));
                    }
                }
            } catch {
                ids.forEach((id) => pendingViewIdsRef.current.add(id));
            } finally {
                viewFlushInFlightRef.current = false;
            }
        };

        const intervalId = window.setInterval(() => {
            flushViews(false);
        }, VIEW_BATCH_INTERVAL_MS);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                flushViews(true);
            }
        };

        const handleBeforeUnload = () => {
            flushViews(true);
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            flushViews(true);
        };
    }, [
        currentReadPostIdRef,
        pendingViewIdsRef,
        userId,
        viewBatchKeyByPostIdRef,
        viewFlushInFlightRef,
        viewedStorageKey,
    ]);
}
