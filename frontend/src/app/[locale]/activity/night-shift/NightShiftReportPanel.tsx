import { CheckCircle, Clock, Ghost, Zap } from 'lucide-react';
import { formatNightShiftDuration } from './nightShiftTime';

type NightShiftReportPanelProps = {
    isServing: boolean;
    elapsedTime: number;
    totalTimeMs?: number | null;
    totalResolvedAnomalies: number;
    currentHourAnomalies: number;
    acceptedAnomalies: number;
    t: (key: string) => string;
};

export function NightShiftReportPanel({
    isServing,
    elapsedTime,
    totalTimeMs,
    totalResolvedAnomalies,
    currentHourAnomalies,
    acceptedAnomalies,
    t,
}: NightShiftReportPanelProps) {
    const displayTime = isServing
        ? formatNightShiftDuration(elapsedTime)
        : totalTimeMs
            ? formatNightShiftDuration(totalTimeMs)
            : '00:00:00';

    return (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-6">
                <Zap className="w-5 h-5 text-yellow-500" />
                {t('night_shift.shift_report')}
            </h3>

            <div className="space-y-4">
                <div className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                    <div className="flex items-center gap-3">
                        <Clock className="w-5 h-5 text-slate-400" />
                        <span className="text-slate-300">{t('night_shift.time_on_post')}</span>
                    </div>
                    <span className="font-mono text-white">
                        {displayTime}
                    </span>
                </div>

                <div className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                    <div className="flex items-center gap-3">
                        <Ghost className="w-5 h-5 text-purple-400" />
                        <span className="text-slate-300">{t('night_shift.anomalies')}</span>
                    </div>
                    <span className="font-bold text-white">
                        {totalResolvedAnomalies}
                    </span>
                </div>

                <div className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                    <div className="flex items-center gap-3">
                        <Zap className="w-5 h-5 text-cyan-400" />
                        <span className="text-slate-300">{t('night_shift.anomalies_current_hour')}</span>
                    </div>
                    <span className="font-bold text-white">
                        {currentHourAnomalies}
                    </span>
                </div>

                <div className="flex justify-between items-center p-3 rounded-lg bg-white/5">
                    <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                        <span className="text-slate-300">{t('night_shift.accepted_by_system')}</span>
                    </div>
                    <span className="font-bold text-white">
                        {acceptedAnomalies}
                    </span>
                </div>

                <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="text-xs text-center text-slate-500 uppercase tracking-widest">
                        {t('night_shift.payment_rule')}
                    </p>
                </div>
            </div>
        </div>
    );
}
