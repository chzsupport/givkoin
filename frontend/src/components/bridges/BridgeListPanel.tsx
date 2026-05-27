'use client';

import { motion } from 'framer-motion';
import type { Bridge } from './types';
import { BridgeImage } from './BridgeImage';

type BridgeListPanelProps = {
  isLandscape: boolean;
  isLoading: boolean;
  bridges: Bridge[];
  selectedBridgeId?: string;
  hasMore: boolean;
  isLoadingMore: boolean;
  t: (key: string) => string;
  onSelectBridge: (bridge: Bridge) => void;
  onLoadMore: () => void;
};

export function BridgeListPanel({
  isLandscape,
  isLoading,
  bridges,
  selectedBridgeId,
  hasMore,
  isLoadingMore,
  t,
  onSelectBridge,
  onLoadMore,
}: BridgeListPanelProps) {
  return (
    <div className={`${isLandscape ? 'lg:col-span-2' : 'col-span-1'} bg-neutral-900/50 border border-white/10 backdrop-blur-xl rounded-2xl p-3 sm:p-4 shadow-2xl overflow-hidden flex flex-col min-h-0`}>
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-0">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="rounded-xl border border-white/10 bg-white/5 p-3 animate-pulse">
              <div className="h-10 w-full rounded-lg bg-white/10" />
              <div className="mt-3 h-3 w-2/3 rounded bg-white/10" />
              <div className="mt-2 h-2 w-1/2 rounded bg-white/10" />
            </div>
          ))
        ) : bridges.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🌉</div>
            <p className="text-neutral-400 uppercase tracking-widest text-tiny">{t('bridges.empty')}</p>
          </div>
        ) : (
          bridges.map((bridge, index) => (
            <motion.div
              key={bridge._id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              onClick={() => onSelectBridge(bridge)}
              className={`group relative p-3 rounded-xl border cursor-pointer transition-all ${selectedBridgeId === bridge._id
                ? 'bg-blue-600/20 border-blue-500/50'
                : 'bg-white/5 border-transparent hover:bg-white/10 hover:border-white/10'
                }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-3">
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 border border-white/10 shadow-inner bg-black/20">
                    <BridgeImage from={bridge.fromCountry} to={bridge.toCountry} type="preview" className="object-cover" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${bridge.status === 'completed' ? 'bg-green-500 shadow-[0_0_8px_rgba(74,222,128,0.6)]' : 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse'}`} />
                      <span className="font-bold text-secondary text-sm sm:text-base">{bridge.fromCountry} ↔ {bridge.toCountry}</span>
                    </div>
                    <span className="text-label text-neutral-500 font-medium">{t('bridges.bridge_of_peace')}</span>
                  </div>
                </div>
                <span className={`text-tiny font-bold uppercase px-2 py-0.5 rounded-md ${bridge.status === 'completed' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                  {bridge.status === 'completed' ? t('bridges.ready') : `${Math.round((bridge.currentStones / bridge.requiredStones) * 100)}%`}
                </span>
              </div>
              <div className="flex items-center justify-between text-tiny text-neutral-400">
                <span>👤 {bridge.contributors[0]?.user?.nickname || t('common.unknown')}</span>
                <span>{bridge.requiredStones.toLocaleString()} {t('units.km')}</span>
              </div>
              {bridge.status !== 'completed' && (
                <div className="mt-2 h-1 bg-neutral-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" style={{ width: `${(bridge.currentStones / bridge.requiredStones) * 100}%` }} />
                </div>
              )}
            </motion.div>
          ))
        )}
        {!isLoading && bridges.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={!hasMore || isLoadingMore}
              className={`w-full rounded-xl border px-4 py-3 text-tiny font-bold uppercase tracking-widest transition-all ${(!hasMore || isLoadingMore)
                ? 'border-white/10 bg-white/5 text-white/40 cursor-not-allowed'
                : 'border-white/15 bg-white/10 text-white/80 hover:bg-white/15'}`}
            >
              {isLoadingMore ? t('common.loading') : hasMore ? t('bridges.show_more') : t('bridges.all_shown')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
