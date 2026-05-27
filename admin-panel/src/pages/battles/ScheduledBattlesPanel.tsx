import { Edit3, Save, Trash2, XCircle } from 'lucide-react';
import type { BattleRecord } from './battleTypes';

export function ScheduledBattlesPanel({
  scheduledBattles,
  editingScheduledBattleId,
  editStartsAt,
  editDurationSeconds,
  actionBusy,
  onEdit,
  onDelete,
  onSave,
  onCancelEdit,
  onEditStartsAtChange,
  onEditDurationSecondsChange,
}: {
  scheduledBattles: BattleRecord[];
  editingScheduledBattleId: string | null;
  editStartsAt: string;
  editDurationSeconds: string;
  actionBusy: boolean;
  onEdit: (battle: BattleRecord) => void;
  onDelete: (battle: BattleRecord) => void;
  onSave: (battle: BattleRecord) => void;
  onCancelEdit: () => void;
  onEditStartsAtChange: (value: string) => void;
  onEditDurationSecondsChange: (value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase text-slate-500">Запланировано</div>
          <div className="mt-1 text-sm text-white">Список будущих боёв для изменения или удаления</div>
        </div>
        <div className="text-xs text-slate-400">Всего: {scheduledBattles.length}</div>
      </div>

      {scheduledBattles.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-sm text-slate-500">
          Запланированных боёв сейчас нет.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {scheduledBattles.map((battle) => {
            const battleId = String(battle?._id || '');
            const selected = battleId === editingScheduledBattleId;
            return (
              <div
                key={battleId}
                className={`rounded-xl border p-4 transition-colors ${selected ? 'border-blue-400/40 bg-blue-500/10' : 'border-white/10 bg-black/10'}`}
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">
                      {battle?.startsAt ? new Date(battle.startsAt).toLocaleString('ru') : 'Дата не указана'}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-400">
                      <span>Длительность: {battle?.durationSeconds || '—'} сек.</span>
                      <span>Источник: {battle?.scheduleSource || '—'}</span>
                      {selected && <span className="text-blue-200">Выбран для изменения</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => onEdit(battle)}
                      disabled={actionBusy}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Edit3 size={16} className="inline-block mr-2" />
                      Изменить
                    </button>
                    <button
                      onClick={() => onDelete(battle)}
                      disabled={actionBusy}
                      className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 size={16} className="inline-block mr-2" />
                      Удалить
                    </button>
                  </div>
                </div>

                {selected && (
                  <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 p-4">
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label className="text-xs uppercase text-slate-500">Новая дата и время</label>
                          <input
                            type="datetime-local"
                            className="input-field mt-2"
                            value={editStartsAt}
                            onChange={(event) => onEditStartsAtChange(event.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs uppercase text-slate-500">Новая длительность</label>
                          <input
                            type="number"
                            min="60"
                            placeholder="секунд"
                            className="input-field mt-2"
                            value={editDurationSeconds}
                            onChange={(event) => onEditDurationSecondsChange(event.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap xl:justify-end">
                        <button
                          onClick={() => onSave(battle)}
                          disabled={actionBusy}
                          className="btn-secondary w-full sm:w-auto"
                        >
                          <Save size={16} />
                          Сохранить изменения
                        </button>
                        <button
                          onClick={onCancelEdit}
                          disabled={actionBusy}
                          className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50 w-full sm:w-auto"
                        >
                          <XCircle size={16} className="inline-block mr-2" />
                          Отменить
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
