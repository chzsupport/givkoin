import type { GratitudeRewardConfig } from './types';

type GratitudeEntryPanelProps = {
  entries: string[];
  isLoading: boolean;
  onEntryChange: (index: number, value: string) => void;
  onEntrySave: (index: number) => void;
  rewarded: boolean[];
  rewardConfig: GratitudeRewardConfig;
  savingIndex: number | null;
  t: (key: string) => string;
};

export function GratitudeEntryPanel({
  entries,
  isLoading,
  onEntryChange,
  onEntrySave,
  rewarded,
  rewardConfig,
  savingIndex,
  t,
}: GratitudeEntryPanelProps) {
  const placeholders = [
    t('practice_gratitude.placeholders.p1'),
    t('practice_gratitude.placeholders.p2'),
    t('practice_gratitude.placeholders.p3'),
  ];

  return (
    <div className="flex items-start justify-center pb-2">
      <div className="w-full space-y-5 rounded-2xl border border-white/10 bg-white/5 px-6 py-6 backdrop-blur-md">
        <div className="space-y-3 text-sm leading-relaxed text-white/70">
          <p>
            {t('practice_gratitude.intro_p1')}
          </p>
          <p className="font-semibold text-white/80">{t('practice_gratitude.how_to_title')}</p>
          <ul className="space-y-1 list-disc pl-5">
            <li>{t('practice_gratitude.how_to.step1')}</li>
            <li>{t('practice_gratitude.how_to.step2')}</li>
            <li>{t('practice_gratitude.how_to.step3')}</li>
          </ul>
        </div>

        {isLoading ? (
          <div className="py-10 text-center text-white/60">{t('common.loading')}</div>
        ) : (
          <div className="space-y-3">
            {placeholders.map((placeholder, index) => {
              const isSaved = rewarded[index];
              const isSaving = savingIndex === index;
              return (
                <div key={placeholder} className="space-y-2">
                  <textarea
                    rows={2}
                    placeholder={placeholder}
                    value={entries[index]}
                    onChange={(event) => onEntryChange(index, event.target.value)}
                    readOnly={isSaved || isSaving}
                    className={`w-full resize-none rounded-xl border px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none ${isSaved
                      ? 'border-emerald-400/30 bg-black/30 text-white/80'
                      : 'border-white/10 bg-black/40 focus:border-indigo-400/60'
                      }`}
                  />
                  <div className="flex flex-wrap items-center justify-end gap-3">
                    {isSaved && (
                      <div className="text-label text-emerald-300/80">
                        {t('practice_gratitude.reward_saved_format')
                          .replace('{k}', String(rewardConfig.kRewardPerEntry))
                          .replace('{stars}', String(rewardConfig.starsPerEntry.toFixed(3)))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => void onEntrySave(index)}
                      disabled={isSaved || isSaving || !entries[index].trim()}
                      className={`rounded-full border px-4 py-1.5 text-tiny font-semibold uppercase tracking-widest transition-all ${isSaved
                        ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200 cursor-default'
                        : 'border-white/20 bg-white/10 text-white/80 hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-50'
                        }`}
                    >
                      {isSaving ? t('practice_gratitude.saving') : t('common.done')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="text-tiny text-white/50 text-center">
          {t('practice_gratitude.draft_note')}
        </div>
      </div>
    </div>
  );
}
