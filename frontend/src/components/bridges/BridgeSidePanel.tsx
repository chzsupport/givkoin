'use client';

import { AnimatePresence, motion } from 'framer-motion';
import type { Bridge } from './types';
import { STONE_COST_K } from './constants';
import { BridgeImage } from './BridgeImage';

type BridgeSidePanelProps = {
  isLandscape: boolean;
  selectedBridge: Bridge | null;
  user: { k?: number } | null | undefined;
  pendingBridgeIds: Record<string, boolean>;
  stonesToday: number;
  existingStoneLimit: number;
  t: (key: string) => string;
  onClearSelected: () => void;
  onShowFullDetails: () => void;
  onLayStone: (bridgeId: string) => void;
};

export function BridgeSidePanel({
  isLandscape,
  selectedBridge,
  user,
  pendingBridgeIds,
  stonesToday,
  existingStoneLimit,
  t,
  onClearSelected,
  onShowFullDetails,
  onLayStone,
}: BridgeSidePanelProps) {
  return (
    <div className={`${isLandscape ? 'lg:col-span-1' : 'col-span-1'} flex flex-col min-h-0`}>
      <AnimatePresence mode="wait">
        {selectedBridge ? (
          <motion.div
            key={selectedBridge._id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="bg-neutral-900/50 border border-white/10 backdrop-blur-xl rounded-2xl overflow-hidden shadow-2xl flex flex-col flex-1 min-h-0"
          >
            <div className="relative h-32 sm:h-36 shrink-0">
              <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent z-10" />
              <BridgeImage from={selectedBridge.fromCountry} to={selectedBridge.toCountry} type="preview" className="object-cover" />
              <button
                onClick={onClearSelected}
                className="absolute top-2 right-2 w-7 h-7 bg-black/50 hover:bg-black/80 rounded-full flex items-center justify-center text-white z-20 text-sm"
              >×</button>
              <div className="absolute bottom-2 left-3 z-20">
                <h2 className="text-h3 text-white">{selectedBridge.fromCountry} ↔ {selectedBridge.toCountry}</h2>
                <div className={`text-tiny font-bold px-1.5 py-0.5 rounded-md inline-block ${selectedBridge.status === 'completed' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                  {selectedBridge.status === 'completed' ? t('bridges.built') : t('bridges.building_status')}
                </div>
              </div>
            </div>

            <div className="p-3 flex-1 overflow-y-auto space-y-3 min-h-0">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white/5 p-2.5 rounded-xl text-center">
                  <div className="text-tiny text-neutral-500 uppercase">{t('bridges.progress')}</div>
                  <div className="text-secondary font-bold text-blue-400">{Math.round((selectedBridge.currentStones / selectedBridge.requiredStones) * 100)}%</div>
                </div>
                <div className="bg-white/5 p-2.5 rounded-xl text-center">
                  <div className="text-tiny text-neutral-500 uppercase">{t('bridges.length')}</div>
                  <div className="text-secondary font-bold text-purple-400">{selectedBridge.requiredStones.toLocaleString()} {t('units.km')}</div>
                </div>
              </div>

              {selectedBridge.status === 'completed' ? (
                <div className="bg-green-900/20 border border-green-500/20 p-3 rounded-xl text-center space-y-2">
                  <p className="text-green-300 text-secondary font-bold">🎉 {t('bridges.bridge_built')}</p>
                  <p className="text-tiny text-neutral-400">{t('bridges.created')}: {new Date(selectedBridge.createdAt).toLocaleDateString()}</p>
                  <button
                    onClick={onShowFullDetails}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-tiny font-bold uppercase tracking-widest"
                  >
                    {t('common.more')}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex justify-between text-secondary">
                    <span className="text-neutral-400">{t('bridges.stones_label')}:</span>
                    <span className="font-mono font-bold">{selectedBridge.currentStones.toLocaleString()} / {selectedBridge.requiredStones.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" style={{ width: `${(selectedBridge.currentStones / selectedBridge.requiredStones) * 100}%` }} />
                  </div>
                  <button
                    onClick={() => onLayStone(selectedBridge._id)}
                    disabled={!user || Number(user.k || 0) < STONE_COST_K || Boolean(pendingBridgeIds[selectedBridge._id]) || stonesToday >= existingStoneLimit}
                    className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 disabled:opacity-50 rounded-xl font-bold text-secondary shadow-lg active:scale-[0.98] transition-all"
                  >
                    {pendingBridgeIds[selectedBridge._id] ? t('bridges.saving') : `🪨 ${t('bridges.lay_stone')} (${STONE_COST_K} K)`}
                  </button>
                </div>
              )}

              <div>
                <h3 className="text-tiny font-bold text-neutral-400 uppercase mb-1.5">{t('bridges.heroes')}</h3>
                <div className="space-y-1.5">
                  {selectedBridge.contributors.length > 0 ? selectedBridge.contributors.slice(0, 4).map((contributor, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-2">
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center text-tiny font-bold ${idx === 0 ? 'bg-yellow-500 text-black' : idx === 1 ? 'bg-gray-400 text-black' : 'bg-neutral-700 text-neutral-300'}`}>
                          {idx + 1}
                        </div>
                        <span className="text-secondary">{contributor.user?.nickname || t('common.unknown')}</span>
                      </div>
                      <span className="text-tiny font-mono text-blue-400">{contributor.stones}</span>
                    </div>
                  )) : (
                    <p className="text-tiny text-neutral-500 italic text-center py-2">{t('bridges.be_first_hero')}</p>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-neutral-900/50 border border-white/10 backdrop-blur-xl rounded-2xl p-4 shadow-2xl flex flex-col items-center justify-center text-center flex-1"
          >
            <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-4">
              <span className="text-3xl">🌉</span>
            </div>
            <h3 className="text-secondary font-bold text-white uppercase tracking-widest mb-2">{t('bridges.select_bridge')}</h3>
            <p className="text-tiny text-neutral-500 leading-relaxed">
              {t('bridges.select_bridge_desc')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
