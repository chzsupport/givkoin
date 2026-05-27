import Image from 'next/image';
import type { EntityProfileData } from './types';

type EntityProfileSidebarProps = {
  canChangeEntity: boolean;
  daysUntilChange: number;
  entity: EntityProfileData;
  onAsk: () => void;
  onRequestChange: () => void;
  t: (key: string) => string;
};

export function EntityProfileSidebar({
  canChangeEntity,
  daysUntilChange,
  entity,
  onAsk,
  onRequestChange,
  t,
}: EntityProfileSidebarProps) {
  return (
    <div className="w-full xl:w-64 flex flex-col items-center xl:items-start shrink-0 gap-3">
      <div className="relative w-full xl:w-full aspect-square rounded-2xl overflow-hidden border-2 border-blue-500/30 shadow-[0_0_30px_rgba(59,130,246,0.15)] bg-neutral-900 shrink-0">
        <Image src={entity.avatarUrl} alt={entity.name} fill sizes="(max-width: 1279px) calc(100vw - 32px), 256px" className="object-contain" unoptimized />
      </div>

      <div className="w-full text-center xl:text-left">
        <h1 data-crystal-anchor="entity-name" className="text-lg sm:text-xl font-bold uppercase tracking-wider text-blue-300 leading-tight break-words">
          {entity.name}
        </h1>
        <div className="text-label text-neutral-500 mt-1">
          {t('entity_profile.soul_reflection')}
        </div>
      </div>

      <button
        type="button"
        onClick={onAsk}
        className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-xl font-bold uppercase tracking-widest text-tiny hover:bg-white/10 transition-all active:scale-95"
      >
        {t('entity.ask')}
      </button>
      <button
        type="button"
        onClick={() => {
          if (!canChangeEntity) return;
          onRequestChange();
        }}
        disabled={!canChangeEntity}
        className={`w-full px-4 py-2 rounded-xl font-bold uppercase tracking-widest text-tiny transition-all ${canChangeEntity
          ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:brightness-110 active:scale-95'
          : 'bg-white/5 text-white/40 border border-white/10 cursor-not-allowed'
          }`}
      >
        {canChangeEntity
          ? t('entity_profile.change_entity')
          : `${t('entity_profile.change_in_days_prefix')}${daysUntilChange}${t('entity_profile.change_in_days_suffix')}`}
      </button>
    </div>
  );
}
