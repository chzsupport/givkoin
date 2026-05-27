'use client';

import { useEffect } from 'react';

export function useLockPageScroll() {
    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;
        const prevHtmlOverflow = html.style.overflow;
        const prevBodyOverflow = body.style.overflow;
        const prevBodyOverscroll = body.style.overscrollBehavior;

        html.style.overflow = 'hidden';
        body.style.overflow = 'hidden';
        body.style.overscrollBehavior = 'none';

        return () => {
            html.style.overflow = prevHtmlOverflow;
            body.style.overflow = prevBodyOverflow;
            body.style.overscrollBehavior = prevBodyOverscroll;
        };
    }, []);
}
