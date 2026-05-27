import type { EntityProfileData } from './types';

type EntityProfileHistoryPanelProps = {
  entity: EntityProfileData;
  t: (key: string) => string;
};

export function EntityProfileHistoryPanel({
  entity,
  t,
}: EntityProfileHistoryPanelProps) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm flex flex-col min-h-0 overflow-hidden">
      <div className="text-tiny uppercase tracking-widest text-neutral-500 font-bold mb-2">{t('entity_profile.history_title')}</div>
      <div className="flex-1 overflow-y-auto pr-2 space-y-2 custom-scrollbar">
        {Array.isArray(entity.history) && entity.history.length > 0 ? (
          entity.history.slice(0, 7).map((item, index) => (
            <div key={index} className="bg-black/20 border border-white/5 rounded-xl p-2.5">
              <div className="text-caption text-white/40 font-medium">{item.createdAt ? new Date(item.createdAt).toLocaleString() : ''}</div>
              <div className="text-xs text-white/70 mt-0.5 leading-snug">{item.message}</div>
            </div>
          ))
        ) : (
          <div className="text-xs text-white/30 italic">{t('entity_profile.no_events')}</div>
        )}
      </div>
    </div>
  );
}
