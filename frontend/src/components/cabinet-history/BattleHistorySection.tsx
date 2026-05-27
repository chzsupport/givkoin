'use client';

import { Eye } from 'lucide-react';
import { formatDateTime, formatNumber } from '@/utils/formatters';
import type { BattleHistoryEntry } from './types';

type BattleHistorySectionProps = {
  battleHistory: BattleHistoryEntry[];
  loadingBattles: boolean;
  language: string;
  t: (key: string) => string;
  onViewBattleSummary: (battleId: string) => void;
};

export function BattleHistorySection({
  battleHistory,
  loadingBattles,
  language,
  t,
  onViewBattleSummary,
}: BattleHistorySectionProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-md">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-h3">{t('battle.history')}</h2>
          <p className="text-secondary text-white/70">{t('battle.history_review')}</p>
        </div>
        {loadingBattles && <span className="text-tiny text-white/60">{t('common.loading')}</span>}
      </div>
      <div className="mt-4 space-y-3">
        {battleHistory.map((battle) => {
          const endedAt = battle.endedAt ? new Date(battle.endedAt) : null;
          const endedAtText = endedAt && !Number.isNaN(endedAt.getTime()) ? formatDateTime(endedAt, language) : '—';
          const isDraw = battle.result === 'draw';
          const isLight = battle.result === 'light';
          return (
            <div key={battle.battleId} className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-secondary text-white/70">
                <span className="font-semibold text-white">{t('battle.title')} #{String(battle.battleId).slice(-6)}</span>
                <span
                  className={`rounded-full border px-2 py-0.5 text-tiny uppercase ${isDraw
                    ? 'border-slate-400/40 bg-slate-400/10 text-slate-200'
                    : isLight
                      ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-200'
                      : 'border-rose-400/40 bg-rose-400/10 text-rose-200'
                    }`}
                >
                  {battle.result ? (isDraw ? t('battle.draw') : isLight ? t('battle.victory_light') : t('battle.victory_darkness')) : '—'}
                </span>
                <span className="text-tiny text-white/60">{endedAtText}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-tiny text-white/60">
                <span>{t('history.your_damage')}: <span className="text-white">{formatNumber(battle.userDamage || 0, language)}</span></span>
                <span>{t('history.light')}: {formatNumber(battle.lightDamage || 0, language)}</span>
                <span>{t('history.darkness')}: {formatNumber(battle.darknessDamage || 0, language)}</span>
                <span>{t('history.battle_attendance')}: {formatNumber(battle.attendanceCount || 0, language)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => onViewBattleSummary(String(battle.battleId))}
                  className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-tiny text-white hover:border-white/40 transition"
                >
                  <Eye size={14} />
                  {t('battle.result')}
                </button>
              </div>
            </div>
          );
        })}
        {battleHistory.length === 0 && !loadingBattles && (
          <div className="rounded-xl border border-white/10 bg-black/30 p-4 text-secondary text-white/70">
            {t('battle.history_empty')}
          </div>
        )}
      </div>
    </div>
  );
}
