import { useEffect } from 'react';

export function useSmoothWheelScroll() {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!window.matchMedia('(pointer: fine)').matches) return;
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

        let current = window.scrollY;
        let target = current;
        let rafId = 0;

        const clampTarget = () => {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            target = Math.max(0, Math.min(target, max));
        };

        const step = () => {
            current += (target - current) * 0.12;
            window.scrollTo(0, current);
            if (Math.abs(target - current) > 0.5) {
                rafId = requestAnimationFrame(step);
            } else {
                rafId = 0;
            }
        };

        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            target += event.deltaY;
            clampTarget();
            if (!rafId) {
                rafId = requestAnimationFrame(step);
            }
        };

        window.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            window.removeEventListener('wheel', onWheel);
            if (rafId) cancelAnimationFrame(rafId);
        };
    }, []);
}
