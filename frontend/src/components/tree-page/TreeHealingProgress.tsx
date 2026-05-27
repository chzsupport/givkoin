export function TreeHealingProgress({
  healingPercent,
  healingRemaining,
  hasTrauma,
  t,
}: {
  healingPercent: number;
  healingRemaining: number;
  hasTrauma: boolean;
  t: (key: string) => string;
}) {
  if (!hasTrauma) return null;

  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-24 sm:top-[120px] md:top-[145px] lg:top-[175px] xl:top-[135px] 2xl:top-[165px] pointer-events-auto px-4 py-2 rounded-xl border border-emerald-500/20 bg-black/40 backdrop-blur-sm shadow-lg w-[260px] sm:w-[320px] md:w-[360px] max-w-[90vw]">
      <div className="flex items-center justify-between text-tiny text-white/70 mb-1">
        <span>{t('tree.healing_injury')}</span>
        <span className="text-emerald-300 font-semibold">{healingPercent}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden border border-white/10">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300"
          style={{ width: `${healingPercent}%` }}
        />
      </div>
      <div className="mt-1 text-caption text-white/60">
        {t('tree.radiance_remaining')} <span className="text-emerald-200 font-semibold">{healingRemaining.toLocaleString()}</span>
      </div>
    </div>
  );
}
