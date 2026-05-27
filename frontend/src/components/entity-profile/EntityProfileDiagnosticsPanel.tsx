import type { EntityMoodDiagnostics } from './types';

type EntityProfileDiagnosticsPanelProps = {
  moodDiag: EntityMoodDiagnostics | null;
  t: (key: string) => string;
};

export function EntityProfileDiagnosticsPanel({
  moodDiag,
  t,
}: EntityProfileDiagnosticsPanelProps) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-sm">
      <div className="text-tiny uppercase tracking-widest text-neutral-500 font-bold mb-2">{t('entity_profile.activity_title')}</div>
      {!moodDiag ? (
        <div className="text-xs text-white/50 italic">{t('common.loading')}</div>
      ) : (
        <div className="text-xs text-white/80 leading-relaxed">
          <div className="flex justify-between items-center border-b border-white/5 pb-1">
            <span className="text-white/50">{t('entity_profile.activity')}:</span>
            <span className="text-white/80 font-bold">{Math.round(moodDiag.corePercent)}%</span>
          </div>
          <div className="flex justify-between items-center border-b border-white/5 py-1">
            <span className="text-white/50">{t('entity_profile.actions')}:</span>
            <span className="text-white/80 font-bold">{moodDiag.confirmedCount}</span>
          </div>
          <div className="flex justify-between items-center pt-1">
            <span className="text-white/50">{t('entity_profile.debuff')}:</span>
            <span className={`font-bold ${moodDiag.activeDebuff ? 'text-rose-400' : 'text-emerald-400'}`}>
              {moodDiag.activeDebuff ? t('common.yes') : t('common.no')}
            </span>
          </div>
          {!moodDiag.isSated && (
            <div className="mt-2 rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-caption text-rose-300 text-center">
              {t('entity_profile.entity_hungry_no_joy')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
