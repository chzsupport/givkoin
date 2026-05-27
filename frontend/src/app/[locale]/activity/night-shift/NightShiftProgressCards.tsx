import { Coins, Star, Zap } from 'lucide-react';

type NightShiftEarnings = {
    k: number;
    lm: number;
    stars: number;
};

type NightShiftProgressCardsProps = {
    currentHourProgress: number;
    currentHourAnomalies: number;
    hourlyGoal: number;
    currentHourRemaining: number;
    totalEarnings: NightShiftEarnings;
    consecutiveEmptyWindows: number;
    payableHours: number;
    pendingSettlementTime: string | null;
    t: (key: string) => string;
};

export function NightShiftProgressCards({
    currentHourProgress,
    currentHourAnomalies,
    hourlyGoal,
    currentHourRemaining,
    totalEarnings,
    consecutiveEmptyWindows,
    payableHours,
    pendingSettlementTime,
    t,
}: NightShiftProgressCardsProps) {
    return (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                <div className="text-tiny uppercase tracking-[0.35em] text-purple-200/80">{t('night_shift.hour_payment')}</div>
                <div className="mt-3 flex items-end justify-between gap-3">
                    <div className="text-3xl font-black text-white">{currentHourProgress}%</div>
                    <div className="text-right text-tiny text-white/55">
                        <div>{currentHourAnomalies}/{hourlyGoal}</div>
                        <div>{t('night_shift.remaining')} {currentHourRemaining}</div>
                    </div>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-400 to-pink-300" style={{ width: `${currentHourProgress}%` }} />
                </div>
                <div className="mt-3 text-sm text-white/65">
                    {t('night_shift.full_hour_paid_after')}
                </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                <div className="text-tiny uppercase tracking-[0.35em] text-emerald-200/80">{t('night_shift.shift_income')}</div>
                <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3 text-sm text-white/70">
                        <span className="flex items-center gap-2"><Coins className="w-4 h-4 text-amber-300" /> K</span>
                        <span className="font-bold text-white">{totalEarnings.k}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm text-white/70">
                        <span className="flex items-center gap-2"><Zap className="w-4 h-4 text-cyan-300" /> {t('night_shift.lumens')}</span>
                        <span className="font-bold text-white">{totalEarnings.lm}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-sm text-white/70">
                        <span className="flex items-center gap-2"><Star className="w-4 h-4 text-blue-300" /> {t('night_shift.stars')}</span>
                        <span className="font-bold text-white">{totalEarnings.stars}</span>
                    </div>
                </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                <div className="text-tiny uppercase tracking-[0.35em] text-amber-200/80">{t('night_shift.post_stability')}</div>
                <div className="mt-3 text-3xl font-black text-white">{consecutiveEmptyWindows}</div>
                <div className="mt-2 text-sm text-white/65">
                    {t('night_shift.empty_windows_in_row_prefix')} {consecutiveEmptyWindows}. {t('night_shift.empty_windows_in_row_suffix')}
                </div>
                <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-tiny text-white/60">
                    {t('night_shift.counted_hours')}: <span className="font-bold text-white">{payableHours}</span>
                </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/40 p-5">
                <div className="text-tiny uppercase tracking-[0.35em] text-cyan-200/80">{t('night_shift.after_handover')}</div>
                <div className="mt-3 text-xl font-bold text-white">
                    {pendingSettlementTime ? `${t('night_shift.wait_until')} ${pendingSettlementTime}` : t('night_shift.no_settlement_expected')}
                </div>
                <div className="mt-2 text-sm text-white/65">
                    {pendingSettlementTime
                        ? t('night_shift.settlement_wait_desc')
                        : t('night_shift.no_settlement_desc')}
                </div>
            </div>
        </div>
    );
}
