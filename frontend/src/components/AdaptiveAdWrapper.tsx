'use client';

import { useEffect, useRef, useState } from 'react';
import { AdBlock } from './AdBlock';

// Definitions
const SIZES = {
    // Mobile
    MOBILE_MAIN: { w: 320, h: 50 },
    MOBILE_TINY: { w: 120, h: 60 },
    // Tablet
    TABLET_BIG: { w: 728, h: 90 },
    TABLET_MID: { w: 468, h: 60 },
    // Desktop
    DESKTOP_MAIN: { w: 970, h: 90 },
    DESKTOP_BIG: { w: 970, h: 250 },
};

export type AdStrategy = 'auto' | 'mobile_only' | 'tablet_only' | 'mobile_tablet_adaptive' | 'chat_adaptive';

interface AdaptiveAdWrapperProps {
    page: string;
    placement: string;
    className?: string;
    /** Defaults to 'auto' for backward compatibility */
    strategy?: AdStrategy;
    /** If provided, overrides width check for specific cases */
    forcedWidth?: number;
    chromeless?: boolean;
}

export function AdaptiveAdWrapper({ page, placement, className, strategy = 'auto', forcedWidth, chromeless = false }: AdaptiveAdWrapperProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [bestSize, setBestSize] = useState<{ w: number; h: number } | null>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        const updateSize = () => {
            if (!containerRef.current) return;
            const containerWidth = forcedWidth ?? containerRef.current.clientWidth;
            const windowWidth = window.innerWidth;

            // Allow specialized logic based on Strategy
            let targetSize = null;

            if (strategy === 'chat_adaptive') {
                // Chat: 468x60 > 320x50 > 120x60
                if (containerWidth >= 468) targetSize = SIZES.TABLET_MID;
                else if (containerWidth >= 320) targetSize = SIZES.MOBILE_MAIN;
                else targetSize = SIZES.MOBILE_TINY;
            }
            else if (strategy === 'mobile_tablet_adaptive') {
                // Strict rules from user:
                // Mobile (< 768px): 320x50 (preferred) -> 120x60
                // Tablet (>= 768px): 728x90 (preferred) -> 468x60

                if (windowWidth < 768) {
                    // Mobile
                    if (containerWidth >= 320) targetSize = SIZES.MOBILE_MAIN;
                    else targetSize = SIZES.MOBILE_TINY;
                } else {
                    // Tablet (and Desktop if used there, but this strategy implies tablet/mobile focus)
                    if (containerWidth >= 728) targetSize = SIZES.TABLET_BIG;
                    else if (containerWidth >= 468) targetSize = SIZES.TABLET_MID;
                    // Fallback for very small "tablets" or resized windows
                    else if (containerWidth >= 320) targetSize = SIZES.MOBILE_MAIN;
                    else targetSize = SIZES.MOBILE_TINY;
                }
            } else {
                // Default 'auto' behavior (legacy support or desktop standard)
                // Just find biggest that fits 
                // (Keeping simple logic here to avoid regression on existing desktop uses)
                if (containerWidth >= 970) targetSize = SIZES.DESKTOP_MAIN;
                else if (containerWidth >= 728) targetSize = SIZES.TABLET_BIG;
                else if (containerWidth >= 468) targetSize = SIZES.TABLET_MID;
                else if (containerWidth >= 320) targetSize = SIZES.MOBILE_MAIN;
                else targetSize = SIZES.MOBILE_TINY;
            }

            setBestSize(targetSize);
        };

        // Initial check
        updateSize();

        // Observe resize
        const observer = new ResizeObserver(updateSize);
        observer.observe(containerRef.current);
        window.addEventListener('resize', updateSize);

        return () => {
            observer.disconnect();
            window.removeEventListener('resize', updateSize);
        };
    }, [strategy, forcedWidth]);

    return (
        <div
            ref={containerRef}
            className={`w-full flex items-center justify-center ${className || ''}`}
        >
            {bestSize ? (
                <div style={{ width: bestSize.w, height: bestSize.h }} className="transition-all duration-300">
                    <AdBlock
                        page={page}
                        placement={placement}
                        style={{ height: bestSize.h }}
                        className="w-full"
                        hideTitle={true}
                        chromeless={chromeless}
                    />
                </div>
            ) : null}
        </div>
    );
}
