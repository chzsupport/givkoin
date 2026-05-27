'use client';

import { useEffect, useState } from 'react';
import { getResponsiveSideAdSlot, type SideAdSlot } from '@/utils/sideAdSlot';

type RouletteLayout = {
    isLandscape: boolean;
    portraitWheelSize: number;
    landscapeWheelSize: number;
    windowWidth: number;
    sideAdSlot: SideAdSlot | null;
};

export function useRouletteLayout(): RouletteLayout {
    const [layout, setLayout] = useState<RouletteLayout>({
        isLandscape: false,
        portraitWheelSize: 280,
        landscapeWheelSize: 280,
        windowWidth: 0,
        sideAdSlot: null,
    });

    useEffect(() => {
        const updateLayout = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            const isLand = w > h;
            const nextSideAdSlot = getResponsiveSideAdSlot(w, h);

            if (isLand) {
                const reservedHeight = 180;
                const availableHeight = h - reservedHeight;
                let sidePanelsWidth = 400;
                let adsWidth = 0;

                if (w >= 1536) {
                    sidePanelsWidth = 700;
                    adsWidth = nextSideAdSlot ? (nextSideAdSlot.width * 2) + 32 : 0;
                } else if (w >= 1280) {
                    sidePanelsWidth = 400;
                    adsWidth = nextSideAdSlot ? (nextSideAdSlot.width * 2) + 32 : 0;
                } else if (w >= 1024) {
                    sidePanelsWidth = 400;
                    adsWidth = nextSideAdSlot ? (nextSideAdSlot.width * 2) + 32 : 0;
                }

                const availableWidth = w - sidePanelsWidth - adsWidth - 40;
                let size = Math.min(availableHeight, availableWidth);
                size = Math.floor(size * 0.9);
                size = Math.max(260, Math.min(size, 850));

                setLayout({
                    isLandscape: true,
                    portraitWheelSize: 280,
                    landscapeWheelSize: size,
                    windowWidth: w,
                    sideAdSlot: nextSideAdSlot,
                });
                return;
            }

            const fixedReserved = 540;
            const estimatedAdHeight = 90;
            const availableWidth = w - 48;
            const remainingForWheel = h - fixedReserved - estimatedAdHeight - 30;
            const size = Math.max(200, Math.min(remainingForWheel, availableWidth, 420));

            setLayout({
                isLandscape: false,
                portraitWheelSize: size,
                landscapeWheelSize: 280,
                windowWidth: w,
                sideAdSlot: nextSideAdSlot,
            });
        };

        updateLayout();
        window.addEventListener('resize', updateLayout);
        return () => window.removeEventListener('resize', updateLayout);
    }, []);

    return layout;
}
