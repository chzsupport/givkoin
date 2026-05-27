import { useEffect, useMemo, useState } from 'react';
import { createApprovalV2, fetchBattleControl } from '../../api/admin';
import { Card } from '../../components/ui';
import type { BattleRecord, BattleSchedulePayload, RequestApprovalPayload } from './battleTypes';
import { BattleControlSummary } from './BattleControlSummary';
import { NewBattleSchedulePanel } from './NewBattleSchedulePanel';
import { ScheduledBattlesPanel } from './ScheduledBattlesPanel';
import {
  getApiErrorMessage,
  normalizeBattleStartsAtForApproval,
  toDatetimeLocal,
} from './battleControlHelpers';

export function BattleControlTab({
  requestApprovalPayload,
  onRefreshMood,
}: {
  requestApprovalPayload: RequestApprovalPayload;
  onRefreshMood: () => Promise<void>;
}) {
  const [controlLoading, setControlLoading] = useState(true);
  const [activeBattle, setActiveBattle] = useState<BattleRecord | null>(null);
  const [upcomingBattle, setUpcomingBattle] = useState<BattleRecord | null>(null);
  const [scheduledBattles, setScheduledBattles] = useState<BattleRecord[]>([]);
  const [startsAt, setStartsAt] = useState('');
  const [durationSeconds, setDurationSeconds] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [editingScheduledBattleId, setEditingScheduledBattleId] = useState<string | null>(null);
  const [editStartsAt, setEditStartsAt] = useState('');
  const [editDurationSeconds, setEditDurationSeconds] = useState('');

  const editingScheduledBattle = useMemo(() => {
    if (!editingScheduledBattleId) return null;
    return scheduledBattles.find((battle) => String(battle?._id || '') === editingScheduledBattleId) || null;
  }, [editingScheduledBattleId, scheduledBattles]);

  const resetScheduleEditor = () => {
    setEditingScheduledBattleId(null);
    setEditStartsAt('');
    setEditDurationSeconds('');
  };

  const loadControl = async () => {
    setControlLoading(true);
    try {
      const data = await fetchBattleControl();
      setActiveBattle(data?.active || null);
      setUpcomingBattle(data?.upcoming || null);
      const fromServer: BattleRecord[] = Array.isArray(data?.scheduledBattles) ? data.scheduledBattles : [];
      setScheduledBattles(fromServer);
    } catch (e) {
      console.error(e);
    } finally {
      setControlLoading(false);
    }
  };

  useEffect(() => {
    loadControl();
  }, []);

  useEffect(() => {
    if (editingScheduledBattle) {
      setEditStartsAt(toDatetimeLocal(editingScheduledBattle.startsAt));
      setEditDurationSeconds(editingScheduledBattle.durationSeconds ? String(editingScheduledBattle.durationSeconds) : '');
      return;
    }
    if (editingScheduledBattleId) {
      setEditingScheduledBattleId(null);
    }
    setEditStartsAt('');
    setEditDurationSeconds('');
  }, [editingScheduledBattle, editingScheduledBattleId]);

  const refreshControlAndMood = async () => {
    await Promise.all([loadControl(), onRefreshMood()]);
  };

  const handleSchedule = async () => {
    if (!startsAt) {
      alert('Укажите время запуска');
      return;
    }
    if (scheduledBattles.length > 0) {
      alert('Сначала выбери запланированный бой в списке ниже для изменения, либо удали его.');
      return;
    }

    const startsAtIso = normalizeBattleStartsAtForApproval(startsAt);
    const approval = requestApprovalPayload({
      title: 'Запланировать новый бой',
      impactPreviewDefault: `Будет создан новый бой на ${new Date(startsAtIso || startsAt).toLocaleString('ru-RU')}${durationSeconds ? ` длительностью ${Number(durationSeconds)} сек.` : '.'}`,
      confirmationPhrase: 'CONFIRM game.battle.schedule',
    });
    if (!approval) return;

    setActionBusy(true);
    try {
      const payload: BattleSchedulePayload = { startsAt: startsAtIso };
      if (durationSeconds) payload.durationSeconds = Number(durationSeconds);
      const res = await createApprovalV2({
        actionType: 'game.battle.schedule',
        ...approval,
        payload,
      });
      alert(res?.operationId
        ? `Заявка создана. Подтверди её в центре контроля. Номер операции: ${res.operationId}`
        : 'Заявка на создание боя отправлена');
      setStartsAt('');
      setDurationSeconds('');
      await refreshControlAndMood();
    } catch (e) {
      alert(getApiErrorMessage(e, 'Ошибка планирования Мрака'));
    } finally {
      setActionBusy(false);
    }
  };

  const handleEditScheduledBattle = (battle: BattleRecord) => {
    if (!battle?._id) return;
    setEditingScheduledBattleId(String(battle._id));
    setEditStartsAt(toDatetimeLocal(battle.startsAt));
    setEditDurationSeconds(battle.durationSeconds ? String(battle.durationSeconds) : '');
  };

  const handleSaveScheduledBattle = async (battle: BattleRecord) => {
    const battleId = String(battle?._id || '').trim();
    if (!battleId) {
      alert('Не найден запланированный бой');
      return;
    }
    if (!editStartsAt) {
      alert('Укажите новое время запуска');
      return;
    }

    const startsAtIso = normalizeBattleStartsAtForApproval(editStartsAt);
    const approval = requestApprovalPayload({
      title: 'Изменить запланированный бой',
      impactPreviewDefault: `Время запуска боя будет изменено на ${new Date(startsAtIso || editStartsAt).toLocaleString('ru-RU')}${editDurationSeconds ? `, длительность станет ${Number(editDurationSeconds)} сек.` : '.'}`,
      confirmationPhrase: 'CONFIRM game.battle.schedule',
    });
    if (!approval) return;

    setActionBusy(true);
    try {
      const payload: BattleSchedulePayload = {
        battleId,
        startsAt: startsAtIso,
      };
      if (editDurationSeconds) payload.durationSeconds = Number(editDurationSeconds);
      const res = await createApprovalV2({
        actionType: 'game.battle.schedule',
        ...approval,
        payload,
      });
      alert(res?.operationId
        ? `Заявка на изменение создана. Подтверди её в центре контроля. Номер операции: ${res.operationId}`
        : 'Заявка на изменение отправлена');
      resetScheduleEditor();
      await refreshControlAndMood();
    } catch (e) {
      alert(getApiErrorMessage(e, 'Ошибка изменения запланированного боя'));
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeleteScheduledBattle = async (battle: BattleRecord) => {
    if (!battle?._id) {
      alert('Сейчас нет запланированного боя для удаления');
      return;
    }
    const approval = requestApprovalPayload({
      title: 'Удалить запланированный бой',
      impactPreviewDefault: 'Запланированный бой будет полностью удалён из базы вместе со служебными хвостами.',
      confirmationPhrase: 'CONFIRM game.battle.schedule_cancel',
    });
    if (!approval) return;

    setActionBusy(true);
    try {
      const res = await createApprovalV2({
        actionType: 'game.battle.schedule_cancel',
        ...approval,
        payload: {
          battleId: String(battle._id),
        },
      });
      alert(res?.operationId
        ? `Заявка на удаление создана. Подтверди её в центре контроля. Номер операции: ${res.operationId}`
        : 'Заявка на удаление отправлена');
      if (String(battle._id) === editingScheduledBattleId) {
        resetScheduleEditor();
      }
      await refreshControlAndMood();
    } catch (e) {
      alert(getApiErrorMessage(e, 'Ошибка удаления запланированного боя'));
    } finally {
      setActionBusy(false);
    }
  };

  const handleFinishNow = async () => {
    if (!activeBattle) {
      alert('Сейчас нет активного боя');
      return;
    }
    const approval = requestApprovalPayload({
      title: 'Завершить текущий бой',
      impactPreviewDefault: 'Текущий бой будет принудительно доведён до завершения и закрыт.',
      confirmationPhrase: 'CONFIRM game.battle.finish_now',
    });
    if (!approval) return;

    setActionBusy(true);
    try {
      const res = await createApprovalV2({
        actionType: 'game.battle.finish_now',
        ...approval,
        payload: {
          battleId: String(activeBattle._id),
        },
      });
      alert(res?.operationId
        ? `Заявка на завершение создана. Подтверди её в центре контроля. Номер операции: ${res.operationId}`
        : 'Заявка на завершение отправлена');
      await refreshControlAndMood();
    } catch (e) {
      alert(getApiErrorMessage(e, 'Ошибка завершения боя'));
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <Card title="Управление Мраком" subtitle="Ручной запуск и расписание">
      {controlLoading ? (
        <div className="text-center text-slate-500">Загрузка...</div>
      ) : (
        <div className="space-y-4">
          <BattleControlSummary activeBattle={activeBattle} upcomingBattle={upcomingBattle} />
          <ScheduledBattlesPanel
            scheduledBattles={scheduledBattles}
            editingScheduledBattleId={editingScheduledBattleId}
            editStartsAt={editStartsAt}
            editDurationSeconds={editDurationSeconds}
            actionBusy={actionBusy}
            onEdit={handleEditScheduledBattle}
            onDelete={handleDeleteScheduledBattle}
            onSave={handleSaveScheduledBattle}
            onCancelEdit={resetScheduleEditor}
            onEditStartsAtChange={setEditStartsAt}
            onEditDurationSecondsChange={setEditDurationSeconds}
          />
          <NewBattleSchedulePanel
            activeBattle={activeBattle}
            scheduledCount={scheduledBattles.length}
            startsAt={startsAt}
            durationSeconds={durationSeconds}
            actionBusy={actionBusy}
            onStartsAtChange={setStartsAt}
            onDurationSecondsChange={setDurationSeconds}
            onSchedule={handleSchedule}
            onFinishNow={handleFinishNow}
          />
        </div>
      )}
    </Card>
  );
}
