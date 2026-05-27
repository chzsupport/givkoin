'use client';

import type { Dispatch, RefObject, SetStateAction } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { NEW_BRIDGE_COST_K } from './constants';
import { BridgeImage } from './BridgeImage';

type BridgeCreateModalProps = {
  t: (key: string) => string;
  user: { k?: number } | null | undefined;
  countryFrom: string;
  countryTo: string;
  neighborsMap: Record<string, string[]>;
  availableToCountries: string[];
  selectedBridgeDistance: number;
  createdToday: number;
  newBridgeLimit: number;
  stonesToday: number;
  existingStoneLimit: number;
  isCreatingBridge: boolean;
  isFromDropdownOpen: boolean;
  isToDropdownOpen: boolean;
  fromDropdownRef: RefObject<HTMLDivElement>;
  toDropdownRef: RefObject<HTMLDivElement>;
  setCountryFrom: Dispatch<SetStateAction<string>>;
  setCountryTo: Dispatch<SetStateAction<string>>;
  setIsFromDropdownOpen: Dispatch<SetStateAction<boolean>>;
  setIsToDropdownOpen: Dispatch<SetStateAction<boolean>>;
  onClose: () => void;
  onCreate: () => void;
};

export function BridgeCreateModal({
  t,
  user,
  countryFrom,
  countryTo,
  neighborsMap,
  availableToCountries,
  selectedBridgeDistance,
  createdToday,
  newBridgeLimit,
  stonesToday,
  existingStoneLimit,
  isCreatingBridge,
  isFromDropdownOpen,
  isToDropdownOpen,
  fromDropdownRef,
  toDropdownRef,
  setCountryFrom,
  setCountryTo,
  setIsFromDropdownOpen,
  setIsToDropdownOpen,
  onClose,
  onCreate,
}: BridgeCreateModalProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 pt-8 sm:pt-4 bg-black/80 backdrop-blur-md"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto bg-neutral-900 border border-white/10 rounded-3xl p-6 shadow-2xl"
      >
        <h2 className="text-h2 text-white mb-4">{t('bridges.create_modal_title')}</h2>

        <div className="relative h-32 mb-6 rounded-2xl overflow-hidden border border-white/10">
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent z-10" />
          <BridgeImage from={countryFrom} to={countryTo} type="preview" className="object-cover" />
          <div className="absolute bottom-2 left-3 z-20 text-tiny font-bold uppercase tracking-widest text-white/90">
            {t('bridges.direction_preview')}
          </div>
        </div>

        <div className="space-y-4 mb-8">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-tiny text-neutral-400 uppercase tracking-widest">
            {t('bridges.limits_prefix')} {createdToday}/{newBridgeLimit}, {t('bridges.limits_existing_prefix')} {stonesToday}/{existingStoneLimit}.
          </div>
          {selectedBridgeDistance > 0 && (
            <div className="rounded-2xl border border-blue-500/10 bg-blue-500/5 p-3 text-tiny text-blue-200 uppercase tracking-widest">
              {t('bridges.selected_bridge_length_prefix')} {selectedBridgeDistance.toLocaleString()} {t('bridges.km_short')}
            </div>
          )}
          <div>
            <label className="block text-tiny uppercase tracking-widest text-neutral-500 font-bold mb-2">{t('bridges.from')}</label>
            <div ref={fromDropdownRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsFromDropdownOpen((prev) => !prev);
                  setIsToDropdownOpen(false);
                }}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-secondary text-slate-100 flex items-center justify-between gap-2 focus:outline-none focus:border-blue-500 transition-colors"
              >
                <span className="truncate">{countryFrom}</span>
                <span className="text-tiny text-neutral-400">{isFromDropdownOpen ? '▲' : '▼'}</span>
              </button>
              <AnimatePresence>
                {isFromDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute z-50 mt-1 left-0 right-0 max-h-64 bg-neutral-950/95 border border-white/10 rounded-xl shadow-2xl overflow-y-auto"
                  >
                    {Object.keys(neighborsMap)
                      .filter((country) => (neighborsMap[country]?.length || 0) > 0)
                      .sort()
                      .map((country) => (
                        <button
                          key={country}
                          type="button"
                          onClick={() => {
                            setCountryFrom(country);
                            setIsFromDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-2 text-secondary ${country === countryFrom
                            ? 'bg-blue-600/40 text-white'
                            : 'text-slate-100 hover:bg-white/10'
                            }`}
                        >
                          {country}
                        </button>
                      ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div>
            <label className="block text-tiny uppercase tracking-widest text-neutral-500 font-bold mb-2">{t('bridges.to')}</label>
            <div ref={toDropdownRef} className="relative">
              <button
                type="button"
                disabled={!availableToCountries.length}
                onClick={() => {
                  if (!availableToCountries.length) return;
                  setIsToDropdownOpen((prev) => !prev);
                  setIsFromDropdownOpen(false);
                }}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-secondary text-slate-100 flex items-center justify-between gap-2 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="truncate">
                  {availableToCountries.length ? countryTo : t('bridges.no_available_countries')}
                </span>
                <span className="text-tiny text-neutral-400">{isToDropdownOpen ? '▲' : '▼'}</span>
              </button>
              <AnimatePresence>
                {isToDropdownOpen && availableToCountries.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="absolute z-50 mt-1 left-0 right-0 max-h-64 bg-neutral-950/95 border border-white/10 rounded-xl shadow-2xl overflow-y-auto"
                  >
                    {availableToCountries.map((country) => (
                      <button
                        key={country}
                        type="button"
                        onClick={() => {
                          setCountryTo(country);
                          setIsToDropdownOpen(false);
                        }}
                        className={`w-full text-left px-4 py-2 text-secondary ${country === countryTo
                          ? 'bg-blue-600/40 text-white'
                          : 'text-slate-100 hover:bg-white/10'
                          }`}
                      >
                        {country}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {availableToCountries.length === 0 && (
              <p className="mt-1 text-tiny text-red-400">
                {t('bridges.no_neighbors_for_country')}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-white/5 hover:bg-white/10 rounded-xl font-bold text-secondary uppercase tracking-widest transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onCreate}
            disabled={!user || Number(user.k || 0) < NEW_BRIDGE_COST_K || countryFrom === countryTo || isCreatingBridge || createdToday >= newBridgeLimit || !selectedBridgeDistance}
            className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-purple-600 disabled:opacity-50 rounded-xl font-bold text-secondary uppercase tracking-widest shadow-lg transition-all active:scale-95"
          >
            {isCreatingBridge ? t('bridges.creating') : `${t('bridges.create')} (${NEW_BRIDGE_COST_K} K)`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
