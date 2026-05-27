export function MiniQuestInline({
  energyCollected,
  bridgeStoneLaid,
  rouletteSpins3,
  t,
}: {
  energyCollected?: boolean;
  bridgeStoneLaid?: boolean;
  rouletteSpins3?: boolean;
  t: (key: string, fallback?: string) => string;
}) {
  const Item = ({ ok, text }: { ok?: boolean; text: string }) => (
    <div className="flex items-center justify-between gap-3">
      <div className="text-caption text-white/70">{text}</div>
      <div className="text-caption font-bold text-white/80">{ok ? "✓" : "—"}</div>
    </div>
  );

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 text-label text-white/50">{t("daily_streak.day_tasks")}</div>
      <div className="space-y-1">
        <Item ok={energyCollected} text={t("daily_streak.task_collect_charge")} />
        <Item ok={bridgeStoneLaid} text={t("daily_streak.task_place_stone")} />
        <Item ok={rouletteSpins3} text={t("daily_streak.task_roulette_3")} />
      </div>
    </div>
  );
}
