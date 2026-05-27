type NightShiftAssessment = {
    title: string;
    note: string;
};

type NightShiftAssessmentCardsProps = {
    hourTempo: NightShiftAssessment;
    postRisk: NightShiftAssessment;
    currentHourRemaining: number;
    consecutiveEmptyWindows: number;
    t: (key: string) => string;
};

export function NightShiftAssessmentCards({
    hourTempo,
    postRisk,
    currentHourRemaining,
    consecutiveEmptyWindows,
    t,
}: NightShiftAssessmentCardsProps) {
    return (
        <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                <div className="text-tiny uppercase tracking-[0.35em] text-fuchsia-200/80">{t('night_shift.hour_assessment')}</div>
                <div className="mt-3 text-2xl font-black text-white">{hourTempo.title}</div>
                <div className="mt-2 text-sm text-white/65">{hourTempo.note}</div>
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-tiny text-white/60">
                    {t('night_shift.to_norm')}: <span className="font-bold text-white">{currentHourRemaining}</span>
                </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                <div className="text-tiny uppercase tracking-[0.35em] text-amber-200/80">{t('night_shift.shift_risk')}</div>
                <div className="mt-3 text-2xl font-black text-white">{postRisk.title}</div>
                <div className="mt-2 text-sm text-white/65">{postRisk.note}</div>
                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-tiny text-white/60">
                    {t('night_shift.empty_windows_short')}: <span className="font-bold text-white">{consecutiveEmptyWindows}</span>
                </div>
            </div>
        </div>
    );
}
