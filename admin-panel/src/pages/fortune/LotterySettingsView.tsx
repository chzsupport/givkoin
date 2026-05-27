import { toNum } from './fortuneHelpers';
import { FortunePanel } from './FortuneUi';
import type { LotteryConfig } from './fortuneTypes';

export function LotterySettingsView({
  lotteryDraft,
  lotteryTime,
  onDraftChange,
  onLotteryTimeChange,
  onSave,
  onReset,
  onDrawNow,
}: {
  lotteryDraft: LotteryConfig;
  lotteryTime: string;
  onDraftChange: (draft: LotteryConfig) => void;
  onLotteryTimeChange: (time: string) => void;
  onSave: () => void;
  onReset: () => void;
  onDrawNow: () => void;
}) {
  return (
    <div className="space-y-4">
      <FortunePanel title="Лотерея: основные параметры">
        <p className="text-sm text-slate-400">Задай цену билета, лимит в день и время ежедневного розыгрыша.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Цена билета (K)</label>
            <input
              className="input-field"
              type="number"
              min={1}
              value={lotteryDraft.ticketCost ?? 100}
              onChange={(e) => onDraftChange({ ...lotteryDraft, ticketCost: toNum(e.target.value, lotteryDraft.ticketCost ?? 100) })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Максимум билетов в день</label>
            <input
              className="input-field"
              type="number"
              min={1}
              value={lotteryDraft.maxTicketsPerDay ?? 10}
              onChange={(e) => onDraftChange({ ...lotteryDraft, maxTicketsPerDay: toNum(e.target.value, lotteryDraft.maxTicketsPerDay ?? 10) })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-400">Время розыгрыша</label>
            <input
              className="input-field"
              type="time"
              value={lotteryTime}
              onChange={(e) => onLotteryTimeChange(e.target.value)}
            />
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-slate-300">
          Сейчас: билет <b>{lotteryDraft.ticketCost} K</b>, лимит <b>{lotteryDraft.maxTicketsPerDay}</b> в день, розыгрыш в <b>{lotteryTime}</b>.
        </div>
      </FortunePanel>

      <FortunePanel title="Лотерея: выплаты за совпадения">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
          {[3, 4, 5, 6, 7].map((m) => (
            <div key={m} className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-1">
              <div className="text-xs text-slate-400">{m} совпадения</div>
              <input
                className="input-field"
                type="number"
                min={0}
                value={lotteryDraft?.payoutByMatches?.[m] ?? 0}
                onChange={(e) => onDraftChange({
                  ...lotteryDraft,
                  payoutByMatches: {
                    ...(lotteryDraft.payoutByMatches || {}),
                    [m]: Math.max(0, Math.round(toNum(e.target.value, lotteryDraft?.payoutByMatches?.[m] ?? 0))),
                  },
                })}
              />
              <div className="text-xs text-slate-500">K</div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <button className="btn-primary" onClick={onSave}>Сохранить лотерею</button>
          <button className="btn-secondary" onClick={onReset}>Отменить изменения</button>
          <button className="btn-secondary" onClick={onDrawNow}>Запустить розыгрыш сейчас</button>
        </div>
      </FortunePanel>
    </div>
  );
}
