import { Block } from '../../components/CmsOperationsUi';
import {
  formatRiskCategoryLabel,
  formatStatusLabel,
  getRiskDecisionLabel,
  getRiskHeadline,
  getRiskStatusTone,
  getUserDisplayName,
} from './cmsFormatters';
import type { CmsSecurityUser, RiskCase, RiskGroup } from './cmsSecurityTypes';

export function RiskCaseCard({
  isDetailLoading,
  selectedRiskCase,
  hasReadyGroup,
  selectedGroup,
  groupUsers,
  moderatorReasons,
  categoryScores,
  isActionLoading,
  onRunAction,
}: {
  isDetailLoading: boolean;
  selectedRiskCase: RiskCase | null;
  hasReadyGroup: boolean;
  selectedGroup: RiskGroup | null;
  groupUsers: CmsSecurityUser[];
  moderatorReasons: string[];
  categoryScores: Array<{ category: string; score: number }>;
  isActionLoading: boolean;
  onRunAction: (action: 'watch' | 'unfreeze' | 'ban') => void;
}) {
  return (
    <Block title="Карточка случая">
      {isDetailLoading && <div className="text-sm text-slate-400">Загрузка деталей...</div>}
      {!isDetailLoading && !selectedRiskCase && <div className="text-sm text-slate-400">Выберите группу слева</div>}
      {!isDetailLoading && selectedRiskCase && !hasReadyGroup && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-4 text-sm text-slate-100">
          Эта карточка не годится для проверки мультиаккаунта: в ней нет собранной группы минимум из двух аккаунтов.
        </div>
      )}
      {!isDetailLoading && selectedRiskCase && hasReadyGroup && (
        <div className="space-y-4">
          <div className={`rounded-2xl border p-4 ${getRiskStatusTone(String(selectedRiskCase?.status || ''), String(selectedRiskCase?.freezeStatus || ''))}`}>
            <div className="text-lg font-semibold text-white">{getRiskHeadline(groupUsers)}</div>
            <div className="mt-2 text-sm text-slate-200">{getRiskDecisionLabel(selectedRiskCase)}</div>
            <div className="mt-2 text-xs text-slate-400">
              Группа: {selectedRiskCase?.groupId || selectedGroup?.id || '—'} · статус: {formatStatusLabel(selectedRiskCase?.status || '')} · риск: {selectedRiskCase?.riskScore || 0}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="text-xs text-slate-400 mb-2">Какие аккаунты входят в группу</div>
                <div className="space-y-2">
                {groupUsers.map((user) => (
                  <div key={String(user?._id || user?.email || '')} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-sm text-white">{getUserDisplayName(user)}</div>
                    <div className="text-xs text-slate-400">{user?.email || 'Без email'} · статус: {formatStatusLabel(user?.status || '')}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs text-slate-400 mb-2">Почему система их связала</div>
              <div className="space-y-2">
                {moderatorReasons.map((reason) => (
                  <div key={reason} className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
                    {reason}
                  </div>
                ))}
                {!moderatorReasons.length && <div className="text-xs text-slate-400">Пока есть только общая служебная пометка, без понятного описания</div>}
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button className="btn-secondary" disabled={isActionLoading} onClick={() => onRunAction('watch')}>Оставить под наблюдением</button>
            <button className="btn-secondary" disabled={isActionLoading} onClick={() => onRunAction('unfreeze')}>Разморозить группу</button>
            <button className="btn-secondary text-rose-300 border-rose-500/30 hover:bg-rose-500/10" disabled={isActionLoading} onClick={() => onRunAction('ban')}>Заблокировать навсегда</button>
          </div>

          {!!categoryScores.length && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs text-slate-400 mb-2">Из чего собран риск</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {categoryScores.map((row) => (
                  <div key={row.category} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                    <div className="text-xs text-slate-400">{formatRiskCategoryLabel(row.category)}</div>
                    <div className="text-sm text-white">{row.score.toFixed(1)} балла</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedRiskCase?.notes && (
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-xs text-slate-400 mb-2">Заметки модераторов и системы</div>
              <div className="whitespace-pre-wrap text-xs text-slate-200">{String(selectedRiskCase.notes)}</div>
            </div>
          )}
        </div>
      )}
    </Block>
  );
}
