'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { apiGet, apiPost } from '@/utils/api';
import { useI18n } from '@/context/I18nContext';
import { normalizeSitePath } from '@/utils/sitePath';

interface AdBlockProps {
  page?: string;      // Deprecated but kept for compatibility
  placement?: string; // Deprecated but kept for compatibility
  className?: string;
  heightClass?: string;
  hideTitle?: boolean;
  chromeless?: boolean;
  style?: React.CSSProperties;
}

interface Creative {
  _id: string;
  type?: 'banner' | 'vast' | 'html';
  kind?: 'banner' | 'vast';
  content: string;
  duration?: number;
}

export function AdBlock({ page, placement, className, heightClass, hideTitle, chromeless, style }: AdBlockProps) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [creatives, setCreatives] = useState<Creative[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Fetch all active creatives for rotation
  useEffect(() => {
    const fetchCreatives = async () => {
      try {
        const resolvedPage = (page || '').trim()
          || (pathname ? normalizeSitePath(pathname) : 'global')
          || 'global';
        const resolvedPlacement = (placement || 'rotation').trim() || 'rotation';
        const query = `page=${encodeURIComponent(resolvedPage)}&placement=${encodeURIComponent(resolvedPlacement)}&kind=banner`;
        const data = await apiGet<Creative[]>(`/ads/rotation?${query}`);
        if (Array.isArray(data) && data.length > 0) {
          setCreatives(data);
        } else {
          setCreatives([]);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Failed to fetch ads:', message);
      }
    };

    fetchCreatives();
  }, [page, placement, pathname]);

  // Handle rotation
  useEffect(() => {
    if (creatives.length === 0) return;

    const currentCreative = creatives[currentIndex];
    const duration = (currentCreative.duration || 10) * 1000;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % creatives.length);
    }, duration);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [currentIndex, creatives]);

  // Record Impression
  useEffect(() => {
    if (creatives.length === 0) return;
    const currentCreative = creatives[currentIndex];
    if (!currentCreative) return;
    const resolvedPage = (page || '').trim()
      || (pathname ? normalizeSitePath(pathname) : 'global')
      || 'global';
    const resolvedPlacement = (placement || 'rotation').trim() || 'rotation';

    const recordImpression = async () => {
      try {
        await apiPost('/ads/impression', {
          page: resolvedPage,
          placement: resolvedPlacement,
          creativeId: currentCreative._id,
        });
      } catch (e) {
        console.error('Impression record failed', e);
      }
    };
    recordImpression();
  }, [currentIndex, creatives, page, placement, pathname]);

  const renderContent = () => {
    if (creatives.length === 0) return null;

    const creative = creatives[currentIndex];
    if (!creative || !creative.content) return null;

    const kind = creative.kind || creative.type;
    if (kind !== 'banner' && kind !== 'html') return null;
    return <div dangerouslySetInnerHTML={{ __html: creative.content }} className="w-full h-full" />;
  };

  const finalContent = renderContent();
  const hasStyleHeight = style && style.height !== undefined;
  const bodyHeight = hasStyleHeight ? '' : (heightClass ? heightClass : 'h-[250px]');

  const bodyClass = chromeless
    ? `w-full ${bodyHeight}`
    : `w-full ${bodyHeight} bg-neutral-900/50 border border-white/10 rounded-2xl flex items-center justify-center`;

  // If no ads, don't render anything (or render placeholder if desired, but usually empty is better for "smart" ads)
  if (creatives.length === 0) {
    return (
      <div ref={containerRef} className={className} style={style} data-ad-block="1">
        {!hideTitle && (
          <div className="text-caption uppercase tracking-[0.35em] text-neutral-400 font-semibold text-left mb-1">{t('ads.label')}</div>
        )}
        <div className={bodyClass} style={hasStyleHeight ? { height: style!.height } : undefined}>
          {/* Empty or Placeholder */}
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className} style={style} data-ad-block="1">
      {!hideTitle && (
        <div className="text-caption uppercase tracking-[0.35em] text-neutral-400 font-semibold text-left mb-1">{t('ads.label')}</div>
      )}
      <div className={bodyClass} style={hasStyleHeight ? { height: style!.height } : undefined}>
        {finalContent}
      </div>
    </div>
  );
}

