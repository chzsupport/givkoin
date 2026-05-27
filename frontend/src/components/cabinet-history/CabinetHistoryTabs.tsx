'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { CabinetHistoryTab } from './types';

type CabinetHistoryTabsProps = {
  activeTab: CabinetHistoryTab;
  counts: Record<CabinetHistoryTab, number>;
  t: (key: string) => string;
  setActiveTab: Dispatch<SetStateAction<CabinetHistoryTab>>;
};

const tabs: Array<{
  id: CabinetHistoryTab;
  labelKey?: string;
  label?: string;
  icon: string;
  activeClassName: string;
}> = [
  {
    id: 'battles',
    labelKey: 'cabinet.battles',
    icon: '⚔️',
    activeClassName: 'border-amber-400/50 bg-amber-400/10 text-amber-200 shadow-[0_0_20px_-5px_rgba(251,191,36,0.3)]',
  },
  {
    id: 'chats',
    labelKey: 'cabinet.chats',
    icon: '💬',
    activeClassName: 'border-sky-400/50 bg-sky-400/10 text-sky-200 shadow-[0_0_20px_-5px_rgba(56,189,248,0.3)]',
  },
  {
    id: 'radiance',
    labelKey: 'cabinet.radiance',
    icon: '✨',
    activeClassName: 'border-violet-400/50 bg-violet-400/10 text-violet-200 shadow-[0_0_20px_-5px_rgba(167,139,250,0.3)]',
  },
  {
    id: 'k',
    label: 'K',
    icon: '🪙',
    activeClassName: 'border-amber-400/50 bg-amber-400/10 text-amber-200 shadow-[0_0_20px_-5px_rgba(251,191,36,0.3)]',
  },
  {
    id: 'stars',
    labelKey: 'cabinet.stars',
    icon: '⭐',
    activeClassName: 'border-cyan-400/50 bg-cyan-400/10 text-cyan-200 shadow-[0_0_20px_-5px_rgba(34,211,238,0.3)]',
  },
];

export function CabinetHistoryTabs({ activeTab, counts, t, setActiveTab }: CabinetHistoryTabsProps) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => setActiveTab(tab.id)}
          className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all ${activeTab === tab.id
            ? tab.activeClassName
            : 'border-white/10 bg-white/5 text-white/60 hover:bg-white/10 hover:text-white hover:border-white/20'
            }`}
        >
          {tab.icon} {tab.labelKey ? t(tab.labelKey) : tab.label}
          <span className="text-caption text-white/50">{counts[tab.id]}</span>
        </button>
      ))}
    </div>
  );
}
