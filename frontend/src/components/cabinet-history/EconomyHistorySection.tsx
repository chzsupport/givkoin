'use client';

import { formatDateTime, formatNumber } from '@/utils/formatters';
import type { EconomyHistoryItem } from './types';

type EconomyHistorySectionProps = {
  mode: 'k' | 'stars';
  items: EconomyHistoryItem[];
  total: number;
  loading: boolean;
  hasMore: boolean;
  language: string;
  t: (key: string) => string;
  getEconomyEntryName: (row: EconomyHistoryItem, mode: 'k' | 'stars') => string;
  onLoadMore: () => void;
};

export function EconomyHistorySection({
  mode,
  items,
  total,
  loading,
  hasMore,
  language,
  t,
  getEconomyEntryName,
  onLoadMore,
}: EconomyHistorySectionProps) {
  const isStars = mode === 'stars';
  const accent = isStars
    ? {
      border: 'border-cyan-400/30',
      bg: 'bg-cyan-400/10',
      text: 'text-cyan-200',
    }
    : {
      border: 'border-amber-400/30',
      bg: 'bg-amber-400/10',
      text: 'text-amber-200',
    };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-h3">{isStars ? t('cabinet.stars') : 'K'}</h2>
          <p className="text-secondary text-white/70">{isStars ? t('history.stars_desc') : t('history.k_desc')}</p>
        </div>
        <div className="flex items-center gap-3">
          {loading && <span className="text-tiny text-white/60">{t('common.loading')}</span>}
          <div className={`rounded-full border ${accent.border} ${accent.bg} px-3 py-1 text-tiny ${accent.text}`}>
            {t('history.total')}: <span className="font-semibold">{isStars ? total.toFixed(3) : formatNumber(total, language)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((row) => {
          const at = row.occurredAt ? new Date(row.occurredAt) : null;
          const atText = at && !Number.isNaN(at.getTime()) ? formatDateTime(at, language) : '—';
          return (
            <div key={row._id} className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-secondary text-white/70">
                <span className={`rounded-full border ${accent.border} ${accent.bg} px-2 py-0.5 text-tiny ${accent.text}`}>
                  +{isStars ? (row.amount || 0).toFixed(3) : formatNumber(row.amount || 0, language)} {isStars ? '⭐' : 'K'}
                </span>
                <span className="text-white/80">{getEconomyEntryName(row, mode)}</span>
                <span className="text-tiny text-white/60">{atText}</span>
              </div>
            </div>
          );
        })}

        {items.length === 0 && !loading && (
          <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-secondary text-white/70">
            {t('history.no_earnings')}
          </div>
        )}
        {hasMore && (
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loading}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-2 text-tiny font-bold uppercase tracking-widest text-white/70 transition hover:bg-white/10 disabled:opacity-50"
            >
              {loading ? t('common.loading') : t('history.show_more')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
