'use client';

import { useRef } from 'react';

export function useNewsPageRefs(lastReadId: string | null) {
    const containerRef = useRef<HTMLDivElement>(null);
    const feedRef = useRef<HTMLDivElement>(null);
    const postsRef = useRef<{ [key: string]: HTMLDivElement | null }>({});
    const pendingViewIdsRef = useRef<Set<string>>(new Set());
    const viewFlushInFlightRef = useRef(false);
    const viewedPostsRef = useRef<Set<string>>(new Set());
    const currentReadPostIdRef = useRef<string | null>(null);
    const lastReadIdRef = useRef<string | null>(lastReadId);
    const hasNewsScrollRef = useRef(false);

    return {
        containerRef,
        currentReadPostIdRef,
        feedRef,
        hasNewsScrollRef,
        lastReadIdRef,
        pendingViewIdsRef,
        postsRef,
        viewFlushInFlightRef,
        viewedPostsRef,
    };
}
