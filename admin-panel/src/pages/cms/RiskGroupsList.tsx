import { Block } from '../../components/CmsOperationsUi';
import {
  formatStatusLabel,
  getModeratorReasons,
  getRiskStatusTone,
  getUserDisplayName,
} from './cmsFormatters';
import type { RiskGroup } from './cmsSecurityTypes';

export function RiskGroupsList({
  groups,
  isLoading,
  selectedId,
  onSelect,
}: {
  groups: RiskGroup[];
  isLoading: boolean;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Block title="Группы риска">
      <div className="space-y-2">
        {isLoading && <div className="text-xs text-slate-400">Загрузка...</div>}
        {!isLoading && !groups.length && <div className="text-sm text-slate-400">Группы не найдены</div>}
        {groups.map((group) => {
          const primaryCaseId = String(group?.riskCaseIds?.[0] || '');
          const isSelected = primaryCaseId && primaryCaseId === String(selectedId || '');
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onSelect(primaryCaseId)}
              className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${isSelected
                ? 'border-cyan-400/40 bg-cyan-500/10'
                : `${getRiskStatusTone(String(group?.status || ''), String(group?.freezeStatus || ''))} hover:bg-white/10`
                }`}
            >
              <div className="text-sm font-semibold text-white">
                {Array.isArray(group?.users) ? group.users.map((user) => getUserDisplayName(user)).join(' / ') : 'Группа'}
              </div>
              <div className="text-xs text-slate-400">
                {group?.users?.length === 2
                  ? 'Скорее всего это один человек'
                  : `Скорее всего это группа из ${group?.users?.length || 0} аккаунтов`}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {getModeratorReasons(group?.signals, group?.evidence)?.[0] || 'Нужно проверить вручную'}
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {formatStatusLabel(group?.status || '')} · риск: {group?.riskScore || 0}
              </div>
            </button>
          );
        })}
      </div>
    </Block>
  );
}
