import type { BattleRecord } from './battleTypes';
import { formatDateTime } from './battleControlHelpers';

export function BattleControlSummary({
  activeBattle,
  upcomingBattle,
}: {
  activeBattle: BattleRecord | null;
  upcomingBattle: BattleRecord | null;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-xs uppercase text-slate-500">Текущий бой</div>
        <div className="mt-2 text-sm text-white">
          {activeBattle
            ? `Активен с ${formatDateTime(activeBattle.startsAt, 'ru')}`
            : 'Нет активного боя'}
        </div>
        {activeBattle && (
          <div className="mt-2 text-xs text-slate-400">
            До {activeBattle.endsAt ? new Date(activeBattle.endsAt).toLocaleString('ru') : '—'}
          </div>
        )}
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-xs uppercase text-slate-500">Следующий запуск</div>
        <div className="mt-2 text-sm text-white">
          {upcomingBattle?.scheduleSource === 'auto'
            ? 'Скрыт волей Мрака'
            : upcomingBattle?.startsAt
            ? new Date(upcomingBattle.startsAt).toLocaleString('ru')
            : 'Не запланирован'}
        </div>
        {upcomingBattle?.durationSeconds && upcomingBattle?.scheduleSource !== 'auto' && (
          <div className="mt-2 text-xs text-slate-400">Длительность: {upcomingBattle.durationSeconds} сек.</div>
        )}
        <div className="mt-1 text-xs text-slate-400">
          Источник: {upcomingBattle?.scheduleSource === 'auto' ? 'Решение Мрака скрыто' : (upcomingBattle?.scheduleSource || '—')}
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/5 p-4">
        <div className="text-xs uppercase text-slate-500">Тайна Мрака</div>
        <div className="mt-2 text-sm text-white">
          Точный момент автонападения скрыт
        </div>
        <div className="mt-1 text-xs text-slate-400">Смотри вкладку настроения Мрака, если хочешь лишь примерный прогноз.</div>
      </div>
    </div>
  );
}
