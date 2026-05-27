import { useEffect, useMemo, useState } from 'react';
import {
  cmsBanRiskGroup,
  cmsFetchRiskCase,
  cmsFetchRiskCases,
  cmsUnfreezeRiskGroup,
  cmsWatchRiskGroup,
} from '../../api/cms';
import { StateMessage } from '../../components/CmsOperationsUi';
import {
  buildRiskGroups,
  formatEvidenceForModerator,
  formatTechnicalSignalForModerator,
  getModeratorReasons,
} from './cmsFormatters';
import { RiskCaseCard } from './RiskCaseCard';
import { RiskCaseDetails } from './RiskCaseDetails';
import { RiskGroupsList } from './RiskGroupsList';
import { SecurityHeader } from './SecurityHeader';
import type { RiskCase, RiskGroup, SignalHistoryEntry } from './cmsSecurityTypes';

function getCmsErrorMessage(error: unknown, fallback: string) {
  const apiError = error as { response?: { data?: { message?: string } }; message?: string };
  return apiError?.response?.data?.message || apiError?.message || fallback;
}

export default function SecurityTab() {
  const [riskCases, setRiskCases] = useState<RiskCase[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [selectedRiskCase, setSelectedRiskCase] = useState<RiskCase | null>(null);
  const [signalHistory, setSignalHistory] = useState<SignalHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [error, setError] = useState('');
  const [ok, setOk] = useState('');

  const loadRiskCases = async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await cmsFetchRiskCases({
        limit: 200,
        source: 'multi_account',
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      const rows: RiskCase[] = Array.isArray(data?.riskCases) ? data.riskCases : [];
      setRiskCases(rows);
      if (!rows.length) {
        setSelectedId('');
        setSelectedRiskCase(null);
        setSignalHistory([]);
        return;
      }

      const hasSelected = rows.some((row) => String(row?._id || '') === String(selectedId || ''));
      const nextSelectedId = hasSelected
        ? String(selectedId || '')
        : String(rows[0]?._id || '');

      setSelectedId(nextSelectedId);
      if (!hasSelected) {
        setSelectedRiskCase(null);
        setSignalHistory([]);
      }
    } catch (error: unknown) {
      setError(getCmsErrorMessage(error, 'Не удалось загрузить риск-кейсы'));
      setRiskCases([]);
      setSelectedId('');
      setSelectedRiskCase(null);
      setSignalHistory([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadRiskCase = async (id: string) => {
    if (!id) {
      setSelectedRiskCase(null);
      setSignalHistory([]);
      return;
    }
    setIsDetailLoading(true);
    setError('');
    try {
      const data = await cmsFetchRiskCase(id);
      setSelectedRiskCase(data?.riskCase || null);
      setSignalHistory(Array.isArray(data?.signalHistory) ? data.signalHistory : []);
    } catch (error: unknown) {
      setError(getCmsErrorMessage(error, 'Не удалось загрузить детали риск-кейса'));
      setSelectedRiskCase(null);
      setSignalHistory([]);
      setSelectedId('');
    } finally {
      setIsDetailLoading(false);
    }
  };

  useEffect(() => {
    loadRiskCases();
  }, [statusFilter]);

  useEffect(() => {
    if (selectedId) loadRiskCase(selectedId);
  }, [selectedId]);

  const groups = useMemo(() => buildRiskGroups(riskCases) as RiskGroup[], [riskCases]);

  const selectedGroup = useMemo(() => {
    const caseId = String(selectedRiskCase?._id || selectedId || '');
    if (!caseId) return null;
    return groups.find((group) => Array.isArray(group?.riskCaseIds) && group.riskCaseIds.includes(caseId)) || null;
  }, [groups, selectedRiskCase?._id, selectedId]);

  const groupUsers = useMemo(() => {
    const main = selectedRiskCase?.user ? [selectedRiskCase.user] : [];
    const related = Array.isArray(selectedRiskCase?.relatedUsersData) ? selectedRiskCase.relatedUsersData : [];
    return [...main, ...related];
  }, [selectedRiskCase]);

  const moderatorReasons = useMemo(
    () => getModeratorReasons(selectedRiskCase?.signals, selectedRiskCase?.evidence),
    [selectedRiskCase?.signals, selectedRiskCase?.evidence],
  );

  const evidenceLines = useMemo(
    () => Array.from(new Set([
      ...(Array.isArray(selectedRiskCase?.evidence) ? selectedRiskCase.evidence : [])
        .map((entry) => formatEvidenceForModerator(entry)),
      ...(Array.isArray(selectedRiskCase?.signals) ? selectedRiskCase.signals : [])
        .map((signal) => formatTechnicalSignalForModerator(String(signal || ''))),
    ]
      .filter(Boolean))),
    [selectedRiskCase?.evidence, selectedRiskCase?.signals],
  );

  const categoryScores = useMemo(() => {
    const raw = selectedRiskCase?.categoryScores && typeof selectedRiskCase.categoryScores === 'object'
      ? selectedRiskCase.categoryScores
      : {};
    return Object.entries(raw)
      .map(([category, score]) => ({
        category,
        score: Number(score || 0),
      }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [selectedRiskCase?.categoryScores]);

  const riskScoreDetailed = useMemo(() => (
    Array.isArray(selectedRiskCase?.riskScoreDetailed) ? selectedRiskCase.riskScoreDetailed : []
  ), [selectedRiskCase?.riskScoreDetailed]);

  const rewardRollbackRows = useMemo(() => (
    Array.isArray(selectedRiskCase?.rewardRollback) ? selectedRiskCase.rewardRollback : []
  ), [selectedRiskCase?.rewardRollback]);

  const askNote = (title: string) => {
    const note = prompt(`Комментарий модератора: ${title}`);
    if (note == null) return null;
    return note.trim();
  };

  const hasReadyGroup = groupUsers.length >= 2;

  const runAction = async (action: 'watch' | 'unfreeze' | 'ban') => {
    setIsActionLoading(true);
    setError('');
    setOk('');
    try {
      if (!selectedRiskCase?._id) return;
      if (!hasReadyGroup) {
        setError('Для этой карточки не собрана понятная группа аккаунтов. Действие остановлено.');
        return;
      }

      if (action === 'watch') {
        const note = askNote('Оставить группу под наблюдением');
        if (note == null) return;
        await cmsWatchRiskGroup(selectedRiskCase._id, { note });
        setOk('Группа оставлена под наблюдением');
      }

      if (action === 'unfreeze') {
        const note = askNote('Разморозить группу');
        if (note == null) return;
        await cmsUnfreezeRiskGroup(selectedRiskCase._id, { note });
        setOk('Группа разморожена');
      }

      if (action === 'ban') {
        if (!window.confirm('Заблокировать всю группу навсегда?')) return;
        const note = askNote('Заблокировать группу навсегда');
        if (note == null) return;
        await cmsBanRiskGroup(selectedRiskCase._id, { note });
        setOk('Группа заблокирована навсегда');
      }

      await loadRiskCases();
    } catch (error: unknown) {
      setError(getCmsErrorMessage(error, 'Не удалось выполнить действие'));
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <SecurityHeader
        statusFilter={statusFilter}
        isLoading={isLoading}
        isActionLoading={isActionLoading}
        onStatusFilterChange={setStatusFilter}
        onRefresh={() => loadRiskCases()}
      />

      <StateMessage error={error} ok={ok} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <RiskGroupsList
          groups={groups}
          isLoading={isLoading}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        <div className="lg:col-span-2 space-y-4">
          <RiskCaseCard
            isDetailLoading={isDetailLoading}
            selectedRiskCase={selectedRiskCase}
            hasReadyGroup={hasReadyGroup}
            selectedGroup={selectedGroup}
            groupUsers={groupUsers}
            moderatorReasons={moderatorReasons}
            categoryScores={categoryScores}
            isActionLoading={isActionLoading}
            onRunAction={runAction}
          />

          <RiskCaseDetails
            evidenceLines={evidenceLines}
            riskScoreDetailed={riskScoreDetailed}
            rewardRollbackRows={rewardRollbackRows}
            signalHistory={signalHistory}
          />
        </div>
      </div>
    </div>
  );
}
