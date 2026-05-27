import { useEffect, useRef, useState } from 'react';
import type { GalaxyTab } from './types';

function tabClass(activeTab: GalaxyTab, tab: GalaxyTab) {
  const activeColor = tab === 'others'
    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
    : tab === 'mine'
      ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
      : 'bg-purple-600 text-white shadow-lg shadow-purple-600/30';

  return `px-2.5 sm:px-3 lg:px-4 py-2 rounded-lg text-tiny font-bold uppercase tracking-widest whitespace-nowrap transition-all ${activeTab === tab
    ? activeColor
    : 'text-neutral-500 hover:text-white hover:bg-white/5'
    }`;
}

export function GalaxyTabs({
  activeTab,
  layoutVersion,
  onTabChange,
  t,
}: {
  activeTab: GalaxyTab;
  layoutVersion: number;
  onTabChange: (tab: GalaxyTab) => void;
  t: (key: string) => string;
}) {
  const [isSplit, setIsSplit] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const tabOthersRef = useRef<HTMLButtonElement | null>(null);
  const tabMineRef = useRef<HTMLButtonElement | null>(null);
  const tabCreateRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const tabOthers = tabOthersRef.current;
    const tabMine = tabMineRef.current;
    const tabCreate = tabCreateRef.current;
    if (!wrap || !tabOthers || !tabMine || !tabCreate) return;

    const GAP = 6;
    const PADDING_AND_BORDER = 12;
    const recompute = () => {
      const containerWidth = wrap.clientWidth;
      const allTabsWidth =
        tabOthers.offsetWidth +
        tabMine.offsetWidth +
        tabCreate.offsetWidth +
        GAP * 2 +
        PADDING_AND_BORDER;
      const firstRowWidth = tabOthers.offsetWidth + tabMine.offsetWidth + GAP + PADDING_AND_BORDER;
      const shouldSplit = containerWidth < allTabsWidth && containerWidth >= firstRowWidth;
      setIsSplit(shouldSplit);
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(wrap);
    ro.observe(tabOthers);
    ro.observe(tabMine);
    ro.observe(tabCreate);
    window.addEventListener('resize', recompute);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', recompute);
    };
  }, [layoutVersion]);

  return (
    <div
      ref={wrapRef}
      className="p-0.5 bg-white/5 border border-white/10 rounded-xl w-full max-w-full mx-auto mb-2 backdrop-blur-md shadow-lg shadow-blue-900/30 flex-shrink-0"
    >
      {!isSplit ? (
        <div className="flex flex-wrap justify-center gap-1.5">
          <button
            ref={tabOthersRef}
            onClick={() => onTabChange('others')}
            className={tabClass(activeTab, 'others')}
          >
            {t('galaxy.tabs.others')}
          </button>
          <button
            ref={tabMineRef}
            onClick={() => onTabChange('mine')}
            className={tabClass(activeTab, 'mine')}
          >
            {t('galaxy.tabs.mine')}
          </button>
          <button
            ref={tabCreateRef}
            onClick={() => onTabChange('create')}
            className={tabClass(activeTab, 'create')}
          >
            {t('galaxy.tabs.create')}
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex justify-center gap-1.5">
            <button
              ref={tabOthersRef}
              onClick={() => onTabChange('others')}
              className={tabClass(activeTab, 'others')}
            >
              {t('galaxy.tabs.others')}
            </button>
            <button
              ref={tabMineRef}
              onClick={() => onTabChange('mine')}
              className={tabClass(activeTab, 'mine')}
            >
              {t('galaxy.tabs.mine')}
            </button>
          </div>
          <div className="flex justify-center">
            <button
              ref={tabCreateRef}
              onClick={() => onTabChange('create')}
              className={tabClass(activeTab, 'create')}
            >
              {t('galaxy.tabs.create')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
