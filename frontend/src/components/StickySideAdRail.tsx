'use client';

import { useEffect, useRef } from 'react';
import { AdBlock } from '@/components/AdBlock';
import type { SideAdSlot } from '@/utils/sideAdSlot';
import { useI18n } from '@/context/I18nContext';

type StickySideAdRailProps = {
  adSlot: SideAdSlot | null;
  page: string;
  placement: string;
  panelClassName?: string;
  dividerClassName?: string;
};

export function StickySideAdRail({
  adSlot,
  page,
  placement,
  panelClassName = 'from-white/5 to-transparent border-white/10',
  dividerClassName = 'border-white/5',
}: StickySideAdRailProps) {
  const { t } = useI18n();
  const railRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const rail = railRef.current;
    const panel = panelRef.current;

    if (!rail || !panel || !adSlot || typeof window === 'undefined' || window.innerWidth < 1024) {
      if (panel) panel.style.transform = 'translate3d(0, 0, 0)';
      return;
    }

    const topOffset = 8;
    let currentY = 0;
    let targetY = 0;
    let maxY = 0;
    let railTop = 0;
    let frameId = 0;

    const applyTransform = (value: number) => {
      panel.style.transform = `translate3d(0, ${value}px, 0)`;
    };

    const measureBounds = () => {
      const rect = rail.getBoundingClientRect();
      railTop = rect.top + window.scrollY;
      maxY = Math.max(0, rail.offsetHeight - adSlot.height - topOffset);
    };

    const animate = () => {
      const delta = targetY - currentY;

      if (Math.abs(delta) < 0.5) {
        currentY = targetY;
        applyTransform(currentY);
        frameId = 0;
        return;
      }

      currentY += delta * 0.16;
      applyTransform(currentY);
      frameId = window.requestAnimationFrame(animate);
    };

    const updateTarget = () => {
      measureBounds();
      const rawTarget = window.scrollY - railTop + topOffset;
      targetY = Math.max(0, Math.min(rawTarget, maxY));

      if (!frameId) {
        frameId = window.requestAnimationFrame(animate);
      }
    };

    measureBounds();
    applyTransform(0);
    updateTarget();

    window.addEventListener('scroll', updateTarget, { passive: true });
    window.addEventListener('resize', updateTarget);

    return () => {
      window.removeEventListener('scroll', updateTarget);
      window.removeEventListener('resize', updateTarget);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [adSlot]);

  if (!adSlot) return null;

  const sideClassName = placement.toLowerCase().includes('right') ? 'right-2' : 'left-2';

  return (
    <aside ref={railRef} className="hidden lg:flex relative flex-shrink-0 p-2 flex-col" style={{ width: adSlot.width + 16 }}>
      <div ref={panelRef} className={`absolute top-0 will-change-transform ${sideClassName}`}>
        <div
          className={`mx-auto bg-gradient-to-b border rounded-lg flex flex-col overflow-hidden ${panelClassName}`}
          style={{ width: adSlot.width, height: adSlot.height }}
        >
          <div className="text-tiny uppercase tracking-[0.35em] text-gray-600 font-semibold text-center px-1 py-2">
            {t('landing.ad')}
          </div>
          <div className={`flex-1 w-full border-t ${dividerClassName}`}>
            <AdBlock
              page={page}
              placement={placement}
              hideTitle
              heightClass="h-full"
              className="w-full h-full"
            />
          </div>
        </div>
      </div>
    </aside>
  );
}
