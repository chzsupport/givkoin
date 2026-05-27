'use client';

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Header } from '@/components/Header';
import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { StickySideAdRail } from '@/components/StickySideAdRail';
import type { SideAdSlot } from '@/utils/sideAdSlot';

type ChatPageFrameProps = {
  sideAdSlot: SideAdSlot | null;
  isDesktop: boolean;
  isSmallHeight: boolean;
  children: ReactNode;
};

export function ChatPageFrame({
  sideAdSlot,
  isDesktop,
  isSmallHeight,
  children,
}: ChatPageFrameProps) {
  return (
    <div className="relative h-[100dvh] w-full bg-black overflow-hidden flex flex-col">
      <motion.div
        initial={{ x: '-100%' }}
        animate={{ x: 0 }}
        transition={{ duration: 0.8, ease: 'circOut' }}
        className="absolute inset-y-0 left-0 w-1/2 bg-gray-900 z-0"
      />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        transition={{ duration: 0.8, ease: 'circOut' }}
        className="absolute inset-y-0 right-0 w-1/2 bg-gray-900 z-0"
      />

      <div className="relative z-20 shrink-0">
        <Header />
      </div>

      <div className="relative z-10 flex-1 min-h-0 flex">
        {isDesktop && (
          <StickySideAdRail adSlot={sideAdSlot} page="chat" placement="chat_sidebar_left" />
        )}

        <div className={`flex-1 flex flex-col min-w-0 ${isSmallHeight ? 'px-1 py-1' : 'px-2 md:px-4 py-2'}`}>
          {!isDesktop && (
            <div className={`flex justify-center shrink-0 w-full ${isSmallHeight ? 'mb-3' : 'mb-4'}`}>
              <AdaptiveAdWrapper
                page="chat"
                placement="chat_header"
                strategy="chat_adaptive"
              />
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
            className="flex-1 min-h-0"
          >
            {children}
          </motion.div>
        </div>

        {isDesktop && (
          <StickySideAdRail adSlot={sideAdSlot} page="chat" placement="chat_sidebar_right" />
        )}
      </div>
    </div>
  );
}
