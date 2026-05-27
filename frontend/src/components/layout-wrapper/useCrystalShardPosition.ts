'use client';

import { useEffect, useState } from 'react';
import type { useCrystal } from '@/context/CrystalContext';
import { normalizeSitePath } from '@/utils/sitePath';

type CrystalShard = ReturnType<typeof useCrystal>['currentPageShard'];

export function useCrystalShardPosition(pathname: string | null, currentPageShard: CrystalShard) {
    const [shardPosition, setShardPosition] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
        if (!currentPageShard) {
            setShardPosition(null);
            return;
        }

        const getTextRect = (el: Element): DOMRect | null => {
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            let node: Node | null;
            while ((node = walker.nextNode())) {
                const text = (node.textContent || '').trim();
                if (!text) continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                const rects = range.getClientRects();
                if (rects.length > 0) return rects[0];
            }
            return null;
        };

        const findAndPosition = () => {
            const scrollY = window.scrollY || document.documentElement.scrollTop;

            const shardWidth = 25;
            const isEntityProfilePage = normalizeSitePath(pathname || '/') === '/entity/profile';
            const side = isEntityProfilePage ? 'right' : currentPageShard.side || 'right';

            const main = document.querySelector('main');
            const entityProfileAnchor = isEntityProfilePage
                ? document.querySelector('[data-crystal-anchor="entity-name"]')
                : null;
            const mainH1 = main?.querySelector('h1') || null;
            const pageH1 = document.querySelector('h1');
            const h2 = document.querySelector('main h2');
            const target = entityProfileAnchor || mainH1 || pageH1 || h2;

            if (target) {
                const tRect = getTextRect(target) || target.getBoundingClientRect();
                const viewTop = tRect.top + (tRect.height / 2) - (shardWidth / 2);
                const top = viewTop + scrollY;

                let left: number;
                const sideOffset = 14;

                if (side === 'left') {
                    left = tRect.left - shardWidth - sideOffset;
                } else {
                    left = tRect.right + sideOffset;
                }

                if (left < 10) left = 10;
                if (left > window.innerWidth - shardWidth - 10) left = window.innerWidth - shardWidth - 10;

                setShardPosition({ top, left });
                return;
            }

            setShardPosition({
                top: scrollY + 120,
                left: window.innerWidth - 80,
            });
        };

        const timer = setTimeout(findAndPosition, 500);
        window.addEventListener('resize', findAndPosition);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', findAndPosition);
        };
    }, [pathname, currentPageShard]);

    return shardPosition;
}
