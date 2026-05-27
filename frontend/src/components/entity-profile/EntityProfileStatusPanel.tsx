import Link from 'next/link';
import type { EntityProfileData } from './types';

type EntityProfileStatusPanelProps = {
  entity: EntityProfileData;
  isSated: boolean;
  localePath: (path: string) => string;
  moodEffectText: string;
  moodLabel: string;
  satietyRemainingText: string;
  t: (key: string) => string;
};

export function EntityProfileStatusPanel({
  entity,
  isSated,
  localePath,
  moodEffectText,
  moodLabel,
  satietyRemainingText,
  t,
}: EntityProfileStatusPanelProps) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
      <div className="text-tiny uppercase tracking-widest text-neutral-500 font-bold mb-3">{t('entity_profile.status_title')}</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
          <div className="text-label text-white/40 mb-0.5">{t('entity_profile.date')}</div>
          <div className="text-sm font-bold text-amber-200">{new Date(entity.createdAt).toLocaleDateString()}</div>
          <div className="text-caption text-white/50">{t('entity_profile.appearance')}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
          <div className="text-label text-white/40 mb-0.5">{t('entity_profile.mood')}</div>
          <div className="text-sm font-bold text-green-400">{moodLabel}</div>
          <div className="text-caption text-white/50">{moodEffectText}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
          <div className="text-label text-white/40 mb-0.5">{t('entity_profile.satiety')}</div>
          <div className={`text-sm font-bold ${isSated ? 'text-emerald-300' : 'text-rose-300'}`}>{isSated ? t('entity_profile.sated') : t('entity_profile.hungry')}</div>
          <div className="text-caption text-white/50 leading-tight">
            {satietyRemainingText}
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
          <div className="text-label text-white/40 mb-0.5">{t('entity_profile.bonus')}</div>
          <div className="text-sm font-bold text-white/80">{isSated ? '+10%' : '0%'}</div>
          <div className="text-caption text-white/50">{t('entity_profile.to_shine')}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Link
          href={localePath('/cabinet/warehouse')}
          className="text-center rounded-xl border border-amber-500/30 bg-amber-500/10 py-2.5 text-tiny font-bold text-amber-200 hover:bg-amber-500/20 transition-colors"
        >
          📦 {t('entity_profile.feed')}
        </Link>
        <Link
          href={localePath('/shop')}
          className="text-center rounded-xl border border-white/10 bg-white/5 py-2.5 text-tiny font-bold text-white/70 hover:bg-white/10 transition-colors"
        >
          🛒 {t('entity_profile.buy_food')}
        </Link>
      </div>
    </div>
  );
}
