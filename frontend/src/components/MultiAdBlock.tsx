'use client';

import React, { useRef, useEffect, useState } from 'react';
import { AdBlock } from './AdBlock';

interface MultiAdBlockProps {
    page: string;
    placement: string;
    gap?: number;
    minWidth?: number;
}

interface AdSize {
    w: number;
    h: number;
}

// Order matters: prefer 320-width blocks first (user rule: bigger space => taller banner)
const POSSIBLE_SIZES: AdSize[] = [
    { w: 320, h: 50 },
    { w: 320, h: 100 },
    { w: 300, h: 250 },
    { w: 336, h: 280 },
    { w: 240, h: 400 },
    { w: 300, h: 600 },
    { w: 160, h: 600 },
    { w: 468, h: 60 },
    { w: 120, h: 60 },
];

function pickBestFit(sizes: AdSize[], availableWidth: number, availableHeight: number, minWidth: number) {
    const fits = sizes.filter((s) => s.w >= minWidth && s.w <= availableWidth && s.h <= availableHeight);
    if (fits.length === 0) return null;

    // Prefer width close to 320 (exact 320 first), then taller height, then wider width.
    fits.sort((a, b) => {
        const aWidthScore = Math.abs(320 - a.w);
        const bWidthScore = Math.abs(320 - b.w);
        if (aWidthScore !== bWidthScore) return aWidthScore - bWidthScore;
        if (a.h !== b.h) return b.h - a.h;
        return b.w - a.w;
    });

    return fits[0];
}

/**
 * Smart component that fills available vertical space 
 * with the largest fitting ad blocks.
 */
export function MultiAdBlock({
    page,
    placement,
    gap = 30,
    minWidth = 120,
}: MultiAdBlockProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [blocks, setBlocks] = useState<AdSize[]>([]);

    useEffect(() => {
        const calculateBlocks = () => {
            if (!containerRef.current) return;

            const availableHeight = containerRef.current.clientHeight;
            const availableWidth = containerRef.current.clientWidth;

            // If practically no space, don't render anything
            if (availableHeight < 50 || availableWidth < 120) {
                setBlocks([]);
                return;
            }

            let currentHeight = availableHeight;
            const resultBlocks: AdSize[] = [];
            // User said: "if 320x100 fits add it, if space remains check again". 
            // Repetition of same size is allowed (e.g. valid to have two 320x100).

            while (currentHeight > 0) {
                const bestFit = pickBestFit(POSSIBLE_SIZES, availableWidth, currentHeight, minWidth);

                if (bestFit) {
                    resultBlocks.push(bestFit);
                    // Decrease height by block height + gap
                    currentHeight -= (bestFit.h + gap);
                } else {
                    // No block fits in the remaining sliver of space
                    break;
                }
            }

            // Always show at least one block if there is meaningful space (even if we can't stack multiples)
            if (resultBlocks.length === 0) {
                const single = pickBestFit(POSSIBLE_SIZES, availableWidth, availableHeight, minWidth);
                if (single) {
                    setBlocks([single]);
                    return;
                }
            }

            setBlocks(resultBlocks);
        };

        // Initial calculation
        calculateBlocks();

        const resizeObserver = new ResizeObserver(calculateBlocks);
        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        return () => resizeObserver.disconnect();
    }, [gap, minWidth]);

    // If we have no blocks calculated yet (initial render) or resize resulted in 0, 
    // we still keep the container to allow ResizeObserver to work.

    return (
        <div ref={containerRef} className="w-full h-full min-h-0 flex flex-col justify-center items-center" style={{ gap }}>
            {blocks.map((size, index) => (
                <div key={index} className="shrink-0" style={{ width: size.w, height: size.h }}>
                    <AdBlock
                        page={page}
                        placement={`${placement}_${index}`} // Unique placement for tracking?
                        style={{ width: size.w, height: size.h }}
                        hideTitle
                    />
                </div>
            ))}
        </div>
    );
}
