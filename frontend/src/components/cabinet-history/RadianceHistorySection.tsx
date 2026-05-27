'use client';

import { formatDateTime, formatNumber } from '@/utils/formatters';
import type { RadianceHistoryItem } from './types';

type RadianceHistorySectionProps = {
  radianceHistory: RadianceHistoryItem[];
  radianceTotal: number;
  loadingRadiance: boolean;
  radianceHasMore: boolean;
  language: string;
  t: (key: string) => string;
  getRadianceActivityName: (activityType: string, amount: number) => string;
  getTreeHealConversionText: (row: RadianceHistoryItem) => string | null;
  onLoadMore: () => void;
};

export function RadianceHistorySection({
  radianceHistory,
  radianceTotal,
  loadingRadiance,
  radianceHasMore,
  language,
  t,
  getRadianceActivityName,
  getTreeHealConversionText,
  onLoadMore,
}: RadianceHistorySectionProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-h3">{t('cabinet.radiance')}</h2>
          <p className="text-secondary text-white/70">{t('history.radiance_desc')}</p>
        </div>
        <div className="flex items-center gap-3">
          {loadingRadiance && <span className="text-tiny text-white/60">{t('common.loading')}</span>}
          <div className="rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-tiny text-violet-200">
            {t('history.total')}: <span className="font-semibold">{formatNumber(radianceTotal, language)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {radianceHistory.map((row, idx) => {
          const at = row.occurredAt ? new Date(row.occurredAt) : null;
          const atText = at && !Number.isNaN(at.getTime()) ? formatDateTime(at, language) : '—';
          const treeHealConversion = getTreeHealConversionText(row);
          return (
            <div key={`${row.activityType}-${idx}-${row.amount}`} className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-secondary text-white/70">
                <span className="rounded-full border border-violet-400/30 bg-violet-400/10 px-2 py-0.5 text-tiny text-violet-200">
                  +{formatNumber(row.amount || 0, language)} {t('cabinet.radiance')}
                </span>
                <span className="text-white/80">{getRadianceActivityName(row.activityType, row.amount || 0)}</span>
                <span className="text-tiny text-white/60">{atText}</span>
              </div>
              {treeHealConversion && (
                <div className="mt-2 text-tiny text-emerald-200/80">
                  {treeHealConversion}
                </div>
              )}
            </div>
          );
        })}

        {radianceHistory.length === 0 && !loadingRadiance && (
          <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-secondary text-white/70">
            {t('history.no_earnings')}
          </div>
        )}
        {radianceHasMore && (
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingRadiance}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-tiny font-bold uppercase tracking-widest text-white/70 transition hover:bg-white/10 disabled:opacity-50"
            >
              {loadingRadiance ? t('common.loading') : t('history.show_more')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
