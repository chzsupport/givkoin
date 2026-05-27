import { AdaptiveAdWrapper } from '@/components/AdaptiveAdWrapper';
import { AdBlock } from '@/components/AdBlock';

type EntityProfileAdPanelProps = {
  isDesktop: boolean;
  t: (key: string) => string;
};

export function EntityProfileAdPanel({
  isDesktop,
  t,
}: EntityProfileAdPanelProps) {
  return (
    <div className="shrink-0 w-full bg-white/5 border border-white/10 rounded-xl overflow-hidden">
      <div className="text-caption uppercase tracking-[0.3em] text-gray-600 text-center py-1">
        {t('entity_profile.ad')}
      </div>
      {isDesktop ? (
        <AdBlock
          page="entity"
          placement="sidebar"
          hideTitle
          heightClass="h-[70px]"
          className="w-full"
          chromeless={true}
        />
      ) : (
        <AdaptiveAdWrapper
          page="entity"
          placement="sidebar"
          strategy="mobile_tablet_adaptive"
          chromeless={true}
          className="w-full mx-auto"
        />
      )}
    </div>
  );
}
