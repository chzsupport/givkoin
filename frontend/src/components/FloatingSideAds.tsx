'use client';

import type { RefObject } from 'react';
import { AdBlock } from '@/components/AdBlock';
import { useI18n } from '@/context/I18nContext';

type FloatingSideAdsProps = {
  adWidth: number;
  isDesktop: boolean;
  leftAdRef: RefObject<HTMLDivElement>;
  page: string;
  rightAdRef: RefObject<HTMLDivElement>;
  leftPlacement: string;
  rightPlacement: string;
  adHeight?: number;
};

function FloatingSideAd({
  adHeight,
  adRef,
  adWidth,
  page,
  placement,
  side,
}: {
  adHeight: number;
  adRef: RefObject<HTMLDivElement>;
  adWidth: number;
  page: string;
  placement: string;
  side: 'left' | 'right';
}) {
  const { t } = useI18n();
  const positionClassName = side === 'left' ? 'left-0' : 'right-0';
  const adClassName = side === 'left' ? 'left-2' : 'right-2';

  return (
    <div className={`pointer-events-none absolute inset-y-0 ${positionClassName} z-20 hidden lg:block`} style={{ width: adWidth + 16 }}>
      <div ref={adRef} className={`absolute top-0 will-change-transform ${adClassName}`}>
        <div
          className="pointer-events-auto bg-gradient-to-b from-white/5 to-transparent border border-white/10 rounded-lg flex flex-col overflow-hidden"
          style={{ width: adWidth, height: adHeight }}
        >
          <div className="text-tiny uppercase tracking-[0.35em] text-gray-600 font-semibold text-center px-1 py-2">
            {t('landing.ad')}
          </div>
          <div className="flex-1 w-full border-t border-white/5">
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
    </div>
  );
}

export function FloatingSideAds({
  adHeight = 600,
  adWidth,
  isDesktop,
  leftAdRef,
  leftPlacement,
  page,
  rightAdRef,
  rightPlacement,
}: FloatingSideAdsProps) {
  if (!isDesktop) return null;

  return (
    <>
      <FloatingSideAd
        adHeight={adHeight}
        adRef={leftAdRef}
        adWidth={adWidth}
        page={page}
        placement={leftPlacement}
        side="left"
      />
      <FloatingSideAd
        adHeight={adHeight}
        adRef={rightAdRef}
        adWidth={adWidth}
        page={page}
        placement={rightPlacement}
        side="right"
      />
    </>
  );
}
