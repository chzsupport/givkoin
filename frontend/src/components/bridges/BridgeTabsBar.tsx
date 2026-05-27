'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { BridgeTab } from './types';

type BridgeTabsBarProps = {
  activeTab: BridgeTab;
  isCreatingBridge: boolean;
  createdToday: number;
  newBridgeLimit: number;
  t: (key: string) => string;
  setActiveTab: Dispatch<SetStateAction<BridgeTab>>;
  onCreateClick: () => void;
};

export function BridgeTabsBar({
  activeTab,
  isCreatingBridge,
  createdToday,
  newBridgeLimit,
  t,
  setActiveTab,
  onCreateClick,
}: BridgeTabsBarProps) {
  return (
    <div className="mb-3 shrink-0 grid gap-2 sm:gap-3 items-center sm:grid-cols-[1fr_auto_1fr]">
      <div className="flex flex-wrap justify-center gap-1 p-0.5 bg-white/5 border border-white/10 rounded-xl backdrop-blur-md w-fit mx-auto sm:col-start-2">
        {(['building', 'my', 'completed'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 rounded-lg text-tiny font-bold uppercase tracking-widest transition-all ${activeTab === tab
              ? 'bg-blue-600 text-white shadow-lg'
              : 'text-neutral-500 hover:text-white hover:bg-white/5'
              }`}
          >
            {tab === 'building' ? t('bridges.tabs.building') : tab === 'my' ? t('bridges.tabs.my') : t('bridges.tabs.completed')}
          </button>
        ))}
      </div>

      <div className="flex justify-center sm:justify-end sm:col-start-3">
        <button
          onClick={onCreateClick}
          disabled={isCreatingBridge || createdToday >= newBridgeLimit}
          className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-tiny uppercase tracking-widest shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          + {t('bridges.create_bridge')}
        </button>
      </div>
    </div>
  );
}
