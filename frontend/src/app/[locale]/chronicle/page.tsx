'use client';

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { PageBackground } from '@/components/PageBackground';
import { AdBlock } from '@/components/AdBlock';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import ChronicleStats from '@/components/chronicle/ChronicleStats';
import BattleHistory from '@/components/chronicle/BattleHistory';
import { PageTitle } from '@/components/PageTitle';
import { ScrollText } from 'lucide-react';
import { getResponsiveSideAdSlot } from '@/utils/sideAdSlot';
import { useI18n } from '@/context/I18nContext';

// Re-trigger build

const ChroniclePage = () => {
  const { t, localePath } = useI18n();
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  const floatingOrbs = useMemo(
    () =>
      Array.from({ length: 10 }).map((_, idx) => ({
        id: idx,
        size: 80 + Math.random() * 120,
        top: `${5 + Math.random() * 70}%`,
        left: `${Math.random() * 100}%`,
        duration: 12 + Math.random() * 10,
        delay: Math.random() * 4,
        gradient:
          idx % 2 === 0
            ? 'radial-gradient(circle at 30% 30%, rgba(139, 92, 246, 0.45), rgba(59, 130, 246, 0.05))'
            : 'radial-gradient(circle at 70% 70%, rgba(56, 189, 248, 0.35), rgba(168, 85, 247, 0.05))',
      })),
    [],
  );

  const [windowWidth, setWindowWidth] = useState(0);
  const [isLandscape, setIsLandscape] = useState(false);
  const [adWidth, setAdWidth] = useState(300);
  const [adHeight, setAdHeight] = useState(600);
  const isDesktop = Boolean(getResponsiveSideAdSlot(windowWidth, typeof window !== 'undefined' ? window.innerHeight : 0));
  const pageRef = useRef<HTMLDivElement | null>(null);
  const leftAdRef = useRef<HTMLDivElement | null>(null);
  const rightAdRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const updateLayout = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setWindowWidth(w);
      const isLand = w > h;
      setIsLandscape(isLand);

      const sideAdSlot = getResponsiveSideAdSlot(w, h);
      setAdWidth(sideAdSlot?.width ?? 300);
      setAdHeight(sideAdSlot?.height ?? 600);
    };

    updateLayout();
    window.addEventListener('resize', updateLayout);
    return () => window.removeEventListener('resize', updateLayout);
  }, []);

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
      maxY = Math.max(0, page.offsetHeight - adHeight - topOffset);
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
  }, [adHeight, isDesktop]);

  return (
    <div ref={pageRef} className="relative w-full text-slate-200 font-sans selection:bg-yellow-500/30">
      <PageBackground />

      {/* Space Overlay */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute -top-10 -left-10 w-[32rem] h-[32rem] bg-gradient-to-br from-blue-500/20 via-purple-500/15 to-transparent blur-[150px] rounded-full animate-pulse" />
        <div className="absolute bottom-0 right-[-6rem] w-[36rem] h-[36rem] bg-gradient-to-br from-indigo-500/20 via-cyan-400/15 to-transparent blur-[150px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
        <div className="absolute inset-0 opacity-30">
          {floatingOrbs.map((orb) => (
            <motion.div
              key={orb.id}
              className="absolute rounded-full"
              style={{ width: orb.size, height: orb.size, top: orb.top, left: orb.left, background: orb.gradient, filter: 'blur(14px)' }}
              animate={{ y: [-20, 30, -10], opacity: [0.2, 0.65, 0.35], rotate: [0, 6, -4, 0] }}
              transition={{ duration: orb.duration, repeat: Infinity, delay: orb.delay, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </div>

      {isDesktop ? (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 z-20 hidden lg:block" style={{ width: adWidth + 16 }}>
            <div ref={leftAdRef} className="absolute left-2 top-0 will-change-transform">
              <div
                className="pointer-events-auto bg-gradient-to-b from-white/5 to-transparent border border-white/10 rounded-lg flex flex-col overflow-hidden"
                style={{ width: adWidth, height: adHeight }}
              >
                <div className="text-tiny uppercase tracking-[0.35em] text-gray-600 font-semibold text-center px-1 py-2">
                  {t('landing.ad')}
                </div>
                <div className="flex-1 w-full border-t border-white/5">
                  <AdBlock
                    page="chronicle"
                    placement="chronicle_sidebar_left"
                    hideTitle
                    heightClass="h-full"
                    className="w-full h-full"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-y-0 right-0 z-20 hidden lg:block" style={{ width: adWidth + 16 }}>
            <div ref={rightAdRef} className="absolute right-2 top-0 will-change-transform">
              <div
                className="pointer-events-auto bg-gradient-to-b from-white/5 to-transparent border border-white/10 rounded-lg flex flex-col overflow-hidden"
                style={{ width: adWidth, height: adHeight }}
              >
                <div className="text-tiny uppercase tracking-[0.35em] text-gray-600 font-semibold text-center px-1 py-2">
                  {t('landing.ad')}
                </div>
                <div className="flex-1 w-full border-t border-white/5">
                  <AdBlock
                    page="chronicle"
                    placement="chronicle_sidebar_right"
                    hideTitle
                    heightClass="h-full"
                    className="w-full h-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      <div
        className="relative z-10 px-3 lg:px-4 py-2 lg:py-3"
        style={isDesktop ? { paddingLeft: adWidth + 28, paddingRight: adWidth + 28 } : undefined}
      >
        <div className="flex flex-col min-w-0">

          {/* Адаптивный рекламный блок сверху - только для мобильных/планшетов в портрете */}
          <div className={`${isDesktop ? 'hidden' : 'flex'} mx-auto mb-6 shrink-0 justify-center w-full`}>
            <AdaptiveAdWrapper
              page="chronicle"
              placement="chronicle_header"
              strategy="mobile_tablet_adaptive"
            />
          </div>

          {/* Back Button */}
          <div className="mb-6 shrink-0">
            <Link
              href={localePath('/tree')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 rounded-lg font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95 group backdrop-blur-md"
            >
              <span className="group-hover:-translate-x-1 transition-transform">←</span> {t('nav.back_to_tree')}
            </Link>
          </div>

          <header className="mb-6 shrink-0">
            <PageTitle
              title={t('chronicle.title')}
              Icon={ScrollText}
              gradientClassName="from-amber-200 via-amber-400 to-orange-500"
              iconClassName="w-4 h-4 xl:w-5 xl:h-5 text-[#D4AF37]"
              className="w-fit mx-auto"
            />
          </header>

          <motion.main
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="max-w-4xl mx-auto w-full"
          >
            {/* 1. ВЕРХНЯЯ ЧАСТЬ - СКАЗОЧНЫЙ РАССКАЗ */}
            <motion.section variants={itemVariants} className="mb-12 text-center md:text-left bg-black/40 backdrop-blur-md p-8 rounded-2xl border border-white/10 shadow-2xl">
              <h1 className="text-[32px] font-bold text-[#D4AF37] mb-6">{t('chronicle.tale_title')}</h1>
              <div className="text-[18px] leading-[1.6] text-slate-200 space-y-4 [&>p]:indent-8">
                <p>
                  {t('chronicle.tale_p1')}
                </p>
                <p>
                  {t('chronicle.tale_p2')}
                </p>
                <p>
                  {t('chronicle.tale_p3')}
                </p>
                <p>
                  {t('chronicle.tale_p4')}
                </p>
                <p>
                  {t('chronicle.tale_p5')}
                </p>
              </div>
            </motion.section>

            {/* Рекламный блок между Сказанием и Статистикой */}
            <div className={`${isLandscape && windowWidth >= 1024 ? 'hidden' : 'flex'} mx-auto mb-12 shrink-0 justify-center w-full`}>
              <AdaptiveAdWrapper
                page="chronicle"
                placement="chronicle_between_story_stats"
                strategy="mobile_tablet_adaptive"
              />
            </div>

            {/* 2. БЛОК СТАТИСТИКИ */}
            <ChronicleStats />

            {/* Рекламный блок между Статистикой и Историей */}
            <div className={`${isLandscape && windowWidth >= 1024 ? 'hidden' : 'flex'} mx-auto mb-12 shrink-0 justify-center w-full`}>
              <AdaptiveAdWrapper
                page="chronicle"
                placement="chronicle_between_stats_history"
                strategy="mobile_tablet_adaptive"
              />
            </div>

            {/* 3. ИСТОРИЧЕСКАЯ СПРАВКА */}
            <BattleHistory />

            {/* Рекламный блок между Историей и Залом славы */}
            <div className={`${isLandscape && windowWidth >= 1024 ? 'hidden' : 'flex'} mx-auto mb-12 shrink-0 justify-center w-full`}>
              <AdaptiveAdWrapper
                page="chronicle"
                placement="chronicle_between_history_hall"
                strategy="mobile_tablet_adaptive"
              />
            </div>

            {/* 4. РЕКОРДЫ И ДОСТИЖЕНИЯ */}
            <motion.section
              variants={itemVariants}
              className="bg-black/40 backdrop-blur-md p-8 rounded-2xl border border-[#D4AF37]/30 shadow-2xl mb-12 relative overflow-hidden group"
            >
              {/* Декоративный эффект свечения */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#D4AF37]/10 rounded-full blur-3xl group-hover:bg-[#D4AF37]/20 transition-colors duration-700" />

              <h2 className="text-[24px] font-bold mb-8 text-[#D4AF37] flex items-center gap-3">
                <span className="w-8 h-px bg-gradient-to-r from-transparent to-[#D4AF37]" />
                {t('chronicle.hall_of_fame')}
                <span className="w-8 h-px bg-gradient-to-l from-transparent to-[#D4AF37]" />
              </h2>
              <div className="text-[14px] text-slate-400">
                {t('chronicle.no_data')}
              </div>
            </motion.section>

          </motion.main>
        </div>
      </div>
    </div>
  );
};

export default ChroniclePage;
