import { History } from 'lucide-react';

type NightShiftLogEntry = {
    anomalyId: string;
    sectorName: string;
    pagePath: string;
    clearedAt: string;
};

type NightShiftClearanceLogProps = {
    entries: NightShiftLogEntry[];
    formatPageLabel: (pagePath: string) => string;
    formatShortTime: (value?: string | null) => string;
    t: (key: string) => string;
};

export function NightShiftClearanceLog({
    entries,
    formatPageLabel,
    formatShortTime,
    t,
}: NightShiftClearanceLogProps) {
    return (
        <div>
            <div className="rounded-2xl border border-white/10 bg-black/40 p-6">
                <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4">
                    <History className="w-5 h-5 text-amber-300" />
                    {t('night_shift.clearance_log')}
                </h3>

                <div className="space-y-3">
                    {entries.length ? entries.map((entry) => (
                        <div key={`${entry.anomalyId}-${entry.clearedAt}`} className="rounded-xl border border-white/10 bg-black/20 p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="font-semibold text-white">{entry.sectorName}</div>
                                <div className="text-tiny text-white/45">{formatShortTime(entry.clearedAt)}</div>
                            </div>
                            <div className="mt-2 text-sm text-white/60">
                                {t('night_shift.found_via')} {formatPageLabel(entry.pagePath)}
                            </div>
                        </div>
                    )) : (
                        <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
                            {t('night_shift.no_anomalies_for_log')}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
