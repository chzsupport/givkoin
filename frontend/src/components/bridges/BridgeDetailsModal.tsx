'use client';

import { motion } from 'framer-motion';
import type { Bridge } from './types';
import { BridgeImage } from './BridgeImage';

type BridgeDetailsModalProps = {
  selectedBridge: Bridge;
  t: (key: string) => string;
  onClose: () => void;
};

export function BridgeDetailsModal({ selectedBridge, t, onClose }: BridgeDetailsModalProps) {
  const sortedContributors = [...selectedBridge.contributors].sort((a, b) => b.stones - a.stones);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="w-full max-w-2xl bg-neutral-900 border border-white/10 rounded-3xl p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-h2 text-white">{t('bridges.history_title')}</h2>
            <p className="text-neutral-500 text-tiny uppercase tracking-widest font-bold">{selectedBridge.fromCountry} ↔ {selectedBridge.toCountry}</p>
          </div>
          <button onClick={onClose} className="text-2xl text-neutral-500 hover:text-white transition-colors">×</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <div className="md:col-span-2 relative h-64 md:h-auto min-h-[300px] rounded-2xl overflow-hidden shadow-xl border border-white/5">
            <BridgeImage
              from={selectedBridge.fromCountry}
              to={selectedBridge.toCountry}
              type={selectedBridge.status === 'completed' ? 'full' : 'preview'}
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          </div>

          <div className="md:col-span-3 flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white/5 p-4 rounded-2xl">
                <div className="text-tiny text-neutral-500 uppercase font-bold mb-1">{t('bridges.founder')}</div>
                <div className="text-secondary font-bold text-blue-400 truncate">{selectedBridge.contributors[0]?.user?.nickname || t('common.unknown')}</div>
              </div>
              <div className="bg-white/5 p-4 rounded-2xl">
                <div className="text-tiny text-neutral-500 uppercase font-bold mb-1">{t('bridges.start_date')}</div>
                <div className="text-secondary font-bold text-purple-400">{new Date(selectedBridge.createdAt).toLocaleDateString()}</div>
              </div>
            </div>
            {selectedBridge.status === 'completed' && (
              <div className="bg-green-500/10 border border-green-500/20 p-4 rounded-2xl">
                <div className="text-tiny text-green-500/50 uppercase font-bold mb-1">{t('bridges.end_date')}</div>
                <div className="text-secondary font-bold text-green-400">{new Date(selectedBridge.updatedAt).toLocaleDateString()}</div>
              </div>
            )}
            <div className="bg-white/5 p-4 rounded-2xl flex-1 flex flex-col min-h-[150px]">
              <h3 className="text-secondary font-bold text-white uppercase tracking-widest mb-4 shrink-0">{t('bridges.top_builders')}</h3>
              <div className="space-y-3 overflow-y-auto custom-scrollbar flex-1">
                {sortedContributors.map((contributor, idx) => (
                  <div key={idx} className="flex items-center justify-between pr-2">
                    <div className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-tiny font-bold ${idx === 0 ? 'bg-yellow-500 text-black' : 'bg-white/10 text-neutral-400'}`}>
                        {idx + 1}
                      </span>
                      <span className="text-secondary font-medium text-neutral-200 truncate">{contributor.user?.nickname || t('common.unknown')}</span>
                    </div>
                    <span className="font-mono font-bold text-blue-400 text-tiny shrink-0">{contributor.stones} {t('bridges.stones_count')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-4 bg-white/5 hover:bg-white/10 rounded-2xl font-bold text-secondary uppercase tracking-widest transition-colors"
        >
          {t('common.close')}
        </button>
      </motion.div>
    </motion.div>
  );
}
