import { useEffect, useState } from 'react';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';

export function useNewsLayout(layoutKey: string) {
    const [windowWidth, setWindowWidth] = useState(0);
    const [adWidth, setAdWidth] = useState(300);
    const [adHeight, setAdHeight] = useState(600);
    const isDesktop = Boolean(getResponsiveSideAdSlot(windowWidth, typeof window !== 'undefined' ? window.innerHeight : 0));

    useEffect(() => {
        const updateLayout = () => {
            const w = window.innerWidth;
            setWindowWidth(w);
            const h = window.innerHeight;

            const sideAdSlot = getResponsiveSideAdSlot(w, h);
            setAdWidth(sideAdSlot?.width ?? 300);
            setAdHeight(sideAdSlot?.height ?? 600);
        };

        updateLayout();
        window.addEventListener('resize', updateLayout);
        return () => window.removeEventListener('resize', updateLayout);
    }, [layoutKey]);

    return {
        adHeight,
        adWidth,
        isDesktop,
    };
}
