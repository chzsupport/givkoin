'use client';

import { useEffect, useRef, useState } from 'react';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';

export function useFloatingSideAds(adHeight = 600) {
  const [windowWidth, setWindowWidth] = useState(0);
  const [windowHeight, setWindowHeight] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const [adWidth, setAdWidth] = useState(300);
  const [resolvedAdHeight, setResolvedAdHeight] = useState(adHeight);

  const pageRef = useRef<HTMLDivElement | null>(null);
  const leftAdRef = useRef<HTMLDivElement | null>(null);
  const rightAdRef = useRef<HTMLDivElement | null>(null);

  const sideAdSlot = getResponsiveSideAdSlot(windowWidth, windowHeight);
  const isDesktop = Boolean(sideAdSlot);

  useEffect(() => {
    const updateLayout = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setWindowWidth(w);
      setWindowHeight(h);
      setIsLandscape(w > h);
      const nextSlot = getResponsiveSideAdSlot(w, h);
      setAdWidth(nextSlot?.width ?? 300);
      setResolvedAdHeight(nextSlot?.height ?? adHeight);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, [adHeight]);

  useEffect(() => {
    const leftAd = leftAdRef.current;
    const rightAd = rightAdRef.current;

    if (!leftAd || !rightAd || !isDesktop) {
      if (leftAd) leftAd.style.transform = 'translate3d(0, 0, 0)';
      if (rightAd) rightAd.style.transform = 'translate3d(0, 0, 0)';
      return;
    }

    const topOffset = 8;
    let currentY = 0;
    let targetY = 0;
    let maxY = 0;
    let pageTop = 0;
    let frameId = 0;

    const applyTransform = (value: number) => {
      const transform = `translate3d(0, ${value}px, 0)`;
      if (leftAdRef.current) leftAdRef.current.style.transform = transform;
      if (rightAdRef.current) rightAdRef.current.style.transform = transform;
    };

    const measureBounds = () => {
      const page = pageRef.current;
      if (!page) return;
      const rect = page.getBoundingClientRect();
      pageTop = rect.top + window.scrollY;
      maxY = Math.max(0, page.offsetHeight - resolvedAdHeight - topOffset);
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
      const rawTarget = window.scrollY - pageTop + topOffset;
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
  }, [isDesktop, resolvedAdHeight]);

  return {
    adHeight: resolvedAdHeight,
    adWidth,
    isDesktop,
    isLandscape,
    leftAdRef,
    pageRef,
    rightAdRef,
    sideAdSlot,
    windowHeight,
    windowWidth,
  };
}
