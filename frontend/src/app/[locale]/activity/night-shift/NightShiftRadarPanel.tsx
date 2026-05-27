import Link from 'next/link';
import { AlertTriangle, Radar } from 'lucide-react';

type NightShiftRadarPanelProps = {
    isServing: boolean;
    radarTargetLabel: string | null;
    radarTargetUrl: string | null;
    localePath: (path: string) => string;
    t: (key: string) => string;
};

export function NightShiftRadarPanel({
    isServing,
    radarTargetLabel,
    radarTargetUrl,
    localePath,
    t,
}: NightShiftRadarPanelProps) {
    return (
        <div className="rounded-2xl border border-white/10 bg-black/40 p-6 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="flex justify-between items-start mb-4">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Radar className="w-5 h-5 text-green-500" />
                    {t('night_shift.radar')}
                </h3>
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20">
                    <div className={`w-2 h-2 rounded-full ${isServing ? 'bg-green-500 animate-ping' : 'bg-slate-500'}`} />
                    <span className="text-xs font-medium text-green-400">
                        {isServing ? t('night_shift.active') : t('night_shift.disabled')}
                    </span>
                </div>
            </div>

            <div className="h-32 flex items-center justify-center rounded-xl bg-black/50 border border-white/5 relative">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px]" />
                {isServing && (
                    <div className="absolute inset-0 border-t-2 border-green-500/30 animate-[scan_2s_linear_infinite] bg-gradient-to-b from-green-500/10 to-transparent h-1/2" />
                )}

                <div className="relative z-10 text-center">
                    {isServing ? (
                        radarTargetLabel ? (
                            <>
                                <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2 animate-bounce" />
                                <div className="text-red-400 font-bold tracking-wider">{t('night_shift.detected')}</div>
                                <div className="text-sm mt-1">
                                    {radarTargetUrl ? (
                                        <Link href={localePath(radarTargetUrl)} className="text-cyan-300 hover:text-cyan-200 underline underline-offset-4">
                                            {radarTargetLabel}
                                        </Link>
                                    ) : (
                                        <span className="text-white">{radarTargetLabel}</span>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="text-green-500/50 font-mono text-sm tracking-widest animate-pulse">
                                {t('night_shift.scanning')}
                            </div>
                        )
                    ) : (
                        <div className="text-slate-600 font-mono text-sm">{t('night_shift.system_not_active')}</div>
                    )}
                </div>
            </div>
        </div>
    );
}
