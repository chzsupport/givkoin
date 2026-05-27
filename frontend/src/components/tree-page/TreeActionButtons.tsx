import Link from 'next/link';
import { motion } from 'framer-motion';
import type { TreePanel } from './types';

export function TreeActionButtons({
  hasTrauma,
  isFruitAvailable,
  isUnderAttack,
  localePath,
  onCollectFruit,
  onHealOpen,
  onOpenPanel,
  t,
}: {
  hasTrauma: boolean;
  isFruitAvailable: boolean;
  isUnderAttack: boolean;
  localePath: (path: string) => string;
  onCollectFruit: () => void;
  onHealOpen: () => void;
  onOpenPanel: (panel: TreePanel) => void;
  t: (key: string) => string;
}) {
  return (
    <>
      <div className="absolute left-6 top-1/2 -translate-y-1/2 pointer-events-auto flex flex-col gap-6">
        {isUnderAttack && (
          <Link
            href={localePath('/battle')}
            className="group flex flex-col items-center gap-2 animate-pulse"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-white shadow-[0_0_30px_rgba(220,38,38,0.8)] border-2 border-red-400 transition-transform hover:scale-110">
              <span className="text-3xl">⚔️</span>
            </div>
            <span className="text-tiny font-bold text-red-400 uppercase tracking-tighter text-center bg-black/60 px-2 py-1 rounded">
              {t('tree.tree_under_attack')}<br />{t('tree.defend')}
            </span>
          </Link>
        )}

        {hasTrauma && !isUnderAttack && (
          <button
            onClick={onHealOpen}
            className="group flex flex-col items-center gap-2"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-600 text-white shadow-[0_0_30px_rgba(16,185,129,0.8)] border-2 border-emerald-400 transition-transform hover:scale-110">
              <span className="text-3xl">💊</span>
            </div>
            <span className="text-tiny font-bold text-emerald-400 uppercase tracking-widest bg-black/60 px-2 py-1 rounded">
              {t('tree.heal')}
            </span>
          </button>
        )}

        {isFruitAvailable && (
          <button
            onClick={onCollectFruit}
            className="group flex flex-col items-center gap-2"
          >
            <motion.div
              animate={{ scale: [1, 1.2, 1], rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-500 text-white shadow-[0_0_30px_rgba(249,115,22,0.8)] border-2 border-orange-300 transition-transform hover:scale-110"
            >
              <span className="text-3xl">🍎</span>
            </motion.div>
            <span className="text-tiny font-bold text-orange-400 uppercase tracking-widest bg-black/60 px-2 py-1 rounded">
              {t('tree.collect_fruit')}
            </span>
          </button>
        )}
      </div>

      <div className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 pointer-events-auto flex flex-col gap-3 sm:gap-6">
        <button
          onClick={() => onOpenPanel('entity')}
          className="flex h-10 w-10 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-blue-500/80 border-2 border-blue-300 shadow-[0_0_15px_rgba(59,130,246,0.5)] backdrop-blur-md transition-all hover:scale-110 hover:brightness-125"
          title={t('entity.title')}
        >
          <span className="text-lg sm:text-2xl">🔵</span>
        </button>
        <button
          onClick={() => onOpenPanel('search')}
          className="flex h-10 w-10 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-white/80 border-2 border-neutral-300 shadow-[0_0_15px_rgba(255,255,255,0.5)] backdrop-blur-md transition-all hover:scale-110 hover:brightness-125"
          title={t('chat.find_partner')}
        >
          <span className="text-lg sm:text-2xl">⚪</span>
        </button>
        <button
          onClick={() => onOpenPanel('solar')}
          className="flex h-10 w-10 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-yellow-500/80 border-2 border-yellow-300 shadow-[0_0_15px_rgba(234,179,8,0.5)] backdrop-blur-md transition-all hover:scale-110 hover:brightness-125"
          title={t('history.solar_charge_noun')}
        >
          <span className="text-lg sm:text-2xl">🟡</span>
        </button>
      </div>
    </>
  );
}
