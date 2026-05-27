import { Clock, XCircle } from 'lucide-react';
import type { BattleRecord } from './battleTypes';

export function NewBattleSchedulePanel({
  activeBattle,
  scheduledCount,
  startsAt,
  durationSeconds,
  actionBusy,
  onStartsAtChange,
  onDurationSecondsChange,
  onSchedule,
  onFinishNow,
}: {
  activeBattle: BattleRecord | null;
  scheduledCount: number;
  startsAt: string;
  durationSeconds: string;
  actionBusy: boolean;
  onStartsAtChange: (value: string) => void;
  onDurationSecondsChange: (value: string) => void;
  onSchedule: () => void;
  onFinishNow: () => void;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="text-xs uppercase text-slate-500">Новый запланированный бой</div>
      <div className="mt-1 text-sm text-white">Общая форма только для создания нового боя</div>
      {scheduledCount > 0 && (
        <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Сейчас уже есть запланированный бой. Его можно изменить или удалить в списке выше.
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs uppercase text-slate-500">Длительность</div>
            <input
              type="number"
              min="60"
              placeholder="секунд (опционально)"
              className="input-field mt-2"
              value={durationSeconds}
              onChange={(event) => onDurationSecondsChange(event.target.value)}
            />
            <div className="mt-2 text-xs text-slate-500">Оставьте пустым для значения по умолчанию.</div>
          </div>
          <div>
            <label className="text-xs uppercase text-slate-500">Дата и время запуска</label>
            <input
              type="datetime-local"
              className="input-field mt-2"
              value={startsAt}
              onChange={(event) => onStartsAtChange(event.target.value)}
            />
            <div className="mt-2 text-xs text-slate-500">Создание нового боя доступно, когда список выше пуст.</div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap xl:justify-end">
          <button
            onClick={onSchedule}
            disabled={actionBusy || scheduledCount > 0}
            className="btn-secondary w-full sm:w-auto"
          >
            <Clock size={16} />
            Запланировать
          </button>
          <button
            onClick={onFinishNow}
            disabled={actionBusy || !activeBattle}
            className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50 w-full sm:w-auto"
          >
            <XCircle size={16} className="inline-block mr-2" />
            Завершить сейчас
          </button>
        </div>
      </div>
    </div>
  );
}
