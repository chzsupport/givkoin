import { Block } from '../../components/CmsOperationsUi';
import {
  formatRiskCategoryLabel,
  formatRiskSignal,
  formatStatusLabel,
  humanizeCode,
  summarizeModeratorSignal,
  summarizeNetworkFlags,
} from './cmsFormatters';
import type { RewardRollbackRow, RiskScoreDetail, SignalHistoryEntry } from './cmsSecurityTypes';

export function RiskCaseDetails({
  evidenceLines,
  riskScoreDetailed,
  rewardRollbackRows,
  signalHistory,
}: {
  evidenceLines: string[];
  riskScoreDetailed: RiskScoreDetail[];
  rewardRollbackRows: RewardRollbackRow[];
  signalHistory: SignalHistoryEntry[];
}) {
  return (
    <Block title="Подробно">
      <details className="rounded-xl border border-white/10 bg-black/20 p-3">
        <summary className="cursor-pointer text-sm font-semibold text-white">Показать доказательства и технические детали</summary>
        <div className="mt-3 space-y-4">
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Понятные доказательства</div>
            {evidenceLines.map((line: string) => (
              <div key={line} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                {line}
              </div>
            ))}
            {!evidenceLines.length && <div className="text-xs text-slate-400">Отдельные доказательства пока не записаны</div>}
          </div>

          <div className="space-y-2">
            <div className="text-xs text-slate-400">Подробные баллы по каждому признаку</div>
            {!riskScoreDetailed.length && <div className="text-xs text-slate-400">Подробный разбор пока не записан</div>}
            {riskScoreDetailed.map((row, index) => (
              <div key={`${row?.signal || 'row'}_${index}`} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                <div className="text-white">{summarizeModeratorSignal(String(row?.signal || '')) || formatRiskSignal(String(row?.signal || ''))}</div>
                <div className="mt-1 text-slate-400">
                  Категория: {formatRiskCategoryLabel(String(row?.category || ''))} · Баллы: {Number(row?.score || 0).toFixed(1)} · Повторов: {row?.count || 1}
                </div>
                {row?.summary && (
                  <div className="mt-1 text-slate-300">{String(row.summary)}</div>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="text-xs text-slate-400">Спорные боевые награды</div>
            {!rewardRollbackRows.length && <div className="text-xs text-slate-400">Пока таких наград не найдено</div>}
            {rewardRollbackRows.map((row) => (
              <div key={String(row?.transactionId || `${row?.userId}_${row?.battleId}`)} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200">
                <div className="text-white">
                  {row?.userNickname || row?.userEmail || row?.userId || 'Пользователь'} · {Number(row?.amount || 0).toFixed(3)} {row?.currency || 'K'}
                </div>
                <div className="mt-1 text-slate-400">
                  Бой: {row?.battleId || '—'} · Статус: {formatStatusLabel(String(row?.status || 'pending'))} · {row?.occurredAt ? new Date(row.occurredAt).toLocaleString() : '—'}
                </div>
                {Number(row?.transactionCount || 0) > 1 && (
                  <div className="mt-1 text-slate-400">
                    Начислений по этому бою: {Number(row?.transactionCount || 0)}
                  </div>
                )}
                {(Number(row?.rolledBackAmount || 0) > 0 || Number(row?.shortfall || 0) > 0) && (
                  <div className="mt-1 text-slate-300">
                    Откат: {Number(row?.rolledBackAmount || 0).toFixed(3)} · Остаток к удержанию: {Number(row?.shortfall || 0).toFixed(3)}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <div className="text-xs text-slate-400">Журнал входов и регистраций</div>
            {!signalHistory.length && <div className="text-sm text-slate-400">История пока пуста</div>}
            <div className="space-y-2 max-h-[360px] overflow-auto pr-1">
              {signalHistory.map((entry) => (
                <div key={String(entry?.id || '')} className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                    <div>
                      <div className="text-sm text-white">
                        {entry?.user?.nickname || entry?.user?.email || 'Пользователь'} · {humanizeCode(String(entry?.eventType || ''))}
                      </div>
                      <div className="text-xs text-slate-400">
                        {entry?.createdAt ? new Date(entry.createdAt).toLocaleString() : '—'}
                      </div>
                    </div>
                    <div className="text-xs text-slate-400">{entry?.ip || 'без IP'}</div>
                  </div>
                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-slate-300">
                    <div>Сеть: {summarizeNetworkFlags(entry?.ipIntel)}</div>
                    <div>Метка браузера: {entry?.deviceId || '—'}</div>
                    <div>Сильный отпечаток: {entry?.fingerprint || '—'}</div>
                    <div>Слабый отпечаток: {entry?.weakFingerprint || '—'}</div>
                    <div>Профиль браузера: {entry?.profileKey || '—'}</div>
                    <div>Автоматизация: {entry?.clientProfile?.webdriver || entry?.clientProfile?.headless ? 'Есть признаки' : 'Не замечена'}</div>
                    <div>Эмулятор: {entry?.clientProfile?.emulator ? 'Да' : 'Нет'}</div>
                    <div>Платформа: {entry?.clientProfile?.platform || '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </details>
    </Block>
  );
}
